const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Master-Key, X-Access-Key",
};

function getSemanaAtual() {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() - (data.getDay() === 0 ? 6 : data.getDay() - 1));
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export default {
  async fetch(request, env) {
    // 1. Tratamento de CORS (Preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const method = request.method;

    // 2. Validação da Chave de Acesso via Secret da Cloudflare
    const keyRecebida = (request.headers.get("X-Master-Key") || request.headers.get("X-Access-Key") || "").trim();
    const masterKey = (env.MASTER_KEY || "").trim();
    if (!masterKey || keyRecebida !== masterKey) {
      return new Response(JSON.stringify({ erro: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const db = env.DB || env.termo_db;

    // 3. Rota: LER RANKING (GET /)
    if (method === "GET" && (url.pathname === "/" || url.pathname === "/ranking")) {
      try {
        const semanaAtual = getSemanaAtual();

        // Busca a data do último reset
        const configReq = await db.prepare("SELECT value FROM system_config WHERE key = 'semanaReset'").first();
        let semanaReset = configReq ? configReq.value : "";

        // Se mudou de semana, reseta os tempos da semana anterior
        if (semanaReset && semanaReset !== semanaAtual) {
          await db.prepare("DELETE FROM partidas").run();
          await db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('semanaReset', ?)").bind(semanaAtual).run();
          semanaReset = semanaAtual;
        } else if (!semanaReset) {
          await db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('semanaReset', ?)").bind(semanaAtual).run();
          semanaReset = semanaAtual;
        }

        // Busca o Top 10 Tempos da semana
        const { results: topTempos } = await db.prepare(
          "SELECT nome_display as nome, tempo_ms as tempoMs, avatar, historico_json, data_formatada as data FROM partidas ORDER BY tempo_ms ASC LIMIT 10"
        ).all();

        // Busca o Ranking Geral de Pontos
        const { results: pontos } = await db.prepare(
          "SELECT pin, nome, pontos, avatar FROM jogadores ORDER BY pontos DESC"
        ).all();

        // Formata os dados no formato idêntico ao JSONBin para o front
        const pontuacaoGeral = {};
        pontos.forEach(p => {
          pontuacaoGeral[p.pin] = { nome: p.nome, pontos: p.pontos, avatar: p.avatar };
        });

        topTempos.forEach(t => {
          t.historico = t.historico_json ? JSON.parse(t.historico_json) : [];
          delete t.historico_json;
        });

        return new Response(JSON.stringify({ semanaReset, topTempos, pontuacaoGeral }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ erro: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 4. Rota DEFINITIVA: SALVAR NOVO RECORDE / PONTUAÇÃO (POST /salvar ou POST /)
    if (method === "POST" && (url.pathname === "/salvar" || url.pathname === "/recorde" || url.pathname === "/")) {
      try {
        const body = await request.json();
        const semanaAtual = getSemanaAtual();

        // Garante que a semana está sincronizada
        const configReq = await db.prepare("SELECT value FROM system_config WHERE key = 'semanaReset'").first();
        const semanaReset = configReq ? configReq.value : "";
        if (semanaReset && semanaReset !== semanaAtual) {
          await db.prepare("DELETE FROM partidas").run();
          await db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('semanaReset', ?)").bind(semanaAtual).run();
        }

        const pin = (body.pin || "JOGADOR_GHOST").trim().toUpperCase();
        const nome = (body.nome || "JOGADOR").trim().toUpperCase();
        const avatar = body.avatar || "doge";
        const pontosGanhos = Number(body.pontosGanhos) || 0;

        // Atualiza ou insere jogador acumulando os pontos
        const jogadorExistente = await db.prepare("SELECT pontos FROM jogadores WHERE pin = ?").bind(pin).first();
        const novosPontos = (jogadorExistente ? jogadorExistente.pontos : 0) + pontosGanhos;

        await db.prepare(`
          INSERT INTO jogadores (pin, nome, pontos, avatar, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(pin) DO UPDATE SET
            nome = excluded.nome,
            pontos = ?,
            avatar = excluded.avatar,
            updated_at = CURRENT_TIMESTAMP
        `).bind(pin, nome, novosPontos, avatar, novosPontos).run();

        // Se registrar tempo
        if (body.registrarTempo && body.tempoMs) {
          const histStr = body.historico ? JSON.stringify(body.historico) : "[]";
          const dataStr = body.data || new Date().toLocaleDateString("pt-BR");
          await db.prepare(`
            INSERT INTO partidas (jogador_pin, nome_display, tempo_ms, avatar, historico_json, data_formatada)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(pin, nome, Number(body.tempoMs), avatar, histStr, dataStr).run();
        }

        return new Response(JSON.stringify({ sucesso: true, pontos: novosPontos }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ erro: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 5. Rota: MIGRAÇÃO (POST /migrar) -> Rota de ETL / Backup
    if (method === "POST" && url.pathname === "/migrar") {
      try {
        const payload = await request.json();

        // Insere o config
        if (payload.semanaReset) {
          await db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('semanaReset', ?)").bind(payload.semanaReset).run();
        }

        // Insere os jogadores (pontuacaoGeral)
        if (payload.pontuacaoGeral) {
          const stmtJogador = db.prepare("INSERT OR REPLACE INTO jogadores (pin, nome, pontos, avatar) VALUES (?, ?, ?, ?)");
          for (const pin of Object.keys(payload.pontuacaoGeral)) {
            const data = payload.pontuacaoGeral[pin];
            await stmtJogador.bind(pin, data.nome, data.pontos, data.avatar).run();
          }
        }

        // Insere as partidas (topTempos)
        if (payload.topTempos) {
          const stmtPartida = db.prepare("INSERT INTO partidas (nome_display, tempo_ms, avatar, historico_json, data_formatada) VALUES (?, ?, ?, ?, ?)");
          for (const t of payload.topTempos) {
            const histStr = t.historico ? JSON.stringify(t.historico) : "[]";
            await stmtPartida.bind(t.nome, t.tempoMs, t.avatar, histStr, t.data).run();
          }
        }

        return new Response(JSON.stringify({ sucesso: "Dados migrados para o D1 com sucesso!" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ erro: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  }
};

function getCorsHeaders(request) {
  const origin = request ? request.headers.get("Origin") : null;
  const allowed = [
    "https://angolanodaiqoption.github.io",
    "https://matheusbarroso124.github.io"
  ];
  let allowOrigin = "https://angolanodaiqoption.github.io";
  if (origin && (allowed.includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) {
    allowOrigin = origin;
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Master-Key, X-Access-Key",
  };
}

export function getSemanaAtual(agora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(agora);
  const obterParte = (tipo) => Number(partes.find((parte) => parte.type === tipo)?.value);
  const anoLocal = obterParte("year");
  const mesLocal = obterParte("month");
  const diaLocal = obterParte("day");
  const dataLocal = new Date(Date.UTC(anoLocal, mesLocal - 1, diaLocal));
  const domingo = new Date(Date.UTC(anoLocal, mesLocal - 1, diaLocal - dataLocal.getUTCDay()));
  const ano = domingo.getUTCFullYear();
  const mes = String(domingo.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(domingo.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

async function sincronizarSemana(db) {
  const semanaAtual = getSemanaAtual();
  const configReq = await db.prepare("SELECT value FROM system_config WHERE key = 'semanaResetDomingo'").first();
  const semanaReset = configReq ? configReq.value : "";

  if (semanaReset && semanaReset !== semanaAtual) {
    await db.prepare("DELETE FROM partidas").run();
  }

  if (semanaReset !== semanaAtual) {
    await db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('semanaResetDomingo', ?)").bind(semanaAtual).run();
  }

  return semanaAtual;
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request);

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
        const semanaReset = await sincronizarSemana(db);

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

    // 4. Rota: SALVAR TEMPO NO RANKING SEMANAL, sem alterar a pontuação geral
    if (method === "POST" && url.pathname === "/tempo") {
      try {
        const body = await request.json();
        const idPublico = typeof body.id === "string" ? body.id.trim().toUpperCase() : "";
        const tempoMs = Number(body.tempoMs) || 0;
        const historico = Array.isArray(body.historico) ? body.historico : [];

        if (!/^[A-Z0-9_-]{1,15}$/.test(idPublico) || tempoMs <= 0 || historico.length > 6) {
          return new Response(JSON.stringify({ erro: "ID público ou dados de tempo inválidos." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        await sincronizarSemana(db);

        const avatar = body.avatar || "doge";
        const dataStr = body.data || new Date().toLocaleDateString("pt-BR");
        await db.prepare(`
          INSERT INTO partidas (jogador_pin, nome_display, tempo_ms, avatar, historico_json, data_formatada)
          VALUES (NULL, ?, ?, ?, ?, ?)
        `).bind(idPublico, tempoMs, avatar, JSON.stringify(historico), dataStr).run();

        return new Response(JSON.stringify({ sucesso: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ erro: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 5. Rota: ATUALIZAR NICK DO PERFIL sem alterar os pontos acumulados
    if (method === "POST" && url.pathname === "/perfil/nome") {
      try {
        const body = await request.json();
        const pin = typeof body.pin === "string" ? body.pin.trim().toUpperCase() : "";
        const nome = typeof body.nome === "string" ? body.nome.trim().toUpperCase() : "";

        if (!pin || pin.length > 15 || !nome || nome.length > 15 || /[\u0000-\u001f\u007f]/.test(nome) || nome === pin) {
          return new Response(JSON.stringify({ erro: "PIN ou nick inválido." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const resultado = await db.prepare(
          "UPDATE jogadores SET nome = ?, updated_at = CURRENT_TIMESTAMP WHERE pin = ?"
        ).bind(nome, pin).run();

        if (resultado.meta.changes === 0) {
          return new Response(JSON.stringify({ erro: "Perfil não encontrado no ranking geral." }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ sucesso: true, nome }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ erro: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 6. Rota: ATUALIZAR AVATAR DO PERFIL sem alterar os pontos acumulados
    if (method === "POST" && url.pathname === "/perfil/avatar") {
      try {
        const body = await request.json();
        const pin = typeof body.pin === "string" ? body.pin.trim().toUpperCase() : "";
        const avatar = typeof body.avatar === "string" ? body.avatar.trim() : "";

        if (!/^[A-Z0-9_-]{1,15}$/.test(pin) || !/^[a-zA-Z0-9_-]{1,50}$/.test(avatar)) {
          return new Response(JSON.stringify({ erro: "PIN ou avatar inválido." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const resultado = await db.prepare(
          "UPDATE jogadores SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE pin = ?"
        ).bind(avatar, pin).run();

        if (resultado.meta.changes === 0) {
          return new Response(JSON.stringify({ erro: "Perfil não encontrado no ranking geral." }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ sucesso: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ erro: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 7. Rota DEFINITIVA: SALVAR NOVO RECORDE / PONTUAÇÃO (POST /salvar ou POST /)
    if (method === "POST" && (url.pathname === "/salvar" || url.pathname === "/recorde" || url.pathname === "/")) {
      try {
        const body = await request.json();

        // 1. TRAVAS DE SEGURANÇA E LÓGICA (Sanitization)
        const nomeUpper = (body.nome || "").trim().toUpperCase();
        const pinUpper = (body.pin || "").trim().toUpperCase();

        if (!nomeUpper || !pinUpper) {
          return new Response(JSON.stringify({ erro: "Nome e PIN são obrigatórios." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (nomeUpper === pinUpper) {
          return new Response(JSON.stringify({ erro: "Por segurança, o PIN não pode ser igual ao Nome." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const tempoMs = Number(body.tempoMs) || 0;
        const pontosGanhos = Number(body.pontosGanhos) || 0;
        const historico = Array.isArray(body.historico) ? body.historico : [];
        const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";

        // Validação: não pode jogar mais de 6 vezes, tempo deve ser positivo se for registrar tempo
        if (body.registrarTempo && (tempoMs <= 0 || historico.length > 6)) {
          return new Response(JSON.stringify({ erro: "Dados de partida inválidos ou forjados." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (pontosGanhos < 0 || pontosGanhos > 100) {
          return new Response(JSON.stringify({ erro: "Dados de partida inválidos ou forjados." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (body.eventId !== undefined && !/^[\w.-]{1,100}$/.test(eventId)) {
          return new Response(JSON.stringify({ erro: "Identificador de partida inválido." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // 2. Garante que a semana está sincronizada
        await sincronizarSemana(db);

        const avatar = body.avatar || "doge";

        if (eventId) {
          const dataStr = body.data || new Date().toLocaleDateString("pt-BR");
          const jogadorAnterior = await db.prepare(
            "SELECT nome FROM jogadores WHERE pin = ?"
          ).bind(pinUpper).first();
          const resultado = await db.prepare(`
            INSERT OR IGNORE INTO score_events (
              event_id,
              pin,
              nome,
              pontos,
              avatar,
              registrar_tempo,
              tempo_ms,
              historico_json,
              data_formatada
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            eventId,
            pinUpper,
            nomeUpper,
            pontosGanhos,
            avatar,
            body.registrarTempo ? 1 : 0,
            tempoMs,
            JSON.stringify(historico),
            dataStr
          ).run();
          let jogador = await db.prepare(
            "SELECT pontos, nome FROM jogadores WHERE pin = ?"
          ).bind(pinUpper).first();

          if (jogadorAnterior && jogador && jogador.nome !== jogadorAnterior.nome) {
            await db.prepare(
              "UPDATE jogadores SET nome = ? WHERE pin = ?"
            ).bind(jogadorAnterior.nome, pinUpper).run();
            jogador = { ...jogador, nome: jogadorAnterior.nome };
          }

          return new Response(JSON.stringify({
            sucesso: true,
            duplicado: resultado.meta.changes === 0,
            pontos: jogador ? jogador.pontos : 0,
            nome: jogador ? jogador.nome : nomeUpper
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // 3. Atualiza ou insere jogador acumulando os pontos
        const jogadorExistente = await db.prepare(
          "SELECT pontos, nome FROM jogadores WHERE pin = ?"
        ).bind(pinUpper).first();
        const novosPontos = (jogadorExistente ? jogadorExistente.pontos : 0) + pontosGanhos;
        const nomeAtual = jogadorExistente ? jogadorExistente.nome : nomeUpper;

        await db.prepare(`
          INSERT INTO jogadores (pin, nome, pontos, avatar, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(pin) DO UPDATE SET
            nome = ?,
            pontos = ?,
            avatar = excluded.avatar,
            updated_at = CURRENT_TIMESTAMP
        `).bind(pinUpper, nomeAtual, novosPontos, avatar, nomeAtual, novosPontos).run();

        // 4. Se registrar tempo semanal
        if (body.registrarTempo && tempoMs > 0) {
          const histStr = JSON.stringify(historico);
          const dataStr = body.data || new Date().toLocaleDateString("pt-BR");
          await db.prepare(`
            INSERT INTO partidas (jogador_pin, nome_display, tempo_ms, avatar, historico_json, data_formatada)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(pinUpper, nomeAtual, tempoMs, avatar, histStr, dataStr).run();
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

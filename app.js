import { EstadoJogo } from "./state.js";
import { obterPalavraAleatoria, palavraExiste } from "./api.js";
import { AVATARES, obterSrcAvatar } from "./avatars.js";

const gridEl = document.getElementById("grid");
const keyboardEl = document.getElementById("keyboard");
const statusEl = document.getElementById("status-message");
const btnRestart = document.getElementById("btn-restart");
const btnThemePicker = document.getElementById("btn-theme-picker");
const modalThemePicker = document.getElementById("modal-theme-picker");
const btnCloseThemePicker = document.getElementById("btn-close-theme-picker");
const btnCancelTheme = document.getElementById("btn-cancel-theme");
const btnApplyTheme = document.getElementById("btn-apply-theme");

// Elementos dos Modais
const modalEndgame = document.getElementById("modal-endgame");
const modalCard = document.getElementById("modal-card");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalSecretWord = document.getElementById("modal-secret-word");
const modalBtnRestart = document.getElementById("modal-btn-restart");
const modalBadge = document.getElementById("modal-badge");

// Modal de Avatares
const modalAvatarSelector = document.getElementById("modal-avatar-selector");
const avatarGridContainer = document.getElementById("avatar-grid-container");
const btnCloseAvatarModal = document.getElementById("btn-close-avatar-modal");
const btnConfirmAvatar = document.getElementById("btn-confirm-avatar");

// Modal de Timeout
const modalTimeout = document.getElementById("modal-timeout");
const timeoutCountdown = document.getElementById("timeout-countdown");

const CLASSES_FOCO = ["ring-2", "ring-tema-borda-ativa"];
const STORAGE_PARTIDA_KEY = "termo_partida_atual_v1";
const STORAGE_LEADERBOARD_KEY = "termo_leaderboard_v1";
const STORAGE_TIMEOUT_KEY = "termo_user_timeout_until_v1";
const STORAGE_USER_PIN_KEY = "termo_user_pin";
const STORAGE_USER_NAME_KEY = "termo_user_name";
const STORAGE_USER_AVATAR_KEY = "termo_user_avatar";
const STORAGE_PENDING_SCORE_EVENTS_KEY = "termo_pending_score_events_v1";
const STORAGE_THEME_KEY = "termo_theme_v1";
const THEMES_AVAILABLE = ["dark", "cyber", "kawaii"];
const TABELA_PONTOS = [100, 80, 60, 40, 20, 10];

const themeSalvo = localStorage.getItem(STORAGE_THEME_KEY);
if (THEMES_AVAILABLE.includes(themeSalvo)) {
  document.body.setAttribute("data-theme", themeSalvo);
}

// Configuração da API (Cloudflare Workers + D1)
const API_URL = "https://termo-api.matheusbarroso124.workers.dev";
const API_KEY = "termo_api_bcd5b29c08a610a1a8d2a8e6a31ab0ef";

let tempoInicio = null;
let tempoFinalMs = 0;
let avatarSelecionado = AVATARES[0].id;
let timerInterval = null;
let themeAtOpening = document.body.getAttribute("data-theme") || "dark";

const TECLADO_LAYOUT = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
];

function checarTimeoutAtivo() {
  const timeoutUntil = localStorage.getItem(STORAGE_TIMEOUT_KEY);
  if (!timeoutUntil) return false;

  const agora = Date.now();
  const tempoRestanteMs = parseInt(timeoutUntil, 10) - agora;

  if (tempoRestanteMs > 0) {
    exibirTelaDeTimeout(tempoRestanteMs);
    return true;
  } else {
    localStorage.removeItem(STORAGE_TIMEOUT_KEY);
    modalTimeout.classList.remove("flex");
    modalTimeout.classList.add("hidden");
    return false;
  }
}

function aplicarPunicaoTimeout(minutos = 30) {
  const tempoFinal = Date.now() + minutos * 60 * 1000;
  localStorage.setItem(STORAGE_TIMEOUT_KEY, tempoFinal.toString());
  fecharModal();
  checarTimeoutAtivo();
}

function exibirTelaDeTimeout(msRestantes) {
  modalTimeout.classList.remove("hidden");
  modalTimeout.classList.add("flex");

  if (timerInterval) clearInterval(timerInterval);

  function atualizarContador() {
    const agora = Date.now();
    const timeoutUntil = parseInt(localStorage.getItem(STORAGE_TIMEOUT_KEY) || "0", 10);
    const restante = timeoutUntil - agora;

    if (restante <= 0) {
      clearInterval(timerInterval);
      localStorage.removeItem(STORAGE_TIMEOUT_KEY);
      modalTimeout.classList.remove("flex");
      modalTimeout.classList.add("hidden");
      inicializarJogo(true);
      return;
    }

    const totalSeg = Math.floor(restante / 1000);
    const min = Math.floor(totalSeg / 60);
    const seg = totalSeg % 60;
    timeoutCountdown.textContent = `00:${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
  }

  atualizarContador();
  timerInterval = setInterval(atualizarContador, 1000);
}

function salvarEstadoLocal() {
  const dados = {
    palavraSecreta: EstadoJogo.palavraSecreta,
    tentativas: EstadoJogo.tentativas,
    linhaAtual: EstadoJogo.linhaAtual,
    colunaAtual: EstadoJogo.colunaAtual,
    fimDeJogo: EstadoJogo.fimDeJogo,
    tempoInicio: tempoInicio
  };
  localStorage.setItem(STORAGE_PARTIDA_KEY, JSON.stringify(dados));
}

function limparEstadoSalvo() {
  localStorage.removeItem(STORAGE_PARTIDA_KEY);
}

async function inicializarJogo(forcadoNovoJogo = false) {
  if (checarTimeoutAtivo()) return;

  fecharModal();
  tempoInicio = null;
  tempoFinalMs = 0;
  avatarSelecionado = AVATARES[0].id;

  let partidaSalva = null;
  if (!forcadoNovoJogo) {
    try {
      const raw = localStorage.getItem(STORAGE_PARTIDA_KEY);
      if (raw) partidaSalva = JSON.parse(raw);
    } catch (err) {
      console.warn("Falha ao restaurar a partida salva:", err);
    }
  }

  if (partidaSalva && partidaSalva.palavraSecreta && !partidaSalva.fimDeJogo) {
    await EstadoJogo.resetar(partidaSalva.palavraSecreta);
    EstadoJogo.tentativas = partidaSalva.tentativas;
    EstadoJogo.linhaAtual = partidaSalva.linhaAtual;
    EstadoJogo.colunaAtual = partidaSalva.colunaAtual;
    EstadoJogo.fimDeJogo = partidaSalva.fimDeJogo;
    tempoInicio = partidaSalva.tempoInicio;

    statusEl.textContent = "Adivinhe a palavra de 5 letras";
    renderizarGrade();
    renderizarTeclado();
    restaurarCoresNaGrade();
    selecionarCelula(EstadoJogo.linhaAtual, EstadoJogo.colunaAtual);
  } else {
    limparEstadoSalvo();
    statusEl.textContent = "Buscando palavra na API...";
    
    const palavra = await obterPalavraAleatoria();
    await EstadoJogo.resetar(palavra);

    statusEl.textContent = "Adivinhe a palavra de 5 letras";
    renderizarGrade();
    renderizarTeclado();
    selecionarCelula(0, 0);
  }
}

function renderizarGrade() {
  gridEl.innerHTML = "";
  const numCols = EstadoJogo.tamanhoPalavra;

  for (let r = 0; r < 6; r++) {
    const row = document.createElement("div");
    row.className = "flex gap-2 justify-center";

    for (let c = 0; c < numCols; c++) {
      const tile = document.createElement("div");
      tile.id = `tile-${r}-${c}`;
      
      const tileSize = numCols > 5 ? "w-10 h-10 text-lg" : "w-12 h-12 text-xl";
      const letra = EstadoJogo.tentativas[r] && EstadoJogo.tentativas[r][c] ? EstadoJogo.tentativas[r][c] : "";
      tile.textContent = letra;

      if (r < EstadoJogo.linhaAtual) {
        tile.className = `${tileSize} flex items-center justify-center font-extrabold text-[var(--text-principal)] rounded uppercase select-none transition-all duration-300 neon-border`;
      } else if (r === EstadoJogo.linhaAtual) {
        const estiloNeutro = letra
          ? "border-tema-borda-ativa bg-tema-caixa-ativa"
          : "border-tema-borda bg-tema-caixa";
        tile.className = `${tileSize} tile-current border-2 ${estiloNeutro} text-[var(--text-principal)] flex items-center justify-center font-extrabold rounded uppercase transition-all duration-150 cursor-pointer select-none neon-border`;
      } else {
        tile.className = `${tileSize} tile-inactive bg-tema-caixa border border-tema-borda flex items-center justify-center font-extrabold text-tema-tecla-texto rounded uppercase select-none pointer-events-none opacity-40 neon-border`;
      }

      tile.addEventListener("click", () => {
        if (r === EstadoJogo.linhaAtual && !EstadoJogo.fimDeJogo) {
          selecionarCelula(r, c);
        }
      });

      row.appendChild(tile);
    }
    gridEl.appendChild(row);
  }
}

function restaurarCoresNaGrade() {
  for (let r = 0; r < EstadoJogo.linhaAtual; r++) {
    aplicarCoresNaLinha(r);
  }
}

function selecionarCelula(r, c) {
  if (EstadoJogo.celulaSelecionada) {
    const [oldR, oldC] = EstadoJogo.celulaSelecionada;
    const oldTile = document.getElementById(`tile-${oldR}-${oldC}`);
    if (oldTile && oldR === EstadoJogo.linhaAtual) {
      oldTile.classList.remove(...CLASSES_FOCO);
    }
  }

  EstadoJogo.celulaSelecionada = [r, c];
  EstadoJogo.colunaAtual = c;
  const tile = document.getElementById(`tile-${r}-${c}`);
  if (tile) {
    tile.classList.add(...CLASSES_FOCO);
  }
}

function renderizarTeclado() {
  keyboardEl.innerHTML = "";
  TECLADO_LAYOUT.forEach((linha) => {
    const rowEl = document.createElement("div");
    rowEl.className = "flex justify-center gap-1.5 sm:gap-1 w-full mb-1 sm:mb-0";
    linha.forEach((key) => {
      const btn = document.createElement("button");
      btn.id = `key-${key}`;
      btn.textContent = key === "BACKSPACE" ? "⌫" : key;
      const width =
        key === "ENTER" || key === "BACKSPACE"
          ? "px-3 text-xs flex-1 font-bold"
          : "w-9 text-sm font-semibold";
      btn.className = `${width} h-14 sm:h-12 bg-tema-tecla text-tema-tecla-texto border-2 border-tema-borda rounded-md hover:bg-tema-caixa-ativa active:scale-95 active:brightness-125 touch-manipulation transition flex items-center justify-center cursor-pointer neon-border`;

      btn.addEventListener("click", () => {
        if (navigator.vibrate) navigator.vibrate(15);
        tratarEntrada(key);
      });
      rowEl.appendChild(btn);
    });
    keyboardEl.appendChild(rowEl);
  });
}

function encontrarProximaVazia(r, inicioCol) {
  const numCols = EstadoJogo.tamanhoPalavra;
  for (let col = inicioCol; col < numCols; col++) {
    if (EstadoJogo.tentativas[r][col] === "") {
      return col;
    }
  }
  return numCols - 1;
}

async function tratarEntrada(tecla) {
  if (EstadoJogo.fimDeJogo) return;

  if (!tempoInicio) {
    tempoInicio = Date.now();
  }

  const numCols = EstadoJogo.tamanhoPalavra;
  const [r, c] = EstadoJogo.celulaSelecionada || [EstadoJogo.linhaAtual, EstadoJogo.colunaAtual];

  if (tecla === "ARROWLEFT") {
    if (c > 0) selecionarCelula(r, c - 1);
  } else if (tecla === "ARROWRIGHT") {
    if (c < numCols - 1) selecionarCelula(r, c + 1);
  } else if (tecla === "BACKSPACE") {
    if (EstadoJogo.tentativas[r][c] !== "") {
      EstadoJogo.tentativas[r][c] = "";
      atualizarTile(r, c, "");
    } else if (c > 0) {
      selecionarCelula(r, c - 1);
      EstadoJogo.tentativas[r][c - 1] = "";
      atualizarTile(r, c - 1, "");
    }
    salvarEstadoLocal();
  } else if (tecla === "ENTER") {
    const tentativaAtual = EstadoJogo.tentativas[EstadoJogo.linhaAtual];
    const palpite = tentativaAtual.join("");

    if (tentativaAtual.length !== numCols || tentativaAtual.some((letra) => !letra)) {
      statusEl.textContent = "Preencha todas as 5 letras antes de confirmar!";
      return;
    }

    statusEl.textContent = "Validando palavra...";
    const existe = await palavraExiste(palpite);

    if (!existe) {
      statusEl.textContent = `A palavra "${palpite}" não existe no dicionário!`;
      return;
    }

    verificarPalpite();
  } else if (/^[A-Z]$/.test(tecla)) {
    EstadoJogo.tentativas[r][c] = tecla;
    atualizarTile(r, c, tecla);

    const proximaVazia = encontrarProximaVazia(r, c + 1);
    selecionarCelula(r, proximaVazia);
    salvarEstadoLocal();
  }
}

function atualizarTile(r, c, letra) {
  const tile = document.getElementById(`tile-${r}-${c}`);
  if (tile && r === EstadoJogo.linhaAtual) {
    tile.textContent = letra;
    if (letra) {
      tile.classList.remove("border-tema-borda", "bg-tema-caixa");
      tile.classList.add("border-tema-borda-ativa", "bg-tema-caixa-ativa");
    } else {
      tile.classList.remove("border-tema-borda-ativa", "bg-tema-caixa-ativa");
      tile.classList.add("border-tema-borda", "bg-tema-caixa");
    }
  }
}

function aplicarCoresNaLinha(r) {
  const palpiteArr = EstadoJogo.tentativas[r];
  const secretaArr = EstadoJogo.palavraSecreta.split("");
  const numCols = EstadoJogo.tamanhoPalavra;
  const tileSize = numCols > 5 ? "w-10 h-10 text-lg" : "w-12 h-12 text-xl";

  const contagemSecreta = {};
  secretaArr.forEach((letra) => {
    contagemSecreta[letra] = (contagemSecreta[letra] || 0) + 1;
  });

  const resultado = Array(numCols).fill("cinza");

  palpiteArr.forEach((letra, i) => {
    if (letra === secretaArr[i]) {
      resultado[i] = "verde";
      contagemSecreta[letra]--;
    }
  });

  palpiteArr.forEach((letra, i) => {
    if (resultado[i] !== "verde") {
      if (secretaArr.includes(letra) && contagemSecreta[letra] > 0) {
        resultado[i] = "amarelo";
        contagemSecreta[letra]--;
      }
    }
  });

  palpiteArr.forEach((letra, i) => {
    const tile = document.getElementById(`tile-${r}-${i}`);
    const keyBtn = document.getElementById(`key-${letra}`);
    const cor = resultado[i];

    if (tile) {
      if (cor === "verde") {
        tile.className = `${tileSize} bg-emerald-600 text-white flex items-center justify-center font-bold rounded uppercase neon-border`;
      } else if (cor === "amarelo") {
        tile.className = `${tileSize} bg-amber-500 text-white flex items-center justify-center font-bold rounded uppercase neon-border`;
      } else {
        tile.className = `${tileSize} bg-tema-caixa text-[var(--text-principal)] opacity-50 flex items-center justify-center font-bold rounded uppercase neon-border`;
      }
    }

    if (!keyBtn) return;

    const isVerde = keyBtn.classList.contains("bg-emerald-600");
    const isAmarelo = keyBtn.classList.contains("bg-amber-500");
    keyBtn.classList.remove("hover:bg-tema-caixa-ativa");

    if (cor === "verde" && !isVerde) {
      keyBtn.classList.remove(
        "bg-tema-tecla",
        "bg-amber-500",
        "text-tema-tecla-texto",
        "opacity-50"
      );
      keyBtn.classList.add("bg-emerald-600", "text-white");
    } else if (cor === "amarelo" && !isVerde && !isAmarelo) {
      keyBtn.classList.remove("bg-tema-tecla", "text-tema-tecla-texto", "opacity-50");
      keyBtn.classList.add("bg-amber-500", "text-white");
    } else if (cor === "cinza" && !isVerde && !isAmarelo) {
      keyBtn.classList.add("opacity-50");
    }
  });
}

function verificarPalpite() {
  const r = EstadoJogo.linhaAtual;
  const palpite = EstadoJogo.tentativas[r].join("");

  const currentTile = document.getElementById(`tile-${r}-${EstadoJogo.colunaAtual}`);
  if (currentTile) currentTile.classList.remove(...CLASSES_FOCO);

  aplicarCoresNaLinha(r);

  if (palpite === EstadoJogo.palavraSecreta) {
    tempoFinalMs = tempoInicio ? Date.now() - tempoInicio : 0;
    statusEl.textContent = "Parabéns! Você venceu!";
    EstadoJogo.fimDeJogo = true;
    limparEstadoSalvo();
    setTimeout(() => abrirModal(true), 600);
  } else if (r === 5) {
    statusEl.textContent = `Fim de jogo! A palavra era: ${EstadoJogo.palavraSecreta}`;
    EstadoJogo.fimDeJogo = true;
    limparEstadoSalvo();
    setTimeout(() => abrirModal(false), 600);
  } else {
    EstadoJogo.linhaAtual++;
    statusEl.textContent = "Tente novamente...";
    
    renderizarGrade();
    restaurarCoresNaGrade();
    selecionarCelula(EstadoJogo.linhaAtual, 0);
    salvarEstadoLocal();
  }
}

// Funções de Leaderboard
function formatarTempo(ms) {
  const totalSeg = Math.floor(ms / 1000);
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  const msResto = Math.floor((ms % 1000) / 10);
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}.${String(msResto).padStart(2, '0')}`;
}

function obterSemanaAtual() {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() - (data.getDay() === 0 ? 6 : data.getDay() - 1));
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function normalizarLeaderboard(valor) {
  const dados = Array.isArray(valor)
    ? { semanaReset: obterSemanaAtual(), topTempos: valor, pontuacaoGeral: {} }
    : valor && typeof valor === "object"
      ? valor
      : {};
  const semanaAtual = obterSemanaAtual();
  const mesmaSemana = !dados.semanaReset || dados.semanaReset === semanaAtual;

  return {
    semanaReset: semanaAtual,
    topTempos: mesmaSemana && Array.isArray(dados.topTempos) ? dados.topTempos : [],
    pontuacaoGeral: dados.pontuacaoGeral && typeof dados.pontuacaoGeral === "object"
      ? Object.assign(Object.create(null), dados.pontuacaoGeral)
      : Object.create(null)
  };
}

export async function obterLeaderboard() {
  try {
    const res = await fetch(`${API_URL}/`, {
      headers: { "X-Master-Key": API_KEY }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const leaderboard = normalizarLeaderboard(data);
    localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(leaderboard));
    return leaderboard;
  } catch (err) {
    console.warn("Falha na API, buscando cache local:", err);
    try {
      const raw = localStorage.getItem(STORAGE_LEADERBOARD_KEY);
      const leaderboard = normalizarLeaderboard(raw ? JSON.parse(raw) : null);
      localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(leaderboard));
      return leaderboard;
    } catch (err) {
      console.warn("Falha ao ler o cache local do leaderboard:", err);
      return normalizarLeaderboard(null);
    }
  }
}

function lerEventosPontuacaoPendentes() {
  const raw = localStorage.getItem(STORAGE_PENDING_SCORE_EVENTS_KEY);
  if (!raw) return [];

  const eventos = JSON.parse(raw);
  if (!Array.isArray(eventos)) {
    throw new Error("A fila de sincronização de pontos está inválida.");
  }
  return eventos;
}

function aplicarEventoAoLeaderboard(leaderboard, evento) {
  if (evento.registrarTempo) {
    leaderboard.topTempos.push({
      nome: evento.nome,
      tempoMs: evento.tempoMs,
      avatar: evento.avatar,
      historico: evento.historico,
      data: evento.data
    });
    leaderboard.topTempos.sort((a, b) => a.tempoMs - b.tempoMs);
    leaderboard.topTempos = leaderboard.topTempos.slice(0, 10);
  }

  const contaAtual = Object.prototype.hasOwnProperty.call(leaderboard.pontuacaoGeral, evento.pin)
    ? leaderboard.pontuacaoGeral[evento.pin]
    : { nome: evento.nome, pontos: 0, avatar: evento.avatar };
  contaAtual.pontos += evento.pontosGanhos;
  contaAtual.nome = evento.nome;
  contaAtual.avatar = evento.avatar;
  leaderboard.pontuacaoGeral[evento.pin] = contaAtual;
}

function gerarIdEvento() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sincronizarPontuacoesPendentes() {
  let eventosPendentes;
  try {
    eventosPendentes = lerEventosPontuacaoPendentes();
  } catch (err) {
    console.error("Erro ao ler a fila de sincronização de pontos:", err);
    return { sincronizado: false, erro: err.message };
  }

  while (eventosPendentes.length > 0) {
    const evento = eventosPendentes[0];
    try {
      const res = await fetch(`${API_URL}/salvar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": API_KEY
        },
        body: JSON.stringify(evento)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const resultado = await res.json();
      if (resultado.sucesso !== true || !Number.isFinite(resultado.pontos)) {
        throw new Error("A API retornou uma confirmação inválida.");
      }

      eventosPendentes.shift();
      localStorage.setItem(STORAGE_PENDING_SCORE_EVENTS_KEY, JSON.stringify(eventosPendentes));

      try {
        const leaderboard = normalizarLeaderboard(
          JSON.parse(localStorage.getItem(STORAGE_LEADERBOARD_KEY) || "null")
        );
        const contaAtual = leaderboard.pontuacaoGeral[evento.pin] || {
          nome: evento.nome,
          pontos: 0,
          avatar: evento.avatar
        };
        contaAtual.nome = evento.nome;
        contaAtual.pontos = resultado.pontos;
        contaAtual.avatar = evento.avatar;
        leaderboard.pontuacaoGeral[evento.pin] = contaAtual;
        localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(leaderboard));
      } catch (err) {
        console.error("A API confirmou os pontos, mas não foi possível atualizar o cache local:", err);
      }
    } catch (err) {
      console.error("Erro ao sincronizar pontuação pendente:", err);
      return { sincronizado: false, erro: err.message };
    }
  }

  return { sincronizado: true };
}

export async function salvarNovoRecorde(nome, pin, tempoMs, avatarId = "doge", registrarTempo = true) {
  const leaderboard = await obterLeaderboard();
  const nomeDisplay = nome.trim().toUpperCase() || "JOGADOR";
  const idConta = pin.trim().toUpperCase() || "JOGADOR_GHOST";

  const historicoPalpites = EstadoJogo.tentativas
    .map(linha => linha.join(""))
    .filter(palavra => palavra.length === EstadoJogo.tamanhoPalavra);

  const pontosGanhos = TABELA_PONTOS[EstadoJogo.linhaAtual] || 10;
  const eventosPendentes = lerEventosPontuacaoPendentes();
  const evento = {
    eventId: gerarIdEvento(),
    nome: nomeDisplay,
    pin: idConta,
    tempoMs,
    avatar: avatarId,
    registrarTempo,
    pontosGanhos,
    historico: historicoPalpites,
    data: new Date().toLocaleDateString("pt-BR")
  };
  eventosPendentes.push(evento);
  localStorage.setItem(STORAGE_PENDING_SCORE_EVENTS_KEY, JSON.stringify(eventosPendentes));

  aplicarEventoAoLeaderboard(leaderboard, evento);

  localStorage.setItem(STORAGE_USER_PIN_KEY, idConta);
  localStorage.setItem(STORAGE_USER_NAME_KEY, nomeDisplay);
  localStorage.setItem(STORAGE_USER_AVATAR_KEY, avatarId);
  localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(leaderboard));

  const resultado = await sincronizarPontuacoesPendentes();
  return { pontosGanhos, sincronizado: resultado.sincronizado, erro: resultado.erro };
}

// Abrir Modal de Avatares
function abrirModalDeAvatares() {
  avatarGridContainer.innerHTML = AVATARES
    .filter((item) => !item.oculto) // <--- ESTA LINHA ESCONDE O GARY
    .map((item) => `
    <div 
      data-id="${item.id}"
      class="avatar-card-item flex flex-col items-center justify-between p-3 rounded-xl border-2 ${item.id === avatarSelecionado ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-900/50 opacity-70'} hover:opacity-100 cursor-pointer transition-all duration-150"
    >
      <img src="${item.src}" class="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border border-slate-700/60 shadow-md" alt="${item.nome}" />
      <span class="text-xs font-semibold text-slate-200 text-center truncate max-w-full mt-1.5">${item.nome}</span>
    </div>
  `).join("");

  modalAvatarSelector.classList.remove("hidden");
  modalAvatarSelector.classList.add("flex");

  const cards = document.querySelectorAll(".avatar-card-item");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      cards.forEach((c) => {
        c.classList.remove("border-amber-400", "bg-amber-400/10");
        c.classList.add("border-slate-800", "bg-slate-900/50", "opacity-70");
      });
      card.classList.remove("border-slate-800", "bg-slate-900/50", "opacity-70");
      card.classList.add("border-amber-400", "bg-amber-400/10");
      avatarSelecionado = card.getAttribute("data-id");
    });
  });
}

function fecharModalDeAvatares() {
  modalAvatarSelector.classList.remove("flex");
  modalAvatarSelector.classList.add("hidden");
}

btnCloseAvatarModal.addEventListener("click", fecharModalDeAvatares);
btnConfirmAvatar.addEventListener("click", () => {
  localStorage.setItem(STORAGE_USER_AVATAR_KEY, avatarSelecionado);
  const currentAvatarPreview = document.getElementById("current-avatar-preview");
  if (currentAvatarPreview) {
    currentAvatarPreview.src = obterSrcAvatar(avatarSelecionado);
  }
  fecharModalDeAvatares();
});

// Controle do Modal Autoral
async function abrirModal(vitoria) {
  modalSecretWord.textContent = EstadoJogo.palavraSecreta;

  const oldLb = document.getElementById("modal-leaderboard-section");
  if (oldLb) oldLb.remove();

  if (vitoria) {
    const tempoStr = formatarTempo(tempoFinalMs);
    const leaderboard = await obterLeaderboard();
    const leaderboardTempos = leaderboard.topTempos;
    
    const piorTempoCadastrado = leaderboardTempos.length > 0
      ? leaderboardTempos[leaderboardTempos.length - 1].tempoMs
      : Infinity;
    const ehNovoRecorde = leaderboardTempos.length < 10 || tempoFinalMs < piorTempoCadastrado;
    const pontosGanhos = TABELA_PONTOS[EstadoJogo.linhaAtual] || 10;

    if (EstadoJogo.linhaAtual === 0) {
      modalBadge.textContent = "DE PRIMEIRA!";
      modalBadge.className = "px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-widest bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/25";
      modalTitle.textContent = "GÊNIO DO TERMO!";
    } else {
      modalBadge.textContent = ehNovoRecorde ? "Novo Recorde!" : "Vitória";
      modalBadge.className = ehNovoRecorde
        ? "px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20"
        : "px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      modalTitle.textContent = "Palavra Adivinhada!";
    }

    modalTitle.className = "text-xl font-bold text-white tracking-tight";
    modalBody.textContent = `Resolvido em ${EstadoJogo.linhaAtual + 1} tentativa(s) • Tempo: ${tempoStr} (+${pontosGanhos} pts)`;
    modalBtnRestart.className = "w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-4 rounded-lg transition-all duration-200 cursor-pointer";

    const lbSection = document.createElement("div");
    lbSection.id = "modal-leaderboard-section";
    lbSection.className = "w-full flex flex-col gap-2.5 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 text-left";

    const nomeSalvo = localStorage.getItem(STORAGE_USER_NAME_KEY) || "";
    const pinSalvo = localStorage.getItem(STORAGE_USER_PIN_KEY) || "";
    const avatarSalvo = localStorage.getItem(STORAGE_USER_AVATAR_KEY);
    const temPerfilSalvo = Boolean(nomeSalvo.trim() && pinSalvo.trim());
    avatarSelecionado = avatarSalvo || AVATARES[0].id;

    const avatarEditorHtml = `
      <div class="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
        <div class="flex items-center gap-3">
          <img id="current-avatar-preview" src="${obterSrcAvatar(avatarSelecionado)}" class="w-11 h-11 rounded-full object-cover border-2 border-amber-400 shadow" alt="Avatar" />
          <div class="flex flex-col">
            <span class="modal-avatar-title text-xs font-semibold text-slate-200">Avatar</span>
            <span class="modal-avatar-description text-[10px] text-slate-400">Escolha a sua imagem</span>
          </div>
        </div>
        <button id="btn-open-avatar-picker" type="button" class="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700/80 transition cursor-pointer">
          <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
          </svg>
          <span>Alterar</span>
        </button>
      </div>
    `;
    const cadastroHtml = temPerfilSalvo ? "" : `
      <div class="flex flex-col gap-2 mt-1">
        <input type="text" id="record-name-input" maxlength="15" placeholder="NOME VISÍVEL NO RANKING (EX: GIGACHAD67)" autocomplete="off" autocorrect="off" spellcheck="false" class="bg-slate-800 text-white text-xs font-medium px-3 py-2 rounded-lg border border-slate-700 w-full focus:outline-none focus:border-slate-500 uppercase" />
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2">
            <input type="password" id="record-pin-input" maxlength="15" placeholder="ID SECRETO (EX: MACACO44)" autocomplete="off" class="bg-slate-800 text-white text-xs font-medium px-3 py-2 rounded-lg border border-slate-700 w-full focus:outline-none focus:border-slate-500 uppercase" />
            <button id="btn-save-record" type="button" class="bg-amber-500 hover:bg-amber-400 active:bg-amber-300 text-slate-950 font-semibold text-xs px-3 rounded-lg transition-colors cursor-pointer shrink-0 min-w-[72px] h-[34px] focus:outline-none focus:ring-2 focus:ring-amber-300/50">Salvar</button>
          </div>
          <span class="flex items-start gap-1.5 text-[9px] text-rose-300/90 font-medium leading-tight px-1 tracking-wide">
            <svg class="w-3 h-3 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"></path>
            </svg>
            <span>Não use senhas reais. O ID não pode ser igual ao nome.</span>
          </span>
        </div>
      </div>
    `;
    lbSection.innerHTML = `
        <span class="text-[10px] font-semibold text-amber-400 uppercase tracking-wider text-center block">${temPerfilSalvo ? "Seus pontos são salvos automaticamente" : "Informe seus dados para registrar os pontos"}</span>
        <div class="flex flex-col gap-2.5">
          ${avatarEditorHtml}
          ${cadastroHtml}
          <div class="flex flex-col gap-1.5">
            <span id="record-save-status" class="text-[10px] text-slate-400 text-center">${temPerfilSalvo ? "Salvando pontos..." : ""}</span>
            <button id="btn-retry-record-sync" type="button" hidden class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold px-3 py-1.5 rounded-lg border border-slate-700 transition cursor-pointer">Tentar sincronizar novamente</button>
          </div>
        </div>
    `;
    if (!temPerfilSalvo) {
      document.getElementById("record-name-input").value = nomeSalvo;
      document.getElementById("record-pin-input").value = pinSalvo;
    }
    if (EstadoJogo.linhaAtual === 0) {
      const btnPremio = document.createElement("button");
      btnPremio.type = "button";
      btnPremio.id = "btn-claim-prize";
      btnPremio.className = "w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold tracking-wide text-xs py-2.5 px-4 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2";
      btnPremio.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M20 12v10H4V12m16 0H4m16 0h1a2 2 0 0 0 2-2V7H1v3a2 2 0 0 0 2 2h1m8 0v10m0-10H7.5a2.5 2.5 0 1 1 2.5-2.5V12Zm0 0h4.5a2.5 2.5 0 1 0-2.5-2.5V12Z"></path>
        </svg>
        <span>Resgatar prêmio máximo</span>
      `;
      btnPremio.addEventListener("click", () => {
        window.open("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "_blank", "noopener,noreferrer");
      });
      lbSection.prepend(btnPremio);
    }

    modalSecretWord.parentElement.after(lbSection);

    setTimeout(async () => {
      const btnOpenPicker = document.getElementById("btn-open-avatar-picker");
      if (btnOpenPicker) {
        btnOpenPicker.addEventListener("click", abrirModalDeAvatares);
      }

      const saveStatus = document.getElementById("record-save-status");
      const retryButton = document.getElementById("btn-retry-record-sync");
      const tentarSincronizar = async () => {
        if (!saveStatus || !retryButton) return;
        retryButton.disabled = true;
        retryButton.textContent = "Sincronizando...";
        const resultado = await sincronizarPontuacoesPendentes();
        if (resultado.sincronizado) {
          saveStatus.textContent = "Pontos sincronizados com o ranking.";
          retryButton.hidden = true;
        } else {
          saveStatus.textContent = "Não foi possível sincronizar. Os pontos continuam salvos neste navegador.";
          retryButton.textContent = "Tentar sincronizar novamente";
        }
        retryButton.disabled = false;
      };
      if (retryButton) {
        retryButton.addEventListener("click", tentarSincronizar);
      }

      const btnSave = document.getElementById("btn-save-record");
      if (btnSave) {
        btnSave.addEventListener("click", async () => {
          const nameInput = document.getElementById("record-name-input");
          const pinInput = document.getElementById("record-pin-input");
          if (nameInput && nameInput.value.trim() && pinInput && pinInput.value.trim()) {
            
            // --- NOVA TRAVA: Nome não pode ser igual ao PIN ---
            if (nameInput.value.trim().toUpperCase() === pinInput.value.trim().toUpperCase()) {
              alert("Por segurança, o seu ID Secreto não pode ser igual ao Nome visível no ranking!");
              return;
            }

            // VERIFICAÇÃO TROLL: Se escolher o avatar armadilha, toma timeout de 30 minutos!
            const avatarObjeto = AVATARES.find(a => a.id === avatarSelecionado);
            if (avatarObjeto && avatarObjeto.troll) {
              aplicarPunicaoTimeout(5);
              return;
            }

            btnSave.disabled = true;
            btnSave.textContent = "Salvando...";
            try {
              const resultado = await salvarNovoRecorde(
                nameInput.value,
                pinInput.value,
                tempoFinalMs,
                avatarSelecionado,
                ehNovoRecorde
              );
              btnSave.textContent = resultado.sincronizado
                ? `Salvo (+${resultado.pontosGanhos} pts)`
                : `Local (+${resultado.pontosGanhos} pts)`;
              btnSave.className = resultado.sincronizado
                ? "bg-emerald-600 text-white font-semibold text-xs px-3 rounded-lg shrink-0 min-w-[72px] h-[34px] text-center"
                : "bg-amber-600 text-white font-semibold text-xs px-3 rounded-lg shrink-0 min-w-[72px] h-[34px] text-center";
              if (saveStatus) {
                saveStatus.textContent = resultado.sincronizado
                  ? "Pontos sincronizados com o ranking."
                  : "Pontos salvos neste navegador; não foi possível sincronizar.";
              }
              if (retryButton) {
                retryButton.hidden = resultado.sincronizado;
              }
            } catch (err) {
              console.error("Erro ao registrar a pontuação:", err);
              btnSave.disabled = false;
              btnSave.textContent = "Tentar de novo";
              if (saveStatus) {
                saveStatus.textContent = "Não foi possível salvar os pontos. Tente novamente.";
              }
              if (retryButton) retryButton.hidden = false;
            }
          } else {
            btnSave.textContent = "Preencha nome e PIN";
            setTimeout(() => {
              if (!btnSave.disabled) btnSave.textContent = "Salvar";
            }, 1500);
          }
        });
      }

      if (temPerfilSalvo && saveStatus) {
        try {
          const resultado = await salvarNovoRecorde(
            nomeSalvo,
            pinSalvo,
            tempoFinalMs,
            avatarSelecionado,
            ehNovoRecorde
          );
          saveStatus.textContent = resultado.sincronizado
            ? "Pontos sincronizados com o ranking."
            : "Pontos salvos neste navegador; não foi possível sincronizar.";
          if (retryButton) retryButton.hidden = resultado.sincronizado;
        } catch (err) {
          console.error("Erro ao salvar automaticamente os pontos:", err);
          saveStatus.textContent = "Não foi possível salvar os pontos. Tente novamente.";
          if (retryButton) retryButton.hidden = false;
        }
      }
    }, 50);

  } else {
    modalBadge.textContent = "Derrota";
    modalBadge.className = "px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20";
    modalTitle.textContent = "Tentativas Esgotadas";
    modalTitle.className = "text-xl font-bold text-white tracking-tight";
    modalBody.textContent = "Não foi desta vez. Tente novamente!";
    modalBtnRestart.className = "w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs py-2.5 px-4 rounded-lg border border-slate-700 transition-all duration-200 cursor-pointer";
  }

  modalEndgame.classList.remove("hidden");
  modalEndgame.classList.add("flex");

  setTimeout(() => {
    modalCard.classList.remove("scale-95", "opacity-0");
    modalCard.classList.add("scale-100", "opacity-100");
  }, 10);
}

function fecharModal() {
  modalCard.classList.remove("scale-100", "opacity-100");
  modalCard.classList.add("scale-95", "opacity-0");
  setTimeout(() => {
    modalEndgame.classList.remove("flex");
    modalEndgame.classList.add("hidden");
  }, 200);
}

// Listeners de Teclado e Ações
document.addEventListener("keydown", (e) => {
  if (!modalThemePicker.classList.contains("hidden")) {
    if (e.key === "Escape") {
      e.preventDefault();
      fecharSeletorDeTema(false);
    }
    return;
  }

  const tecla = e.key.toUpperCase();
  if (
    tecla === "ENTER" ||
    tecla === "BACKSPACE" ||
    tecla === "ARROWLEFT" ||
    tecla === "ARROWRIGHT" ||
    /^[A-Z]$/.test(tecla)
  ) {
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    e.preventDefault();
    tratarEntrada(tecla);
  }
});

btnRestart.addEventListener("click", () => inicializarJogo(true));
modalBtnRestart.addEventListener("click", () => inicializarJogo(true));

function selecionarTema(tema) {
  if (!THEMES_AVAILABLE.includes(tema)) return;
  document.body.setAttribute("data-theme", tema);
  document.querySelectorAll("[data-theme-choice]").forEach((choice) => {
    choice.setAttribute("aria-pressed", String(choice.getAttribute("data-theme-choice") === tema));
  });
}

function abrirSeletorDeTema() {
  themeAtOpening = document.body.getAttribute("data-theme") || "dark";
  selecionarTema(themeAtOpening);
  modalThemePicker.classList.remove("hidden");
  modalThemePicker.classList.add("flex");
  modalThemePicker.setAttribute("aria-hidden", "false");
  const selectedChoice = modalThemePicker.querySelector(`[data-theme-choice="${themeAtOpening}"]`);
  (selectedChoice || btnCloseThemePicker).focus();
}

function fecharSeletorDeTema(aplicar) {
  if (aplicar) {
    localStorage.setItem(STORAGE_THEME_KEY, document.body.getAttribute("data-theme") || "dark");
  } else {
    selecionarTema(themeAtOpening);
  }
  modalThemePicker.classList.remove("flex");
  modalThemePicker.classList.add("hidden");
  modalThemePicker.setAttribute("aria-hidden", "true");
  btnThemePicker.focus();
}

btnThemePicker.addEventListener("click", abrirSeletorDeTema);
btnCloseThemePicker.addEventListener("click", () => fecharSeletorDeTema(false));
btnCancelTheme.addEventListener("click", () => fecharSeletorDeTema(false));
btnApplyTheme.addEventListener("click", () => fecharSeletorDeTema(true));
modalThemePicker.addEventListener("click", (event) => {
  if (event.target === modalThemePicker) fecharSeletorDeTema(false);
});
modalThemePicker.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const focusableButtons = Array.from(modalThemePicker.querySelectorAll("button:not([disabled])"));
  const firstButton = focusableButtons[0];
  const lastButton = focusableButtons[focusableButtons.length - 1];
  if (event.shiftKey && document.activeElement === firstButton) {
    event.preventDefault();
    lastButton.focus();
  } else if (!event.shiftKey && document.activeElement === lastButton) {
    event.preventDefault();
    firstButton.focus();
  }
});
modalThemePicker.querySelectorAll("[data-theme-choice]").forEach((choice) => {
  choice.addEventListener("click", () => selecionarTema(choice.getAttribute("data-theme-choice")));
});

inicializarJogo(false);
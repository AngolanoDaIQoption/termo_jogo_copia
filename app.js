import { EstadoJogo, TEMAS } from "./state.js";
import { obterPalavraAleatoria, palavraExiste } from "./api.js";
import { AVATARES, obterSrcAvatar } from "./avatars.js";

const gridEl = document.getElementById("grid");
const keyboardEl = document.getElementById("keyboard");
const statusEl = document.getElementById("status-message");
const btnRestart = document.getElementById("btn-restart");
const themeSelect = document.getElementById("theme-select");
const bodyEl = document.getElementById("app-body");

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

const CLASSES_FOCO = ['ring-2', 'ring-[#1447e6]', 'border-[#1447e6]'];
const STORAGE_PARTIDA_KEY = "termo_partida_atual_v1";
const STORAGE_LEADERBOARD_KEY = "termo_leaderboard_v1";

// Configuração do JSONbin (Access Key em Base64)
const JSONBIN_BIN_ID = "6aed5519ffd5d16053aad2c0";
const JSONBIN_ACCESS_KEY = atob("JDJhJDEwJDVxVzk2RzB2d1o3SDF3ODlPeTkySGVrQTZTQWJaTFo1TGJVY2FMNTEuWGdycDZlbDBSVWg2");

let tempoInicio = null;
let tempoFinalMs = 0;
let avatarSelecionado = AVATARES[0].id;

const TECLADO_LAYOUT = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
];

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
  fecharModal();
  tempoInicio = null;
  tempoFinalMs = 0;
  avatarSelecionado = AVATARES[0].id;

  let partidaSalva = null;
  if (!forcadoNovoJogo) {
    try {
      const raw = localStorage.getItem(STORAGE_PARTIDA_KEY);
      if (raw) partidaSalva = JSON.parse(raw);
    } catch {}
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
        tile.className = `${tileSize} flex items-center justify-center font-extrabold text-white rounded uppercase select-none transition-all duration-300`;
      } else if (r === EstadoJogo.linhaAtual) {
        const estiloBorda = letra ? "border-slate-500 bg-slate-800 text-white" : "border-slate-700 bg-slate-900/40 text-white";
        tile.className = `${tileSize} border-2 ${estiloBorda} flex items-center justify-center font-extrabold rounded uppercase transition-all duration-150 cursor-pointer select-none`;
      } else {
        tile.className = `${tileSize} bg-slate-900/30 border border-slate-800/50 flex items-center justify-center font-extrabold text-slate-700 rounded uppercase select-none pointer-events-none opacity-40`;
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
    rowEl.className = "flex justify-center gap-1 w-full";
    linha.forEach((key) => {
      const btn = document.createElement("button");
      btn.id = `key-${key}`;
      btn.textContent = key === "BACKSPACE" ? "⌫" : key;
      const width =
        key === "ENTER" || key === "BACKSPACE"
          ? "px-3 text-xs flex-1 font-bold"
          : "w-9 text-sm font-semibold";
      btn.className = `${width} h-12 bg-slate-700 text-white rounded hover:bg-slate-600 transition flex items-center justify-center cursor-pointer`;

      btn.addEventListener("click", () => tratarEntrada(key));
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
      tile.className = tile.className
        .replace(/border-slate-\d+/, "border-slate-400")
        .replace(/bg-slate-\S+/, "bg-slate-800");
      tile.classList.add("text-white");
    } else {
      tile.className = tile.className
        .replace(/border-slate-\d+/, "border-slate-700")
        .replace(/bg-slate-\S+/, "bg-slate-900/40");
      tile.classList.add("text-white");
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

    if (cor === "verde") {
      tile.className = `${tileSize} bg-emerald-600 text-white flex items-center justify-center font-bold rounded uppercase`;
      if (keyBtn) keyBtn.className = keyBtn.className.replace(/bg-\S+/, "bg-emerald-600");
    } else if (cor === "amarelo") {
      tile.className = `${tileSize} bg-amber-500 text-white flex items-center justify-center font-bold rounded uppercase`;
      if (keyBtn && !keyBtn.classList.contains("bg-emerald-600")) {
        keyBtn.className = keyBtn.className.replace(/bg-\S+/, "bg-amber-500");
      }
    } else {
      tile.className = `${tileSize} bg-slate-800 text-slate-400 flex items-center justify-center font-bold rounded uppercase`;
      if (
        keyBtn &&
        !keyBtn.classList.contains("bg-emerald-600") &&
        !keyBtn.classList.contains("bg-amber-500")
      ) {
        keyBtn.className = keyBtn.className.replace(/bg-\S+/, "bg-slate-800/60 text-slate-500");
      }
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

export async function obterLeaderboard() {
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
      headers: { "X-Access-Key": JSONBIN_ACCESS_KEY }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ranking = Array.isArray(data.record) ? data.record : [];
    localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(ranking));
    return ranking;
  } catch (err) {
    console.warn("Falha no JSONbin, buscando cache local:", err);
    try {
      const raw = localStorage.getItem(STORAGE_LEADERBOARD_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export async function salvarNovoRecorde(nome, tempoMs, avatarId = "doge") {
  const listaAtual = await obterLeaderboard();
  
  listaAtual.push({ 
    nome: nome.trim().toUpperCase() || "JOGADOR", 
    tempoMs, 
    avatar: avatarId, 
    data: new Date().toLocaleDateString() 
  });

  listaAtual.sort((a, b) => a.tempoMs - b.tempoMs);
  const top10 = listaAtual.slice(0, 10);

  localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(top10));

  try {
    await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": JSONBIN_ACCESS_KEY
      },
      body: JSON.stringify(top10)
    });
  } catch (err) {
    console.error("Erro ao sincronizar com JSONbin:", err);
  }
}

// Abrir Modal de Avatares Ampliado (3 por linha + Zoom)
function abrirModalDeAvatares() {
  avatarGridContainer.innerHTML = AVATARES.map((item) => `
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
    
    // É recorde se a lista tiver menos de 10 itens OU se o tempo for menor que o último colocado
    const piorTempoCadastrado = leaderboard.length > 0 ? leaderboard[leaderboard.length - 1].tempoMs : Infinity;
    const ehNovoRecorde = leaderboard.length < 10 || tempoFinalMs < piorTempoCadastrado;

    modalBadge.textContent = ehNovoRecorde ? "Novo Recorde!" : "Vitória";
    modalBadge.className = ehNovoRecorde
      ? "px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20"
      : "px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";

    modalTitle.textContent = "Palavra Adivinhada!";
    modalTitle.className = "text-xl font-bold text-white tracking-tight";
    modalBody.textContent = `Resolvido em ${EstadoJogo.linhaAtual + 1} tentativa(s) • Tempo: ${tempoStr}`;
    modalBtnRestart.className = "w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-4 rounded-lg transition-all duration-200 cursor-pointer";

    const lbSection = document.createElement("div");
    lbSection.id = "modal-leaderboard-section";
    lbSection.className = "w-full flex flex-col gap-2.5 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 text-left";

    if (ehNovoRecorde) {
      avatarSelecionado = AVATARES[0].id;

      lbSection.innerHTML = `
        <span class="text-[10px] font-semibold text-amber-400 uppercase tracking-wider text-center block">Qualifique-se no Top 10</span>
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <div class="flex items-center gap-3">
              <img id="current-avatar-preview" src="${obterSrcAvatar(avatarSelecionado)}" class="w-11 h-11 rounded-full object-cover border-2 border-amber-400 shadow" alt="Avatar" />
              <div class="flex flex-col">
                <span class="text-xs font-semibold text-slate-200">Avatar</span>
                <span class="text-[10px] text-slate-400">Escolha a sua imagem</span>
              </div>
            </div>
            <button id="btn-open-avatar-picker" type="button" class="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700/80 transition cursor-pointer">
              <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
              </svg>
              <span>Alterar</span>
            </button>
          </div>
          <div class="flex gap-2">
            <input type="text" id="record-name-input" maxlength="10" placeholder="SEU NOME" class="bg-slate-800 text-white text-xs font-semibold px-3 py-2 rounded-lg border border-slate-700 flex-1 focus:outline-none uppercase" />
            <button id="btn-save-record" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3.5 py-2 rounded-lg transition cursor-pointer">Salvar</button>
          </div>
        </div>
      `;
    } else {
      let rankingHtml = leaderboard.slice(0, 5).map((item, idx) => `
        <div class="flex justify-between items-center text-xs font-medium ${idx === 0 ? 'text-amber-400 font-bold' : 'text-slate-300'}">
          <div class="flex items-center gap-2.5">
            <img src="${obterSrcAvatar(item.avatar)}" class="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-slate-700" alt="avatar" />
            <span>#${idx + 1} ${item.nome}</span>
          </div>
          <span class="font-mono">${formatarTempo(item.tempoMs)}</span>
        </div>
      `).join("");

      lbSection.innerHTML = `
        <span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center block">Top 5 Geral</span>
        <div class="flex flex-col gap-2 mt-1">${rankingHtml}</div>
      `;
    }

    modalSecretWord.parentElement.after(lbSection);

    setTimeout(() => {
      const btnOpenPicker = document.getElementById("btn-open-avatar-picker");
      if (btnOpenPicker) {
        btnOpenPicker.addEventListener("click", abrirModalDeAvatares);
      }

      const btnSave = document.getElementById("btn-save-record");
      if (btnSave) {
        btnSave.addEventListener("click", async () => {
          const nameInput = document.getElementById("record-name-input");
          if (nameInput && nameInput.value) {
            btnSave.disabled = true;
            btnSave.textContent = "Salvando...";
            await salvarNovoRecorde(nameInput.value, tempoFinalMs, avatarSelecionado);
            btnSave.textContent = "Salvo ✓";
            btnSave.className = "bg-emerald-600 text-white font-semibold text-xs px-3 py-2 rounded-lg";
          }
        });
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

themeSelect.addEventListener("change", (e) => {
  const tema = TEMAS[e.target.value];
  if (tema) {
    bodyEl.className = `${tema.body} min-h-screen flex flex-col justify-between items-center p-4 transition-colors duration-300 select-none relative`;
  }
});

inicializarJogo(false);
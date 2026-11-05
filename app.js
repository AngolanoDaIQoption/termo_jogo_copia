import { EstadoJogo, TEMAS } from "./state.js";
import { obterPalavraAleatoria, palavraExiste } from "./api.js";

const gridEl = document.getElementById("grid");
const keyboardEl = document.getElementById("keyboard");
const statusEl = document.getElementById("status-message");
const btnRestart = document.getElementById("btn-restart");
const themeSelect = document.getElementById("theme-select");
const bodyEl = document.getElementById("app-body");

// Elementos do Modal Autoral
const modalEndgame = document.getElementById("modal-endgame");
const modalCard = document.getElementById("modal-card");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalSecretWord = document.getElementById("modal-secret-word");
const modalBtnRestart = document.getElementById("modal-btn-restart");
const modalBadge = document.getElementById("modal-badge");

const CLASSES_FOCO = ['ring-2', 'ring-[#1447e6]', 'border-[#1447e6]'];

const TECLADO_LAYOUT = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
];

async function inicializarJogo() {
  fecharModal();
  statusEl.textContent = "Buscando palavra na API...";
  
  // Obtém palavra de 5 letras via API (ou fallback)
  const palavra = await obterPalavraAleatoria();
  await EstadoJogo.resetar(palavra);

  statusEl.textContent = "Adivinhe a palavra de 5 letras";
  renderizarGrade();
  renderizarTeclado();
  selecionarCelula(0, 0);
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
      tile.className = `${tileSize} border-2 border-slate-700 flex items-center justify-center font-bold rounded uppercase transition-all duration-300 cursor-pointer select-none`;

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
  }
}

function atualizarTile(r, c, letra) {
  const tile = document.getElementById(`tile-${r}-${c}`);
  if (tile) tile.textContent = letra;
}

function verificarPalpite() {
  const r = EstadoJogo.linhaAtual;
  const palpiteArr = EstadoJogo.tentativas[r];
  const palpite = palpiteArr.join("");
  const secretaArr = EstadoJogo.palavraSecreta.split("");
  const numCols = EstadoJogo.tamanhoPalavra;

  const currentTile = document.getElementById(`tile-${r}-${EstadoJogo.colunaAtual}`);
  if (currentTile) currentTile.classList.remove(...CLASSES_FOCO);

  const tileSize = numCols > 5 ? "w-10 h-10 text-lg" : "w-12 h-12 text-xl";

  const contagemSecreta = {};
  secretaArr.forEach((letra) => {
    contagemSecreta[letra] = (contagemSecreta[letra] || 0) + 1;
  });

  const resultado = Array(numCols).fill("cinza");

  // PASSO 1: Marca letras verdes (posição exata)
  palpiteArr.forEach((letra, i) => {
    if (letra === secretaArr[i]) {
      resultado[i] = "verde";
      contagemSecreta[letra]--;
    }
  });

  // PASSO 2: Marca letras amarelas (se houver saldo na secreta)
  palpiteArr.forEach((letra, i) => {
    if (resultado[i] !== "verde") {
      if (secretaArr.includes(letra) && contagemSecreta[letra] > 0) {
        resultado[i] = "amarelo";
        contagemSecreta[letra]--;
      }
    }
  });

  // PASSO 3: Renderização de cores
  palpiteArr.forEach((letra, i) => {
    const tile = document.getElementById(`tile-${r}-${i}`);
    const keyBtn = document.getElementById(`key-${letra}`);
    const cor = resultado[i];

    if (cor === "verde") {
      tile.className = `${tileSize} bg-green-600 text-white flex items-center justify-center font-bold rounded uppercase`;
      if (keyBtn) keyBtn.className = keyBtn.className.replace(/bg-\S+/, "bg-green-600");
    } else if (cor === "amarelo") {
      tile.className = `${tileSize} bg-yellow-500 text-white flex items-center justify-center font-bold rounded uppercase`;
      if (keyBtn && !keyBtn.classList.contains("bg-green-600")) {
        keyBtn.className = keyBtn.className.replace(/bg-\S+/, "bg-yellow-500");
      }
    } else {
      tile.className = `${tileSize} bg-zinc-700 text-slate-300 flex items-center justify-center font-bold rounded uppercase`;
      if (
        keyBtn &&
        !keyBtn.classList.contains("bg-green-600") &&
        !keyBtn.classList.contains("bg-yellow-500")
      ) {
        keyBtn.className = keyBtn.className.replace(/bg-\S+/, "bg-zinc-800 text-zinc-500");
      }
    }
  });

  if (palpite === EstadoJogo.palavraSecreta) {
    statusEl.textContent = "Parabéns! Você venceu!";
    EstadoJogo.fimDeJogo = true;
    setTimeout(() => abrirModal(true), 600);
  } else if (r === 5) {
    statusEl.textContent = `Fim de jogo! A palavra era: ${EstadoJogo.palavraSecreta}`;
    EstadoJogo.fimDeJogo = true;
    setTimeout(() => abrirModal(false), 600);
  } else {
    EstadoJogo.linhaAtual++;
    statusEl.textContent = "Tente novamente...";
    selecionarCelula(EstadoJogo.linhaAtual, 0);
  }
}

// Controle do Modal Autoral
function abrirModal(vitoria) {
  modalSecretWord.textContent = EstadoJogo.palavraSecreta;

  if (vitoria) {
    modalBadge.textContent = "Vitória";
    modalBadge.className = "px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    modalTitle.textContent = "Palavra Adivinhada!";
    modalTitle.className = "text-2xl font-extrabold text-white tracking-tight";
    modalBody.textContent = `Resolvido em ${EstadoJogo.linhaAtual + 1} tentativa(s).`;
    modalBtnRestart.className = "w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3 px-6 rounded-xl shadow-lg hover:shadow-emerald-900/30 active:scale-[0.98] transition-all duration-200 cursor-pointer";
  } else {
    modalBadge.textContent = "Derrota";
    modalBadge.className = "px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20";
    modalTitle.textContent = "Tentativas Esgotadas";
    modalTitle.className = "text-2xl font-extrabold text-white tracking-tight";
    modalBody.textContent = "Não foi desta vez. Tente novamente!";
    modalBtnRestart.className = "w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm py-3 px-6 rounded-xl border border-slate-700 active:scale-[0.98] transition-all duration-200 cursor-pointer";
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
    e.preventDefault();
    tratarEntrada(tecla);
  }
});

btnRestart.addEventListener("click", inicializarJogo);
modalBtnRestart.addEventListener("click", inicializarJogo);

themeSelect.addEventListener("change", (e) => {
  const tema = TEMAS[e.target.value];
  if (tema) {
    bodyEl.className = `${tema.body} min-h-screen flex flex-col justify-between items-center p-4 transition-colors duration-300 select-none relative`;
  }
});

inicializarJogo();
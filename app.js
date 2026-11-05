import { EstadoJogo, TEMAS } from "./state.js";
import { obterPalavraAleatoria, palavraExiste } from "./api.js";

const gridEl = document.getElementById("grid");
const keyboardEl = document.getElementById("keyboard");
const statusEl = document.getElementById("status-message");
const btnRestart = document.getElementById("btn-restart");
const themeSelect = document.getElementById("theme-select");
const bodyEl = document.getElementById("app-body");
const CLASSES_FOCO = ['ring-2', 'ring-[#1447e6]', 'border-[#1447e6]'];

const TECLADO_LAYOUT = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
];

async function inicializarJogo() {
  statusEl.textContent = "Carregando palavra...";
  const palavra = await obterPalavraAleatoria();
  EstadoJogo.resetar(palavra);

  statusEl.textContent = "Adivinhe a palavra de 5 letras";
  renderizarGrade();
  renderizarTeclado();
  selecionarCelula(0, 0); // Seleciona a primeira célula por padrão
}

function renderizarGrade() {
  gridEl.innerHTML = "";
  for (let r = 0; r < 6; r++) {
    const row = document.createElement("div");
    row.className = "flex gap-2";
    for (let c = 0; c < 5; c++) {
      const tile = document.createElement("div");
      tile.id = `tile-${r}-${c}`;
      tile.className =
        "w-12 h-12 border-2 border-slate-700 flex items-center justify-center text-xl font-bold rounded uppercase transition-all duration-300 cursor-pointer select-none";

      // Evento de clique para permitir seleção manual da célula
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
  // Remove destaque anterior
  if (EstadoJogo.celulaSelecionada) {
    const [oldR, oldC] = EstadoJogo.celulaSelecionada;
    const oldTile = document.getElementById(`tile-${oldR}-${oldC}`);
    if (oldTile && oldR === EstadoJogo.linhaAtual) {
      oldTile.classList.remove(...CLASSES_FOCO);
    }
  }

  // Aplica novo destaque
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
      btn.className = `${width} h-12 bg-slate-700 text-white rounded hover:bg-slate-600 transition flex items-center justify-center`;

      btn.addEventListener("click", () => tratarEntrada(key));
      rowEl.appendChild(btn);
    });
    keyboardEl.appendChild(rowEl);
  });
}

function tratarEntrada(tecla) {
  if (EstadoJogo.fimDeJogo) return;

  const [r, c] = EstadoJogo.celulaSelecionada || [
    EstadoJogo.linhaAtual,
    EstadoJogo.colunaAtual,
  ];

  if (tecla === "ARROWLEFT") {
    if (c > 0) selecionarCelula(r, c - 1);
  } else if (tecla === "ARROWRIGHT") {
    if (c < 4) selecionarCelula(r, c + 1);
  } else if (tecla === "BACKSPACE") {
    EstadoJogo.tentativas[r][c] = "";
    atualizarTile(r, c, "");
    if (c > 0) selecionarCelula(r, c - 1);
  } else if (tecla === "ENTER") {
    const tentativaAtual = EstadoJogo.tentativas[EstadoJogo.linhaAtual];
    const palpite = tentativaAtual.join("");

    // 1. Verifica se todas as 5 células estão preenchidas
    if (tentativaAtual.length !== 5 || tentativaAtual.some((letra) => !letra)) {
      statusEl.textContent = "Preencha todas as 5 letras antes de confirmar!";
      return;
    }

    // 2. Valida se a palavra existe no dicionário
    if (!palavraExiste(palpite)) {
      statusEl.textContent = `A palavra "${palpite}" não existe no dicionário!`;
      return;
    }

    // Se passou pelas validações, envia o palpite
    verificarPalpite();
  } else if (/^[A-Z]$/.test(tecla)) {
    EstadoJogo.tentativas[r][c] = tecla;
    atualizarTile(r, c, tecla);
    if (c < 4) selecionarCelula(r, c + 1);
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

  // Remove o anel de foco da linha confirmada
  const currentTile = document.getElementById(
    `tile-${r}-${EstadoJogo.colunaAtual}`,
  );
  if (currentTile) {
    currentTile.classList.remove(...CLASSES_FOCO);
  }

  palpiteArr.forEach((letra, i) => {
    const tile = document.getElementById(`tile-${r}-${i}`);
    const keyBtn = document.getElementById(`key-${letra}`);

    if (letra === secretaArr[i]) {
      tile.className =
        "w-12 h-12 bg-green-600 text-white flex items-center justify-center text-xl font-bold rounded uppercase";
      if (keyBtn)
        keyBtn.className = keyBtn.className.replace(/bg-\S+/, "bg-green-600");
    } else if (secretaArr.includes(letra)) {
      tile.className =
        "w-12 h-12 bg-yellow-500 text-white flex items-center justify-center text-xl font-bold rounded uppercase";
      if (keyBtn && !keyBtn.classList.contains("bg-green-600")) {
        keyBtn.className = keyBtn.className.replace(/bg-\S+/, "bg-yellow-500");
      }
    } else {
      tile.className =
        "w-12 h-12 bg-zinc-700 text-slate-300 flex items-center justify-center text-xl font-bold rounded uppercase";
      if (
        keyBtn &&
        !keyBtn.classList.contains("bg-green-600") &&
        !keyBtn.classList.contains("bg-yellow-500")
      ) {
        keyBtn.className = keyBtn.className.replace(
          /bg-\S+/,
          "bg-zinc-800 text-zinc-500",
        );
      }
    }
  });

  if (palpite === EstadoJogo.palavraSecreta) {
    statusEl.textContent = "Parabéns! Você venceu! 🎉";
    EstadoJogo.fimDeJogo = true;
  } else if (r === 5) {
    statusEl.textContent = `Fim de jogo! A palavra era: ${EstadoJogo.palavraSecreta}`;
    EstadoJogo.fimDeJogo = true;
  } else {
    EstadoJogo.linhaAtual++;
    statusEl.textContent = "Tente novamente...";
    selecionarCelula(EstadoJogo.linhaAtual, 0); // Foca no primeiro quadrado da nova linha
  }
}

// Event Listeners Físicos e de Interface
document.addEventListener("keydown", (e) => {
  const tecla = e.key.toUpperCase();
  if (
    tecla === "ENTER" ||
    tecla === "BACKSPACE" ||
    tecla === "ARROWLEFT" ||
    tecla === "ARROWRIGHT" ||
    /^[A-Z]$/.test(tecla)
  ) {
    // Evita que a seta role a página
    if (e.key.startsWith("Arrow")) e.preventDefault();
    tratarEntrada(tecla);
  }
});

btnRestart.addEventListener("click", inicializarJogo);

themeSelect.addEventListener("change", (e) => {
  const tema = TEMAS[e.target.value];
  if (tema) {
    bodyEl.className = `${tema.body} min-h-screen flex flex-col justify-between items-center p-4 transition-colors duration-300`;
  }
});

// Inicializa ao carregar a página
inicializarJogo();

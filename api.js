import { PALAVRAS_SORTEIO } from "./palavras-sorteio.js";

// Base usada pelos clones de Termo (inclui formas conjugadas como MATOU, SAROU).
// Versão fixada para o site não quebrar se o pacote mudar.
const URL_PACOTE = "https://cdn.jsdelivr.net/npm/@andsfonseca/palavras-pt-br@1.0.8/+esm";

// Plano B: lista do LibreOffice (só tem formas "de dicionário", sem conjugações)
const URL_PLANO_B =
  "https://raw.githubusercontent.com/pythonprobr/palavras/master/palavras.txt";

// Lista própria, hospedada junto com o site (sem CORS, sem depender de terceiros).
// Gerada pelo script gerar_lista.py -- se o arquivo não existir, ele é ignorado.
const URL_LOCAL = "./palavras-validas.txt";

const CACHE_KEY = "termo_validacao_v3";

function normalizar(texto) {
  return texto ? texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
}

function limpar(lista) {
  const out = [];
  for (const item of lista) {
    const p = normalizar(String(item).trim());
    if (p.length === 5 && /^[A-Z]+$/.test(p)) out.push(p);
  }
  return out;
}

// Palavras sorteáveis (limpas e sem repetição)
const palavrasSorteio = Array.from(
  new Set(PALAVRAS_SORTEIO.map(normalizar).filter((p) => p.length === 5))
);

// Validação: já começa com as palavras do sorteio (a secreta sempre é aceita)
const dicionarioSet = new Set(palavrasSorteio);

let promessaCarregamento = null;

async function carregarLocal() {
  const res = await fetch(URL_LOCAL);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return limpar((await res.text()).split(/\r?\n/));
}

async function carregarDoPacote() {
  const { Word } = await import(URL_PACOTE);
  // limit=5, removeAccents=true, includeCompounds=false, especiais=false, próprios=false
  const todas = Word.getAllWords(5, true, false, false, false);
  return limpar(todas);
}

async function carregarPlanoB() {
  const res = await fetch(URL_PLANO_B);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return limpar((await res.text()).split(/\r?\n/));
}

async function carregarValidacao() {
  // 1) cache local: o pacote é pesado, então só baixa na primeira visita
  try {
    const cache = localStorage.getItem(CACHE_KEY);
    if (cache) {
      cache.split(",").forEach((p) => dicionarioSet.add(p));
      console.info("Dicionário (cache):", dicionarioSet.size, "palavras");
      return;
    }
  } catch {}

  // 2) pacote com a base do Termo, depois plano B
  for (const fonte of [carregarLocal, carregarDoPacote, carregarPlanoB]) {
    try {
      const lista = await fonte();
      if (lista.length > 1000) {
        lista.forEach((p) => dicionarioSet.add(p));
        try { localStorage.setItem(CACHE_KEY, lista.join(",")); } catch {}
        console.info("Dicionário carregado via", fonte.name, ":", dicionarioSet.size, "palavras");
        return;
      }
    } catch (e) {
      console.warn("Falhou:", fonte.name, e);
    }
  }

  console.error("Não consegui carregar nenhuma lista grande. Só vale a lista do sorteio.");
}

function garantirCarregado() {
  if (!promessaCarregamento) promessaCarregamento = carregarValidacao();
  return promessaCarregamento;
}

// Começa a carregar assim que o site abre
garantirCarregado();

export async function obterPalavraAleatoria() {
  return palavrasSorteio[Math.floor(Math.random() * palavrasSorteio.length)];
}

export async function palavraExiste(palavra) {
  if (!palavra || palavra.length !== 5) return false;
  await garantirCarregado();
  return dicionarioSet.has(normalizar(palavra));
}
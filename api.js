let dicionarioSet = new Set();
let palavrasSorteio = [];

// URL de uma Wordlist completa de palavras em português (sem acento)
const URL_DICIONARIO = "https://raw.githubusercontent.com/pythonprobr/palavras/main/palavras.json";

/**
 * Normaliza textos (remove acentos e deixa em caixa alta)
 */
function normalizar(texto) {
  return texto ? texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
}

/**
 * Carrega a lista completa de palavras na memória (executado 1 vez ao iniciar)
 */
async function carregarDicionario() {
  if (dicionarioSet.size > 0) return;

  try {
    const res = await fetch(URL_DICIONARIO);
    if (!res.ok) throw new Error("Erro ao baixar dicionário");
    
    const listaGeral = await res.json();

    // Filtra estritamente palavras de 5 letras sem acento
    listaGeral.forEach((item) => {
      const palavraLimpa = normalizar(item);
      if (palavraLimpa.length === 5 && /^[A-Z]+$/.test(palavraLimpa)) {
        dicionarioSet.add(palavraLimpa);
      }
    });

    palavrasSorteio = Array.from(dicionarioSet);
  } catch (erro) {
    console.warn("Erro ao carregar dicionário remoto, aplicando lista local de emergência:", erro);
    // Lista reserva caso esteja totalmente offline
    const fallback = ["TERMO", "SENAI", "TRAIU", "MATOU", "PELOS", "LOUCO", "CARRO", "PRAIA", "PORTA", "TEXTO"];
    fallback.forEach(p => dicionarioSet.add(p));
    palavrasSorteio = fallback;
  }
}

/**
 * Sortear palavra secreta
 */
export async function obterPalavraAleatoria() {
  await carregarDicionario();
  const index = Math.floor(Math.random() * palavrasSorteio.length);
  return palavrasSorteio[index];
}

/**
 * Valida o palpite do jogador (aceita TRAIU, falou, comeu, etc.)
 */
export async function palavraExiste(palavra) {
  if (!palavra || palavra.length !== 5) return false;
  await carregarDicionario();
  return dicionarioSet.has(normalizar(palavra));
}
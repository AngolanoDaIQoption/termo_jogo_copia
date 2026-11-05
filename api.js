import { DICIONARIO_PALAVRAS } from "./palavras.js";

// Cache local para guardar palavras já validadas durante a partida
const dicionarioCache = new Set(
  DICIONARIO_PALAVRAS.map((p) => normalizar(p))
);

function normalizar(texto) {
  return texto ? texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : "";
}

/**
 * Busca uma palavra aleatória de 5 letras
 */
export async function obterPalavraAleatoria() {
  try {
    // Tenta buscar via API pública do Dicio
    const res = await fetch("https://api.dicio-api-busca.vercel.app/words/random");
    if (!res.ok) throw new Error(`Status ${res.status}`);
    
    const dados = await res.json();
    const palavraLimpa = normalizar(dados.word || dados.palavra || "");

    if (palavraLimpa.length === 5 && /^[A-Z]+$/.test(palavraLimpa)) {
      dicionarioCache.add(palavraLimpa);
      return palavraLimpa;
    } else {
      return await obterPalavraAleatoria();
    }
  } catch (erro) {
    console.warn("API indisponível ou bloqueada pela rede. Usando sorteio local fallback.", erro);
    const index = Math.floor(Math.random() * DICIONARIO_PALAVRAS.length);
    return normalizar(DICIONARIO_PALAVRAS[index]);
  }
}

/**
 * Valida se a palavra existe (API em tempo real com fallback)
 */
export async function palavraExiste(palavra) {
  if (!palavra || palavra.length !== 5) return false;
  const palavraUpper = normalizar(palavra);
  
  // 1. Se já está no cache ou no dicionário local, valida imediatamente
  if (dicionarioCache.has(palavraUpper)) return true;

  try {
    // 2. Consulta a API para verificar se a palavra existe na língua portuguesa
    const res = await fetch(`https://api.dicio-api-busca.vercel.app/words/${palavraUpper.toLowerCase()}`);
    if (res.ok) {
      dicionarioCache.add(palavraUpper);
      return true;
    }
    return false;
  } catch (erro) {
    // 3. Caso a rede bloqueie a API, aceita o palpite de 5 letras para não travar o jogador
    console.warn("Rede bloqueou a consulta da API, aplicando validação permissiva de fallback.");
    return true; 
  }
}
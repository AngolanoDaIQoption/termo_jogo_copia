/**
 * Módulo de Integração com a API do Dicio (Dicionário Português)
 */
let dicionarioCache = new Set();

/**
 * Normaliza strings: remove acentos e transforma em maiúsculas
 */
function normalizar(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

/**
 * Busca uma palavra de 5 letras da API Dicio
 */
export async function obterPalavraAleatoria() {
  try {
    // API pública da Dicio para obter palavra aleatória
    const res = await fetch('https://api.dicio-api-busca.vercel.app/words/random');
    if (!res.ok) throw new Error(`Status ${res.status}`);
    
    const dados = await res.json();
    const palavraLimpa = normalizar(dados.word || dados.palavra || "");

    // Se a palavra sorteada tiver exatamente 5 letras e apenas A-Z, usa ela
    if (palavraLimpa.length === 5 && /^[A-Z]+$/.test(palavraLimpa)) {
      dicionarioCache.add(palavraLimpa);
      return palavraLimpa;
    } else {
      // Se a API retornar uma palavra de outro tamanho, chama novamente (recursão)
      return await obterPalavraAleatoria();
    }
  } catch (erro) {
    console.warn("Dicio API indisponível, utilizando rota fallback alternativa:", erro);
    return buscarPalavraFallback();
  }
}

/**
 * Rota reserva de palavras válidas de 5 letras (inclui MATOU e centenas de outras)
 */
function buscarPalavraFallback() {
  const palavrasLista = [
    "TERMO", "SENAI", "PIXEL", "VETOR", "LOGICA", "TEXTO", "PODER", "MUNDO",
    "MATOU", "CASAL", "NUVEM", "PRAIA", "FAUNA", "FLORA", "PESOS", "TERRA",
    "PORTA", "NORTE", "FROTA", "CORPO", "MENTE", "CARRO", "CURSO", "LINHA",
    "CAMPO", "FOGO", "FESTA", "SOLAR", "ROCHA", "LIVRO", "CHAVE", "GATO"
  ];
  
  palavrasLista.forEach(p => dicionarioCache.add(p));
  const index = Math.floor(Math.random() * palavrasLista.length);
  return palavrasLista[index];
}

/**
 * Valida se a palavra existe (consulta a API da Dicio em tempo real)
 */
export async function palavraExiste(palavra) {
  const palavraUpper = normalizar(palavra);
  
  // 1. Se já está no cache, valida imediatamente
  if (dicionarioCache.has(palavraUpper)) return true;

  try {
    // 2. Consulta a API da Dicio para saber se a palavra realmente existe no Português
    const res = await fetch(`https://api.dicio-api-busca.vercel.app/words/${palavraUpper.toLowerCase()}`);
    if (res.ok) {
      dicionarioCache.add(palavraUpper);
      return true;
    }
    return false;
  } catch (erro) {
    // Caso esteja sem internet, se a palavra tiver 5 letras aceita para não travar o jogo
    return true; 
  }
}
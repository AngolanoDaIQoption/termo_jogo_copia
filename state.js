/**
 * Módulo de Gestão de Estado do Jogo (Tamanho Dinâmico & Hash)
 */
export const EstadoJogo = {
  palavraSecreta: '',
  palavraHash: '',
  tamanhoPalavra: 5,
  linhaAtual: 0,
  colunaAtual: 0,
  celulaSelecionada: null,
  tentativas: [],
  fimDeJogo: false,

  async resetar(novaPalavra) {
    this.palavraSecreta = novaPalavra.toUpperCase();
    this.tamanhoPalavra = this.palavraSecreta.length;
    this.palavraHash = await gerarHashSHA256(this.palavraSecreta);
    this.linhaAtual = 0;
    this.colunaAtual = 0;
    this.celulaSelecionada = null;
    // 6 tentativas, cada uma com N colunas
    this.tentativas = Array(6).fill(null).map(() => Array(this.tamanhoPalavra).fill(''));
    this.fimDeJogo = false;
  }
};

export async function gerarHashSHA256(texto) {
  const msgBuffer = new TextEncoder().encode(texto.toUpperCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const TEMAS = {
  dark: {
    body: "bg-slate-900 text-white",
    cardEmpty: "border-slate-700 text-white"
  },
  cyberpunk: {
    body: "bg-zinc-950 text-yellow-400",
    cardEmpty: "border-pink-500 text-yellow-400"
  }
};
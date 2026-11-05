/**
 * Módulo de Gestão de Estado do Jogo
 */
export const EstadoJogo = {
  palavraSecreta: '',
  linhaAtual: 0,
  colunaAtual: 0,
  celulaSelecionada: null, // Guarda [r, c] da célula clicada
  tentativas: Array(6).fill(null).map(() => Array(5).fill('')),
  fimDeJogo: false,

  resetar(novaPalavra) {
    this.palavraSecreta = novaPalavra;
    this.linhaAtual = 0;
    this.colunaAtual = 0;
    this.celulaSelecionada = null;
    this.tentativas = Array(6).fill(null).map(() => Array(5).fill(''));
    this.fimDeJogo = false;
  }
};

export const TEMAS = {
  dark: {
    body: "bg-slate-900 text-white",
    cardEmpty: "border-slate-700 text-white",
    keyDefault: "bg-slate-700 text-white hover:bg-slate-600"
  },
  cyberpunk: {
    body: "bg-zinc-950 text-yellow-400",
    cardEmpty: "border-pink-500 text-yellow-400",
    keyDefault: "bg-purple-900 text-pink-300 hover:bg-purple-800"
  }
};
export const AVATARES = [
  { id: "doge", nome: "Doge", src: "./assets/avatars/doge.png" },
  { id: "gigachad", nome: "GigaChad", src: "./assets/avatars/gigachad.png" },
  { id: "pikachu", nome: "Pikachu", src: "./assets/avatars/pikachu.png" },
  { id: "stonks", nome: "Stonks", src: "./assets/avatars/stonks.png" },
  { id: "fine", nome: "This is Fine", src: "./assets/avatars/fine.png" },
  { id: "pai", nome: "Pai de familia", src: "./assets/avatars/pai.webp" },
  { id: "galo", nome: "Galo cego", src: "./assets/avatars/galo.png" },
  { id: "calabreso", nome: "Davi Brito", src: "./assets/avatars/calabreso.webp" },
  { id: "patrick", nome: "Lost in the sauce", src: "./assets/avatars/patrick.png"},
  { id: "obvio", nome: "Era tão óbvio", src: "./assets/avatars/obvio.png"},
  { id: "vorcaro", nome: "Vorcaro", src: "./assets/avatars/vorcaro.png"},
  { id: "italiano", nome: "Italiano", src: "./assets/avatars/italiano.png"},
  { id: "mula", nome: "Pai dos pobres", src: "./assets/avatars/mula.png", troll: true},
  { id: "torcedor", nome: "Festa na roça", src: "./assets/avatars/torcedor.webp" },
  { id: "angolano", nome: "AngolanoIQOption", src: "./assets/avatars/angolano.png" },
  { id: "petista", nome: "Petista médio", src: "./assets/avatars/petista.png"},
  { id: "pix", nome: "Pix da Silva JR", src: "./assets/avatars/pix.png"},
  { id: "gary", nome: "Gary (Default)", src: "./assets/avatars/gary.webp" },
];

export const AVATAR_PADRAO = AVATARES[0];

export function obterSrcAvatar(avatarId) {
  if (!avatarId) return AVATAR_PADRAO.src;
  const idLimpo = String(avatarId).trim().toLowerCase();
  const encontrado = AVATARES.find((a) => a.id.toLowerCase() === idLimpo);
  return encontrado ? encontrado.src : AVATAR_PADRAO.src;
}
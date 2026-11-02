// Câmera do canvas (deslocamento e zoom) e posição dos cards filhos de uma conversa. Sem DOM.
// Câmera = { x, y, z }: ponto da tela = ponto do mundo * z + (x, y).

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

// Zoom ancorado: o ponto do mundo sob (px, py) continua sob o ponteiro.
export function zoomEm(cam, px, py, fator, min, max) {
  const z = limitar(cam.z * fator, min, max);
  const mx = (px - cam.x) / cam.z;
  const my = (py - cam.y) / cam.z;
  return { x: px - mx * z, y: py - my * z, z };
}

// Pinça de dois dedos: parte da câmera de quando os dedos tocaram (a0, b0) e dos dedos agora (a1, b1).
// O zoom segue a razão entre as distâncias e o ponto do mundo que estava entre os dedos acompanha o novo centro,
// então o mesmo gesto também arrasta o canvas.
export function pinca(cam, a0, b0, a1, b1, min, max) {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  if (d0 < 1) return cam;
  const z = limitar(cam.z * (Math.hypot(b1.x - a1.x, b1.y - a1.y) / d0), min, max);
  const c0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const c1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const mx = (c0.x - cam.x) / cam.z;
  const my = (c0.y - cam.y) / cam.z;
  return { x: c1.x - mx * z, y: c1.y - my * z, z };
}

// Enquadra retângulos do mundo dentro da área visível (que já desconta painéis), com margem e zoom máximo.
export function enquadrar(rets, area, margem, zMax) {
  if (!rets.length) return { x: 0, y: 0, z: 1 };
  const x0 = Math.min(...rets.map((r) => r.x));
  const y0 = Math.min(...rets.map((r) => r.y));
  const x1 = Math.max(...rets.map((r) => r.x + r.w));
  const y1 = Math.max(...rets.map((r) => r.y + r.h));
  const z = Math.max(0.05, Math.min((area.w - 2 * margem) / (x1 - x0 || 1), (area.h - 2 * margem) / (y1 - y0 || 1), zMax));
  return { x: area.x + area.w / 2 - ((x0 + x1) / 2) * z, y: area.y + area.h / 2 - ((y0 + y1) / 2) * z, z };
}

export const TAM = { subagente: { w: 290, h: 150 }, imagem: { w: 280, h: 320 }, video: { w: 280, h: 480 } };
const ESPACO = 24;
const AFASTAMENTO = 80;

// Subagentes numa fileira centralizada embaixo do terminal; mídias em grade de 3 colunas à direita.
export function layoutFilhos(t, nSub, midias) {
  const tipos = Array.isArray(midias) ? midias : Array.from({ length: midias }, () => 'imagem');
  const largura = nSub * TAM.subagente.w + Math.max(0, nSub - 1) * ESPACO;
  const x0 = t.x + t.w / 2 - largura / 2;
  const subagentes = Array.from({ length: nSub }, (_, i) => ({
    x: x0 + i * (TAM.subagente.w + ESPACO), y: t.y + t.h + AFASTAMENTO, ...TAM.subagente,
  }));
  const saida = [];
  let y = t.y;
  for (let i = 0; i < tipos.length; i += 3) {
    const fileira = tipos.slice(i, i + 3);
    fileira.forEach((tipo, c) => saida.push({ x: t.x + t.w + AFASTAMENTO + c * (TAM.imagem.w + ESPACO), y, ...(TAM[tipo] ?? TAM.imagem) }));
    y += Math.max(...fileira.map((tipo) => (TAM[tipo] ?? TAM.imagem).h)) + ESPACO;
  }
  return { subagentes, midias: saida };
}

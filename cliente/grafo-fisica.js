// Física do grafo, sem DOM: repulsão entre vizinhos (grade espacial), molas nas ligações,
// atração leve ao centro, amortecimento e limite de velocidade.
// Nó = { x, y, vx, vy, fixo? }; ligação = { a, b, tipo } com índices dos nós.

const CELULA = 160;
const REPULSAO = 1400;
const MOLA = 0.03;
const REPOUSO = { pasta: 46, link: 110 };
const CENTRO = 0.0012;
const ATRITO = 0.82;
const VMAX = 14;

export function posicaoInicial(i) {
  const a = i * 2.39996; // ângulo de ouro: espiral sem amontoar
  const r = 22 * Math.sqrt(i + 1);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

export const raioDe = (tipo, grau) => 3.5 + Math.sqrt(grau) * 1.7 + (tipo === 'pasta' ? 2.5 : 0);

// Um passo da simulação; ritmo (0 a 1) é a "temperatura". Devolve a energia (soma de v²).
export function passo(nos, ligacoes, ritmo = 1) {
  const grade = new Map();
  nos.forEach((n, i) => {
    const k = `${Math.floor(n.x / CELULA)},${Math.floor(n.y / CELULA)}`;
    if (!grade.has(k)) grade.set(k, []);
    grade.get(k).push(i);
  });
  for (let i = 0; i < nos.length; i += 1) {
    const n = nos[i];
    const cx = Math.floor(n.x / CELULA);
    const cy = Math.floor(n.y / CELULA);
    for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
      for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
        for (const j of grade.get(`${gx},${gy}`) ?? []) {
          if (j <= i) continue;
          const m = nos[j];
          let dx = n.x - m.x;
          let dy = n.y - m.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = 0.1 * ((i % 3) - 1 || 1); dy = 0.1; d2 = 0.02; } // no mesmo ponto: empurra para um lado fixo
          if (d2 > CELULA * CELULA) continue;
          const f = (REPULSAO / d2) * ritmo;
          const d = Math.sqrt(d2);
          n.vx += (dx / d) * f; n.vy += (dy / d) * f;
          m.vx -= (dx / d) * f; m.vy -= (dy / d) * f;
        }
      }
    }
  }
  for (const l of ligacoes) {
    const a = nos[l.a];
    const b = nos[l.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const f = (d - (REPOUSO[l.tipo] ?? REPOUSO.link)) * MOLA * ritmo;
    a.vx += (dx / d) * f; a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
  }
  let energia = 0;
  for (const n of nos) {
    if (n.fixo) { n.vx = 0; n.vy = 0; continue; }
    n.vx = (n.vx - n.x * CENTRO * ritmo) * ATRITO;
    n.vy = (n.vy - n.y * CENTRO * ritmo) * ATRITO;
    const v = Math.hypot(n.vx, n.vy);
    if (v > VMAX) { n.vx *= VMAX / v; n.vy *= VMAX / v; }
    n.x += n.vx; n.y += n.vy;
    energia += n.vx * n.vx + n.vy * n.vy;
  }
  return energia;
}

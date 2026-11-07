// Geometria das Lousas, sem DOM e sem estado: tudo em coordenadas do mundo (a câmera fica em camera.js).
// Objetos: stroke (traço: tool, c, s, p), shape (k: rect, ellipse, tri, diamond), sticky, text, frame, line (k: line, arrow; a/b = {id} preso a um objeto).
// Caixas (shape, sticky, text, frame) têm x, y, w, h e r (rotação em radianos). Cor 'ink' = a cor da tinta do tema.

export const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
export const distSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax; const dy = by - ay; const l = dx * dx + dy * dy;
  const t = l ? limitar(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
export const girar = (x, y, cx, cy, a) => {
  const c = Math.cos(a); const s = Math.sin(a); const dx = x - cx; const dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
};
export const ehCaixa = (o) => o.t === 'shape' || o.t === 'sticky' || o.t === 'text' || o.t === 'frame';
export const centro = (o) => [o.x + o.w / 2, o.y + o.h / 2];
export const porIdDe = (objs) => { const m = new Map(objs.map((o) => [o.id, o])); return (id) => m.get(id) ?? null; };
export const linhasDoTexto = (o) => String(o.text ?? '').split('\n').length;

export function cantos(o) {
  const [cx, cy] = centro(o);
  return [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]].map((p) => girar(p[0], p[1], cx, cy, o.r || 0));
}

// ponto da borda do objeto na direção de q (as setas presas terminam na borda, não no centro)
export function pontaNaBorda(o, q) {
  const [cx, cy] = centro(o); const dx = q[0] - cx; const dy = q[1] - cy;
  if (!dx && !dy) return [cx, cy];
  const t = 1 / Math.max(Math.abs(dx) / (o.w / 2 + 4), Math.abs(dy) / (o.h / 2 + 4));
  return [cx + dx * t, cy + dy * t];
}

export function pontasDaLinha(l, porId) {
  const ta = l.a && porId(l.a.id); const tb = l.b && porId(l.b.id);
  let p1 = [l.x1, l.y1]; let p2 = [l.x2, l.y2];
  const ca = ta ? centro(ta) : p1; const cb = tb ? centro(tb) : p2;
  if (ta) p1 = pontaNaBorda(ta, cb);
  if (tb) p2 = pontaNaBorda(tb, ca);
  return [p1, p2];
}

export function limites(o, porId) {
  if (o.t === 'stroke') {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    const pad = o.tool === 'hl' ? o.s * 1.5 : o.s / 2;
    for (const p of o.p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  }
  if (o.t === 'line') {
    const [a, b] = pontasDaLinha(o, porId); const pd = o.s / 2 + 4;
    return { x: Math.min(a[0], b[0]) - pd, y: Math.min(a[1], b[1]) - pd, w: Math.abs(a[0] - b[0]) + 2 * pd, h: Math.abs(a[1] - b[1]) + 2 * pd };
  }
  const cs = cantos(o); const xs = cs.map((p) => p[0]); const ys = cs.map((p) => p[1]);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function uniao(lista, porId) {
  if (!lista.length) return null;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const o of lista) { const b = limites(o, porId); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function dentroDoPoligono(p, poli) {
  let dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const a = poli[i]; const b = poli[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) dentro = !dentro;
  }
  return dentro;
}

const local = (o, x, y) => { const c = centro(o); const p = girar(x, y, c[0], c[1], -(o.r || 0)); return [p[0] - o.x, p[1] - o.y]; };

// o ponto (x, y) acerta o objeto? tol em unidades do mundo (a tela usa ~6 px dividido pelo zoom)
export function acertou(o, x, y, tol, porId) {
  if (o.t === 'stroke') {
    const r = (o.tool === 'hl' ? o.s * 1.5 : o.s / 2) + tol; const p = o.p;
    if (p.length === 1) return Math.hypot(x - p[0][0], y - p[0][1]) < r;
    for (let i = 0; i < p.length - 1; i++) if (distSeg(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) < r) return true;
    return false;
  }
  if (o.t === 'line') { const [a, b] = pontasDaLinha(o, porId); return distSeg(x, y, a[0], a[1], b[0], b[1]) < o.s / 2 + tol + 2; }
  const l = local(o, x, y);
  if (o.t === 'frame') { // só a borda e o título: o miolo deixa clicar nos objetos de dentro
    const dentro = l[0] >= 0 && l[1] >= 0 && l[0] <= o.w && l[1] <= o.h;
    const borda = dentro && (l[0] < tol * 2 || l[1] < tol * 2 || l[0] > o.w - tol * 2 || l[1] > o.h - tol * 2);
    const titulo = l[0] >= 0 && l[0] <= Math.max(120, o.w * 0.5) && l[1] < 0 && l[1] > -4 * tol;
    return borda || titulo;
  }
  if (o.t === 'shape' && o.k === 'ellipse') { const dx = (l[0] - o.w / 2) / (o.w / 2 + tol); const dy = (l[1] - o.h / 2) / (o.h / 2 + tol); return dx * dx + dy * dy <= 1; }
  return l[0] >= -tol && l[1] >= -tol && l[0] <= o.w + tol && l[1] <= o.h + tol;
}

export function escolher(objs, x, y, tol) {
  const porId = porIdDe(objs);
  for (let i = objs.length - 1; i >= 0; i--) if (acertou(objs[i], x, y, tol, porId)) return objs[i];
  return null;
}
export function ondePrender(objs, x, y, tol) { // em quê uma seta pode se prender
  const porId = porIdDe(objs);
  for (let i = objs.length - 1; i >= 0; i--) { const o = objs[i]; if ((o.t === 'shape' || o.t === 'sticky' || o.t === 'text') && acertou(o, x, y, tol, porId)) return o; }
  return null;
}
export const idsDoGrupo = (objs, o) => (o.g ? objs.filter((x) => x.g === o.g).map((x) => x.id) : [o.id]);

// ---------- transformações: recebem o objeto como estava ao começar o gesto e devolvem um novo ----------
const copia = (o) => structuredClone(o);

export function movido(o, dx, dy, porId) {
  const q = copia(o);
  if (q.t === 'stroke') q.p = q.p.map((p) => [p[0] + dx, p[1] + dy]);
  else if (q.t === 'line') { const [a, b] = pontasDaLinha(o, porId); Object.assign(q, { a: null, b: null, x1: a[0] + dx, y1: a[1] + dy, x2: b[0] + dx, y2: b[1] + dy }); }
  else { q.x += dx; q.y += dy; }
  return q;
}

export function escalado(o, ox, oy, sx, sy, porId) {
  const q = copia(o);
  if (q.t === 'stroke') q.p = q.p.map((p) => [ox + (p[0] - ox) * sx, oy + (p[1] - oy) * sy]);
  else if (q.t === 'line') {
    const [a, b] = pontasDaLinha(o, porId);
    Object.assign(q, { a: null, b: null, x1: ox + (a[0] - ox) * sx, y1: oy + (a[1] - oy) * sy, x2: ox + (b[0] - ox) * sx, y2: oy + (b[1] - oy) * sy });
  } else {
    const c = centro(o); const nc = [ox + (c[0] - ox) * sx, oy + (c[1] - oy) * sy];
    q.w = Math.max(12, o.w * sx); q.h = Math.max(12, o.h * sy);
    if (q.t === 'text') { q.fs = Math.max(8, o.fs * sy); q.h = q.fs * 1.25 * linhasDoTexto(q); }
    q.x = nc[0] - q.w / 2; q.y = nc[1] - q.h / 2;
  }
  return q;
}

export function girado(o, cx, cy, a, porId) {
  const q = copia(o);
  if (q.t === 'stroke') q.p = q.p.map((p) => girar(p[0], p[1], cx, cy, a));
  else if (q.t === 'line') {
    const [p1, p2] = pontasDaLinha(o, porId); const a1 = girar(p1[0], p1[1], cx, cy, a); const a2 = girar(p2[0], p2[1], cx, cy, a);
    Object.assign(q, { a: null, b: null, x1: a1[0], y1: a1[1], x2: a2[0], y2: a2[1] });
  } else { const c = centro(o); const nc = girar(c[0], c[1], cx, cy, a); q.x = nc[0] - q.w / 2; q.y = nc[1] - q.h / 2; q.r = (o.r || 0) + a; }
  return q;
}

// ---------- traços ----------
// insere pontos até nenhum vão passar de `passo` (a borracha de precisão precisa de pontos próximos)
export function densificar(p, passo) {
  const saida = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const a = saida[saida.length - 1]; const b = p[i]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > passo) { const n = Math.ceil(d / passo); for (let k = 1; k < n; k++) saida.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }
    saida.push(b);
  }
  return saida;
}

export function simplificar(p, eps) { // Ramer-Douglas-Peucker
  if (p.length < 3) return p;
  const a = p[0]; const b = p[p.length - 1]; let max = 0; let ix = 0;
  for (let i = 1; i < p.length - 1; i++) { const d = distSeg(p[i][0], p[i][1], a[0], a[1], b[0], b[1]); if (d > max) { max = d; ix = i; } }
  if (max > eps) return simplificar(p.slice(0, ix + 1), eps).slice(0, -1).concat(simplificar(p.slice(ix), eps));
  return [a, b];
}

// Desenho inteligente: devolve a linha ou a forma que o traço quis ser, ou null (e o traço fica como foi desenhado).
export function reconhecer(traco, minimo, novoId) {
  const p = traco.p;
  if (p.length < 6) return null;
  const xs = p.map((q) => q[0]); const ys = p.map((q) => q[1]);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const w = x1 - x0; const h = y1 - y0; const diag = Math.hypot(w, h);
  if (diag < minimo) return null;
  let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const first = p[0]; const last = p[p.length - 1]; const folga = Math.hypot(first[0] - last[0], first[1] - last[1]);
  if (folga > 0.2 * L) { // aberto: só vira linha se já era quase reto
    return folga / L > 0.9 ? { id: novoId(), t: 'line', k: 'line', a: null, b: null, x1: first[0], y1: first[1], x2: last[0], y2: last[1], c: traco.c, s: traco.s } : null;
  }
  const simp = simplificar(p.concat([first]), diag * 0.08); const v = simp.length - 1; // vértices do contorno fechado
  let area = 0; for (let j = 0; j < p.length; j++) { const q = p[(j + 1) % p.length]; area += p[j][0] * q[1] - q[0] * p[j][1]; }
  area = Math.abs(area) / 2;
  const redondez = (4 * Math.PI * area) / (L * L);
  const base = { id: novoId(), t: 'shape', x: x0, y: y0, w: Math.max(w, 20), h: Math.max(h, 20), r: 0, c: traco.c, f: null, s: traco.s, text: '', fs: 18 };
  if (v === 3) return { ...base, k: 'tri' };
  if (v === 4 || v === 5) {
    const meios = [[x0 + w / 2, y0], [x1, y0 + h / 2], [x0 + w / 2, y1], [x0, y0 + h / 2]];
    const perto = simp.slice(0, 4).filter((q) => meios.some((m) => Math.hypot(q[0] - m[0], q[1] - m[1]) < diag * 0.14)).length;
    return { ...base, k: perto >= 3 ? 'diamond' : 'rect' };
  }
  return redondez > 0.72 ? { ...base, k: 'ellipse' } : null;
}

// ---------- borrachas ----------
const raioDoTraco = (o) => (o.tool === 'hl' ? o.s * 1.5 : o.s / 2);

// apaga o traço inteiro que o círculo (wx, wy, raio) toca; só traços, e nunca os bloqueados
export function apagarInteiro(objs, wx, wy, raio) {
  const saida = objs.filter((o) => {
    if (o.t !== 'stroke' || o.lock) return true;
    const r = raio + raioDoTraco(o); const p = o.p;
    if (p.length === 1) return Math.hypot(wx - p[0][0], wy - p[0][1]) >= r;
    for (let i = 0; i < p.length - 1; i++) if (distSeg(wx, wy, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) < r) return false;
    return true;
  });
  return { objs: saida, mudou: saida.length !== objs.length };
}

// apaga só os pontos dentro do círculo: o traço vira dois (ou mais) pedaços
export function apagarPedaco(objs, wx, wy, raio, passo, novoId) {
  let mudou = false; const saida = [];
  for (const o of objs) {
    if (o.t !== 'stroke' || o.lock) { saida.push(o); continue; }
    const r = raio + raioDoTraco(o); const pedacos = []; let corrida = []; let tocou = false;
    for (const q of densificar(o.p, passo)) {
      if (Math.hypot(q[0] - wx, q[1] - wy) < r) { tocou = true; if (corrida.length > 1) pedacos.push(corrida); corrida = []; } else corrida.push(q);
    }
    if (corrida.length > 1) pedacos.push(corrida);
    if (!tocou) { saida.push(o); continue; }
    mudou = true;
    for (const pc of pedacos) saida.push({ ...copia(o), id: novoId(), p: pc });
  }
  return { objs: saida, mudou };
}

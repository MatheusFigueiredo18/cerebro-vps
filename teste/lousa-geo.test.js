import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../cliente/lousa-geo.js';

let n = 0;
const novoId = () => `n${++n}`;
const circulo = (cx, cy, r, k = 40) => Array.from({ length: k + 1 }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / k), cy + r * Math.sin((2 * Math.PI * i) / k)]);
const percurso = (pts, porLado = 12) => { // lados retos com muitos pontos, como o mouse faz
  const saida = [];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < porLado; k++) saida.push([pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * k) / porLado, pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * k) / porLado]);
  saida.push(pts.at(-1));
  return saida;
};
const traco = (p, extra = {}) => ({ id: novoId(), t: 'stroke', tool: 'pen', c: 'ink', s: 3, p, ...extra });
const caixa = (extra = {}) => ({ id: novoId(), t: 'shape', k: 'rect', x: 100, y: 100, w: 200, h: 100, r: 0, c: 'ink', f: null, s: 3, text: '', fs: 18, ...extra });

test('desenho inteligente: retângulo, losango, triângulo, oval e linha, mesmo tortos', () => {
  const ret = traco(percurso([[0, 0], [200, 3], [198, 100], [2, 98], [0, 0]]));
  assert.equal(G.reconhecer(ret, 24, novoId).k, 'rect');
  assert.equal(G.reconhecer(traco(percurso([[100, 0], [200, 60], [100, 120], [0, 60], [100, 0]])), 24, novoId).k, 'diamond');
  assert.equal(G.reconhecer(traco(percurso([[100, 0], [200, 160], [0, 160], [100, 0]])), 24, novoId).k, 'tri');
  assert.equal(G.reconhecer(traco(circulo(100, 100, 80)), 24, novoId).k, 'ellipse');
  const r = G.reconhecer(traco(percurso([[0, 0], [300, 20]], 30)), 24, novoId);
  assert.equal(r.t, 'line');
  assert.equal(r.x2, 300);
  assert.equal(G.reconhecer(traco(percurso([[0, 0], [100, 100], [200, 0], [300, 100]])), 24, novoId), null); // zigue-zague continua traço
  assert.equal(G.reconhecer(traco(percurso([[0, 0], [5, 5]], 8)), 24, novoId), null); // pequeno demais
  const forma = G.reconhecer(ret, 24, novoId);
  assert.equal(forma.c, 'ink'); assert.equal(forma.s, 3); assert.equal(forma.f, null);
});

test('acertar e escolher: o objeto de cima vence, quadro só pela borda, oval pela elipse', () => {
  const baixo = caixa({ id: 'a' });
  const cima = caixa({ id: 'b', x: 150 });
  assert.equal(G.escolher([baixo, cima], 200, 150, 5).id, 'b');
  assert.equal(G.escolher([baixo, cima], 110, 150, 5).id, 'a');
  assert.equal(G.escolher([baixo, cima], 900, 900, 5), null);
  const quadro = { id: 'q', t: 'frame', x: 0, y: 0, w: 400, h: 300, r: 0, title: 'Q' };
  assert.equal(G.escolher([quadro], 200, 150, 5), null); // miolo: deixa passar
  assert.equal(G.escolher([quadro], 200, 2, 5).id, 'q'); // borda
  const oval = caixa({ id: 'o', k: 'ellipse', x: 0, y: 0, w: 100, h: 100 });
  assert.ok(G.escolher([oval], 50, 50, 2));
  assert.equal(G.escolher([oval], 2, 2, 2), null); // o canto do retângulo fica fora da oval
  const girada = caixa({ id: 'g', x: 0, y: 0, w: 200, h: 20, r: Math.PI / 2 }); // vira uma barra vertical
  assert.ok(G.escolher([girada], 100, 100, 2));
  assert.equal(G.escolher([girada], 20, 10, 2), null);
  const t = traco([[0, 0], [100, 0]]);
  assert.ok(G.escolher([t], 50, 3, 4));
  assert.equal(G.escolher([t], 50, 30, 4), null);
});

test('setas presas: acompanham o objeto, terminam na borda e se soltam ao mover a própria seta', () => {
  const a = caixa({ id: 'a', x: 0, y: 0, w: 100, h: 100 });
  const b = caixa({ id: 'b', x: 400, y: 0, w: 100, h: 100 });
  const seta = { id: 's', t: 'line', k: 'arrow', x1: 0, y1: 0, x2: 0, y2: 0, a: { id: 'a' }, b: { id: 'b' }, c: 'ink', s: 3 };
  const porId = G.porIdDe([a, b, seta]);
  const [p1, p2] = G.pontasDaLinha(seta, porId);
  assert.ok(Math.abs(p1[0] - 104) < 1e-6 && Math.abs(p1[1] - 50) < 1e-6);
  assert.ok(Math.abs(p2[0] - 396) < 1e-6);
  b.y = 300; // o destino desce: a ponta segue
  assert.ok(G.pontasDaLinha(seta, porId)[1][1] > 50);
  const m = G.movido(seta, 10, 10, porId);
  assert.equal(m.a, null); assert.equal(m.b, null);
  assert.equal(G.ondePrender([a, b, seta], 50, 50, 5).id, 'a');
  assert.equal(G.ondePrender([seta], 50, 50, 5), null);
});

test('mover, escalar e girar devolvem objetos novos sem mexer no original', () => {
  const o = caixa({ x: 100, y: 100, w: 200, h: 100 });
  const porId = G.porIdDe([o]);
  const m = G.movido(o, 10, -5, porId);
  assert.deepEqual([m.x, m.y], [110, 95]); assert.deepEqual([o.x, o.y], [100, 100]);
  const e = G.escalado(o, 100, 100, 2, 0.5, porId);
  assert.deepEqual([e.x, e.y, e.w, e.h], [100, 100, 400, 50]);
  const r = G.girado(o, 200, 150, Math.PI / 2, porId);
  assert.ok(Math.abs(r.r - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(G.centro(r)[0] - 200) < 1e-9 && Math.abs(G.centro(r)[1] - 150) < 1e-9);
  assert.deepEqual(G.escalado(traco([[0, 0], [10, 0]]), 0, 0, 3, 3, porId).p, [[0, 0], [30, 0]]);
  const texto = { id: 'x', t: 'text', x: 0, y: 0, w: 100, h: 25, r: 0, c: 'ink', text: 'a\nb', fs: 20 };
  const tx = G.escalado(texto, 0, 0, 2, 2, porId);
  assert.equal(tx.fs, 40); assert.equal(tx.h, 40 * 1.25 * 2);
});

test('limites e união consideram rotação, traços e setas', () => {
  const o = caixa({ x: 0, y: 0, w: 100, h: 20, r: Math.PI / 2 });
  const b = G.limites(o, G.porIdDe([o]));
  assert.ok(Math.abs(b.w - 20) < 1e-6 && Math.abs(b.h - 100) < 1e-6);
  assert.deepEqual(G.limites(traco([[0, 0], [10, 10]], { s: 4 })), { x: -2, y: -2, w: 14, h: 14 });
  assert.deepEqual(G.uniao([caixa({ x: 0, y: 0, w: 10, h: 10 }), caixa({ x: 50, y: 60, w: 10, h: 10 })], () => null), { x: 0, y: 0, w: 60, h: 70 });
  assert.equal(G.uniao([], () => null), null);
});

test('borracha: o traço inteiro (só traços) e o pedaço (parte o traço)', () => {
  const t = traco(percurso([[0, 0], [200, 0]], 40), { id: 'T' });
  const post = { id: 'P', t: 'sticky', x: 80, y: -50, w: 40, h: 100, r: 0, f: '#fff', text: '' };
  const r1 = G.apagarInteiro([t, post], 100, 0, 6);
  assert.equal(r1.mudou, true);
  assert.deepEqual(r1.objs.map((o) => o.id), ['P']); // o post-it fica
  assert.equal(G.apagarInteiro([t, post], 100, 60, 6).mudou, false);
  assert.equal(G.apagarInteiro([{ ...t, lock: true }], 100, 0, 6).mudou, false);
  let k = 0;
  const r2 = G.apagarPedaco([t, post], 100, 0, 6, 3, () => `p${++k}`);
  assert.equal(r2.mudou, true);
  const pedacos = r2.objs.filter((o) => o.t === 'stroke');
  assert.equal(pedacos.length, 2);
  assert.ok(Math.max(...pedacos[0].p.map((q) => q[0])) < 100);
  assert.ok(Math.min(...pedacos[1].p.map((q) => q[0])) > 100);
  assert.notEqual(pedacos[0].id, pedacos[1].id);
  assert.equal(G.apagarPedaco([t], 100, 80, 6, 3, novoId).mudou, false);
});

test('densificar, simplificar, polígono e grupo', () => {
  const d = G.densificar([[0, 0], [10, 0]], 3);
  assert.ok(d.length >= 4);
  for (let i = 1; i < d.length; i++) assert.ok(Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]) <= 3.01);
  assert.deepEqual(G.simplificar([[0, 0], [5, 0.1], [10, 0]], 1), [[0, 0], [10, 0]]);
  assert.equal(G.simplificar([[0, 0], [5, 5], [10, 0]], 1).length, 3);
  const poli = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(G.dentroDoPoligono([5, 5], poli), true);
  assert.equal(G.dentroDoPoligono([15, 5], poli), false);
  const a = caixa({ id: 'a', g: 'G' }); const b = caixa({ id: 'b', g: 'G' }); const c = caixa({ id: 'c' });
  assert.deepEqual(G.idsDoGrupo([a, b, c], a), ['a', 'b']);
  assert.deepEqual(G.idsDoGrupo([a, b, c], c), ['c']);
});

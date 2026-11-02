import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinca } from '../cliente/camera.js';

const LIM = [0.2, 4];
const perto = (a, b) => Math.abs(a - b) < 1e-9;

test('pinça: afastar os dedos aumenta o zoom na mesma proporção', () => {
  const cam = { x: 10, y: 20, z: 1 };
  const r = pinca(cam, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 }, ...LIM);
  assert.ok(perto(r.z, 2));
});

test('pinça: aproximar os dedos diminui o zoom (o que faltava no celular)', () => {
  const cam = { x: 0, y: 0, z: 1 };
  const r = pinca(cam, { x: 50, y: 100 }, { x: 250, y: 100 }, { x: 100, y: 100 }, { x: 200, y: 100 }, ...LIM);
  assert.ok(perto(r.z, 0.5));
});

test('pinça: respeita os limites mínimo e máximo de zoom', () => {
  const cam = { x: 0, y: 0, z: 1 };
  const longe = pinca(cam, { x: 100, y: 100 }, { x: 110, y: 100 }, { x: 0, y: 100 }, { x: 1000, y: 100 }, ...LIM);
  const junto = pinca(cam, { x: 0, y: 100 }, { x: 1000, y: 100 }, { x: 100, y: 100 }, { x: 101, y: 100 }, ...LIM);
  assert.equal(longe.z, 4);
  assert.equal(junto.z, 0.2);
});

test('pinça: o ponto do mundo sob o centro dos dedos continua sob o novo centro', () => {
  const cam = { x: 30, y: -40, z: 1.5 };
  const a0 = { x: 120, y: 200 }; const b0 = { x: 280, y: 240 };
  const a1 = { x: 140, y: 230 }; const b1 = { x: 220, y: 250 };
  const c0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const c1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const mundo = { x: (c0.x - cam.x) / cam.z, y: (c0.y - cam.y) / cam.z };
  const r = pinca(cam, a0, b0, a1, b1, ...LIM);
  assert.ok(perto(mundo.x * r.z + r.x, c1.x));
  assert.ok(perto(mundo.y * r.z + r.y, c1.y));
});

test('pinça: dedos começando no mesmo ponto não quebram a câmera', () => {
  const cam = { x: 5, y: 6, z: 2 };
  const r = pinca(cam, { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 0, y: 0 }, { x: 80, y: 0 }, ...LIM);
  assert.deepEqual(r, cam);
});

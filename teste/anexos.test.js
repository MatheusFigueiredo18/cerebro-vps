import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referenciaPrompt, caminhosDoArrasto, arrastoTemArquivos, posicaoSolta, pontaLigacao, caminhoCurvo, adicionarAnexos, TIPO_ARRASTO } from '../cliente/anexos.js';

test('referência do prompt: @ no Claude, caminho puro nos outros, aspas se tiver espaço', () => {
  assert.equal(referenciaPrompt(['conteudo/enviados/a.png'], 'claude'), '@conteudo/enviados/a.png ');
  assert.equal(referenciaPrompt(['conteudo/enviados/a.png'], 'codex'), 'conteudo/enviados/a.png ');
  assert.equal(referenciaPrompt(['conteudo/enviados/Capa 2.jpg', 'x/y.mp4'], 'claude'), '"conteudo/enviados/Capa 2.jpg" @x/y.mp4 ');
  assert.equal(referenciaPrompt([], 'claude'), '');
});

test('arrasto: lê só caminhos válidos e ignora lixo e ..', () => {
  const dt = (v) => ({ getData: () => v, types: [TIPO_ARRASTO] });
  assert.deepEqual(caminhosDoArrasto(dt(JSON.stringify(['a/b.png', '../fora', 3, '']))), ['a/b.png']);
  assert.deepEqual(caminhosDoArrasto(dt('não é json')), []);
  assert.deepEqual(caminhosDoArrasto(null), []);
  assert.equal(arrastoTemArquivos({ types: ['Files'] }), true);
  assert.equal(arrastoTemArquivos({ types: [TIPO_ARRASTO] }), true);
  assert.equal(arrastoTemArquivos({ types: ['text/plain'] }), false);
});

test('posição de soltura: o centro do card fica sob o ponteiro, com zoom e câmera', () => {
  const p = posicaoSolta({ x: 100, y: 50, z: 2 }, { left: 10, top: 20 }, 410, 220, 100, 60);
  // mundo x = (410 - 10 - 100) / 2 = 150, menos metade da largura (50) = 100; y = (220 - 20 - 50) / 2 = 75, menos 30 = 45
  assert.deepEqual(p, { x: 100, y: 45 });
});

test('ligação: sai do lado do terminal mais perto do arquivo', () => {
  const t = { x: 0, y: 0, w: 800, h: 500 };
  const direita = pontaLigacao(t, { x: 900, y: 100, w: 200, h: 100 });
  assert.equal(direita.x1, 800); assert.equal(direita.x2, 900); assert.equal(direita.h, true);
  const esquerda = pontaLigacao(t, { x: -400, y: 100, w: 200, h: 100 });
  assert.equal(esquerda.x1, 0); assert.equal(esquerda.x2, -200);
  const embaixo = pontaLigacao(t, { x: 300, y: 650, w: 200, h: 100 });
  assert.equal(embaixo.y1, 500); assert.equal(embaixo.y2, 650); assert.equal(embaixo.h, false);
  const em_cima = pontaLigacao(t, { x: 300, y: -300, w: 200, h: 100 });
  assert.equal(em_cima.y1, 0); assert.equal(em_cima.y2, -200);
  assert.match(caminhoCurvo(direita), /^M800 \d+ C870 /);
});

test('anexos: não repete o mesmo arquivo e escalona os novos', () => {
  const a = adicionarAnexos([], ['a.png', 'b.png'], { x: 10, y: 10 });
  assert.deepEqual(a, [{ caminho: 'a.png', x: 10, y: 10 }, { caminho: 'b.png', x: 38, y: 38 }]);
  const b = adicionarAnexos(a, ['a.png', 'c.png'], { x: 200, y: 200 });
  assert.equal(b.length, 3);
  assert.deepEqual(b[0], { caminho: 'a.png', x: 10, y: 10 });
  assert.deepEqual(b[2], { caminho: 'c.png', x: 200, y: 200 });
});

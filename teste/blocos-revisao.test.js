import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdParaBlocos, blocosParaMd, abreEmGuia } from '../cliente/blocos.js';

test('blocos: callout dobrável do Obsidian volta igual', () => {
  for (const md of ['> [!faq]- Pergunta\n> resposta\n', '> [!tip]+\n> dica\n', '> [!note]+ Título\n', '> [!note] Aberto\n']) {
    assert.equal(blocosParaMd(mdParaBlocos(md)), md);
  }
});

test('blocos: cerca de código sem fechamento fica como texto e volta igual', () => {
  const md = '```js\nconst a = 1;\n\nfim\n';
  const blocos = mdParaBlocos(md);
  assert.ok(blocos.every((b) => b.tipo !== 'codigo'));
  assert.equal(blocosParaMd(blocos), md);
});

test('blocos: cerca fechada continua virando bloco de código', () => {
  const [b] = mdParaBlocos('```js\nconst a = 1;\n```\n');
  assert.equal(b.tipo, 'codigo');
  assert.equal(b.texto, 'const a = 1;');
});

test('abreEmGuia: só .md fora de pastas ocultas', () => {
  assert.equal(abreEmGuia('Spoke/nota.md'), true);
  assert.equal(abreEmGuia('NOTA.MD'), true);
  assert.equal(abreEmGuia('.claude/skills/save/SKILL.md'), false);
  assert.equal(abreEmGuia('a/.oculta/x.md'), false);
  assert.equal(abreEmGuia('imagem.png'), false);
});

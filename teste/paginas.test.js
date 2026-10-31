import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caminhoSeguro, criarPagina, criarPasta, lerPagina, salvarPagina, buscar } from '../servidor/paginas.js';

const novoVault = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'core-os-')));

test('caminhoSeguro rejeita ../ e caminho absoluto', () => {
  const v = novoVault();
  assert.throws(() => caminhoSeguro(v, '../fora'), /fora do vault/);
  assert.throws(() => caminhoSeguro(v, 'a/../../fora'), /fora do vault/);
  assert.throws(() => caminhoSeguro(v, '/etc/passwd'), /fora do vault/);
  assert.throws(() => caminhoSeguro(v, 'C:\\Windows'), /fora do vault/);
});

test('caminhoSeguro rejeita segmento oculto', () => {
  const v = novoVault();
  assert.throws(() => caminhoSeguro(v, '.git/config'), /fora do vault/);
  assert.throws(() => caminhoSeguro(v, 'a/.banco.json'), /fora do vault/);
});

test('caminhoSeguro aceita vazio como a raiz do vault', () => {
  const v = novoVault();
  assert.equal(caminhoSeguro(v, ''), v);
});

test('criarPagina limpa caracteres inválidos do título', () => {
  const v = novoVault();
  assert.equal(criarPagina(v, '', 'a/b:c*?').caminho, 'a b c.md');
  assert.equal(fs.readFileSync(path.join(v, 'a b c.md'), 'utf8'), '# a/b:c*?\n');
});

test('criarPagina com título vazio vira "Sem título.md"', () => {
  const v = novoVault();
  assert.equal(criarPagina(v, '', '   ').caminho, 'Sem título.md');
});

test('criarPagina corta título de 300 caracteres em 80', () => {
  const v = novoVault();
  const { caminho } = criarPagina(v, '', 'x'.repeat(300));
  assert.equal(caminho, `${'x'.repeat(80)}.md`);
});

test('criarPagina repetida vira "Título 2.md" e não sobrescreve', () => {
  const v = novoVault();
  const a = criarPagina(v, '', 'Título');
  fs.writeFileSync(path.join(v, a.caminho), 'meu texto');
  const b = criarPagina(v, '', 'Título');
  assert.equal(b.caminho, 'Título 2.md');
  assert.equal(fs.readFileSync(path.join(v, a.caminho), 'utf8'), 'meu texto');
});

test('criarPasta cria dentro de uma pasta existente e evita duplicata', () => {
  const v = novoVault();
  const a = criarPasta(v, '', 'Spoke');
  const b = criarPasta(v, '', 'Spoke');
  assert.equal(a.caminho, 'Spoke');
  assert.equal(b.caminho, 'Spoke 2');
  assert.ok(fs.statSync(path.join(v, 'Spoke 2')).isDirectory());
});

test('salvarPagina com mtime velho lança CONFLITO e não altera o arquivo', () => {
  const v = novoVault();
  const { caminho } = criarPagina(v, '', 'Nota');
  const { mtime } = lerPagina(v, caminho);
  assert.equal(typeof salvarPagina(v, caminho, 'primeiro', mtime).mtime, 'number');
  const abs = path.join(v, caminho);
  fs.writeFileSync(abs, 'mudou por fora');
  const futuro = new Date(Date.now() + 60_000);
  fs.utimesSync(abs, futuro, futuro);
  assert.throws(() => salvarPagina(v, caminho, 'segundo', mtime), (e) => e.code === 'CONFLITO');
  assert.equal(fs.readFileSync(abs, 'utf8'), 'mudou por fora');
});

test('salvarPagina recusa arquivo que não é .md', () => {
  const v = novoVault();
  fs.writeFileSync(path.join(v, 'x.txt'), 'a');
  assert.throws(() => salvarPagina(v, 'x.txt', 'b', 0), /somente \.md/);
});

test('buscar acha por nome e por conteúdo', () => {
  const v = novoVault();
  fs.writeFileSync(path.join(v, 'Receitas.md'), '# Receitas\nbolo de cenoura');
  fs.writeFileSync(path.join(v, 'Outra.md'), 'uma BANANA madura');
  const porNome = buscar(v, 'receitas');
  assert.deepEqual(porNome.map((r) => r.caminho), ['Receitas.md']);
  const porTexto = buscar(v, 'banana');
  assert.deepEqual(porTexto.map((r) => r.caminho), ['Outra.md']);
  assert.match(porTexto[0].trecho, /BANANA/);
});

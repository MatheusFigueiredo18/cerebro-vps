import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { subir, entrar, json, escrever } from './ajuda.js';

async function preparar(t) {
  const s = await subir();
  t.after(() => s.fechar());
  const cookie = await entrar(s.base);
  const pedir = async (metodo, rota, corpo) => {
    const r = await fetch(`${s.base}${rota}`, corpo === undefined ? { method: metodo, headers: { cookie } } : json(cookie, corpo, metodo));
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };
  return { s, cookie, pedir };
}

test('páginas: criar, ler, salvar, conflito e erros mapeados', async (t) => {
  const { s, pedir } = await preparar(t);
  fs.mkdirSync(path.join(s.cfg.vault, 'notas'));
  const criada = await pedir('POST', '/api/paginas', { pasta: 'notas', titulo: 'Minha nota' });
  assert.deepEqual(criada, { status: 200, corpo: { caminho: 'notas/Minha nota.md' } });
  assert.deepEqual((await pedir('POST', '/api/pastas', { pasta: 'notas', nome: 'Sub' })).corpo, { caminho: 'notas/Sub' });

  const lida = await pedir('GET', `/api/pagina?caminho=${encodeURIComponent('notas/Minha nota.md')}`);
  assert.equal(lida.corpo.texto, '# Minha nota\n');
  const salva = await pedir('PUT', '/api/pagina', { caminho: 'notas/Minha nota.md', texto: 'novo', mtime: lida.corpo.mtime });
  assert.equal(salva.status, 200);
  assert.equal(typeof salva.corpo.mtime, 'number');
  const conflito = await pedir('PUT', '/api/pagina', { caminho: 'notas/Minha nota.md', texto: 'x', mtime: lida.corpo.mtime - 1000 });
  assert.equal(conflito.status, 409);
  assert.ok(conflito.corpo.erro);

  assert.equal((await pedir('GET', '/api/pagina?caminho=../fora.md')).status, 400);
  assert.equal((await pedir('GET', '/api/pagina?caminho=notas/x.txt')).status, 400);
  assert.equal((await pedir('GET', '/api/pagina?caminho=notas/nada.md')).status, 404);
  assert.equal((await pedir('POST', '/api/paginas', { pasta: 'nao-existe', titulo: 'x' })).status, 404);

  const achados = await pedir('GET', '/api/busca?q=novo');
  assert.deepEqual(achados.corpo.map((a) => a.caminho), ['notas/Minha nota.md']);
});

test('PUT /api/pagina aceita até 3 MB só depois do login', async (t) => {
  const { s, cookie, pedir } = await preparar(t);
  escrever(s.cfg.vault, 'g.md', '');
  const { corpo: { mtime } } = await pedir('GET', '/api/pagina?caminho=g.md');
  const grande = 'a'.repeat(1_500_000);
  assert.equal((await pedir('PUT', '/api/pagina', { caminho: 'g.md', texto: grande, mtime })).status, 200);
  const semLogin = await fetch(`${s.base}/api/pagina`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'b'.repeat(2_500_000) }) });
  assert.equal(semLogin.status, 401);
  const enorme = await fetch(`${s.base}/api/pagina`, json(cookie, { caminho: 'g.md', texto: 'c'.repeat(3_200_000), mtime }, 'PUT'));
  assert.equal(enorme.status, 413);
  const outra = await fetch(`${s.base}/api/paginas`, json(cookie, { pasta: '', titulo: 'd'.repeat(1_100_000) }));
  assert.equal(outra.status, 413);
});

test('bancos: criar, ler, linhas, propriedade, esquema e erros', async (t) => {
  const { pedir } = await preparar(t);
  const { corpo: { caminho } } = await pedir('POST', '/api/bancos', { pasta: '', nome: 'Tarefas' });
  assert.equal(caminho, 'Tarefas');
  const banco = await pedir('GET', '/api/banco?pasta=Tarefas');
  assert.equal(banco.corpo.esquema.nome, 'Tarefas');
  assert.deepEqual(banco.corpo.linhas, []);

  const linha = await pedir('POST', '/api/banco/linhas', { pasta: 'Tarefas', titulo: 'Comprar pão' });
  assert.equal(linha.corpo.props.status, 'A fazer');
  const alterada = await pedir('PATCH', '/api/banco/linha', { caminho: linha.corpo.caminho, prop: 'status', valor: 'Feito' });
  assert.equal(alterada.corpo.props.status, 'Feito');
  assert.equal((await pedir('PATCH', '/api/banco/linha', { caminho: linha.corpo.caminho, prop: 'x y', valor: 1 })).status, 400);

  const esquema = { ...banco.corpo.esquema, nome: 'Renomeado' };
  assert.equal((await pedir('PUT', '/api/banco/esquema', { pasta: 'Tarefas', esquema })).status, 200);
  assert.equal((await pedir('GET', '/api/banco?pasta=Tarefas')).corpo.esquema.nome, 'Renomeado');
  assert.equal((await pedir('PUT', '/api/banco/esquema', { pasta: 'Tarefas', esquema: { nome: 1 } })).status, 400);

  await pedir('POST', '/api/pastas', { pasta: '', nome: 'Comum' });
  assert.equal((await pedir('GET', '/api/banco?pasta=Comum')).status, 404);
});

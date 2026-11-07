import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolverNoVault, arvore, listarPasta, conteudos, grafo, pesoCapa } from '../servidor/arquivos.js';
import { tmp, escrever, cfgTeste, subir, entrar } from './ajuda.js';

test('resolverNoVault: barras iniciais, .., absoluto, inexistente e ocultos', () => {
  const v = tmp();
  escrever(v, 'a/b.md', 'x');
  escrever(v, '.oculto/c.md', 'y');
  assert.equal(resolverNoVault(v, '/a/b.md'), path.join(v, 'a', 'b.md'));
  assert.equal(resolverNoVault(v, ''), v);
  assert.equal(resolverNoVault(v, '.oculto/c.md'), path.join(v, '.oculto', 'c.md'));
  assert.equal(resolverNoVault(v, '../fora'), null);
  assert.equal(resolverNoVault(v, 'a/../../fora'), null);
  assert.equal(resolverNoVault(v, 'a/nada.md'), null);
  assert.equal(resolverNoVault(v, path.dirname(v)), null);
});

test('resolverNoVault: link simbólico para fora é recusado', (t) => {
  const v = tmp();
  const fora = tmp();
  escrever(fora, 'segredo.txt', 's');
  try { fs.symlinkSync(fora, path.join(v, 'link'), 'junction'); } catch { t.skip('sem permissão para criar link'); return; }
  assert.equal(resolverNoVault(v, 'link/segredo.txt'), null);
});

test('arvore: esconde ocultos menos .claude, pastas antes, ordem pt e profundidade 8', () => {
  const v = tmp();
  for (const f of ['b.md', 'Á.md', 'a.md', 'pasta/x.md', '.git/config', '.obsidian/a', 'node_modules/m/i.js', '.claude/skills/s.md', '.DS_Store']) escrever(v, f);
  escrever(v, '1/2/3/4/5/6/7/8/9/fundo.md');
  const nos = arvore(v);
  assert.deepEqual(nos.map((n) => n.nome), ['.claude', '1', 'pasta', 'a.md', 'Á.md', 'b.md']);
  const semMtime = ({ mtime, filhos, ...no }) => (filhos ? { ...no, filhos: filhos.map(semMtime) } : no);
  assert.deepEqual(semMtime(nos[0].filhos[0]), { nome: 'skills', caminho: '.claude/skills', tipo: 'pasta', filhos: [{ nome: 's.md', caminho: '.claude/skills/s.md', tipo: 'arquivo' }] });
  let n = nos[1];
  for (let i = 2; i <= 8; i += 1) n = n.filhos[0];
  assert.equal(n.caminho, '1/2/3/4/5/6/7/8');
  assert.deepEqual(n.filhos, []);
});

test('arvore: marca pasta de banco e traz mtime de cada item', () => {
  const v = tmp();
  escrever(v, 'tarefas/.banco.json', '{}');
  escrever(v, 'tarefas/linha.md', 'x');
  escrever(v, 'notas/a.md', 'y');
  const [notas, tarefas] = arvore(v);
  assert.equal(tarefas.banco, true);
  assert.equal(notas.banco, undefined);
  assert.equal(typeof notas.filhos[0].mtime, 'number');
  assert.ok(notas.filhos[0].mtime > 0);
});

test('listarPasta: plana, recursiva, sem ocultos nem índices, ordem natural', () => {
  const v = tmp();
  for (const f of ['c/10.png', 'c/2.png', 'c/sub/1.png', 'c/CLAUDE.md', 'c/sub/AGENTS.md', 'c/.oculto', 'c/.d/x.png']) escrever(v, f, 'ab');
  const l = listarPasta(v, 'c');
  assert.deepEqual(l.map((i) => i.caminho), ['c/2.png', 'c/10.png', 'c/sub/1.png']);
  assert.equal(l[0].nome, '2.png');
  assert.equal(l[0].tamanho, 2);
  assert.equal(typeof l[0].mtime, 'number');
  assert.equal(listarPasta(v, 'c/2.png'), null);
  assert.equal(listarPasta(v, '../'), null);
});

test('pesoCapa segue a tabela da especificação', () => {
  assert.equal(pesoCapa('x/capa.mp4'), 0);
  assert.equal(pesoCapa('entrega/1.png'), 1);
  assert.equal(pesoCapa('1.png'), 2);
  assert.equal(pesoCapa('original/1.png'), 3);
  assert.equal(pesoCapa('video-final.mp4'), 4);
  assert.equal(pesoCapa('bruto.MOV'), 5);
  assert.equal(pesoCapa('nota.md'), null);
});

test('conteudos: categorias, itens, capa, contagem e ordem por recência', () => {
  const v = tmp();
  const t0 = Date.now() / 1000;
  const marcar = (rel, s) => { const a = escrever(v, rel, 'x'); fs.utimesSync(a, t0 + s, t0 + s); };
  marcar('conteudo/carrosseis/post-a/original/1.png', 10);
  marcar('conteudo/carrosseis/post-a/entrega/2.png', 11);
  marcar('conteudo/carrosseis/post-a/entrega/10.png', 12);
  marcar('conteudo/carrosseis/post-a/CLAUDE.md', 99);
  marcar('conteudo/carrosseis/solto.mp4', 20);
  marcar('conteudo/reels/r/bruto.mp4', 30);
  marcar('conteudo/reels/r/editado.mp4', 5);
  fs.mkdirSync(path.join(v, 'conteudo', 'vazia'));
  fs.mkdirSync(path.join(v, 'conteudo', 'vazia', 'nada'));
  marcar('conteudo/.oculta/a.png', 50);
  marcar('conteudo/solto-na-raiz.png', 60);

  const cats = conteudos(v);
  assert.deepEqual(cats.map((c) => c.nome), ['reels', 'carrosseis', 'vazia']);
  const car = cats[1];
  assert.equal(car.caminho, 'conteudo/carrosseis');
  assert.deepEqual(car.itens.map((i) => i.nome), ['solto.mp4', 'post-a']);
  const post = car.itens[1];
  assert.equal(post.pasta, true);
  assert.equal(post.arquivos, 3);
  assert.equal(Math.round(post.mtime / 1000), Math.round(t0 + 12));
  assert.deepEqual(post.capa, { caminho: 'conteudo/carrosseis/post-a/entrega/2.png', tipo: 'imagem' });
  assert.deepEqual(car.itens[0].capa, { caminho: 'conteudo/carrosseis/solto.mp4', tipo: 'video' });
  assert.equal(car.itens[0].arquivos, 1);
  assert.deepEqual(cats[0].itens[0].capa, { caminho: 'conteudo/reels/r/editado.mp4', tipo: 'video' });
  assert.deepEqual(cats[2].itens[0], { nome: 'nada', caminho: 'conteudo/vazia/nada', pasta: true, arquivos: 0, mtime: 0, capa: null });
  assert.equal(cats[2].mtime, 0);
  assert.deepEqual(conteudos(tmp()), []);
});

test('grafo: nós, ligações de pasta e as três formas de link', () => {
  const v = tmp();
  escrever(v, 'notas/a.md', 'Veja [[B]] e [[b|outro]] e ![[foto.png]] e [[a]] e [[inexistente]].\n[x](../midia/foto.png#k) [y](sub%20pasta/c.md) `midia/` `c.md` `nao existe`');
  escrever(v, 'notas/sub pasta/c.md', '[[a#titulo]]');
  escrever(v, 'outra/b.md', '');
  escrever(v, 'zz/b.md', 'segundo b');
  escrever(v, 'midia/foto.png', '');
  escrever(v, 'midia/lixo.bin', '');
  escrever(v, 'sessoes/x.md', '');
  escrever(v, '.claude/hooks/h.md', '');
  escrever(v, '.claude/skills/s.md', '[[a]]');
  escrever(v, 'notas/c.md', '');
  const g = grafo(v);
  const ids = g.nos.map((n) => n.id);
  assert.ok(!ids.some((i) => i.startsWith('sessoes') || i.startsWith('.claude/hooks')));
  assert.ok(!ids.includes('midia/lixo.bin'));
  assert.deepEqual(g.nos.find((n) => n.id === 'notas/a.md'), { id: 'notas/a.md', nome: 'a', tipo: 'nota' });
  assert.deepEqual(g.nos.find((n) => n.id === 'midia/foto.png'), { id: 'midia/foto.png', nome: 'foto.png', tipo: 'midia' });
  assert.deepEqual(g.nos.find((n) => n.id === 'notas'), { id: 'notas', nome: 'notas', tipo: 'pasta' });
  assert.ok(g.ligacoes.some((l) => l.de === 'notas' && l.para === 'notas/a.md' && l.tipo === 'pasta'));
  const links = (de) => g.ligacoes.filter((l) => l.tipo === 'link' && l.de === de).map((l) => l.para).sort();
  assert.deepEqual(links('notas/a.md'), ['midia', 'midia/foto.png', 'notas/c.md', 'notas/sub pasta/c.md', 'outra/b.md']);
  assert.deepEqual(links('notas/sub pasta/c.md'), ['notas/a.md']);
  assert.deepEqual(links('.claude/skills/s.md'), ['notas/a.md']);
});

test('rotas de arquivo: leitura com Range, download, pasta e 404', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  escrever(s.cfg.vault, 'docs/texto.txt', '0123456789');
  escrever(s.cfg.vault, '.oculto.md', 'oi');
  const cookie = await entrar(s.base);
  const get = (u, h = {}) => fetch(`${s.base}${u}`, { headers: { cookie, ...h } });

  const r = await get('/api/arquivo?caminho=docs/texto.txt');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/plain/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.equal(await r.text(), '0123456789');
  const parcial = await get('/api/arquivo?caminho=docs/texto.txt', { range: 'bytes=2-4' });
  assert.equal(parcial.status, 206);
  assert.equal(await parcial.text(), '234');
  const baixar = await get('/api/arquivo?caminho=docs/texto.txt&baixar=1');
  assert.match(baixar.headers.get('content-disposition'), /attachment; filename="?texto.txt"?/);
  assert.equal(await (await get('/api/arquivo?caminho=.oculto.md')).text(), 'oi');
  for (const c of ['docs', '../x', 'nada.md']) {
    const e = await get(`/api/arquivo?caminho=${encodeURIComponent(c)}`);
    assert.equal(e.status, 404);
    assert.ok((await e.json()).erro);
  }
  assert.equal((await (await get('/api/pasta?caminho=docs')).json())[0].caminho, 'docs/texto.txt');
  assert.equal((await get('/api/pasta?caminho=docs/texto.txt')).status, 404);
  assert.equal((await (await get('/api/arvore')).json())[0].nome, 'docs');
  assert.ok(Array.isArray((await (await get('/api/conteudos')).json())));
  assert.ok(Array.isArray((await (await get('/api/grafo')).json()).nos));
});

test('envio: pasta padrão, colisão, nome limpo, inválidos e marca de dono', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  const cookie = await entrar(s.base);
  const enviar = (q, corpo = 'abc') => fetch(`${s.base}/api/enviar?${q}`, { method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream' }, body: corpo });

  const r1 = await enviar('nome=foto.png');
  assert.equal(r1.status, 200);
  assert.deepEqual(await r1.json(), { caminho: 'conteudo/enviados/foto.png' });
  assert.deepEqual(await (await enviar('nome=foto.png')).json(), { caminho: 'conteudo/enviados/foto-2.png' });
  assert.deepEqual(await (await enviar('nome=foto.png')).json(), { caminho: 'conteudo/enviados/foto-3.png' });
  assert.deepEqual(await (await enviar(`pasta=a/b&nome=${encodeURIComponent('../../x/ seg.txt ')}`)).json(), { caminho: 'a/b/seg.txt' });
  assert.equal(fs.readFileSync(path.join(s.cfg.vault, 'a', 'b', 'seg.txt'), 'utf8'), 'abc');
  for (const q of ['nome=', 'nome=.env', 'pasta=../fora&nome=a.txt']) {
    const e = await enviar(q);
    assert.equal(e.status, 400, q);
    assert.ok((await e.json()).erro);
  }
  assert.ok(!fs.readdirSync(path.join(s.cfg.vault, 'conteudo', 'enviados')).some((n) => n.endsWith('.enviando')));
  assert.ok(s.enviadosPeloDono.has(path.join(s.cfg.vault, 'conteudo', 'enviados', 'foto.png')));
});

test('explorador de conteúdos: pastas dentro de pastas, mover sem sobrescrever e recusas', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  const cookie = await entrar(s.base);
  const pedir = (rota, metodo = 'GET', corpo) => fetch(`${s.base}${rota}`, { method: metodo, headers: { cookie, ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const nivel = async (c) => (await pedir(`/api/conteudos/nivel?caminho=${encodeURIComponent(c)}`)).json();
  escrever(s.cfg.vault, 'conteudo/solta.png', 'x');
  escrever(s.cfg.vault, 'conteudo/clientes/ana/foto.png', 'y');

  // criar pasta dentro de pasta (rota que já existe) e ver só o nível pedido, pastas antes de arquivos
  assert.equal((await pedir('/api/pastas', 'POST', { pasta: 'conteudo/clientes', nome: 'Bia' })).status, 200);
  const raiz = await nivel('conteudo');
  assert.deepEqual(raiz.itens.map((i) => [i.nome, i.pasta]), [['clientes', true], ['solta.png', false]]);
  assert.deepEqual((await nivel('conteudo/clientes')).itens.map((i) => i.nome), ['ana', 'Bia']);

  // mover arquivo e pasta; destino ocupado renomeia em vez de sobrescrever
  const mover = (de, para) => pedir('/api/conteudos/mover', 'POST', { de, para });
  assert.deepEqual(await (await mover('conteudo/solta.png', 'conteudo/clientes/Bia')).json(), { caminho: 'conteudo/clientes/Bia/solta.png' });
  escrever(s.cfg.vault, 'conteudo/solta.png', 'z');
  assert.deepEqual(await (await mover('conteudo/solta.png', 'conteudo/clientes/Bia')).json(), { caminho: 'conteudo/clientes/Bia/solta-2.png' });
  assert.equal((await mover('conteudo/clientes/Bia', 'conteudo/clientes/ana')).status, 200);
  assert.ok(fs.existsSync(path.join(s.cfg.vault, 'conteudo/clientes/ana/Bia/solta.png')));

  // recusas: pasta dentro dela mesma, fora de conteudo/, ".." e raiz
  assert.equal((await mover('conteudo/clientes', 'conteudo/clientes/ana')).status, 400);
  assert.equal((await mover('conteudo/clientes/ana/foto.png', 'docs')).status, 400);
  assert.equal((await mover('conteudo/../docs', 'conteudo')).status, 400);
  assert.equal((await mover('conteudo', 'conteudo/clientes')).status, 400);
  assert.equal((await mover('conteudo/nao-existe', 'conteudo')).status, 404);
  assert.equal((await pedir('/api/conteudos/nivel?caminho=docs')).status, 404);

  // renomear: mesmo lugar, sem sobrescrever, sem sair da pasta; apagar vai para .trash/
  const renomear = (de, nome) => pedir('/api/conteudos/renomear', 'POST', { de, nome });
  assert.deepEqual(await (await renomear('conteudo/clientes/ana/foto.png', 'retrato.png')).json(), { caminho: 'conteudo/clientes/ana/retrato.png' });
  escrever(s.cfg.vault, 'conteudo/clientes/ana/outra.png', 'o');
  assert.equal((await renomear('conteudo/clientes/ana/outra.png', 'retrato.png')).status, 409);
  assert.equal((await renomear('conteudo/clientes/ana/outra.png', '.oculto')).status, 400);
  assert.equal((await renomear('conteudo', 'x')).status, 400);
  assert.deepEqual(await (await renomear('conteudo/clientes/ana/outra.png', '../../fugiu.png')).json(), { caminho: 'conteudo/clientes/ana/fugiu.png' });
  assert.equal((await pedir('/api/conteudos/apagar', 'POST', { de: 'conteudo/clientes/ana' })).status, 200);
  assert.ok(!fs.existsSync(path.join(s.cfg.vault, 'conteudo/clientes/ana')));
  assert.ok(fs.readdirSync(path.join(s.cfg.vault, '.trash')).some((n) => n.endsWith('-ana')));
  assert.equal((await pedir('/api/conteudos/apagar', 'POST', { de: 'docs' })).status, 400);
  assert.equal((await pedir('/api/conteudos/apagar', 'POST', { de: 'conteudo' })).status, 400);
});

const temFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('capa de vídeo: gera, guarda em cache e recusa o que não é vídeo', { skip: !temFfmpeg && 'ffmpeg ausente' }, async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  const video = path.join(s.cfg.vault, 'conteudo', 'v.mp4');
  fs.mkdirSync(path.dirname(video), { recursive: true });
  spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '2', video]);
  escrever(s.cfg.vault, 'conteudo/n.md', 'x');
  const cookie = await entrar(s.base);
  const pedir = (c) => fetch(`${s.base}/api/capa?caminho=${c}`, { headers: { cookie } });
  const [a, b] = await Promise.all([pedir('conteudo/v.mp4'), pedir('conteudo/v.mp4')]);
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('content-type'), 'image/jpeg');
  assert.equal(a.headers.get('cache-control'), 'private, max-age=86400');
  assert.equal(b.status, 200);
  assert.equal(fs.readdirSync(path.join(s.cfg.dados, 'capas')).filter((n) => n.endsWith('.jpg')).length, 1);
  const r404 = await pedir('conteudo/n.md');
  assert.equal(r404.status, 404);
  assert.equal(await r404.text(), '');
});

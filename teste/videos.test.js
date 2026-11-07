import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarVideos, validarGrafo } from '../servidor/videos.js';
import { tmp, subir, entrar, json } from './ajuda.js';

const traco = (id = 't1') => ({ id, t: 'stroke', tool: 'pen', c: 'ink', s: 3, p: [[0, 0], [10, 10]] });
const no = (id = 'n1') => ({ id, tipo: 'prompt', x: 10, y: 20, w: 280, h: 190, dados: { texto: 'oi' } });
const nota = (id = 'a1') => ({ id, x: 5, y: 6, w: 170, h: 150, cor: '#FFE066', texto: 'lembrar da trilha' });
const grafo = () => ({ cam: { x: 1, y: 2, z: 1 }, nos: [no()], links: [{ a: 'n1', b: 'n2' }], tracos: [traco()], notas: [nota()] });

test('vídeo: criar, salvar com versão, listar e ler', () => {
  let relogio = 1000;
  const v = criarVideos(tmp('dados-'), () => (relogio += 10));
  const a = v.criar({ titulo: '  Meu   vídeo ' });
  assert.equal(a.titulo, 'Meu vídeo');
  assert.equal(a.numero, 1);
  assert.equal(a.versao, 1);
  assert.equal(v.criar({}).numero, 2);
  assert.deepEqual(a.grafo.nos, []);

  const r = v.salvar(a.id, { versao: 1, titulo: 'Renomeado', grafo: grafo() });
  assert.equal(r.versao, 2);
  const lida = v.ler(a.id);
  assert.equal(lida.titulo, 'Renomeado');
  assert.equal(lida.grafo.notas[0].texto, 'lembrar da trilha');
  assert.equal(lida.grafo.tracos.length, 1);
  assert.equal(v.listar().length, 2);
  assert.equal(v.listar().find((x) => x.id === a.id).nos, 1);
});

test('vídeo: criar com id do painel é idempotente e aceita o grafo antigo do navegador (migração)', () => {
  const v = criarVideos(tmp('dados-'));
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const a = v.criar({ id, numero: 7, titulo: 'Vídeo 7', criada: 1234, grafo: { cam: { x: 0, y: 0, z: 1 }, nos: [no()], links: [] } });
  assert.equal(a.id, id);
  assert.equal(a.numero, 7);
  assert.equal(a.criada, 1234);
  assert.deepEqual(a.grafo.tracos, []); // campos que faltavam no grafo antigo entram vazios
  const b = v.criar({ id, titulo: 'Outro nome' });
  assert.equal(b.titulo, 'Vídeo 7'); // já existia: devolve a mesma
  assert.equal(v.listar().length, 1);
});

test('vídeo: versão velha vira conflito; remover só arquiva (o arquivo fica)', () => {
  const dados = tmp('dados-');
  const v = criarVideos(dados);
  const a = v.criar({});
  v.salvar(a.id, { versao: 1, grafo: grafo() });
  assert.throws(() => v.salvar(a.id, { versao: 1, grafo: grafo() }), (e) => e.code === 'CONFLITO');
  v.arquivar(a.id);
  assert.equal(v.listar().length, 0);
  assert.throws(() => v.ler(a.id), /não encontrada/);
  assert.ok(fs.existsSync(path.join(dados, 'video', `${a.id}.json`)), 'o arquivo continua no disco');
});

test('vídeo: grafo inválido e id fora do padrão são recusados', () => {
  assert.throws(() => validarGrafo(null), /inválid/);
  assert.throws(() => validarGrafo({ nos: 'x' }), /listas/);
  assert.throws(() => validarGrafo({ nos: [{ id: 'a', tipo: 'p', x: 'dez', y: 0, w: 1, h: 1 }] }), /número x/);
  assert.throws(() => validarGrafo({ nos: [{ id: 'a', tipo: 'p', x: 0, y: 0, w: 1, h: 1, dados: { t: 'x'.repeat(21000) } }] }), /dados do nó/);
  assert.throws(() => validarGrafo({ links: [{ a: 1, b: 'x' }] }), /ligação/);
  assert.throws(() => validarGrafo({ notas: [{ id: 'a', x: 0, y: 0, w: Infinity, h: 1 }] }), /número w/);
  assert.throws(() => validarGrafo({ tracos: [{ id: 'a', t: 'shape', x: 0, y: 0, w: 1, h: 1 }] }), /traços/);
  assert.throws(() => validarGrafo({ cam: { x: 0, y: 0, z: 0 } }), /câmera/);
  assert.doesNotThrow(() => validarGrafo(grafo()));
  assert.doesNotThrow(() => validarGrafo({ cam: null, nos: [], links: [] }));
  const v = criarVideos(tmp('dados-'));
  for (const id of ['../x', '..\\x', 'x', 'ZZZZZZZZ', '']) assert.throws(() => v.ler(id), /inválid/);
});

test('rotas de vídeo: exigem login, salvam, migram, arquivam e aceitam corpo maior que 1 MB', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  assert.equal((await fetch(`${s.base}/api/video`)).status, 401);
  const cookie = await entrar(s.base);
  const pedir = async (metodo, rota, corpo) => {
    const r = await fetch(`${s.base}${rota}`, corpo === undefined ? { method: metodo, headers: { cookie } } : json(cookie, corpo, metodo));
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };
  const id = '11111111-2222-3333-4444-555555555555';
  const criada = await pedir('POST', '/api/video', { id, numero: 1, titulo: 'Vídeo 1' });
  assert.equal(criada.status, 200);
  assert.equal(criada.corpo.id, id);

  const grande = { ...grafo(), tracos: Array.from({ length: 40 }, (_, k) => ({ ...traco(`t${k}`), p: Array.from({ length: 2000 }, (__, i) => [i * 1.2345678, k * 3.1415926]) })) }; // ~2 MB
  const salva = await pedir('PUT', `/api/video/${id}`, { versao: 1, titulo: 'Vídeo 1', grafo: grande });
  assert.equal(salva.status, 200);
  assert.equal(salva.corpo.versao, 2);
  assert.equal((await pedir('GET', `/api/video/${id}`)).corpo.grafo.tracos.length, 40);
  assert.equal((await pedir('PUT', `/api/video/${id}`, { versao: 1, grafo: grafo() })).status, 409);
  assert.equal((await pedir('PUT', `/api/video/${id}`, { versao: 2, grafo: { nos: [{ id: 'x' }] } })).status, 400);
  assert.equal((await pedir('GET', '/api/video/aaaaaaaa-0000-0000-0000-000000000000')).status, 404);
  assert.equal((await pedir('GET', '/api/video/nao-e-id')).status, 400);

  const lista = await pedir('GET', '/api/video');
  assert.equal(lista.corpo.length, 1);
  assert.equal('grafo' in lista.corpo[0], false); // a lista não carrega o grafo
  assert.equal((await pedir('POST', `/api/video/${id}/arquivar`)).status, 200);
  assert.equal((await pedir('GET', '/api/video')).corpo.length, 0);
  assert.equal((await pedir('GET', `/api/video/${id}`)).status, 404);
});

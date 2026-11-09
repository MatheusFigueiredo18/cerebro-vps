import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarLousas, validarObjetos } from '../servidor/lousas.js';
import { tmp, subir, entrar, json } from './ajuda.js';

const traco = (id = 't1') => ({ id, t: 'stroke', tool: 'pen', c: 'ink', s: 3, p: [[0, 0], [10, 10], [20, 5]] });
const postit = (id = 's1') => ({ id, t: 'sticky', x: 10, y: 20, w: 170, h: 170, r: 0, f: '#FFE066', text: 'Ideia' });

test('lousas: criar, salvar com versão, listar por última alteração e duplicar', () => {
  let relogio = 1000;
  const l = criarLousas(tmp('dados-'), () => (relogio += 10));
  const a = l.criar('  Meu   quadro ');
  assert.equal(a.titulo, 'Meu quadro');
  assert.equal(a.versao, 1);
  assert.deepEqual(a.objs, []);
  const b = l.criar('');
  assert.equal(b.titulo, 'Quadro sem título');

  const r = l.salvar(a.id, { versao: 1, titulo: 'Renomeada', vista: { x: 5, y: 6, z: 2 }, objs: [traco(), postit()] });
  assert.equal(r.versao, 2);
  const lida = l.ler(a.id);
  assert.equal(lida.titulo, 'Renomeada');
  assert.deepEqual(lida.vista, { x: 5, y: 6, z: 2 });
  assert.equal(lida.objs.length, 2);

  assert.deepEqual(l.listar().map((x) => x.id), [a.id, b.id]); // a mais recentemente alterada primeiro
  assert.equal(l.listar()[0].objetos, 2);

  const copia = l.duplicar(a.id);
  assert.notEqual(copia.id, a.id);
  assert.equal(copia.titulo, 'Renomeada (cópia)');
  assert.equal(copia.versao, 1);
  assert.equal(copia.objs.length, 2);
  assert.equal(l.ler(a.id).objs.length, 2); // o original não muda
});

test('lousas: versão desatualizada vira conflito e não grava nada', () => {
  const l = criarLousas(tmp('dados-'));
  const a = l.criar('x');
  l.salvar(a.id, { versao: 1, objs: [traco()] });
  assert.throws(() => l.salvar(a.id, { versao: 1, objs: [] }), (e) => e.code === 'CONFLITO');
  assert.equal(l.ler(a.id).objs.length, 1);
  assert.equal(l.ler(a.id).versao, 2);
});

test('lousas: título e miniatura são limpos; vista inválida volta ao padrão', () => {
  const l = criarLousas(tmp('dados-'));
  const a = l.criar('x');
  l.salvar(a.id, { versao: 1, titulo: 'a\u0000b\n'.repeat(80), vista: { x: NaN, y: 1, z: 1 }, objs: [], miniatura: 'javascript:alert(1)' });
  const lida = l.ler(a.id);
  assert.ok(lida.titulo.length <= 120);
  assert.ok(!/[\u0000-\u001f]/.test(lida.titulo));
  assert.deepEqual(lida.vista, { x: 80, y: 80, z: 1 });
  assert.equal(lida.miniatura, '');
  l.salvar(a.id, { versao: 2, objs: [], miniatura: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.equal(l.ler(a.id).miniatura, 'data:image/png;base64,iVBORw0KGgo=');
  l.salvar(a.id, { versao: 3, objs: [] }); // sem o campo: mantém a miniatura
  assert.equal(l.ler(a.id).miniatura, 'data:image/png;base64,iVBORw0KGgo=');
});

test('lousas: objetos inválidos são recusados', () => {
  assert.throws(() => validarObjetos('x'), /inválid/);
  assert.throws(() => validarObjetos([{ id: 'a', t: 'script' }]), /tipo/);
  assert.throws(() => validarObjetos([{ id: 'a', t: 'shape', x: 'dez' }]), /número x/);
  assert.throws(() => validarObjetos([{ id: 'a', t: 'shape', w: Infinity }]), /número w/);
  assert.throws(() => validarObjetos([{ id: 'a', t: 'stroke', p: [] }]), /pontos/);
  assert.throws(() => validarObjetos([{ id: 'a', t: 'stroke', p: [[1, 'b']] }]), /ponto/);
  assert.throws(() => validarObjetos([{ t: 'text' }]), /id/);
  assert.throws(() => validarObjetos([{ id: 'a', t: 'text', text: 'x'.repeat(20001) }]), /texto/);
  assert.throws(() => validarObjetos(Array.from({ length: 20001 }, (_, i) => ({ id: String(i), t: 'text' }))), /grande demais/);
  assert.doesNotThrow(() => validarObjetos([traco(), postit(), { id: 'l', t: 'line', k: 'arrow', x1: 0, y1: 0, x2: 5, y2: 5, a: { id: 's1' }, b: null }]));
  // imagem ou vídeo do cérebro: caminho relativo, sem sair da pasta
  assert.doesNotThrow(() => validarObjetos([{ id: 'm', t: 'midia', src: 'conteudo/enviados/foto.png', v: false, x: 0, y: 0, w: 320, h: 180, r: 0 }]));
  for (const src of ['', '/etc/passwd', '../fora.png', 'conteudo/../../fora.png', 'conteudo\\..\\fora.png', 7]) {
    assert.throws(() => validarObjetos([{ id: 'm', t: 'midia', src, x: 0, y: 0, w: 1, h: 1 }]), /arquivo/);
  }
  assert.throws(() => validarObjetos([{ id: 'm', t: 'midia', src: 'a.png', v: 'sim', x: 0, y: 0, w: 1, h: 1 }]), /vídeo/);
});

test('lousas: id fora do padrão nunca toca o disco (sem travessia de pasta)', () => {
  const dados = tmp('dados-');
  const l = criarLousas(dados);
  for (const id of ['../x', '..\\x', 'x', 'ZZZZZZZZZZZZZZZZ', '0123456789abcdef0', '']) assert.throws(() => l.ler(id), /inválid/);
  assert.throws(() => l.ler('0123456789abcdef'), /não encontrado/);
  fs.writeFileSync(path.join(dados, 'lousas', 'lixo.json'), '{}');
  assert.equal(l.listar().length, 0);
});

test('lousas: gravação compacta e atômica (sem arquivo temporário sobrando)', () => {
  const dados = tmp('dados-');
  const l = criarLousas(dados);
  const a = l.criar('x');
  l.salvar(a.id, { versao: 1, objs: [traco()] });
  const arquivos = fs.readdirSync(path.join(dados, 'lousas'));
  assert.deepEqual(arquivos, [`${a.id}.json`]);
  const bruto = fs.readFileSync(path.join(dados, 'lousas', `${a.id}.json`), 'utf8');
  assert.equal(bruto.trim().split('\n').length, 1); // JSON em uma linha
});

test('rotas de lousas: exigem login, salvam, mapeiam erros e aceitam corpo maior que 1 MB', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  const semLogin = await fetch(`${s.base}/api/lousas`);
  assert.equal(semLogin.status, 401);
  const cookie = await entrar(s.base);
  const pedir = async (metodo, rota, corpo) => {
    const r = await fetch(`${s.base}${rota}`, corpo === undefined ? { method: metodo, headers: { cookie } } : json(cookie, corpo, metodo));
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };
  const criada = await pedir('POST', '/api/lousas', { titulo: 'Rota' });
  assert.equal(criada.status, 200);
  const id = criada.corpo.id;
  assert.match(id, /^[a-f0-9]{16}$/);

  const grande = Array.from({ length: 40 }, (_, k) => ({ ...traco(`t${k}`), p: Array.from({ length: 2000 }, (__, i) => [i * 1.2345678, k * 3.1415926]) })); // ~2 MB
  const salva = await pedir('PUT', `/api/lousas/${id}`, { versao: 1, titulo: 'Rota', vista: { x: 0, y: 0, z: 1 }, objs: grande });
  assert.equal(salva.status, 200);
  assert.equal(salva.corpo.versao, 2);

  const lida = await pedir('GET', `/api/lousas/${id}`);
  assert.equal(lida.corpo.objs.length, 40);
  assert.equal((await pedir('PUT', `/api/lousas/${id}`, { versao: 1, objs: [] })).status, 409);
  assert.equal((await pedir('PUT', `/api/lousas/${id}`, { versao: 2, objs: [{ id: 'x', t: 'iframe' }] })).status, 400);
  assert.equal((await pedir('GET', '/api/lousas/0123456789abcdef')).status, 404);
  assert.equal((await pedir('GET', '/api/lousas/nao-e-id')).status, 400);

  const lista = await pedir('GET', '/api/lousas');
  assert.equal(lista.corpo.length, 1);
  assert.equal(lista.corpo[0].objetos, 40);
  assert.equal('objs' in lista.corpo[0], false); // a lista não carrega os desenhos
  const copia = await pedir('POST', `/api/lousas/${id}/duplicar`);
  assert.equal(copia.status, 200);
  assert.equal((await pedir('GET', '/api/lousas')).corpo.length, 2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarUsuarios, pode, secaoDaRota, conferirSenha } from '../servidor/acessos.js';
import { tmp, subir, entrar, json } from './ajuda.js';

const ver = { permissoes: { lousa: 'ver' } };
const editar = { permissoes: { lousa: 'editar', conteudos: 'ver' } };

test('acessos: cada rota cai na seção certa e só "editar" grava', () => {
  assert.equal(pode(ver, 'GET', '/lousas'), true);
  assert.equal(pode(ver, 'PUT', '/lousas/0123456789abcdef'), false);
  assert.equal(pode(editar, 'PUT', '/lousas/0123456789abcdef'), true);
  assert.equal(pode(editar, 'POST', '/conteudos/apagar'), false); // conteúdos só para ver
  assert.equal(pode(editar, 'GET', '/video'), false); // sem a seção
  assert.equal(pode({ admin: true }, 'DELETE', '/usuarios/x'), true);
  assert.equal(pode(null, 'GET', '/lousas'), false);
  for (const r of ['/usuarios', '/conversas', '/estado', '/video/ab/gerar', '/config/whatsapp/acesso', '/rota-nova']) assert.equal(secaoDaRota('POST', r), 'admin', r);
  assert.equal(pode({ permissoes: { whatsapp: 'editar' } }, 'POST', '/config/motores'), false);
  assert.equal(pode({ permissoes: { n8n: 'ver' } }, 'GET', '/config'), true);
  assert.equal(pode({ permissoes: {} }, 'GET', '/extras'), true);
});

test('acessos: arquivo solto só dentro de conteudo/ para quem não tem a seção Arquivos', () => {
  assert.equal(pode(ver, 'GET', '/arquivo', { caminho: 'conteudo/quadros/a.png' }), true);
  assert.equal(pode(ver, 'GET', '/arquivo', { caminho: 'memoria/segredo.md' }), false);
  assert.equal(pode(ver, 'GET', '/arquivo', { caminho: 'conteudo/../memoria/segredo.md' }), false);
  assert.equal(pode(ver, 'GET', '/arquivo', { caminho: 'conteudoX/a.png' }), false);
  assert.equal(pode(ver, 'POST', '/enviar', { pasta: 'conteudo/quadros' }), false); // ver não envia
  assert.equal(pode(editar, 'POST', '/enviar', { pasta: 'conteudo/quadros' }), true);
  assert.equal(pode(editar, 'POST', '/enviar', { pasta: 'assets' }), false);
  assert.equal(pode({ permissoes: { arquivos: 'ver' } }, 'GET', '/arquivo', { caminho: 'memoria/x.md' }), true);
});

test('acessos: criar, validar, conferir senha, guardar sem a senha e apagar', () => {
  const dados = tmp('dados-');
  const u = criarUsuarios(dados);
  assert.throws(() => u.criar({ usuario: 'admin', senha: '12345678' }), /admin/);
  assert.throws(() => u.criar({ usuario: 'Ana Maria', senha: '12345678' }), /inválido/);
  assert.throws(() => u.criar({ usuario: 'ana', senha: 'curta' }), /8 a 200/);
  const ana = u.criar({ usuario: 'ANA', nome: ' Ana ', senha: 'senha-boa-1', permissoes: { lousa: 'editar', conversas: 'editar', grafo: 'tudo' } });
  assert.equal(ana.usuario, 'ana');
  assert.equal(ana.nome, 'Ana');
  assert.deepEqual(ana.permissoes, { lousa: 'editar' }); // conversas e níveis estranhos ficam de fora
  assert.equal('hash' in ana, false);
  assert.throws(() => u.criar({ usuario: 'ana', senha: '12345678' }), /Já existe/);
  assert.equal(u.verificar('ana', 'errada'), null);
  assert.equal(u.verificar('ninguem', 'senha-boa-1'), null);
  assert.equal(u.verificar(' Ana ', 'senha-boa-1').id, ana.id);

  const salvo = JSON.parse(fs.readFileSync(path.join(dados, 'usuarios.json'), 'utf8'));
  assert.doesNotMatch(JSON.stringify(salvo), /senha-boa-1/);
  assert.ok(conferirSenha('senha-boa-1', salvo[0].hash));
  assert.equal(criarUsuarios(dados).listar().length, 1); // relê do disco

  u.atualizar(ana.id, { ativo: false });
  assert.equal(u.verificar('ana', 'senha-boa-1'), null); // suspensa não entra
  assert.equal(u.apagar(ana.id), true);
  assert.equal(u.apagar(ana.id), false);
});

test('rotas de acessos: admin cria a pessoa, ela entra e só faz o que pode', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  const admin = await entrar(s.base);
  const eu = await (await fetch(`${s.base}/api/eu`, { headers: { cookie: admin } })).json();
  assert.equal(eu.admin, true);

  const r = await fetch(`${s.base}/api/usuarios`, json(admin, { usuario: 'bia', nome: 'Bia', senha: 'senha-da-bia', permissoes: { lousa: 'ver' } }));
  assert.equal(r.status, 200);
  const bia = await r.json();
  assert.equal((await fetch(`${s.base}/api/usuarios`, json(admin, { usuario: 'bia', senha: 'outra-senha' }))).status, 400);

  const login = async (usuario, senha) => {
    const x = await fetch(`${s.base}/api/login`, json('', { usuario, senha }));
    return { status: x.status, cookie: (x.headers.get('set-cookie') ?? '').split(';')[0] };
  };
  assert.equal((await login('bia', 'errada')).status, 401);
  const { cookie } = await login('bia', 'senha-da-bia');
  const perfil = await (await fetch(`${s.base}/api/eu`, { headers: { cookie } })).json();
  assert.deepEqual(perfil, { logado: true, admin: false, usuario: 'bia', nome: 'Bia', permissoes: { lousa: 'ver' } });

  assert.equal((await fetch(`${s.base}/api/lousas`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${s.base}/api/lousas`, json(cookie, { titulo: 'x' }))).status, 403);
  assert.equal((await fetch(`${s.base}/api/grafo`, { headers: { cookie } })).status, 403);
  assert.equal((await fetch(`${s.base}/api/usuarios`, { headers: { cookie } })).status, 403);
  assert.equal((await fetch(`${s.base}/api/estado`, { headers: { cookie } })).status, 403);

  // o admin libera a edição e vale na hora, sem novo login
  await fetch(`${s.base}/api/usuarios/${bia.id}`, json(admin, { permissoes: { lousa: 'editar' } }, 'PUT'));
  assert.equal((await fetch(`${s.base}/api/lousas`, json(cookie, { titulo: 'x' }))).status, 200);

  // senha nova derruba a sessão aberta
  await fetch(`${s.base}/api/usuarios/${bia.id}`, json(admin, { senha: 'senha-nova-bia' }, 'PUT'));
  assert.equal((await fetch(`${s.base}/api/lousas`, { headers: { cookie } })).status, 401);
  const nova = await login('bia', 'senha-nova-bia');
  assert.equal(nova.status, 200);
  assert.equal((await fetch(`${s.base}/api/usuarios/${bia.id}`, { method: 'DELETE', headers: { cookie: admin } })).status, 200);
  assert.equal((await fetch(`${s.base}/api/lousas`, { headers: { cookie: nova.cookie } })).status, 401);
  assert.equal((await fetch(`${s.base}/api/usuarios/${bia.id}`, { method: 'DELETE', headers: { cookie: admin } })).status, 404);

  // o admin continua entrando com "admin" + senha do .env
  assert.equal((await login('admin', 'segredo')).status, 200);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lerArquivoEnv, configuracao } from '../servidor/config.js';
import { tmp, escrever, cfgTeste, subir, entrar } from './ajuda.js';

test('arquivo .env: formato, aspas e o ambiente do processo vence', () => {
  const d = tmp();
  const arq = escrever(d, '.env', 'A=1\n  B = "dois"  \nC=\'tres\'\nminuscula=x\nlixo\nD=ja\n#E=4\n');
  const env = lerArquivoEnv(arq, { D: 'processo' });
  assert.deepEqual(env, { A: '1', B: 'dois', C: 'tres', D: 'processo' });
  assert.deepEqual(lerArquivoEnv(path.join(d, 'nao-existe'), { X: '1' }), { X: '1' });
});

test('configuracao: padrões, cérebro resolvido e pasta de dados criada', () => {
  const vault = tmp();
  const dados = path.join(tmp(), 'dados', 'sub');
  const c = configuracao({ CORE_OS_VAULT: vault, CORE_OS_DATA: dados });
  assert.equal(c.porta, 3000);
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.vault, fs.realpathSync(vault));
  assert.ok(fs.statSync(dados).isDirectory());
  assert.deepEqual(c.bins, { claude: 'claude', codex: 'codex', antigravity: 'agy' });
  assert.equal(c.evo.instancia, 'cerebro');
  assert.match(c.whatsWebhook, /\/webhook\/core-os-whatsapp$/);
  assert.throws(() => configuracao({ CORE_OS_VAULT: path.join(vault, 'nao-existe'), CORE_OS_DATA: dados }), /cérebro/);
});

test('cabeçalhos de segurança e sem anúncio do framework', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  const r = await fetch(`${s.base}/api/eu`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { logado: false });
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('login, cookie, barreira, /api/eu e logout', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  assert.equal((await fetch(`${s.base}/api/qualquer`)).status, 401);
  const errado = await fetch(`${s.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"senha":"x"}' });
  assert.equal(errado.status, 401);
  assert.ok((await errado.json()).erro);

  const r = await fetch(`${s.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"senha":"segredo"}' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /^coreos=[0-9a-f]{64};/);
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Strict/);
  assert.match(sc, /Max-Age=2592000/);
  assert.match(sc, /Path=\//);
  assert.doesNotMatch(sc, /Secure/);
  const cookie = sc.split(';')[0];

  assert.deepEqual(await (await fetch(`${s.base}/api/eu`, { headers: { cookie } })).json(), { logado: true });
  assert.equal((await fetch(`${s.base}/api/qualquer`, { headers: { cookie } })).status, 404);
  const salvos = JSON.parse(fs.readFileSync(path.join(s.cfg.dados, 'logins.json'), 'utf8'));
  assert.deepEqual(salvos, [cookie.slice('coreos='.length)]);

  const saida = await fetch(`${s.base}/api/logout`, { method: 'POST', headers: { cookie } });
  assert.deepEqual(await saida.json(), { ok: true });
  assert.match(saida.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await fetch(`${s.base}/api/qualquer`, { headers: { cookie } })).status, 401);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s.cfg.dados, 'logins.json'), 'utf8')), []);
});

test('tokens persistem entre reinícios e só os 50 mais recentes ficam', async (t) => {
  const cfg = cfgTeste();
  const antigos = Array.from({ length: 60 }, (_, i) => i.toString(16).padStart(64, '0'));
  fs.writeFileSync(path.join(cfg.dados, 'logins.json'), JSON.stringify(antigos));
  const s = await subir(cfg);
  t.after(() => s.fechar());
  assert.deepEqual(await (await fetch(`${s.base}/api/eu`, { headers: { cookie: `coreos=${antigos[59]}` } })).json(), { logado: true });
  const cookie = await entrar(s.base);
  const salvos = JSON.parse(fs.readFileSync(path.join(cfg.dados, 'logins.json'), 'utf8'));
  assert.equal(salvos.length, 50);
  assert.equal(salvos.at(-1), cookie.slice('coreos='.length));
});

test('limite de tentativas: 5 erros em 60 s bloqueiam até a senha certa', async (t) => {
  let agora = 1_000_000;
  const s = await subir(cfgTeste(), { agora: () => agora });
  t.after(() => s.fechar());
  const tentar = (senha) => fetch(`${s.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senha }) });
  for (let i = 0; i < 5; i += 1) assert.equal((await tentar('x')).status, 401);
  const bloqueado = await tentar('segredo');
  assert.equal(bloqueado.status, 429);
  assert.match((await bloqueado.json()).erro, /minuto/);
  agora += 61_000;
  assert.equal((await tentar('segredo')).status, 200);
});

test('Secure no cookie quando o proxy do loopback diz que é HTTPS', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  const r = await fetch(`${s.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' }, body: '{"senha":"segredo"}' });
  assert.match(r.headers.get('set-cookie'), /Secure/);
});

test('corpo JSON acima de 1 MB é recusado', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  const r = await fetch(`${s.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senha: 'x'.repeat(1_100_000) }) });
  assert.equal(r.status, 413);
  assert.ok((await r.json()).erro);
});

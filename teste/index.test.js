import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmp, escrever, subir } from './ajuda.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('estáticos da interface sem login e com cabeçalhos de segurança', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  const r = await fetch(`${s.base}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(`${s.base}/blocos.js`)).status, 200);
});

test('bibliotecas do terminal em /vendor sem login, só as pastas liberadas', async (t) => {
  const s = await subir();
  t.after(() => s.fechar());
  for (const p of ['xterm/lib/xterm.mjs', 'xterm/css/xterm.css', 'addon-fit/lib/addon-fit.mjs', 'addon-unicode11/lib/addon-unicode11.mjs']) {
    const r = await fetch(`${s.base}/vendor/${p}`);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), p.endsWith('.css') ? /text\/css/ : /javascript/, p);
  }
  assert.equal((await fetch(`${s.base}/vendor/xterm/package.json`)).status, 404);
  assert.equal((await fetch(`${s.base}/vendor/express/package.json`)).status, 404);
});

test('index.js lê o .env, gera senha quando falta e responde /api/eu', async (t) => {
  const vault = tmp();
  const env = escrever(tmp(), '.env', `CORE_OS_VAULT=${vault}\nCORE_OS_DATA=${tmp()}\nCORE_OS_PORT=0\n`);
  const p = spawn(process.execPath, [path.join(RAIZ, 'servidor', 'index.js')], { env: { PATH: process.env.PATH, CORE_OS_ENV: env, HOME: tmp() } });
  t.after(() => p.kill());
  let log = '';
  p.stdout.on('data', (d) => { log += d; });
  p.stderr.on('data', (d) => { log += d; });
  const fim = Date.now() + 10_000;
  while (!/http:\/\/[\d.]+:\d+/.test(log) && Date.now() < fim) await new Promise((ok) => setTimeout(ok, 50));
  const [url] = /http:\/\/[\d.]+:\d+/.exec(log) ?? [];
  assert.ok(url, log);
  assert.match(log, /senha gerada/i);
  const senha = /senha gerada[^:]*: (\S+)/i.exec(log)[1];
  assert.deepEqual(await (await fetch(`${url}/api/eu`)).json(), { logado: false });
  const login = await fetch(`${url}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senha }) });
  assert.equal(login.status, 200);
});

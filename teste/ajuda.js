// Utilidades dos testes de servidor: pastas temporárias, servidor em porta livre e login.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarServidor } from '../servidor/app.js';

export const tmp = (prefixo = 'cerebro-') => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefixo)));

export function escrever(base, rel, conteudo = '') {
  const abs = path.join(base, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, conteudo);
  return abs;
}

export function cfgTeste(extra = {}) {
  const casa = tmp('casa-');
  return {
    porta: 0,
    host: '127.0.0.1',
    vault: tmp('vault-'),
    dados: tmp('dados-'),
    casa,
    senha: 'segredo',
    tokenPonte: 'tok',
    codexHome: path.join(casa, '.codex'),
    bins: { claude: 'claude-inexistente', codex: 'codex-inexistente', antigravity: 'agy-inexistente', grok: 'grok-inexistente' },
    evo: { url: '', key: '', instancia: 'cerebro' },
    whatsWebhook: 'http://n8n:5678/webhook/core-os-whatsapp',
    whatsDono: '',
    n8nUrl: '',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    ...extra,
  };
}

export async function subir(cfg = cfgTeste(), deps = {}) {
  const s = criarServidor(cfg, { silencioso: true, ...deps });
  await new Promise((ok) => s.server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${s.server.address().port}`;
  return { ...s, cfg, base };
}

export async function entrar(base, senha = 'segredo') {
  const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senha }) });
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  return cookie;
}

export const json = (cookie, corpo, metodo = 'POST') => ({
  method: metodo,
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(corpo),
});

export const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function ate(condicao, limite = 5000) {
  const fim = Date.now() + limite;
  while (Date.now() < fim) {
    const v = await condicao();
    if (v) return v;
    await esperar(25);
  }
  throw new Error('condição não aconteceu a tempo');
}

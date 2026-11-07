import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { spawnPorPipes } from '../servidor/terminal.js';
import { pastaProjetoClaude } from '../servidor/registros.js';
import { cfgTeste, subir, entrar, json, escrever, ate, esperar } from './ajuda.js';

const FALSO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'motor-falso.mjs');

async function preparar(t, extra = {}, deps = {}) {
  const cfg = cfgTeste({ bins: { claude: FALSO, codex: FALSO, antigravity: FALSO, grok: FALSO }, ...extra });
  const s = await subir(cfg, { spawnTerminal: spawnPorPipes, ...deps });
  t.after(() => s.fechar());
  const cookie = await entrar(s.base);
  const api = async (metodo, rota, corpo) => {
    const r = await fetch(`${s.base}${rota}`, corpo === undefined ? { method: metodo, headers: { cookie } } : json(cookie, corpo, metodo));
    const texto = await r.text();
    return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
  };
  return { s, cfg, cookie, api };
}

function abrirWs(s, cookie, id, extraHeaders = {}) {
  const ws = new WebSocket(`${s.base.replace('http', 'ws')}/ws?conversa=${id}&cols=100&rows=30`, { headers: { cookie, ...extraHeaders } });
  ws.recebido = '';
  ws.on('message', (d) => { ws.recebido += d.toString(); });
  ws.on('error', () => {});
  return ws;
}

const abriu = (ws) => new Promise((ok) => { ws.on('open', () => ok(true)); ws.on('close', () => ok(false)); ws.on('error', () => ok(false)); });

test('criar conversa: registro gravado, terminal vivo e resumo no estado', async (t) => {
  const { s, cfg, api } = await preparar(t);
  const { status, corpo: c } = await api('POST', '/api/conversas', { motor: 'nao-existe' });
  assert.equal(status, 200);
  assert.match(c.id, /^[0-9a-f-]{36}$/);
  assert.equal(c.motor, 'claude');
  assert.equal(c.numero, 1);
  assert.deepEqual(c.midias, []);
  assert.equal(typeof c.criada, 'number');
  assert.equal(c.ultimaAtividade, c.criada);
  const salvo = JSON.parse(fs.readFileSync(path.join(cfg.dados, 'conversas.json'), 'utf8'));
  assert.equal(salvo[0].id, c.id);

  const { corpo: estado } = await api('GET', '/api/estado');
  assert.equal(estado.length, 1);
  assert.deepEqual(Object.keys(estado[0]).sort(), ['ativo', 'criada', 'id', 'midias', 'motor', 'motorNome', 'nota', 'numero', 'origem', 'processando', 'subagentes', 'titulo', 'trabalhando', 'ultimaAcao'].sort());
  assert.equal(estado[0].titulo, 'Conversa 1');
  assert.equal(estado[0].origem, 'painel');
  assert.equal(estado[0].ativo, true);
  assert.equal(estado[0].motorNome, 'Claude Code');
  assert.equal((await api('POST', '/api/conversas', { motor: 'codex' })).corpo.numero, 2);
  assert.equal((await api('GET', '/api/estado')).corpo[1].motor, 'codex');
  void s;
});

test('WebSocket: buffer, entrada, ambiente do agente e vários clientes', async (t) => {
  const { s, cookie, api } = await preparar(t, { env: { PATH: process.env.PATH, CORE_OS_PASSWORD: 'vaza', CLAUDECODE: '1' } });
  const { corpo: c } = await api('POST', '/api/conversas', {});
  const ws = abrirWs(s, cookie, c.id);
  assert.equal(await abriu(ws), true);
  await ate(() => ws.recebido.includes('❯'));
  assert.ok(ws.recebido.includes(`["--session-id","${c.id}","--append-system-prompt"`));
  const env = JSON.parse(/ENV (\{.*?\})\r\n/.exec(ws.recebido)[1]);
  assert.deepEqual(env, { sessao: c.id, para: '', senha: null, token: null, claudecode: null, term: 'xterm-256color' });

  const ws2 = abrirWs(s, cookie, c.id);
  await abriu(ws2);
  await ate(() => ws2.recebido.includes('❯'));
  ws.send(JSON.stringify({ t: 'i', d: 'oi' }));
  ws.send('não é json');
  ws.send(JSON.stringify({ t: 'r', cols: 9999, rows: 10 }));
  await ate(() => ws2.recebido.includes('ECO[oi]'));
  ws2.close();
  await esperar(50);
  assert.equal((await api('GET', '/api/estado')).corpo[0].ativo, true);
  ws.close();
});

test('WebSocket recusa sem login, id desconhecido, outra origem e outro caminho', async (t) => {
  const { s, cookie, api } = await preparar(t);
  const { corpo: c } = await api('POST', '/api/conversas', {});
  assert.equal(await abriu(abrirWs(s, '', c.id)), false);
  assert.equal(await abriu(abrirWs(s, cookie, '0f8fad5b-d9cb-469f-a165-70867728950e')), false);
  assert.equal(await abriu(abrirWs(s, cookie, c.id, { origin: 'http://malicioso.example' })), false);
  const host = new URL(s.base).host;
  assert.equal(await abriu(abrirWs(s, cookie, c.id, { origin: `http://${host}` })), true);
  const outro = new WebSocket(`${s.base.replace('http', 'ws')}/outro?conversa=${c.id}`, { headers: { cookie } });
  outro.on('error', () => {});
  assert.equal(await abriu(outro), false);
});

test('pedido pré-escrito é digitado sem Enter quando aparece o prompt', async (t) => {
  const { s, cookie, api } = await preparar(t);
  const { corpo: c } = await api('POST', '/api/conversas', { pedido: 'faça\nisso agora' });
  const ws = abrirWs(s, cookie, c.id);
  await abriu(ws);
  await ate(() => ws.recebido.includes('ECO[faça isso agora]'), 4000);
  ws.close();
});

test('processo que sai avisa os clientes e a próxima conexão retoma com --resume', async (t) => {
  const { s, cfg, cookie, api } = await preparar(t);
  const { corpo: c } = await api('POST', '/api/conversas', {});
  escrever(pastaProjetoClaude(cfg.casa, cfg.vault), `${c.id}.jsonl`, '');
  const ws = abrirWs(s, cookie, c.id);
  await abriu(ws);
  await ate(() => ws.recebido.includes('❯'));
  ws.send(JSON.stringify({ t: 'i', d: 'sair' }));
  await ate(() => /retomar/.test(ws.recebido));
  await ate(async () => (await api('GET', '/api/estado')).corpo[0].ativo === false);
  ws.send(JSON.stringify({ t: 'i', d: 'ignorado' }));
  ws.close();
  const ws2 = abrirWs(s, cookie, c.id);
  await abriu(ws2);
  await ate(() => ws2.recebido.includes(`["--resume","${c.id}"`));
  ws2.close();
});

test('motor não instalado mostra o aviso no terminal', async (t) => {
  const { s, cookie, api } = await preparar(t, { bins: { claude: 'claude-inexistente-xyz', codex: 'x', antigravity: 'y', grok: 'z' } });
  const { corpo: c } = await api('POST', '/api/conversas', {});
  const ws = abrirWs(s, cookie, c.id);
  await abriu(ws);
  await ate(() => /não está instalado/.test(ws.recebido));
  assert.match(ws.recebido, /Claude Code/);
  ws.close();
});

test('estado lê nota de status, registro (trabalhando, última ação) e subagentes', async (t) => {
  const { cfg, api } = await preparar(t);
  const { corpo: c } = await api('POST', '/api/conversas', {});
  escrever(cfg.vault, `sessoes/${c.id}.md`, '> resumo\n# Meu título\n- [ ] a\n');
  const projeto = pastaProjetoClaude(cfg.casa, cfg.vault);
  escrever(projeto, `${c.id}.jsonl`, `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } })}\n`);
  escrever(projeto, `${c.id}/subagents/s1.meta.json`, JSON.stringify({ description: 'Ajudante' }));
  escrever(projeto, `${c.id}/subagents/s1.jsonl`, '');
  const [e] = (await api('GET', '/api/estado')).corpo;
  assert.equal(e.titulo, 'Meu título');
  assert.equal(e.nota, '> resumo\n# Meu título\n- [ ] a\n');
  assert.equal(e.trabalhando, true);
  assert.equal(e.ultimaAcao, 'Bash: ls');
  assert.equal(e.subagentes[0].descricao, 'Ajudante');
  assert.equal(e.subagentes[0].status, 'trabalhando');

  const h = await api('GET', `/api/conversas/${c.id}/historico`);
  assert.deepEqual(h.corpo, [{ papel: 'acao', texto: 'Bash: ls', quando: null }]);
  assert.equal((await api('GET', '/api/conversas/nao-e-id/historico')).status, 400);
});

test('encerrar arquiva sem apagar e some do estado', async (t) => {
  const { cfg, api } = await preparar(t);
  const { corpo: c } = await api('POST', '/api/conversas', {});
  escrever(cfg.vault, `sessoes/${c.id}.md`, '# x');
  assert.deepEqual(await api('DELETE', `/api/conversas/${c.id}`), { status: 200, corpo: { ok: true } });
  assert.deepEqual((await api('GET', '/api/estado')).corpo, []);
  const salvo = JSON.parse(fs.readFileSync(path.join(cfg.dados, 'conversas.json'), 'utf8'));
  assert.equal(salvo[0].arquivada, true);
  assert.ok(fs.existsSync(path.join(cfg.vault, 'sessoes', `${c.id}.md`)));
  const naoExiste = await api('DELETE', '/api/conversas/0f8fad5b-d9cb-469f-a165-70867728950e');
  assert.deepEqual(naoExiste, { status: 404, corpo: null });
});

test('reinício zera processando e mantém as conversas', async (t) => {
  const cfg = cfgTeste();
  fs.writeFileSync(path.join(cfg.dados, 'conversas.json'), JSON.stringify([
    { id: '0f8fad5b-d9cb-469f-a165-70867728950e', criada: 1, ultimaAtividade: 1, midias: [], numero: 1, motor: 'claude', origem: 'whatsapp', whatsDe: '5562', processando: true },
  ]));
  const s = await subir(cfg, { spawnTerminal: spawnPorPipes });
  t.after(() => s.fechar());
  const cookie = await entrar(s.base);
  const [e] = await (await fetch(`${s.base}/api/estado`, { headers: { cookie } })).json();
  assert.equal(e.processando, false);
  assert.equal(e.origem, 'whatsapp');
  assert.match(e.titulo, /^WhatsApp /);
});

test('mídias novas em conteudo/ vão para a conversa mais ativa, exceto envios do dono', async (t) => {
  let agora = Date.now();
  const { s, cfg, api, cookie } = await preparar(t, {}, { agora: () => agora });
  const { corpo: c1 } = await api('POST', '/api/conversas', {});
  escrever(cfg.vault, 'conteudo/antiga.png', 'x');
  s.conversas.varrerMidias();
  await api('POST', '/api/conversas', {});
  const c2 = s.conversas.porId((await api('GET', '/api/estado')).corpo[1].id);
  c2.ultimaAtividade = agora + 10;
  s.conversas.porId(c1.id).ultimaAtividade = agora - 60_000;
  escrever(cfg.vault, 'conteudo/carrosseis/nova.png', 'x');
  await fetch(`${s.base}/api/enviar?nome=meu.png`, { method: 'POST', headers: { cookie }, body: 'x' });
  s.conversas.varrerMidias();
  const estado = (await api('GET', '/api/estado')).corpo;
  assert.deepEqual(estado.find((e) => e.id === c2.id).midias, ['conteudo/carrosseis/nova.png']);
  assert.deepEqual(estado.find((e) => e.id === c1.id).midias, []);

  agora += 10 * 60_000;
  escrever(cfg.vault, 'conteudo/tarde.png', 'x');
  s.conversas.varrerMidias();
  assert.deepEqual(s.conversas.porId(c2.id).midias, ['conteudo/carrosseis/nova.png']);
});

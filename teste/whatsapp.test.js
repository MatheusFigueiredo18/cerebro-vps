import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chaveNumero, normalizarAcesso, lerAcesso, autorizar } from '../servidor/whatsapp.js';
import { spawnPorPipes } from '../servidor/terminal.js';
import { cfgTeste, subir, entrar, json, ate, escrever } from './ajuda.js';

const FALSO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'motor-falso.mjs');
const MEU = '5562988887777';

test('chaveNumero: sufixos, país e nono dígito', () => {
  assert.equal(chaveNumero('5562988887777@s.whatsapp.net'), '556288887777');
  assert.equal(chaveNumero('556288887777:12@s.whatsapp.net'), '556288887777');
  assert.equal(chaveNumero('(62) 98888-7777'), '556288887777');
  assert.equal(chaveNumero('6288887777'), '556288887777');
  assert.equal(chaveNumero('14155550123'), '5514155550123'.slice(0, 4) + '155550123');
  assert.equal(chaveNumero('4915112345678'), '4915112345678');
  assert.equal(chaveNumero(''), '');
});

test('normalizarAcesso: dígitos, faixa de tamanho, prefixo 55, repetidos e máximo 20', () => {
  const r = normalizarAcesso(['(62) 98888-7777', '62988887777', '123', '5562988887777', '+1 415 555 0123 4', ...Array.from({ length: 30 }, (_, i) => `6299999${String(i).padStart(4, '0')}`)], undefined);
  assert.equal(r.numeros[0], '5562988887777');
  assert.equal(r.numeros.length, 20);
  assert.equal(r.numeros.filter((n) => n === '5562988887777').length, 1);
  assert.equal(r.chatVoce, true);
  assert.equal(normalizarAcesso([], false).chatVoce, false);
  assert.equal(normalizarAcesso(['14155550123456']).numeros.length, 0);
});

test('lerAcesso usa WHATS_DONO só enquanto o arquivo não existe', () => {
  const cfg = cfgTeste({ whatsDono: '62 98888-7777' });
  assert.deepEqual(lerAcesso(cfg), { numeros: ['5562988887777'], chatVoce: true });
  fs.writeFileSync(path.join(cfg.dados, 'whatsapp-acesso.json'), '{"numeros":[],"chatVoce":false}');
  assert.deepEqual(lerAcesso(cfg), { numeros: [], chatVoce: false });
  fs.writeFileSync(path.join(cfg.dados, 'whatsapp-acesso.json'), 'quebrado');
  assert.deepEqual(lerAcesso(cfg), { numeros: [], chatVoce: true });
});

test('autorizar: chat Você, mensagem do dono a terceiros, lista e formato antigo', () => {
  const acesso = { numeros: ['5511977776666'], chatVoce: true };
  const eu = `${MEU}@s.whatsapp.net`;
  assert.deepEqual(autorizar({ deMim: true, chat: `556288887777@s.whatsapp.net`, eu }, acesso), { destino: '556288887777' });
  assert.equal(autorizar({ deMim: true, chat: '5511977776666@s.whatsapp.net', eu }, acesso), null);
  assert.equal(autorizar({ deMim: true, chat: eu, eu }, { ...acesso, chatVoce: false }), null);
  assert.deepEqual(autorizar({ deMim: false, chat: '551177776666@s.whatsapp.net', eu }, acesso), { destino: '551177776666' });
  assert.equal(autorizar({ deMim: false, chat: '5511900001111@s.whatsapp.net', eu }, acesso), null);
  assert.equal(autorizar({ deMim: false, chat: '@s.whatsapp.net', eu }, { numeros: [''], chatVoce: true }), null);
  assert.deepEqual(autorizar({ deMim: true, texto: 'x' }, acesso), { destino: '' });
  assert.equal(autorizar({ deMim: true, texto: 'x' }, { ...acesso, chatVoce: false }), null);
});

// ---------- Evolution falsa ----------
async function evolutionFalsa() {
  const ev = { estado: 'close', existe: true, chamadas: [], enviadas: [], falhar: false, qr: 'data:image/png;base64,AAA' };
  const server = http.createServer(async (req, res) => {
    let corpo = '';
    for await (const p of req) corpo += p;
    const c = { metodo: req.method, rota: req.url, apikey: req.headers.apikey, corpo: corpo ? JSON.parse(corpo) : null };
    ev.chamadas.push(c);
    const enviar = (status, j) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (ev.falhar) return enviar(500, { response: { message: ['caiu tudo'] } });
    if (req.url.startsWith('/instance/connectionState/')) return ev.existe ? enviar(200, { instance: { state: ev.estado } }) : enviar(404, { message: 'não existe' });
    if (req.url.startsWith('/instance/fetchInstances')) return enviar(200, ev.existe ? [{ name: 'outra' }, { name: 'cerebro', ownerJid: `${MEU}@s.whatsapp.net`, profileName: 'Cérebro' }] : []);
    if (req.url === '/instance/create') { ev.existe = true; return enviar(201, {}); }
    if (req.url.startsWith('/webhook/set/')) return enviar(201, {});
    if (req.url.startsWith('/instance/connect/')) { ev.estado = 'connecting'; return enviar(200, { base64: ev.qr, code: '2@abc' }); }
    if (req.url.startsWith('/instance/logout/')) { ev.estado = 'close'; return enviar(200, {}); }
    if (req.url.startsWith('/message/sendText/')) { ev.enviadas.push(c.corpo); return enviar(201, {}); }
    return enviar(404, {});
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  ev.url = `http://127.0.0.1:${server.address().port}`;
  ev.fechar = () => new Promise((ok) => { server.closeAllConnections(); server.close(ok); });
  return ev;
}

async function preparar(t, extra = {}, deps = {}) {
  const ev = await evolutionFalsa();
  const cfg = cfgTeste({ evo: { url: ev.url, key: 'chave', instancia: 'cerebro' }, bins: { claude: FALSO, codex: FALSO, antigravity: FALSO }, ...extra });
  const s = await subir(cfg, { spawnTerminal: spawnPorPipes, ...deps });
  t.after(async () => { await s.fechar(); await ev.fechar(); });
  const cookie = await entrar(s.base);
  const api = async (metodo, rota, corpo) => {
    const r = await fetch(`${s.base}${rota}`, corpo === undefined ? { method: metodo, headers: { cookie } } : json(cookie, corpo, metodo));
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };
  const ponte = async (corpo, token = 'tok') => {
    const r = await fetch(`${s.base}/api/ponte/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-core-os-token': token }, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json() };
  };
  return { ev, cfg, s, api, ponte };
}

test('config: sem Evolution configurada fica indisponível e conectar dá 502', async (t) => {
  const s = await subir(cfgTeste({ n8nUrl: 'https://n8n.exemplo.com' }));
  t.after(() => s.fechar());
  const cookie = await entrar(s.base);
  const c = await (await fetch(`${s.base}/api/config`, { headers: { cookie } })).json();
  assert.equal(c.whatsapp.configurado, false);
  assert.equal(c.whatsapp.estado, 'indisponivel');
  assert.deepEqual(c.whatsapp.acesso, { numeros: [], chatVoce: true });
  assert.equal(c.n8n.url, 'https://n8n.exemplo.com');
  assert.equal(c.servidor.cerebro, s.cfg.vault);
  assert.match(c.servidor.painel, /^http:\/\/127\.0\.0\.1:\d+$/);
  const r = await fetch(`${s.base}/api/config/whatsapp/conectar`, json(cookie, {}));
  assert.equal(r.status, 502);
  assert.match((await r.json()).erro, /não está configurada/);
});

test('config: estado, número, nome de perfil e erro da Evolution', async (t) => {
  const { ev, api } = await preparar(t);
  ev.estado = 'open';
  const c = (await api('GET', '/api/config')).corpo;
  assert.equal(c.whatsapp.estado, 'open');
  assert.equal(c.whatsapp.numero, MEU);
  assert.equal(c.whatsapp.nomePerfil, 'Cérebro');
  assert.ok(ev.chamadas.every((x) => x.apikey === 'chave'));
  ev.falhar = true;
  const erro = await api('GET', '/api/config');
  assert.equal(erro.status, 200);
  assert.equal(erro.corpo.whatsapp.erro, 'caiu tudo');
});

test('conectar recria instância apagada, pede QR, gera outro e desconecta', async (t) => {
  const { ev, api } = await preparar(t);
  ev.existe = false;
  const r = await api('POST', '/api/config/whatsapp/conectar', {});
  assert.deepEqual(r.corpo, { qr: 'data:image/png;base64,AAA', estado: 'connecting' });
  assert.deepEqual(ev.chamadas.find((c) => c.rota === '/instance/create').corpo, { instanceName: 'cerebro', integration: 'WHATSAPP-BAILEYS', qrcode: false });
  const hook = ev.chamadas.find((c) => c.rota === '/webhook/set/cerebro').corpo.webhook;
  assert.deepEqual(hook, { enabled: true, url: 'http://n8n:5678/webhook/core-os-whatsapp', byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] });

  assert.deepEqual((await api('GET', '/api/config/whatsapp/qr')).corpo, { estado: 'connecting', qr: 'data:image/png;base64,AAA' });
  ev.chamadas.length = 0;
  await api('POST', '/api/config/whatsapp/conectar', { novo: true });
  assert.deepEqual(ev.chamadas.map((c) => c.metodo + c.rota.split('?')[0]).filter((x) => /logout|connect\//.test(x)), ['DELETE/instance/logout/cerebro', 'GET/instance/connect/cerebro']);

  ev.estado = 'open';
  assert.deepEqual((await api('GET', '/api/config/whatsapp/qr')).corpo, { estado: 'open' });
  assert.deepEqual((await api('POST', '/api/config/whatsapp/conectar', {})).corpo, { estado: 'open' });
  assert.deepEqual((await api('POST', '/api/config/whatsapp/desconectar')).corpo, { ok: true, estado: 'close' });
  ev.falhar = true;
  assert.equal((await api('POST', '/api/config/whatsapp/desconectar')).status, 502);
  assert.equal((await api('GET', '/api/config/whatsapp/qr')).status, 502);
});

test('acesso: normaliza, grava e devolve', async (t) => {
  const { cfg, api } = await preparar(t);
  const r = await api('POST', '/api/config/whatsapp/acesso', { numeros: ['(62) 98888-7777', 'abc'], chatVoce: false });
  assert.deepEqual(r.corpo, { numeros: ['5562988887777'], chatVoce: false });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cfg.dados, 'whatsapp-acesso.json'), 'utf8')), r.corpo);
});

test('motores: leitura, gravação e ids desconhecidos ignorados', async (t) => {
  const { api } = await preparar(t);
  const g = (await api('GET', '/api/config/motores')).corpo;
  assert.equal(g.padrao, 'claude');
  assert.equal(g.whatsapp, 'claude');
  assert.deepEqual(Object.keys(g.motores), ['claude', 'codex', 'antigravity']);
  assert.equal(g.motores.claude.instalado, true);
  assert.equal(g.motores.claude.nome, 'Claude Code');
  assert.ok(g.motores.codex.login);
  assert.deepEqual((await api('POST', '/api/config/motores', { padrao: 'codex', whatsapp: 'xyz' })).corpo, { padrao: 'codex', whatsapp: 'claude' });
  assert.equal((await api('POST', '/api/conversas', {})).corpo.motor, 'codex');
});

test('catálogo: extras com instalado e primeiros testes', async (t) => {
  const { cfg, api } = await preparar(t);
  fs.writeFileSync(path.join(cfg.casa, '.claude.json'), JSON.stringify({ mcpServers: { 'meu-n8n': { url: 'segredo' } }, projects: { [cfg.vault]: { mcpServers: { Context7: {} } } } }));
  escrever(cfg.vault, '.mcp.json', JSON.stringify({ mcpServers: { supabase: { env: { KEY: 'x' } } } }));
  const { corpo } = await api('GET', '/api/extras');
  for (const item of [...corpo.aplicacoes, ...corpo.mcps]) {
    assert.deepEqual(Object.keys(item).sort(), ['faz', 'id', 'instalado', 'logo', 'nome', 'pedido']);
    assert.match(item.pedido, /\.env/);
  }
  const mcp = Object.fromEntries(corpo.mcps.map((m) => [m.id, m.instalado]));
  assert.equal(mcp.n8n, true);
  assert.equal(mcp.context7, true);
  assert.equal(mcp.supabase, true);
  assert.equal(mcp.notion, false);
  assert.ok(!JSON.stringify(corpo).includes('segredo'));
  const testes = (await api('GET', '/api/primeiros-testes')).corpo;
  assert.equal(testes.length, 5);
  for (const x of testes) assert.deepEqual(Object.keys(x).sort(), ['faz', 'icone', 'id', 'pedido', 'titulo']);
  assert.ok(testes.some((x) => x.pedido.endsWith(' ')));
});

test('ponte: token, ignorados, texto vazio e resposta com marca invisível no chat Você', async (t) => {
  const { ev, cfg, s, api, ponte } = await preparar(t);
  const eu = `${MEU}@s.whatsapp.net`;
  assert.deepEqual(await ponte({ texto: 'oi' }, 'errado'), { status: 401, corpo: { erro: 'token' } });
  assert.deepEqual(await ponte({ texto: 'oi', tipo: 'texto', deMim: false, chat: '5511900001111@s.whatsapp.net', eu }), { status: 202, corpo: { ok: true, ignorado: true } });
  assert.equal((await ponte({ texto: '   ', tipo: 'texto', deMim: true, chat: eu, eu })).status, 400);

  const r = await ponte({ texto: 'qual a boa?', tipo: 'texto', deMim: true, chat: eu, eu });
  assert.equal(r.status, 202);
  assert.equal(r.corpo.ok, true);
  assert.equal(typeof r.corpo.posicao, 'number');
  await ate(() => ev.enviadas.length === 1, 8000);
  assert.equal(ev.enviadas[0].number, MEU);
  assert.ok(ev.enviadas[0].text.startsWith('⁣eco:qual a boa?'));
  const visto = JSON.parse(ev.enviadas[0].text.slice(ev.enviadas[0].text.indexOf('{')));
  assert.equal(visto.env.para, MEU);
  assert.ok(visto.args.includes('--permission-mode'));
  assert.match(visto.args[visto.args.indexOf('--append-system-prompt') + 1], /WhatsApp/);

  const [c] = (await api('GET', '/api/estado')).corpo;
  assert.equal(c.origem, 'whatsapp');
  assert.equal(c.processando, false);
  const mapa = JSON.parse(fs.readFileSync(path.join(cfg.dados, 'whatsapp.json'), 'utf8'));
  assert.equal(mapa[chaveNumero(MEU)].conversa, c.id);
  assert.equal(s.conversas.porId(c.id).whatsDe, MEU);
});

test('ponte: mesma conversa, comando de nova, tipo não texto e reabertura após terminal', async (t) => {
  const { ev, cfg, s, api, ponte } = await preparar(t);
  fs.writeFileSync(path.join(cfg.dados, 'whatsapp-acesso.json'), JSON.stringify({ numeros: ['5511977776666'], chatVoce: true }));
  fs.writeFileSync(path.join(cfg.dados, 'whatsapp.json'), JSON.stringify({ conversa: 'velha', ultima: 1 }));
  const de = { deMim: false, chat: '5511977776666@s.whatsapp.net', eu: `${MEU}@s.whatsapp.net`, tipo: 'texto' };
  await ponte({ ...de, texto: 'um' });
  await ponte({ ...de, texto: 'dois' });
  await ate(() => ev.enviadas.length === 2, 8000);
  assert.equal(ev.enviadas[1].number, '5511977776666');
  assert.ok(!ev.enviadas[1].text.startsWith('⁣'));
  assert.equal((await api('GET', '/api/estado')).corpo.length, 1);
  const mapa = JSON.parse(fs.readFileSync(path.join(cfg.dados, 'whatsapp.json'), 'utf8'));
  assert.equal(mapa.conversa, undefined);
  assert.equal(mapa.ultima, undefined);

  await ponte({ ...de, texto: '/NOVA' });
  await ate(() => ev.enviadas.length === 3, 8000);
  assert.match(ev.enviadas[2].text, /nova/i);
  assert.equal((await api('GET', '/api/estado')).corpo.length, 2);

  await ponte({ ...de, tipo: 'audio', texto: '' });
  await ate(() => ev.enviadas.length === 4, 8000);
  assert.match(ev.enviadas[3].text, /texto/);

  const atual = (await api('GET', '/api/estado')).corpo[1];
  s.conversas.conectar({ send() {}, on() {} }, s.conversas.porId(atual.id), 80, 24);
  await ponte({ ...de, texto: 'tres' });
  await ate(() => ev.enviadas.length === 5, 8000);
  assert.equal((await api('GET', '/api/estado')).corpo.length, 3);
});

test('ponte: Antigravity guarda o histórico e a sessão do motor', async (t) => {
  const { ev, s, api, ponte } = await preparar(t);
  await api('POST', '/api/config/motores', { whatsapp: 'antigravity' });
  const eu = `${MEU}@s.whatsapp.net`;
  await ponte({ texto: 'oi', tipo: 'texto', deMim: true, chat: eu, eu });
  await ate(() => ev.enviadas.length === 1, 8000);
  const [e] = (await api('GET', '/api/estado')).corpo;
  const c = s.conversas.porId(e.id);
  assert.equal(c.sessaoMotor, 'cv-1');
  assert.deepEqual(c.historico.map((h) => h.papel), ['voce', 'claude']);
  const h = (await api('GET', `/api/conversas/${e.id}/historico`)).corpo;
  assert.equal(h[1].texto, ev.enviadas[0].text.slice(1));
});

test('ponte: 6 horas sem falar ou motor trocado abrem conversa nova', async (t) => {
  let agora = Date.now();
  const { ev, api, ponte } = await preparar(t, {}, { agora: () => agora });
  const eu = `${MEU}@s.whatsapp.net`;
  const msg = { texto: 'oi', tipo: 'texto', deMim: true, chat: eu, eu };
  await ponte(msg);
  await ate(() => ev.enviadas.length === 1, 8000);
  agora += 5 * 3600_000;
  await ponte(msg);
  await ate(() => ev.enviadas.length === 2, 8000);
  assert.equal((await api('GET', '/api/estado')).corpo.length, 1);
  agora += 6 * 3600_000 + 1;
  await ponte(msg);
  await ate(() => ev.enviadas.length === 3, 8000);
  assert.equal((await api('GET', '/api/estado')).corpo.length, 2);
  await api('POST', '/api/config/motores', { whatsapp: 'codex' });
  await ponte(msg);
  await ate(() => ev.enviadas.length === 4, 8000);
  const estado = (await api('GET', '/api/estado')).corpo;
  assert.equal(estado.length, 3);
  assert.equal(estado[2].motor, 'codex');
  assert.equal(ev.enviadas[3].text, '⁣codex:oi');
});

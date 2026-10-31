// Fluxo do n8n, Compose, publicação no SQLite do n8n e estrutura do cérebro de exemplo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmp, subir, cfgTeste } from './ajuda.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const fluxo = JSON.parse(ler('instalador/stack/fluxos/whatsapp.json'));
const no = (tipo) => fluxo.nodes.find((n) => n.type === `n8n-nodes-base.${tipo}`);
const compose = ler('instalador/stack/docker-compose.yml');
const instalar = ler('instalador/instalar.sh');
const CEREBRO = path.join(REPO, 'cerebro-exemplo');

// Roda o código do nó como o n8n roda: $input.all() devolve os itens recebidos.
const filtrar = (...corpos) => new Function('$input', no('code').parameters.jsCode)({ all: () => corpos.map((json) => ({ json })) }).map((i) => i.json);
const evento = (key, message = {}, extra = {}) => ({ body: { sender: '5562900000000@s.whatsapp.net', data: { key, message, messageType: 'conversation', ...extra } } });

test('fluxo do n8n: id fixo, três nós ligados e caminho do webhook igual ao do painel e do instalador', () => {
  assert.equal(fluxo.id, 'coreOsWhatsapp01');
  assert.equal(fluxo.nodes.length, 3);
  const gancho = no('webhook');
  assert.equal(gancho.parameters.path, 'core-os-whatsapp');
  assert.equal(gancho.parameters.httpMethod, 'POST');
  assert.equal(gancho.parameters.responseMode, 'onReceived');
  assert.match(ler('servidor/config.js'), /http:\/\/n8n:5678\/webhook\/core-os-whatsapp/);
  assert.match(instalar, /WEBHOOK_INTERNO="http:\/\/n8n:5678\/webhook\/core-os-whatsapp"/);
  assert.deepEqual(Object.keys(fluxo.connections).sort(), [gancho.name, no('code').name].sort());
  assert.equal(fluxo.connections[gancho.name].main[0][0].node, no('code').name);
  assert.equal(fluxo.connections[no('code').name].main[0][0].node, no('httpRequest').name);
  assert.equal(fluxo.settings.saveDataSuccessExecution, 'none');
  assert.equal(fluxo.settings.saveManualExecutions, false);
});

test('fluxo do n8n: requisição usa CORE_OS_PONTE, o cabeçalho do token e exatamente os cinco campos', () => {
  const p = no('httpRequest').parameters;
  assert.equal(p.method, 'POST');
  assert.match(p.url, /\$env\.CORE_OS_PONTE/);
  assert.deepEqual(p.headerParameters.parameters, [{ name: 'x-core-os-token', value: '={{ $env.CORE_OS_HOOK_TOKEN }}' }]);
  const campos = [...p.jsonBody.matchAll(/(\w+): \$json\.\1/g)].map((m) => m[1]);
  assert.deepEqual(campos, ['texto', 'tipo', 'deMim', 'chat', 'eu']);
  assert.match(compose, /CORE_OS_PONTE: http:\/\/host\.docker\.internal:\$\{CORE_OS_PORT:-3000\}\/api\/ponte\/whatsapp/);
  assert.match(ler('servidor/app.js'), /app\.post\('\/api\/ponte\/whatsapp'[\s\S]{0,300}x-core-os-token/);
});

test('fluxo do n8n: filtro descarta grupos, status, canais, laço e não mensagens; monta o objeto', () => {
  const eu = { remoteJid: '5562900000000@s.whatsapp.net', fromMe: true };
  assert.deepEqual(filtrar(evento(eu, { conversation: 'oi' })), [
    { texto: 'oi', tipo: 'texto', deMim: true, chat: '5562900000000@s.whatsapp.net', eu: '5562900000000@s.whatsapp.net' },
  ]);
  // identificador opaco: o número vem do remoteJidAlt; corpo sem "body" também vale
  const opaco = filtrar(evento({ remoteJid: '123@lid', remoteJidAlt: '5511988887777@s.whatsapp.net' }, { extendedTextMessage: { text: 'olá' } }).body);
  assert.equal(opaco[0].chat, '5511988887777@s.whatsapp.net');
  assert.equal(opaco[0].texto, 'olá');
  assert.equal(opaco[0].deMim, false);
  for (const jid of ['1203@g.us', 'status@broadcast', '99@newsletter', '', '123@lid']) {
    assert.deepEqual(filtrar(evento({ remoteJid: jid }, { conversation: 'x' })), [], jid);
  }
  assert.deepEqual(filtrar(evento(eu, { conversation: '⁣resposta do cérebro' })), []);
  assert.deepEqual(filtrar(evento(eu, { imageMessage: { caption: '⁣foto' } }, { messageType: 'imageMessage' })), []);
  for (const t of ['reactionMessage', 'protocolMessage', 'senderKeyDistributionMessage', 'editedMessage', 'pollCreationMessage', 'stickerMessage']) {
    assert.deepEqual(filtrar(evento(eu, {}, { messageType: t })), [], t);
  }
  assert.equal(filtrar(evento(eu, {}, { messageType: 'audioMessage' }))[0].tipo, 'audio');
  assert.equal(filtrar(evento(eu, {}, { messageType: 'imageMessage' }))[0].tipo, 'outro');
});

test('fluxo do n8n: o objeto montado é aceito pela ponte do painel com o token', async () => {
  const s = await subir(cfgTeste());
  try {
    const [corpo] = filtrar(evento({ remoteJid: '5511977776666@s.whatsapp.net' }, { conversation: 'quem é você?' }));
    const r = await fetch(`${s.base}/api/ponte/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-core-os-token': 'tok' }, body: JSON.stringify(corpo) });
    assert.equal(r.status, 202);
    assert.equal((await r.json()).ignorado, true);
    const sem = await fetch(`${s.base}/api/ponte/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    assert.equal(sem.status, 401);
  } finally {
    await s.fechar();
  }
});

test('compose: portas só no loopback, versões fixas e toda variável usada é gravada pelo instalador', () => {
  const portas = [...compose.matchAll(/ports: \[(.*)\]/g)].flatMap((m) => m[1].split(',').map((p) => p.trim().replace(/"/g, '')));
  assert.deepEqual(portas, ['127.0.0.1:8080:8080', '127.0.0.1:5679:5678']);
  assert.equal(/^\s*-\s*"?\d+:\d+/m.test(compose), false, 'nenhuma porta em todas as interfaces');
  assert.match(compose, /image: postgres:16/);
  assert.match(compose, /image: redis:7/);
  assert.match(compose, /- \.\/fluxos:\/fluxos:ro/);
  assert.match(compose, /extra_hosts: \["host\.docker\.internal:host-gateway"\]/);
  assert.match(compose, /N8N_BLOCK_ENV_ACCESS_IN_NODE: "false"/);
  assert.match(compose, /^name: core-os$/m);
  const usadas = new Set([...compose.matchAll(/\$\{([A-Z0-9_]+)/g)].map((m) => m[1]));
  const gravadas = new Set([...instalar.matchAll(/(?:env_def|garantir) ([A-Z0-9_]+)/g)].map((m) => m[1]));
  for (const v of usadas) assert.ok(gravadas.has(v), `${v} é usada no compose mas o instalador não grava`);
  for (const fixa of ['N8N_FIXA', 'EVOLUTION_FIXA', 'CADDY_IMG']) {
    assert.match(instalar, new RegExp(`${fixa}="[^"]+:v?\\d+\\.\\d+\\.\\d+"`), fixa);
  }
});

function acharPython() {
  for (const p of ['python3', 'python']) {
    const r = spawnSync(p, ['--version'], { encoding: 'utf8' });
    if (r.status === 0 && /Python 3/.test(r.stdout + r.stderr)) return p;
  }
  return null;
}

test('publicar-fluxo.py grava versão nova no fluxo e no histórico, a cada execução', (t) => {
  const py = acharPython();
  if (!py) return t.skip('python 3 não encontrado');
  const banco = path.join(tmp('n8n-'), 'database.sqlite');
  const esquema = `import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
c.execute('CREATE TABLE workflow_entity (id TEXT PRIMARY KEY, name TEXT NOT NULL, nodes TEXT, connections TEXT, active BOOLEAN DEFAULT 0, versionId TEXT, activeVersionId TEXT)')
c.execute('CREATE TABLE workflow_history ("versionId" TEXT PRIMARY KEY, "workflowId" TEXT NOT NULL, "authors" TEXT NOT NULL, "nodes" TEXT NOT NULL, "connections" TEXT NOT NULL, "name" TEXT, "autosaved" BOOLEAN DEFAULT 0, "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL)')
c.execute("INSERT INTO workflow_entity (id,name,nodes,connections) VALUES ('coreOsWhatsapp01','Fluxo','[1]','{}')")
c.commit()`;
  assert.equal(spawnSync(py, ['-c', esquema, banco]).status, 0);
  const publicar = () => spawnSync(py, [path.join(REPO, 'instalador/stack/publicar-fluxo.py'), banco, 'coreOsWhatsapp01'], { encoding: 'utf8' });
  const v1 = publicar();
  assert.equal(v1.status, 0, v1.stderr);
  const v2 = publicar();
  const consulta = `import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1])
print(json.dumps({'fluxo':c.execute("SELECT versionId,activeVersionId FROM workflow_entity").fetchone(),'hist':c.execute('SELECT versionId,workflowId,nodes,connections,name,authors FROM workflow_history ORDER BY createdAt').fetchall()}))`;
  const estado = JSON.parse(spawnSync(py, ['-c', consulta, banco], { encoding: 'utf8' }).stdout);
  assert.deepEqual(estado.fluxo, [v2.stdout.trim(), v2.stdout.trim()]);
  assert.equal(estado.hist.length, 2);
  assert.deepEqual(estado.hist.map((h) => h[0]).sort(), [v1.stdout.trim(), v2.stdout.trim()].sort());
  assert.deepEqual(estado.hist[0].slice(1), ['coreOsWhatsapp01', '[1]', '{}', 'Fluxo', 'instalador']);
  const faltando = spawnSync(py, [path.join(REPO, 'instalador/stack/publicar-fluxo.py'), banco, 'outro'], { encoding: 'utf8' });
  assert.notEqual(faltando.status, 0);
  assert.match(faltando.stderr, /não está no banco/);
});

test('cérebro de exemplo: estrutura da spec, índices, sem caixa de entrada, marcador e nota de status', () => {
  const existe = (rel) => fs.existsSync(path.join(CEREBRO, rel));
  for (const rel of ['CLAUDE.md', 'AGENTS.md', 'COMO-USAR.md', '.claude/settings.json', '.claude/hooks/painel.sh', '.claude/hooks/captura.sh',
    'tasks/todo.md', 'tasks/lessons.md', 'memoria/MEMORY.md', 'memoria/estilo-de-conteudo.md',
    '.claude/skills/whatsapp/motor/whatsapp.sh', 'conteudo/whatsapp/2026-10-25-cardapio-da-semana.md']) {
    assert.ok(existe(rel), rel);
  }
  for (const pasta of ['tasks', 'memoria', 'conteudo', 'sessoes', 'assets']) assert.ok(existe(`${pasta}/CLAUDE.md`), `índice de ${pasta}`);
  const proibidas = /^(inbox|caixa[-_ ]?de[-_ ]?entrada|entrada|rascunhos?|diario|di[aá]rio|triagem|00[-_ ]?inbox)$/i;
  const andar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      assert.ok(!proibidas.test(e.name), `pasta proibida: ${e.name}`);
      andar(path.join(dir, e.name));
    }
  };
  andar(CEREBRO);

  const constituicao = ler('cerebro-exemplo/CLAUDE.md');
  assert.match(constituicao, /^# .*\{\{NOME\}\}/);
  assert.match(ler('cerebro-exemplo/AGENTS.md'), /^# .*\{\{NOME\}\}/);
  assert.match(constituicao, /sessoes\/<id>\.md/);
  assert.match(constituicao, /```markdown\n# .+\n> .+\n- \[ \] .+/);
  assert.match(constituicao, /- \[x\]/);
  assert.match(constituicao, /pedido\.md/);
  assert.match(constituicao, /\/opt\/core-os\/\.env/);
  assert.match(ler('cerebro-exemplo/AGENTS.md'), /CORE_OS_SESSAO/);

  const skills = ['whatsapp', 'carrossel', 'thumbnail', 'edicao-video', 'save'];
  for (const s of skills) {
    const md = ler(`cerebro-exemplo/.claude/skills/${s}/SKILL.md`);
    assert.match(md, new RegExp(`^---\\nname: ${s}\\ndescription: .*"`), s);
    assert.ok(constituicao.includes(`\`${s}\``), `skill ${s} citada na constituição`);
  }
  const link = path.join(CEREBRO, '.agents/skills');
  if (fs.lstatSync(link).isSymbolicLink()) assert.equal(fs.readlinkSync(link), '../.claude/skills');
  else assert.equal(fs.readFileSync(link, 'utf8'), '../.claude/skills', 'clone sem suporte a link guarda o alvo como texto');

  const cfg = JSON.parse(ler('cerebro-exemplo/.claude/settings.json'));
  assert.match(cfg.hooks.SessionStart[0].hooks[0].command, /\.claude\/hooks\/painel\.sh/);
  assert.match(cfg.hooks.UserPromptSubmit[0].hooks[0].command, /\.claude\/hooks\/captura\.sh/);
  const painel = spawnSync(process.env.BASH_BIN || 'bash', [path.join(CEREBRO, '.claude/hooks/painel.sh').replace(/\\/g, '/')],
    { env: { ...process.env, CLAUDE_PROJECT_DIR: CEREBRO.replace(/\\/g, '/') }, encoding: 'utf8' });
  assert.equal(painel.status, 0, painel.stderr);
  assert.match(painel.stdout, /Hoje é \d\d\/\d\d\/\d{4}/);
  assert.match(painel.stdout, /- \[ \] Escolher qual das três capas/);
  assert.ok(!painel.stdout.includes('Instalar o painel'), 'concluídas não entram');

  const entregas = fs.readdirSync(path.join(CEREBRO, 'conteudo/carrosseis/2026-10-20-habitos-que-rendem/entrega')).filter((f) => f.endsWith('.jpg'));
  assert.ok(entregas.length > 12);
  for (const p of ['carrosseis/2026-10-20-habitos-que-rendem', 'thumbnails/rotina-da-manha', 'reels/01-tres-erros-de-iniciante']) {
    assert.match(ler(`cerebro-exemplo/conteudo/${p}/pedido.md`), /^---\ntype: entrega\ncaso: .+\ncanal: (painel|terminal|whatsapp)\ndata: \d{4}-\d\d-\d\d\n---/, p);
  }
});

test('nenhum texto novo usa travessão', () => {
  const textos = [];
  const andar = (dir) => {
    for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) andar(rel);
      else if (/\.(md|sh|json|yml|py|mjs)$/.test(e.name)) textos.push(rel);
    }
  };
  for (const d of ['cerebro-exemplo', 'instalador', 'skill']) andar(d);
  textos.push('README.md', 'montar-pacote.sh', 'docs/DECISOES.md');
  for (const t of textos) assert.ok(!ler(t).includes(String.fromCharCode(0x2014)), t);
});

// ---------- ferramenta da skill whatsapp contra uma Evolution falsa ----------
async function evolutionFalsa() {
  const pedidos = [];
  const respostas = {
    '/instance/fetchInstances?instanceName=cerebro': [{ name: 'cerebro', ownerJid: '5562900000000@s.whatsapp.net' }],
    '/chat/findContacts/cerebro': [{ remoteJid: '5511988887777@s.whatsapp.net', pushName: 'Ana Souza' }, { remoteJid: '5511955554444@s.whatsapp.net', pushName: 'Ana Lima' }],
    '/chat/findChats/cerebro': [
      { remoteJid: '123@lid', updatedAt: '2026-10-30T12:00:00Z', lastMessage: { key: { remoteJid: '123@lid', remoteJidAlt: '5511988887777@s.whatsapp.net' }, message: { conversation: 'mais nova' }, messageTimestamp: 1793000000 } },
      { remoteJid: '5511988887777@s.whatsapp.net', lastMessage: { key: { remoteJid: '5511988887777@s.whatsapp.net' }, message: { conversation: 'antiga' }, messageTimestamp: 1790000000 } },
      { remoteJid: '5511955554444@s.whatsapp.net', lastMessage: { key: { fromMe: true }, message: { conversation: 'oi Ana' }, messageTimestamp: 1791000000 } },
      { remoteJid: 'status@broadcast', lastMessage: { message: { conversation: 'status' }, messageTimestamp: 1799000000 } },
    ],
    '/chat/findMessages/cerebro': (corpo) => ({ messages: { records: corpo.where.key.remoteJid === '123@lid'
      ? [{ key: { id: 'b' }, message: { conversation: 'segunda' }, messageTimestamp: 1793000000, pushName: 'Ana' }]
      : [{ key: { id: 'a', fromMe: true }, message: { conversation: 'primeira' }, messageTimestamp: 1790000000 }, { key: { id: 'b' }, message: { conversation: 'segunda' }, messageTimestamp: 1793000000 }] } }),
  };
  const server = http.createServer((req, res) => {
    let t = '';
    req.on('data', (d) => { t += d; }).on('end', () => {
      const corpo = t ? JSON.parse(t) : null;
      pedidos.push({ url: req.url, chave: req.headers.apikey, corpo });
      const r = respostas[req.url];
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(typeof r === 'function' ? r(corpo) : r ?? { ok: true }));
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { pedidos, server, url: `http://127.0.0.1:${server.address().port}` };
}

test('skill whatsapp: conversas unificadas, ler com ambiguidade e envio com marca invisível para o próprio número', async () => {
  const evo = await evolutionFalsa();
  const motor = path.join(CEREBRO, '.claude/skills/whatsapp/motor/whatsapp.mjs');
  const env = { ...process.env, CORE_OS_ENV: '/nao/existe', EVO_URL: evo.url, EVO_KEY: 'chave', EVO_INSTANCE: 'cerebro', WHATS_PARA: '' };
  const rodar = (args, extra = {}) => promisify(execFile)(process.execPath, [motor, ...args], { env: { ...env, ...extra } }).then(
    (r) => ({ codigo: 0, ...r }), (e) => ({ codigo: e.code, stdout: e.stdout, stderr: e.stderr }));
  try {
    const conv = await rodar(['conversas']);
    const linhas = conv.stdout.trim().split('\n');
    assert.equal(linhas.length, 2, conv.stdout);
    assert.match(linhas[0], /Ana Souza {2}5511988887777 {2}mais nova$/);
    assert.match(linhas[1], /Ana Lima {2}5511955554444/);
    assert.ok(!conv.stdout.includes('status'));

    const ambiguo = await rodar(['ler', 'ana']);
    assert.equal(ambiguo.codigo, 2);
    assert.match(ambiguo.stdout, /Ana Souza {2}5511988887777/);
    const leitura = await rodar(['ler', '988887777']);
    assert.equal(leitura.codigo, 0, leitura.stderr);
    assert.deepEqual(leitura.stdout.trim().split('\n').map((l) => l.replace(/^.*? {2}/, '')), ['eu: primeira', 'Ana: segunda']);
    assert.equal((await rodar(['ler', 'ninguém'])).codigo, 1);

    await rodar(['text', 'lembrete']);
    await rodar(['text', 'oi', '55 11 98888-7777']);
    await rodar(['text', 'pra quem pediu'], { WHATS_PARA: '5511955554444' });
    const envios = evo.pedidos.filter((p) => p.url === '/message/sendText/cerebro').map((p) => p.corpo);
    assert.deepEqual(envios, [
      { number: '5562900000000', text: '⁣lembrete' },
      { number: '5511988887777', text: 'oi' },
      { number: '5511955554444', text: 'pra quem pediu' },
    ]);
    assert.ok(evo.pedidos.every((p) => p.chave === 'chave'));

    const uso = await rodar(['nada']);
    assert.equal(uso.codigo, 1);
    assert.match(uso.stderr, /uso: whatsapp\.sh/);
  } finally {
    evo.server.close();
  }
});

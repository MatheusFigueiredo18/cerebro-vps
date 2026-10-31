// Leitura passiva dos registros que o Claude Code e o Codex gravam em disco (formato de terceiros).
import fs from 'node:fs';
import path from 'node:path';

const MAX_HISTORICO = 300;
const NOTA_STATUS = /sessoes\/[0-9a-f-]{36}\.md/i;
const ACAO_NOTA = 'Atualizando a nota de status';

export const chaveProjeto = (vaultReal) => vaultReal.replace(/[^A-Za-z0-9]/g, '-');
export const pastaProjetoClaude = (casa, vaultReal) => path.join(casa, '.claude', 'projects', chaveProjeto(vaultReal));

const curto = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 90);
const mexeNaNota = (entrada) => Object.values(entrada ?? {}).some((v) => typeof v === 'string' && NOTA_STATUS.test(v.replace(/\\/g, '/')));

export function descreverAcao(ferramenta, entrada = {}) {
  if (mexeNaNota(entrada)) return ACAO_NOTA;
  const e = entrada ?? {};
  if (e.description) return curto(`${ferramenta}: ${e.description}`);
  if (e.file_path) return curto(`${ferramenta}: ${path.basename(String(e.file_path))}`);
  if (e.command) return curto(`${ferramenta}: ${e.command}`);
  if (e.pattern) return curto(`${ferramenta}: ${e.pattern}`);
  return curto(ferramenta);
}

function* linhasJson(arquivo) {
  let texto;
  try { texto = fs.readFileSync(arquivo, 'utf8'); } catch { return; }
  for (const linha of texto.split('\n')) {
    if (!linha.trim()) continue;
    try { yield JSON.parse(linha); } catch { /* linha parcial ou corrompida */ }
  }
}

const quandoDe = (o) => { const t = Date.parse(o?.timestamp); return Number.isNaN(t) ? null : t; };
const ultimos = (lista) => lista.slice(-MAX_HISTORICO);

// ---------- Claude Code ----------
const cacheStatus = new Map();

export function statusClaude(arquivo) {
  let st;
  try { st = fs.statSync(arquivo); } catch { return null; }
  const guardado = cacheStatus.get(arquivo);
  if (guardado && guardado.tamanho === st.size) return { ...guardado.valor, mtime: st.mtimeMs };
  const valor = { ultimaAcao: null, terminou: false, escritos: [] };
  for (const o of linhasJson(arquivo)) {
    const conteudo = o.message?.content;
    if (o.type !== 'assistant' || !Array.isArray(conteudo)) continue;
    const usos = conteudo.filter((b) => b?.type === 'tool_use');
    if (usos.length) {
      const ultimo = usos.at(-1);
      valor.ultimaAcao = descreverAcao(ultimo.name, ultimo.input);
      valor.terminou = false;
      for (const u of usos) if ((u.name === 'Write' || u.name === 'Edit') && u.input?.file_path) valor.escritos.push(String(u.input.file_path));
    } else if (o.message.stop_reason === 'end_turn') valor.terminou = true;
  }
  cacheStatus.set(arquivo, { tamanho: st.size, valor });
  return { ...valor, mtime: st.mtimeMs };
}

export function historicoClaude(arquivo) {
  const itens = [];
  for (const o of linhasJson(arquivo)) {
    const quando = quandoDe(o);
    const conteudo = o.message?.content;
    if (o.type === 'user' && !o.isMeta) {
      const texto = typeof conteudo === 'string' ? conteudo
        : Array.isArray(conteudo) ? conteudo.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : '';
      // começar com "<" indica injeção do sistema (saída de hook, comando)
      if (texto.trim() && !texto.trimStart().startsWith('<')) itens.push({ papel: 'voce', texto, quando });
    } else if (o.type === 'assistant' && Array.isArray(conteudo)) {
      for (const b of conteudo) {
        if (b?.type === 'text' && b.text?.trim()) itens.push({ papel: 'claude', texto: b.text, quando });
        else if (b?.type === 'tool_use') itens.push({ papel: 'acao', texto: descreverAcao(b.name, b.input), quando });
      }
    }
  }
  return ultimos(itens);
}

export function subagentes(pastaProjeto, id, agora = Date.now()) {
  const pasta = path.join(pastaProjeto, id, 'subagents');
  let nomes;
  try { nomes = fs.readdirSync(pasta); } catch { return []; }
  return nomes.filter((n) => n.endsWith('.meta.json')).map((n) => {
    const nome = n.slice(0, -'.meta.json'.length);
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(pasta, n), 'utf8')) ?? {}; } catch { /* metadados ilegíveis não derrubam a lista */ }
    const st = statusClaude(path.join(pasta, `${nome}.jsonl`));
    const inicio = st?.mtime ?? 0;
    const status = st?.terminou ? 'concluido' : st && agora - st.mtime < 30_000 ? 'trabalhando' : 'parado';
    return { id: nome, descricao: meta.description || 'Subagente', tipo: meta.agentType || '', status, ultimaAcao: st?.ultimaAcao ?? null, inicio };
  }).sort((a, b) => a.inicio - b.inicio);
}

// ---------- Codex ----------
export const pastaSessoesCodex = (codexHome) => path.join(codexHome, 'sessions');

function descreverCodex(payload) {
  let args = payload.arguments ?? payload.input ?? payload.action ?? {};
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
  const cmd = Array.isArray(args?.command) ? args.command.join(' ') : args?.command;
  const texto = cmd || payload.name || 'Ação';
  return NOTA_STATUS.test(String(texto)) ? ACAO_NOTA : curto(texto);
}

export function lerCodex(arquivo) {
  const r = { itens: [], ultimaAcao: null, terminou: false, mtime: 0 };
  try { r.mtime = fs.statSync(arquivo).mtimeMs; } catch { return r; }
  for (const o of linhasJson(arquivo)) {
    const p = o.payload ?? {};
    const quando = quandoDe(o);
    if (o.type === 'event_msg' && p.type === 'user_message') { r.itens.push({ papel: 'voce', texto: String(p.message ?? ''), quando }); r.terminou = false; }
    else if (o.type === 'event_msg' && p.type === 'agent_message') r.itens.push({ papel: 'claude', texto: String(p.message ?? ''), quando });
    else if (o.type === 'event_msg' && p.type === 'task_complete') r.terminou = true;
    else if (o.type === 'response_item' && /call$/.test(p.type ?? '') && p.type !== 'function_call_output') {
      r.ultimaAcao = descreverCodex(p);
      r.itens.push({ papel: 'acao', texto: r.ultimaAcao, quando });
      r.terminou = false;
    }
  }
  r.itens = ultimos(r.itens);
  return r;
}

const pastaDoDia = (base, d) => path.join(base, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
const jsonlDe = (dir) => { try { return fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')).map((n) => path.join(dir, n)); } catch { return []; } };
const ultimosDias = (base, dias) => Array.from({ length: dias }, (_, i) => pastaDoDia(base, new Date(Date.now() - i * 86_400_000)));

function todosJsonl(dir) {
  let itens;
  try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return itens.flatMap((d) => (d.isDirectory() ? todosJsonl(path.join(dir, d.name)) : d.name.endsWith('.jsonl') ? [path.join(dir, d.name)] : []));
}

export function acharArquivoCodex(base, id, cache) {
  const guardado = cache.get(id);
  if (guardado && fs.existsSync(guardado)) return guardado;
  const temId = (f) => path.basename(f).includes(id);
  const achado = ultimosDias(base, 7).flatMap(jsonlDe).find(temId) ?? todosJsonl(base).find(temId) ?? null;
  if (achado) cache.set(id, achado);
  return achado;
}

export function registrosCodexRecentes(base, dias = 2) {
  return ultimosDias(base, dias).flatMap(jsonlDe).map((arquivo) => {
    let meta = {};
    try {
      const primeira = fs.readFileSync(arquivo, 'utf8').split('\n', 1)[0];
      meta = JSON.parse(primeira).payload ?? {};
    } catch { return null; }
    const ts = Date.parse(meta.timestamp);
    let criado = ts;
    if (Number.isNaN(ts)) { try { criado = fs.statSync(arquivo).mtimeMs; } catch { return null; } }
    return meta.id ? { arquivo, id: String(meta.id), cwd: meta.cwd, criado } : null;
  }).filter(Boolean);
}

// Liga cada registro novo do Codex à conversa solta mais recente aberta até 5 s depois dele.
export function vincularCodex(conversas, registros, vaultReal) {
  const usados = new Set(conversas.map((c) => c.sessaoMotor).filter(Boolean));
  let mudou = false;
  for (const reg of registros.sort((a, b) => a.criado - b.criado)) {
    if (usados.has(reg.id) || reg.cwd !== vaultReal) continue;
    const soltas = conversas.filter((c) => c.motor === 'codex' && !c.arquivada && !c.sessaoMotor && c.iniciouTerminal && c.iniciouTerminal <= reg.criado + 5000);
    const escolhida = soltas.sort((a, b) => b.iniciouTerminal - a.iniciouTerminal)[0];
    if (!escolhida) continue;
    escolhida.sessaoMotor = reg.id;
    usados.add(reg.id);
    mudou = true;
  }
  return mudou;
}

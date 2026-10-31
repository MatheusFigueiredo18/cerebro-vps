#!/usr/bin/env node
// Ferramenta da skill whatsapp: lê conversas e envia mensagens pela Evolution API do painel.
import fs from 'node:fs';
import path from 'node:path';

const INVISIVEL = '⁣';
const ARQ_ENV = process.env.CORE_OS_ENV || '/opt/core-os/.env';
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv', '.zip': 'application/zip',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};

function falhar(texto, codigo = 1) {
  console.error(texto);
  process.exit(codigo);
}

function lerEnv() {
  const env = {};
  try {
    for (const linha of fs.readFileSync(ARQ_ENV, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha);
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* sem arquivo: vale só o ambiente */ }
  return { ...env, ...process.env };
}

const env = lerEnv();
const BASE = String(env.EVO_URL || '').replace(/\/+$/, '');
const CHAVE = env.EVO_KEY || '';
const INST = encodeURIComponent(env.EVO_INSTANCE || 'cerebro');

async function evo(metodo, rota, corpo) {
  const r = await fetch(BASE + rota, {
    method: metodo,
    headers: { apikey: CHAVE, 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  if (!r.ok) falhar(`A Evolution recusou (${r.status}): ${texto}`);
  try { return texto ? JSON.parse(texto) : null; } catch { return texto; }
}

const digitos = (jid) => String(jid ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
const emMs = (t) => (typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Number(t) ? emMs(Number(t)) : Date.parse(t) || 0);
const horario = (ms) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));
const lista = (j) => (Array.isArray(j) ? j : Array.isArray(j?.records) ? j.records : Array.isArray(j?.messages?.records) ? j.messages.records : []);

function conteudo(registro) {
  const m = registro?.message ?? {};
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption
    || m.documentMessage?.caption || `[${registro?.messageType || 'mensagem'}]`;
}

// Junta chats e contatos; a mesma pessoa pode aparecer com identificadores diferentes.
async function pessoas() {
  const [chats, contatos] = await Promise.all([
    evo('POST', `/chat/findChats/${INST}`, {}),
    evo('POST', `/chat/findContacts/${INST}`, { where: {} }),
  ]);
  const nomes = new Map();
  for (const c of lista(contatos)) if (c?.pushName) nomes.set(digitos(c.remoteJid), c.pushName);
  const unidas = new Map();
  for (const c of lista(chats)) {
    const jid = String(c?.remoteJid ?? '');
    if (!jid || jid === 'status@broadcast') continue;
    const ultima = c.lastMessage ?? {};
    const grupo = jid.endsWith('@g.us');
    const numero = digitos(grupo ? jid : ultima.key?.remoteJidAlt || jid);
    const nome = nomes.get(numero) || nomes.get(digitos(jid)) || (!ultima.key?.fromMe && ultima.pushName) || c.pushName || c.name || numero;
    const item = { ts: emMs(ultima.messageTimestamp ?? c.updatedAt), nome, numero, grupo, jids: [jid], previa: conteudo(ultima).replace(/\s+/g, ' ').slice(0, 80) };
    const chave = grupo ? jid : numero;
    const antes = unidas.get(chave);
    if (!antes) { unidas.set(chave, item); continue; }
    const jids = [...new Set([...antes.jids, jid])];
    if (item.ts > antes.ts) Object.assign(antes, item);
    antes.jids = jids;
  }
  return [...unidas.values()].sort((a, b) => b.ts - a.ts);
}

async function acharPessoa(alvo) {
  if (alvo.includes('@')) return { nome: alvo, numero: digitos(alvo), jids: [alvo] };
  const todas = await pessoas();
  const d = alvo.replace(/\D/g, '');
  const achadas = /^[\d\s+().-]+$/.test(alvo) && d.length >= 8
    ? todas.filter((p) => p.numero.endsWith(d))
    : todas.filter((p) => p.nome.toLowerCase().includes(alvo.toLowerCase()));
  if (!achadas.length) falhar(`Ninguém encontrado para "${alvo}".`);
  if (achadas.length > 1) {
    console.log(`Mais de uma pessoa para "${alvo}":`);
    for (const p of achadas) console.log(`  ${p.nome}  ${p.numero}${p.grupo ? ' [grupo]' : ''}`);
    process.exit(2);
  }
  return achadas[0];
}

async function meuNumero() {
  const j = await evo('GET', `/instance/fetchInstances?instanceName=${INST}`);
  const alvo = decodeURIComponent(INST);
  const i = (Array.isArray(j) ? j : [j]).find((x) => (x?.name ?? x?.instance?.instanceName) === alvo);
  return digitos(i?.ownerJid ?? i?.instance?.owner);
}

async function destino(informado) {
  const eu = await meuNumero();
  const para = digitos(informado) || digitos(env.WHATS_PARA) || eu;
  if (!para) falhar('Não sei para quem mandar: informe o número.');
  return { para, paraMim: para === eu };
}

async function midia(arquivo) {
  if (/^https?:\/\//i.test(arquivo)) return { media: arquivo, fileName: path.basename(new URL(arquivo).pathname) || 'arquivo', mimetype: MIME[path.extname(new URL(arquivo).pathname).toLowerCase()] };
  if (!fs.existsSync(arquivo)) falhar(`Arquivo não encontrado: ${arquivo}`);
  return { media: fs.readFileSync(arquivo).toString('base64'), fileName: path.basename(arquivo), mimetype: MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream' };
}

const comandos = {
  async conversas(qtd = '20') {
    for (const p of (await pessoas()).slice(0, Number(qtd) || 20)) {
      console.log(`${p.ts ? horario(p.ts) : '--'}  ${p.nome}  ${p.numero}${p.grupo ? ' [grupo]' : ''}  ${p.previa}`);
    }
  },
  async ler(alvo, qtd = '20') {
    if (!alvo) falhar('uso: whatsapp.sh ler <número ou nome> [quantidade]');
    const n = Number(qtd) || 20;
    const p = await acharPessoa(alvo);
    const vistas = new Map();
    for (const jid of p.jids) {
      const j = await evo('POST', `/chat/findMessages/${INST}`, { where: { key: { remoteJid: jid } }, page: 1, offset: n });
      for (const r of lista(j)) {
        const id = r?.key?.id ?? `${jid}-${r?.messageTimestamp}`;
        if (!vistas.has(id)) vistas.set(id, r);
      }
    }
    const msgs = [...vistas.values()].sort((a, b) => emMs(a.messageTimestamp) - emMs(b.messageTimestamp)).slice(-n);
    if (!msgs.length) return console.log(`Nenhuma mensagem com ${p.nome}.`);
    for (const r of msgs) console.log(`${horario(emMs(r.messageTimestamp))}  ${r.key?.fromMe ? 'eu' : r.pushName || p.nome}: ${conteudo(r)}`);
  },
  async contato(termo) {
    if (!termo) falhar('uso: whatsapp.sh contato <nome>');
    const vistos = new Set();
    for (const c of lista(await evo('POST', `/chat/findContacts/${INST}`, { where: {} }))) {
      const numero = digitos(c?.remoteJid);
      if (!c?.pushName || vistos.has(numero) || !c.pushName.toLowerCase().includes(termo.toLowerCase())) continue;
      vistos.add(numero);
      console.log(`${c.pushName}  ${numero}`);
    }
    if (!vistos.size) falhar(`Nenhum contato com "${termo}".`);
  },
  async text(texto, para) {
    if (!texto) falhar('uso: whatsapp.sh text "<mensagem>" [número]');
    const d = await destino(para);
    await evo('POST', `/message/sendText/${INST}`, { number: d.para, text: d.paraMim ? INVISIVEL + texto : texto });
    console.log(`Enviado para ${d.para}.`);
  },
  async image(arquivo, legenda = '', para) { await comandos.enviarMidia('image', arquivo, legenda, para); },
  async doc(arquivo, legenda = '', para) { await comandos.enviarMidia('document', arquivo, legenda, para); },
  async enviarMidia(tipo, arquivo, legenda, para) {
    if (!arquivo) falhar(`uso: whatsapp.sh ${tipo === 'image' ? 'image' : 'doc'} <arquivo ou URL> ["legenda"] [número]`);
    const d = await destino(para);
    const m = await midia(arquivo);
    await evo('POST', `/message/sendMedia/${INST}`, { number: d.para, mediatype: tipo, ...m, caption: d.paraMim ? INVISIVEL + legenda : legenda });
    console.log(`Enviado ${m.fileName} para ${d.para}.`);
  },
  async audio(arquivo, para) {
    if (!arquivo) falhar('uso: whatsapp.sh audio <arquivo ou URL> [número]');
    const d = await destino(para);
    await evo('POST', `/message/sendWhatsAppAudio/${INST}`, { number: d.para, audio: (await midia(arquivo)).media });
    console.log(`Áudio enviado para ${d.para}.`);
  },
  async status() {
    const j = await evo('GET', `/instance/connectionState/${INST}`);
    console.log(j?.instance?.state ?? j?.state ?? 'desconhecido');
  },
  async eu() { console.log((await meuNumero()) || 'nenhum número conectado'); },
};

const USO = `uso: whatsapp.sh <comando> [argumentos]
  conversas [qtd]                     conversas mais recentes
  ler <número ou nome> [qtd]          mensagens com a pessoa
  contato <nome>                      procura contatos pelo nome
  text "<mensagem>" [número]          envia texto
  image <arquivo|URL> ["legenda"] [número]
  doc <arquivo|URL> ["legenda"] [número]
  audio <arquivo|URL> [número]        envia como mensagem de voz
  status                              estado da conexão
  eu                                  número conectado`;

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || cmd === 'enviarMidia' || !comandos[cmd]) falhar(USO);
if (!BASE || !CHAVE) falhar(`EVO_URL e EVO_KEY precisam estar em ${ARQ_ENV}.`);
try {
  await comandos[cmd](...args);
} catch (e) {
  falhar(`Falha ao falar com a Evolution: ${e.message}`);
}

// Core OS · bancos de dados: uma pasta com .banco.json (esquema e visões) e uma página .md por linha.
// As propriedades de cada linha ficam no frontmatter da página, então o Claude Code e o Obsidian leem tudo igual.
import fs from 'node:fs';
import path from 'node:path';
import { caminhoSeguro, criarPasta, criarPagina } from './paginas.js';

export const TIPOS_PROP = ['texto', 'select', 'data', 'numero', 'checkbox'];
const TIPOS_VISAO = ['tabela', 'quadro', 'calendario'];
const ARQ_BANCO = '.banco.json';
const MAX_BYTES = 2 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]+$/;
const NUMERO = /^-?\d+(\.\d+)?$/;
const CABECA = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

// ---------- frontmatter (YAML mínimo: uma chave por linha, listas em bloco) ----------
function lerValor(txt) {
  const t = txt.trim();
  if (t === '' || t === 'null' || t === '~') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (NUMERO.test(t)) return Number(t);
  if (t.startsWith('"')) { try { return JSON.parse(t); } catch { return t; } }
  return t;
}

function escreverValor(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  const ambiguo = s === '' || s !== s.trim() || /^(true|false|null|~)$/.test(s) || NUMERO.test(s) || /[:"\n\r#]|^[-?[\]{}&*!|>'%@`]/.test(s);
  return ambiguo ? JSON.stringify(s) : s;
}

export function lerFrontmatter(md) {
  const m = CABECA.exec(md);
  if (!m) return { props: {}, corpo: md };
  const props = {};
  const linhas = (m[1] ?? '').split(/\r?\n/);
  for (let i = 0; i < linhas.length; i += 1) {
    const k = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(linhas[i]);
    if (!k) continue;
    const itens = [];
    while (k[2].trim() === '' && i + 1 < linhas.length && /^[ \t]+-[ \t]+/.test(linhas[i + 1])) {
      i += 1;
      itens.push(lerValor(linhas[i].replace(/^[ \t]+-[ \t]+/, '')));
    }
    props[k[1]] = itens.length ? itens : lerValor(k[2]);
  }
  return { props, corpo: md.slice(m[0].length) };
}

export function escreverFrontmatter(props, corpo) {
  const linhas = Object.entries(props).flatMap(([k, v]) => (Array.isArray(v)
    ? [`${k}:`, ...v.map((x) => `  - ${escreverValor(x)}`)]
    : [`${k}: ${escreverValor(v)}`.trimEnd()]));
  return linhas.length ? `---\n${linhas.join('\n')}\n---\n${corpo}` : corpo;
}

// troca (ou cria) só a linha da chave, sem mexer no resto do cabeçalho nem no corpo
function trocarChave(md, chave, valor) {
  const linha = `${chave}: ${valor}`.trimEnd();
  const m = CABECA.exec(md);
  if (!m) return `---\n${linha}\n---\n${md}`;
  const nl = m[0].includes('\r\n') ? '\r\n' : '\n';
  const linhas = m[1] === undefined ? [] : m[1].split(/\r?\n/);
  const i = linhas.findIndex((l) => l.startsWith(`${chave}:`));
  if (i === -1) linhas.push(linha);
  else {
    let fim = i + 1;
    while (fim < linhas.length && /^[ \t]+\S/.test(linhas[fim])) fim += 1; // itens de lista da chave antiga
    linhas.splice(i, fim - i, linha);
  }
  return `---${nl}${linhas.join(nl)}${nl}---${nl}${md.slice(m[0].length)}`;
}

// ---------- banco ----------
const relDe = (vault, abs) => path.relative(vault, abs).split(path.sep).join('/');

function pastaDoBanco(vault, pastaRel) {
  const dir = caminhoSeguro(vault, pastaRel);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('pasta não encontrada');
  if (!fs.existsSync(path.join(dir, ARQ_BANCO))) throw new Error('esta pasta não é um banco');
  return dir;
}

function esquemaPadrao(nome) {
  return {
    nome,
    propriedades: [
      { id: 'status', nome: 'Status', tipo: 'select', opcoes: ['A fazer', 'Fazendo', 'Feito'] },
      { id: 'data', nome: 'Data', tipo: 'data' },
    ],
    visoes: [
      { id: 'tabela', nome: 'Tabela', tipo: 'tabela' },
      { id: 'quadro', nome: 'Quadro', tipo: 'quadro', agruparPor: 'status' },
      { id: 'calendario', nome: 'Calendário', tipo: 'calendario', dataProp: 'data' },
    ],
  };
}

const gravarEsquema = (dir, esquema) => fs.writeFileSync(path.join(dir, ARQ_BANCO), `${JSON.stringify(esquema, null, 2)}\n`);

export function criarBanco(vault, pastaRel, nome) {
  const { caminho } = criarPasta(vault, pastaRel, nome);
  gravarEsquema(caminhoSeguro(vault, caminho), esquemaPadrao(String(nome ?? '').trim() || path.posix.basename(caminho)));
  return { caminho };
}

function linhaDe(vault, abs) {
  const { props } = lerFrontmatter(fs.readFileSync(abs, 'utf8'));
  return { caminho: relDe(vault, abs), titulo: path.basename(abs, path.extname(abs)), props };
}

export function lerBanco(vault, pastaRel) {
  const dir = pastaDoBanco(vault, pastaRel);
  let esquema;
  try { esquema = JSON.parse(fs.readFileSync(path.join(dir, ARQ_BANCO), 'utf8')); } catch (e) { throw new Error(`.banco.json inválido: ${e.message}`); }
  if (!esquema || typeof esquema !== 'object' || Array.isArray(esquema)) throw new Error('.banco.json inválido: esperado um objeto');
  esquema = { ...esquema, propriedades: esquema.propriedades ?? [], visoes: esquema.visoes ?? [] };
  const linhas = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith('.') && path.extname(d.name).toLowerCase() === '.md')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
    .filter((d) => fs.statSync(path.join(dir, d.name)).size <= MAX_BYTES)
    .map((d) => linhaDe(vault, path.join(dir, d.name)));
  return { esquema, linhas };
}

export function salvarProp(vault, linhaRel, propId, valor) {
  if (!ID.test(String(propId))) throw new Error('propriedade inválida');
  const escalar = valor === null || typeof valor === 'string' || typeof valor === 'boolean' || (typeof valor === 'number' && Number.isFinite(valor));
  if (!escalar) throw new Error('valor inválido');
  const abs = caminhoSeguro(vault, linhaRel);
  if (path.extname(abs).toLowerCase() !== '.md') throw new Error('somente .md');
  const st = fs.statSync(abs);
  if (!st.isFile()) throw new Error('página não encontrada');
  if (st.size > MAX_BYTES) throw new Error('arquivo grande demais');
  fs.writeFileSync(abs, trocarChave(fs.readFileSync(abs, 'utf8'), propId, escreverValor(valor)));
  return linhaDe(vault, abs);
}

export function criarLinha(vault, pastaRel, titulo) {
  const { esquema } = lerBanco(vault, pastaRel);
  const { caminho } = criarPagina(vault, pastaRel, titulo);
  for (const p of esquema.propriedades) if (p.tipo === 'select' && p.opcoes?.length) salvarProp(vault, caminho, p.id, p.opcoes[0]);
  return linhaDe(vault, caminhoSeguro(vault, caminho));
}

export function salvarEsquema(vault, pastaRel, esquema) {
  const dir = pastaDoBanco(vault, pastaRel);
  if (!esquema || typeof esquema !== 'object' || typeof esquema.nome !== 'string') throw new Error('esquema inválido');
  const props = esquema.propriedades ?? [];
  const visoes = esquema.visoes ?? [];
  if (!Array.isArray(props) || !Array.isArray(visoes)) throw new Error('esquema inválido');
  for (const p of props) {
    if (!p || !ID.test(String(p.id)) || typeof p.nome !== 'string' || !p.nome.trim()) throw new Error('propriedade inválida');
    if (!TIPOS_PROP.includes(p.tipo)) throw new Error('tipo de propriedade inválido');
    if (p.opcoes !== undefined && !(Array.isArray(p.opcoes) && p.opcoes.every((o) => typeof o === 'string'))) throw new Error('opções inválidas');
  }
  for (const v of visoes) {
    if (!v || !ID.test(String(v.id)) || typeof v.nome !== 'string') throw new Error('visão inválida');
    if (!TIPOS_VISAO.includes(v.tipo)) throw new Error('tipo de visão inválido');
  }
  gravarEsquema(dir, { ...esquema, propriedades: props, visoes });
}

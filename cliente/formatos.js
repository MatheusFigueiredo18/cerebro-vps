// Formatos e regras pequenas da interface, sem DOM: tipos de arquivo, títulos, datas, tamanhos,
// telefones, nota de status, ordenação da árvore e qual guia um item abre.
import { abreEmGuia } from './blocos.js';

const IMAGEM = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const VIDEO = new Set(['mp4', 'mov', 'webm', 'm4v']);
const TEXTO = new Set(['txt', 'json', 'sh', 'js', 'csv', 'canvas']);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const CATEGORIAS = { carrosseis: 'Carrosséis', reels: 'Reels', thumbnails: 'Thumbnails', whatsapp: 'WhatsApp', enviados: 'Enviados', videos: 'Vídeos', imagens: 'Imagens' };
const PREFIXO_DATA = /^(\d{4})-(\d{2})-(\d{2})-/;
export const natural = new Intl.Collator('pt', { numeric: true });

const extensao = (nome) => { const m = /\.([^./]+)$/.exec(nome); return m ? m[1].toLowerCase() : ''; };
const maiuscula = (s) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
export const nomeBase = (caminho) => caminho.split('/').pop();
export const pastaDe = (caminho) => caminho.split('/').slice(0, -1).join('/');

export function tipoArquivo(nome) {
  const e = extensao(nome);
  if (IMAGEM.has(e)) return 'imagem';
  if (VIDEO.has(e)) return 'video';
  if (e === 'md') return 'markdown';
  return TEXTO.has(e) ? 'texto' : 'outro';
}
export const ehMidia = (nome) => ['imagem', 'video'].includes(tipoArquivo(nome));

export function tituloAmigavel(nome, ehArquivo) {
  const sem = ehArquivo ? nome.replace(/\.[^.]+$/, '') : nome;
  return maiuscula(sem.replace(PREFIXO_DATA, '').replace(/[-_]+/g, ' ').trim());
}

export function dataCurta(nome, mtime) {
  const m = PREFIXO_DATA.exec(nome);
  if (m) return `${m[3]}/${m[2]}`;
  if (!mtime) return '';
  const d = new Date(mtime);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i += 1; }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unidades[i]}`;
}

export const rotuloCategoria = (nome) => CATEGORIAS[nome] ?? maiuscula(nome.replace(/-+/g, ' '));

// Arquivos de uma pasta de conteúdo agrupados pela subpasta: a própria pasta, depois "entrega", depois o resto.
export function agruparPorSubpasta(arquivos, pasta) {
  const grupos = new Map();
  for (const a of arquivos) {
    const rel = a.caminho.slice(pasta.length + 1);
    const grupo = rel.split('/').slice(0, -1).join(' / ');
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo).push(a);
  }
  const peso = (g) => (g === '' ? 0 : g === 'entrega' ? 1 : 2);
  return [...grupos].map(([grupo, lista]) => ({ grupo, arquivos: lista }))
    .sort((a, b) => peso(a.grupo) - peso(b.grupo) || natural.compare(a.grupo, b.grupo));
}

export function formatarTelefone(digitos) {
  const d = String(digitos ?? '').replace(/\D/g, '');
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m && (d.length === 12 || d.length === 13) ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : d;
}

export function numeroValido(texto) {
  const d = String(texto ?? '').replace(/\D/g, '');
  return d.length >= 10 && d.length <= 13 ? d : null;
}

// Nota de status de uma conversa: o resumo é a primeira citação; o checklist, as caixas marcáveis.
export function lerNota(nota) {
  const linhas = String(nota ?? '').split(/\r?\n/);
  const citacao = linhas.find((l) => l.startsWith('> '));
  const checklist = [];
  for (const l of linhas) {
    const m = /^\s*[-*] \[([ xX])\] (.*)$/.exec(l);
    if (m) checklist.push({ texto: m[2].trim(), feito: m[1] !== ' ' });
  }
  return { resumo: citacao ? citacao.slice(2).trim() : '', checklist };
}

export function ordenarNos(nos, ordem) {
  const cmp = ordem === 'recentes' ? (a, b) => (b.mtime ?? 0) - (a.mtime ?? 0) || natural.compare(a.nome, b.nome)
    : ordem === 'nome-desc' ? (a, b) => natural.compare(b.nome, a.nome)
      : (a, b) => natural.compare(a.nome, b.nome);
  return nos.map((n) => (n.filhos ? { ...n, filhos: ordenarNos(n.filhos, ordem) } : n))
    .sort((a, b) => (b.tipo === 'pasta') - (a.tipo === 'pasta') || cmp(a, b));
}

function acharFilhos(nos, pasta) {
  if (pasta === '') return nos;
  for (const n of nos) {
    if (n.tipo !== 'pasta') continue;
    if (n.caminho === pasta) return n.filhos ?? [];
    if (pasta.startsWith(`${n.caminho}/`)) return acharFilhos(n.filhos ?? [], pasta);
  }
  return [];
}

// Mídias da mesma pasta do arquivo (sem subpastas), na ordem natural: é a fila do visor.
export function midiasIrmas(arvore, caminho) {
  return acharFilhos(arvore, pastaDe(caminho))
    .filter((n) => n.tipo === 'arquivo' && ehMidia(n.nome))
    .sort((a, b) => natural.compare(a.nome, b.nome))
    .map((n) => n.caminho);
}

export function guiaDeArquivo(no) {
  if (no.tipo === 'pasta') return no.banco ? { id: `b:${no.caminho}`, tipo: 'banco', titulo: no.nome, caminho: no.caminho } : null;
  if (abreEmGuia(no.caminho)) return { id: `p:${no.caminho}`, tipo: 'pagina', titulo: no.nome.replace(/\.md$/i, ''), caminho: no.caminho };
  return { id: `a:${no.caminho}`, tipo: 'arquivo', titulo: no.nome, caminho: no.caminho };
}

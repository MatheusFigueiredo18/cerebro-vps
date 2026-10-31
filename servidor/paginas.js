// Core OS · páginas e pastas do vault: criar, ler, salvar (com aviso de conflito) e buscar.
// Todo caminho recebido passa por caminhoSeguro: nada sai do vault e nada oculto é tocado.
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024;
const INVALIDOS = /[\\/:*?"<>|\u0000-\u001f]/g;
const IGNORADOS = new Set(['node_modules']);

const dentro = (vault, p) => p === vault || p.startsWith(vault + path.sep);
const relDe = (vault, abs) => path.relative(vault, abs).split(path.sep).join('/');
const foraDoVault = () => new Error('fora do vault');

export function caminhoSeguro(vault, rel) {
  const r = String(rel ?? '');
  if (path.isAbsolute(r) || /^[a-zA-Z]:/.test(r) || /^[\\/]/.test(r)) throw foraDoVault();
  const partes = r.split(/[\\/]+/).filter(Boolean);
  if (partes.some((p) => p.startsWith('.'))) throw foraDoVault();
  const alvo = path.resolve(vault, ...partes);
  if (!dentro(vault, alvo)) throw foraDoVault();
  // um link simbólico no caminho não pode apontar para fora do vault
  let existente = alvo;
  while (!fs.existsSync(existente)) existente = path.dirname(existente);
  if (!dentro(vault, fs.realpathSync(existente))) throw foraDoVault();
  return alvo;
}

export function nomeLivre(dirAbs, base, ext) {
  let nome = `${base}${ext}`;
  for (let n = 2; fs.existsSync(path.join(dirAbs, nome)); n += 1) nome = `${base} ${n}${ext}`;
  return nome;
}

const nomeBase = (texto) => String(texto ?? '').replace(INVALIDOS, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim().replace(/\.+$/, '') || 'Sem título';

function pastaExistente(vault, pastaRel) {
  const dir = caminhoSeguro(vault, pastaRel);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('pasta não encontrada');
  return dir;
}

export function criarPagina(vault, pastaRel, titulo) {
  const dir = pastaExistente(vault, pastaRel);
  const nome = nomeLivre(dir, nomeBase(titulo), '.md');
  const cabecalho = String(titulo ?? '').replace(/\s+/g, ' ').trim() || 'Sem título';
  const abs = path.join(dir, nome);
  fs.writeFileSync(abs, `# ${cabecalho}\n`, { flag: 'wx' });
  return { caminho: relDe(vault, abs) };
}

export function criarPasta(vault, pastaRel, nome) {
  const dir = pastaExistente(vault, pastaRel);
  const abs = path.join(dir, nomeLivre(dir, nomeBase(nome), ''));
  fs.mkdirSync(abs);
  return { caminho: relDe(vault, abs) };
}

function paginaMd(vault, rel) {
  const abs = caminhoSeguro(vault, rel);
  if (path.extname(abs).toLowerCase() !== '.md') throw new Error('somente .md');
  return abs;
}

export function lerPagina(vault, rel) {
  const abs = paginaMd(vault, rel);
  const st = fs.statSync(abs);
  if (!st.isFile()) throw new Error('página não encontrada');
  if (st.size > MAX_BYTES) throw new Error('arquivo grande demais');
  return { texto: fs.readFileSync(abs, 'utf8'), mtime: st.mtimeMs };
}

export function salvarPagina(vault, rel, texto, mtimeEsperado) {
  const abs = paginaMd(vault, rel);
  if (Buffer.byteLength(String(texto)) > MAX_BYTES) throw new Error('arquivo grande demais');
  const st = fs.statSync(abs);
  if (!st.isFile()) throw new Error('página não encontrada');
  if (st.mtimeMs !== mtimeEsperado) throw Object.assign(new Error('o arquivo mudou fora do painel'), { code: 'CONFLITO' });
  fs.writeFileSync(abs, String(texto));
  return { mtime: fs.statSync(abs).mtimeMs };
}

export function buscar(vault, termo, limite = 30) {
  const q = String(termo ?? '').trim().toLocaleLowerCase('pt');
  if (!q) return [];
  const achados = [];
  (function andar(dir, prof) {
    if (prof > 8 || achados.length >= limite) return;
    let itens = [];
    try { itens = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'pt')); } catch { return; }
    for (const d of itens) {
      if (achados.length >= limite) return;
      if (d.name.startsWith('.') || IGNORADOS.has(d.name)) continue;
      const abs = path.join(dir, d.name);
      if (d.isDirectory()) { andar(abs, prof + 1); continue; }
      if (path.extname(d.name).toLowerCase() !== '.md') continue;
      const titulo = path.basename(d.name, '.md');
      let texto = '';
      try { if (fs.statSync(abs).size <= MAX_BYTES) texto = fs.readFileSync(abs, 'utf8'); } catch { continue; }
      const linhas = texto.split(/\r?\n/);
      const achada = linhas.find((l) => l.toLocaleLowerCase('pt').includes(q));
      if (!titulo.toLocaleLowerCase('pt').includes(q) && achada === undefined) continue;
      achados.push({ caminho: relDe(vault, abs), titulo, trecho: (achada ?? linhas.find((l) => l.trim()) ?? '').trim().slice(0, 120) });
    }
  }(vault, 0));
  return achados;
}

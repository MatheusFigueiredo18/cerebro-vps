// Leitura do cérebro: proteção de caminhos, árvore, listagem de pasta, galeria de conteúdos e grafo.
import fs from 'node:fs';
import path from 'node:path';

export const EXT_IMAGEM = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
export const EXT_VIDEO = new Set(['mp4', 'mov', 'webm', 'm4v']);
const ESCONDIDOS = new Set(['.git', 'node_modules', '.DS_Store', '.obsidian', '.trash']);
const INDICES = new Set(['CLAUDE.md', 'AGENTS.md']);
const PROFUNDIDADE = 8;
const MAX_NOTA = 2 * 1024 * 1024;

const alfabetica = new Intl.Collator('pt');
export const natural = new Intl.Collator('pt', { numeric: true });

export const extensao = (nome) => path.extname(nome).slice(1).toLowerCase();
export const tipoMidia = (nome) => (EXT_IMAGEM.has(extensao(nome)) ? 'imagem' : EXT_VIDEO.has(extensao(nome)) ? 'video' : null);
export const relDe = (vault, abs) => path.relative(vault, abs).split(path.sep).join('/');
const dentro = (vault, p) => p === vault || p.startsWith(vault + path.sep);

// Caminho real (links seguidos) dentro do cérebro, ou null. Ocultos podem ser lidos se pedidos explicitamente.
export function resolverNoVault(vault, rel) {
  const limpo = String(rel ?? '').replace(/^[\\/]+/, '');
  let real;
  try { real = fs.realpathSync(path.resolve(vault, limpo)); } catch { return null; }
  return dentro(vault, real) ? real : null;
}

function lerDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

const visivelNaArvore = (nome) => nome === '.claude' || (!ESCONDIDOS.has(nome) && !nome.startsWith('.'));

export function arvore(vault) {
  // shortcut: links simbólicos aparecem como arquivo e não são seguidos, para a árvore não sair do cérebro
  const listar = (dir, nivel) => {
    if (nivel > PROFUNDIDADE) return [];
    return lerDir(dir)
      .filter((d) => visivelNaArvore(d.name))
      .sort((a, b) => (b.isDirectory() - a.isDirectory()) || alfabetica.compare(a.name, b.name))
      .map((d) => {
        const abs = path.join(dir, d.name);
        const no = { nome: d.name, caminho: relDe(vault, abs), tipo: d.isDirectory() ? 'pasta' : 'arquivo' };
        // mtime alimenta "ordenar por recentes" na lateral; banco diz que a pasta abre como banco de dados
        try { no.mtime = fs.lstatSync(abs).mtimeMs; } catch { no.mtime = 0; }
        if (d.isDirectory()) {
          if (fs.existsSync(path.join(abs, '.banco.json'))) no.banco = true;
          no.filhos = listar(abs, nivel + 1);
        }
        return no;
      });
  };
  return listar(vault, 1);
}

// Arquivos de uma pasta, recursivo, sem ocultos e sem índices de pasta.
function arquivosDe(dir) {
  const saida = [];
  for (const d of lerDir(dir)) {
    if (d.name.startsWith('.') || INDICES.has(d.name)) continue;
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) saida.push(...arquivosDe(abs));
    else if (d.isFile()) {
      try { saida.push({ abs, st: fs.statSync(abs) }); } catch { /* sumiu no meio da leitura */ }
    }
  }
  return saida;
}

export function listarPasta(vault, rel) {
  const dir = resolverNoVault(vault, rel);
  if (!dir || !fs.statSync(dir).isDirectory()) return null;
  return arquivosDe(dir)
    .map(({ abs, st }) => ({ caminho: relDe(vault, abs), nome: path.basename(abs), tamanho: st.size, mtime: st.mtimeMs }))
    .sort((a, b) => natural.compare(a.caminho, b.caminho));
}

// Menor peso vira capa: o resultado final antes do material bruto.
export function pesoCapa(relNoItem) {
  const r = relNoItem.toLowerCase();
  const nome = path.posix.basename(r);
  const tipo = tipoMidia(nome);
  if (!tipo) return null;
  if (nome.startsWith('capa.')) return 0;
  if (tipo === 'imagem') {
    if (/(^|\/)entrega\//.test(r)) return 1;
    return /(^|\/)original\//.test(r) ? 3 : 2;
  }
  return /depois|final|editado/.test(nome) ? 4 : 5;
}

function itemDeConteudo(vault, abs, d) {
  const arquivos = d.isDirectory() ? arquivosDe(abs) : [{ abs, st: fs.statSync(abs) }];
  let capa = null;
  let melhor = Infinity;
  for (const { abs: a } of arquivos) {
    const relItem = d.isDirectory() ? relDe(abs, a) : d.name;
    const peso = pesoCapa(relItem);
    if (peso === null) continue;
    const caminho = relDe(vault, a);
    if (peso < melhor || (peso === melhor && natural.compare(caminho, capa.caminho) < 0)) {
      melhor = peso;
      capa = { caminho, tipo: tipoMidia(a) };
    }
  }
  return {
    nome: d.name,
    caminho: relDe(vault, abs),
    pasta: d.isDirectory(),
    arquivos: arquivos.length,
    mtime: arquivos.reduce((m, x) => Math.max(m, x.st.mtimeMs), 0),
    capa,
  };
}

const deConteudo = (d) => !d.name.startsWith('.') && !INDICES.has(d.name);
const recentes = (a, b) => b.mtime - a.mtime;

export function conteudos(vault) {
  const raiz = path.join(vault, 'conteudo');
  return lerDir(raiz)
    .filter((d) => d.isDirectory() && deConteudo(d))
    .map((cat) => {
      const dir = path.join(raiz, cat.name);
      const itens = lerDir(dir).filter(deConteudo).filter((d) => d.isDirectory() || d.isFile())
        .map((d) => itemDeConteudo(vault, path.join(dir, d.name), d)).sort(recentes);
      return { nome: cat.name, caminho: `conteudo/${cat.name}`, itens, mtime: itens.reduce((m, i) => Math.max(m, i.mtime), 0) };
    })
    .sort(recentes);
}

// ---------- grafo ----------
const semMd = (nome) => nome.replace(/\.md$/i, '');
const decodificar = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function grafo(vault) {
  const nos = [];
  const ligacoes = [];
  const ids = new Set();
  const notas = [];
  const percorrer = (lista, pai) => {
    for (const no of lista) {
      if (no.caminho === 'sessoes' || no.caminho === '.claude/hooks') continue;
      const tipo = no.tipo === 'pasta' ? 'pasta' : /\.md$/i.test(no.nome) ? 'nota' : tipoMidia(no.nome) ? 'midia' : null;
      if (!tipo) continue;
      nos.push({ id: no.caminho, nome: semMd(no.nome), tipo });
      ids.add(no.caminho);
      if (pai) ligacoes.push({ de: pai, para: no.caminho, tipo: 'pasta' });
      if (tipo === 'nota') notas.push(no.caminho);
      if (no.filhos) percorrer(no.filhos, no.caminho);
    }
  };
  percorrer(arvore(vault), null);

  const porNome = new Map();
  for (const n of nos) {
    const chave = semMd(path.posix.basename(n.id)).toLowerCase();
    if (n.tipo !== 'pasta' && !porNome.has(chave)) porNome.set(chave, n.id);
  }

  for (const nota of notas) {
    let texto = '';
    try {
      const abs = path.join(vault, nota);
      if (fs.statSync(abs).size <= MAX_NOTA) texto = fs.readFileSync(abs, 'utf8');
    } catch { continue; }
    const pastaNota = path.posix.dirname(nota);
    const relNaPasta = (alvo) => path.posix.normalize(path.posix.join(pastaNota, alvo));
    const alvos = new Set();
    for (const [, alvo] of texto.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
      const nome = semMd(path.posix.basename(alvo.split(/[|#]/)[0].trim())).toLowerCase();
      if (porNome.has(nome)) alvos.add(porNome.get(nome));
    }
    for (const [, alvo] of texto.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const c = relNaPasta(decodificar(alvo.split('#')[0]));
      if (ids.has(c)) alvos.add(c);
    }
    for (const [, alvo] of texto.matchAll(/`([^`\s]+)`/g)) {
      const limpo = alvo.replace(/\/+$/, '');
      const daRaiz = path.posix.normalize(limpo.replace(/^\/+/, ''));
      if (ids.has(daRaiz)) alvos.add(daRaiz);
      else if (ids.has(relNaPasta(limpo))) alvos.add(relNaPasta(limpo));
    }
    alvos.delete(nota);
    for (const para of alvos) ligacoes.push({ de: nota, para, tipo: 'link' });
  }
  return { nos, ligacoes };
}

// ---------- envio ----------
export function nomeDeEnvio(bruto) {
  const nome = String(bruto ?? '').split(/[\\/]/).pop().replace(/[\\/\0]/g, '').trim();
  return !nome || nome.startsWith('.') ? null : nome;
}

export function pastaDeEnvio(vault, rel) {
  const limpo = String(rel || 'conteudo/enviados').replace(/^[\\/]+/, '');
  const alvo = path.resolve(vault, limpo);
  if (dentro(vault, alvo) && !fs.existsSync(alvo)) {
    // só cria se o ancestral que já existe estiver dentro do cérebro (um link não pode levar a criação para fora)
    let existente = path.dirname(alvo);
    while (!fs.existsSync(existente)) existente = path.dirname(existente);
    if (dentro(vault, fs.realpathSync(existente))) fs.mkdirSync(alvo, { recursive: true });
  }
  const dir = resolverNoVault(vault, limpo);
  return dir && fs.statSync(dir).isDirectory() ? dir : null;
}

export function destinoLivre(dir, nome) {
  const ext = path.extname(nome);
  const base = nome.slice(0, nome.length - ext.length);
  let final = nome;
  for (let n = 2; fs.existsSync(path.join(dir, final)); n += 1) final = `${base}-${n}${ext}`;
  return path.join(dir, final);
}

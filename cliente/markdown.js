// Markdown só de leitura (visor, balões do WhatsApp, arquivos em guia).
// lerMarkdown e inline são puros e testados; renderizar monta nós DOM com textContent (nunca innerHTML),
// então nada vindo do cérebro vira HTML: script, iframe e object simplesmente não existem aqui.
import { separarFrontmatter, mdParaBlocos } from './blocos.js';

const LINHA_TABELA = /^\|.*\|\s*$/;
const SEPARADOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const celulas = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function lerMarkdown(md) {
  const { cabeca, corpo } = separarFrontmatter(String(md ?? ''));
  const crus = mdParaBlocos(corpo);
  const blocos = [];
  const ultimo = () => blocos.at(-1);
  const colado = (b) => (b.linhasEmBranco ?? 0) === 0;
  const item = (tipo, valor, b) => {
    const u = ultimo();
    if (u?.tipo === tipo && colado(b)) u.itens.push(valor);
    else blocos.push(tipo === 'numerada' ? { tipo, itens: [valor], inicio: b.num ?? 1 } : { tipo, itens: [valor] });
  };

  for (let i = 0; i < crus.length; i += 1) {
    const b = crus[i];
    if (b.tipo === 'paragrafo') {
      const t = b.texto;
      const titulo = /^(#{4,6}) (.*)$/.exec(t);
      const tarefa = /^[*+] \[([ xX])\] (.*)$/.exec(t);
      const marcador = /^[*+] (.*)$/.exec(t);
      const prox = crus[i + 1];
      if (titulo) blocos.push({ tipo: `h${titulo[1].length}`, texto: titulo[2] });
      else if (tarefa) item('tarefas', { texto: tarefa[2], feito: tarefa[1] !== ' ' }, b);
      else if (marcador) item('lista', marcador[1], b);
      else if (LINHA_TABELA.test(t) && prox?.tipo === 'paragrafo' && colado(prox) && SEPARADOR.test(prox.texto)) {
        const tabela = { tipo: 'tabela', cabeca: celulas(t), linhas: [] };
        i += 1;
        while (crus[i + 1]?.tipo === 'paragrafo' && colado(crus[i + 1]) && LINHA_TABELA.test(crus[i + 1].texto)) { i += 1; tabela.linhas.push(celulas(crus[i].texto)); }
        blocos.push(tabela);
      } else if (ultimo()?.tipo === 'p' && colado(b)) ultimo().linhas.push(t);
      else blocos.push({ tipo: 'p', linhas: [t] });
    } else if (b.tipo === 'lista') item('lista', b.texto, b);
    else if (b.tipo === 'numerada') item('numerada', b.texto, b);
    else if (b.tipo === 'tarefa') item('tarefas', { texto: b.texto, feito: Boolean(b.feito) }, b);
    else if (b.tipo === 'codigo') blocos.push({ tipo: 'codigo', texto: b.texto, lang: b.lang });
    else if (b.tipo === 'divisor') blocos.push({ tipo: 'hr' });
    else if (b.tipo === 'destaque') blocos.push({ tipo: 'destaque', texto: b.texto, lang: b.lang });
    else if (b.tipo === 'citacao') blocos.push({ tipo: 'citacao', texto: b.texto });
    else blocos.push({ tipo: b.tipo, texto: b.texto }); // h1, h2, h3
  }
  const dentro = cabeca.replace(/^---\r?\n/, '').replace(/\r?\n?---[ \t]*(\r?\n)?$/, '');
  return { cabeca: dentro, blocos };
}

const ALVO = String.raw`\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)`;
const PADROES = [
  ['codigo', /`([^`]+)`/y],
  ['embed', /!\[\[([^\]]+)\]\]/y],
  ['wiki', /\[\[([^\]]+)\]\]/y],
  ['img', new RegExp(String.raw`!\[([^\]]*)\]${ALVO}`, 'y')],
  ['link', new RegExp(String.raw`\[([^\]]+)\]${ALVO}`, 'y')],
  ['negrito', /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*|__(?=\S)([\s\S]+?)(?<=\S)__/y],
  ['italico', /\*(?=[^\s*])([\s\S]+?)(?<=[^\s*])\*|(?<!\w)_(?=\S)([\s\S]+?)(?<=\S)_(?!\w)/y],
];

export function inline(texto) {
  const saida = [];
  let solto = '';
  const soltar = () => { if (solto) { saida.push({ t: 'texto', v: solto }); solto = ''; } };
  for (let i = 0; i < texto.length;) {
    let achou = null;
    if ('`![*_'.includes(texto[i])) {
      for (const [tipo, re] of PADROES) {
        re.lastIndex = i;
        const m = re.exec(texto);
        if (m) { achou = { tipo, m }; break; }
      }
    }
    if (!achou) { solto += texto[i]; i += 1; continue; }
    soltar();
    const { tipo, m } = achou;
    if (tipo === 'codigo') saida.push({ t: 'codigo', v: m[1] });
    else if (tipo === 'embed') { const alvo = m[1].split('|')[0].trim(); saida.push({ t: 'img', src: alvo, alt: alvo, embed: true }); }
    else if (tipo === 'wiki') { const [alvo, rotulo] = m[1].split('|'); saida.push({ t: 'wiki', v: (rotulo ?? alvo).trim() }); }
    else if (tipo === 'img') saida.push({ t: 'img', src: m[2], alt: m[1] });
    else if (tipo === 'link') saida.push({ t: 'link', href: m[2], filhos: inline(m[1]) });
    else saida.push({ t: tipo, filhos: inline(m[1] ?? m[2]) });
    i += m[0].length;
  }
  soltar();
  return saida;
}

const decodificar = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function juntarCaminho(pasta, rel) {
  const partes = [];
  for (const p of `${pasta}/${rel}`.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') partes.pop(); else partes.push(p);
  }
  return partes.join('/');
}

export const urlArquivo = (caminho, baixar = false) => `/api/arquivo?caminho=${encodeURIComponent(caminho)}${baixar ? '&baixar=1' : ''}`;

// Imagem com caminho relativo vem do cérebro pela rota de arquivo; endereço externo, absoluto ou data: fica como está.
export function urlDeImagem(src, pasta, arquivos = []) {
  if (/^(https?:|data:)/i.test(src) || src.startsWith('/')) return src;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return '';
  const alvo = decodificar(src).toLowerCase();
  const porNome = arquivos.find((c) => c.split('/').pop().toLowerCase() === alvo);
  return urlArquivo(porNome ?? juntarCaminho(pasta, decodificar(src)));
}

// ---------- DOM (só no navegador) ----------
function el(tag, cls, texto) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
}

function pintarInline(alvo, tokens, op) {
  for (const k of tokens) {
    if (k.t === 'texto') alvo.append(k.v);
    else if (k.t === 'codigo') alvo.append(el('code', null, k.v));
    else if (k.t === 'wiki') alvo.append(el('strong', 'md-wiki', k.v));
    else if (k.t === 'negrito' || k.t === 'italico') { const e = el(k.t === 'negrito' ? 'strong' : 'em'); pintarInline(e, k.filhos, op); alvo.append(e); }
    else if (k.t === 'img') {
      const src = urlDeImagem(k.src, op.pasta, k.embed ? op.arquivos : []);
      if (!src) continue;
      const img = el('img');
      img.src = src;
      img.alt = k.alt;
      img.loading = 'lazy';
      alvo.append(img);
    } else if (k.t === 'link') {
      const a = el('a');
      pintarInline(a, k.filhos, op);
      if (/^(https?:|mailto:)/i.test(k.href)) { a.href = k.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      else if (!/^[a-z][a-z0-9+.-]*:/i.test(k.href) && op.abrir) {
        const caminho = juntarCaminho(op.pasta, decodificar(k.href.split('#')[0]));
        a.href = '#';
        a.addEventListener('click', (e) => { e.preventDefault(); op.abrir(caminho); });
      }
      alvo.append(a);
    }
  }
}

function comQuebras(alvo, linhas, op) {
  linhas.forEach((l, i) => { if (i) alvo.append(el('br')); pintarInline(alvo, inline(l), op); });
  return alvo;
}

// op = { pasta, arquivos, abrir(caminho) }: pasta da nota, caminhos conhecidos (para ![[x]]) e o que fazer num link interno.
export function renderizar(md, op = {}) {
  const o = { pasta: '', arquivos: [], ...op };
  const { cabeca, blocos } = lerMarkdown(md);
  const raiz = el('div', 'md');
  if (cabeca) raiz.append(el('pre', 'md-cabeca', cabeca));
  for (const b of blocos) {
    if (/^h[1-6]$/.test(b.tipo)) raiz.append(comQuebras(el(b.tipo), [b.texto], o));
    else if (b.tipo === 'p') raiz.append(comQuebras(el('p'), b.linhas, o));
    else if (b.tipo === 'lista' || b.tipo === 'numerada') {
      const lista = el(b.tipo === 'lista' ? 'ul' : 'ol');
      if (b.inicio && b.inicio !== 1) lista.start = b.inicio;
      for (const t of b.itens) lista.append(comQuebras(el('li'), [t], o));
      raiz.append(lista);
    } else if (b.tipo === 'tarefas') {
      const lista = el('ul', 'md-tarefas');
      for (const t of b.itens) {
        const li = el('li', t.feito ? 'feito' : '');
        const caixa = el('input');
        caixa.type = 'checkbox';
        caixa.checked = t.feito;
        caixa.disabled = true;
        li.append(caixa, ' ');
        lista.append(comQuebras(li, [t.texto], o));
      }
      raiz.append(lista);
    } else if (b.tipo === 'codigo') { const pre = el('pre'); pre.append(el('code', null, b.texto)); raiz.append(pre); }
    else if (b.tipo === 'hr') raiz.append(el('hr'));
    else if (b.tipo === 'citacao' || b.tipo === 'destaque') {
      const q = el('blockquote', b.tipo === 'destaque' ? 'md-destaque' : '');
      if (b.tipo === 'destaque') q.append(el('b', 'md-destaque-tipo', b.lang));
      raiz.append(comQuebras(q, b.texto.split('\n'), o));
    } else if (b.tipo === 'tabela') {
      const t = el('table');
      const cab = el('tr');
      for (const c of b.cabeca) cab.append(comQuebras(el('th'), [c], o));
      t.append(el('thead'));
      t.firstChild.append(cab);
      const corpo = el('tbody');
      for (const linha of b.linhas) { const tr = el('tr'); for (const c of linha) tr.append(comQuebras(el('td'), [c], o)); corpo.append(tr); }
      t.append(corpo);
      const caixa = el('div', 'md-tabela');
      caixa.append(t);
      raiz.append(caixa);
    }
  }
  return raiz;
}

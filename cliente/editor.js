// Editor de páginas em blocos. A página continua sendo um .md: o cabeçalho (frontmatter) fica intacto
// e o corpo é lido e gravado por blocos.js. "/" no começo de um bloco abre o menu de tipos.
// Salva sozinho; conflito (409) mantém o texto na tela; fechar a guia ainda salva o que faltava.
import { separarFrontmatter, mdParaBlocos, blocosParaMd } from './blocos.js';
import { el, api } from './comum.js';
import * as shell from './shell.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const LISTAS = ['lista', 'numerada', 'tarefa'];
const DICA = { paragrafo: "Digite '/' para escolher um bloco", h1: 'Título 1', h2: 'Título 2', h3: 'Título 3', lista: 'Item', numerada: 'Item', tarefa: 'Tarefa', citacao: 'Citação', destaque: 'Destaque' };
const MENU = [
  ['paragrafo', 'Texto', 'texto', 'paragrafo'], ['h1', 'Título 1', 'titulo', 'h1'], ['h2', 'Título 2', 'titulo', 'h2'], ['h3', 'Título 3', 'titulo', 'h3'],
  ['lista', 'Lista', 'lista', 'marcador'], ['numerada', 'Lista numerada', 'numerada', 'numero'], ['tarefa', 'Tarefa', 'tarefa', 'caixa'],
  ['citacao', 'Citação', 'citacao'], ['destaque', 'Destaque', 'destaque', 'aviso'], ['codigo', 'Código', 'codigo'], ['divisor', 'Divisor', 'divisor', 'linha'],
];
const ESPERA_SALVAR_MS = 800;

function montarPagina(area, guia) {
  let blocos = [];
  let cabeca = '';
  let mtime = 0;
  let sujo = false;
  let conflito = false;
  let enviando = false;
  let editou = false; // digitou durante um envio
  let timer = null;
  let menu = null; // { i, itens, sel, caixa }

  const estado = el('span', { class: 'editor-estado', role: 'status' });
  const aviso = el('div', { class: 'editor-aviso', role: 'alert', hidden: true });
  const corpo = el('div', { class: 'editor-corpo' });
  const fim = el('div', { class: 'editor-fim', 'aria-hidden': 'true' });
  area.append(el('div', { class: 'editor' }, el('div', { class: 'editor-topo' }, el('span', { class: 'editor-nome' }, guia.caminho), estado), aviso, corpo, fim));

  const url = () => `/api/pagina?caminho=${encodeURIComponent(guia.caminho)}`;
  const textoCompleto = () => cabeca + blocosParaMd(blocos);

  // ---------- salvar ----------
  function marcar() {
    sujo = true;
    if (enviando) editou = true;
    estado.textContent = 'Editando…';
    clearTimeout(timer);
    if (!conflito) timer = setTimeout(salvar, ESPERA_SALVAR_MS);
  }

  async function salvar() {
    if (!sujo || enviando || conflito) return;
    enviando = true;
    estado.textContent = 'Salvando…';
    sujo = false;
    editou = false;
    try {
      const d = await api('/api/pagina', { metodo: 'PUT', corpo: { caminho: guia.caminho, texto: textoCompleto(), mtime } });
      mtime = d.mtime;
      estado.textContent = sujo ? 'Editando…' : 'Salvo';
    } catch (e) {
      sujo = true;
      if (e.status === 409) { conflito = true; mostrarConflito(); } else estado.textContent = e.status ? e.message : 'Sem conexão: tento de novo na próxima edição';
    }
    enviando = false;
    if (editou && !conflito) salvar(); // o que foi digitado durante o envio não espera a próxima tecla
  }

  function mostrarConflito() {
    estado.textContent = 'Não salvo';
    aviso.hidden = false;
    aviso.replaceChildren(
      el('span', {}, 'Este arquivo mudou fora do painel. O que você digitou continua aqui, sem salvar.'),
      el('button', { type: 'button', class: 'bt', onclick: async () => { conflito = false; sujo = false; aviso.hidden = true; await carregar(); } }, 'Usar a versão do arquivo'),
      el('button', { type: 'button', class: 'bt primario', onclick: async () => {
        try { mtime = (await api(url())).mtime; } catch { return; }
        conflito = false; aviso.hidden = true; sujo = true; salvar(); // grava por cima: a pessoa escolheu o texto dela
      } }, 'Manter o meu texto'));
  }

  // fechar a guia: o salvar normal ainda roda; sair da página: só cabe um envio keepalive (limite de uns 64 KB)
  function descarregar(aoSair) {
    clearTimeout(timer);
    if (conflito || enviando || !sujo) return;
    if (!aoSair) { salvar(); return; }
    const pedido = JSON.stringify({ caminho: guia.caminho, texto: textoCompleto(), mtime });
    sujo = false;
    fetch('/api/pagina', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, keepalive: pedido.length < 60_000, body: pedido }).catch(() => {});
  }
  const aoSairDaPagina = () => descarregar(true);
  const avisarSaida = (e) => { if (sujo || enviando || conflito) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('pagehide', aoSairDaPagina);
  window.addEventListener('beforeunload', avisarSaida);

  // ---------- desenho ----------
  const lerCampo = (c) => (c.tagName === 'TEXTAREA' ? c.value : c.innerText.replace(/\n+$/, ''));

  function posicao(c) {
    if (c.tagName === 'TEXTAREA') return c.selectionStart;
    const s = getSelection();
    if (!s.rangeCount) return 0;
    const r = s.getRangeAt(0);
    const antes = document.createRange();
    antes.selectNodeContents(c);
    antes.setEnd(r.endContainer, r.endOffset);
    return antes.toString().length;
  }

  function focar(i, pos = 0) {
    const linha = corpo.querySelector(`[data-i="${i}"]`);
    if (!linha) return;
    const c = linha.querySelector('.bloco-texto');
    if (!c) { linha.focus(); return; }
    c.focus();
    const alvo = pos === 'fim' ? lerCampo(c).length : pos;
    if (c.tagName === 'TEXTAREA') { c.setSelectionRange(alvo, alvo); return; }
    const no = c.firstChild;
    const r = document.createRange();
    if (no) r.setStart(no, Math.min(alvo, no.length)); else r.setStart(c, 0);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }

  const ajustarAltura = (t) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; };

  function desenhar() {
    fecharMenu();
    corpo.replaceChildren();
    let num = 0;
    blocos.forEach((b, i) => {
      if (b.tipo === 'numerada') num = b.num ?? (blocos[i - 1]?.tipo === 'numerada' ? num + 1 : 1);
      corpo.append(linha(b, i, num));
    });
    requestAnimationFrame(() => corpo.querySelectorAll('textarea').forEach(ajustarAltura));
  }

  function linha(b, i, num) {
    const row = el('div', { class: `bloco bloco-${b.tipo}`, dados: { i } });
    if (b.tipo === 'divisor') {
      row.tabIndex = 0;
      row.setAttribute('aria-label', 'Divisor (Backspace apaga)');
      row.append(el('hr'));
      row.addEventListener('keydown', (e) => { if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); remover(i); } });
      return row;
    }
    const marca = el('span', { class: 'bloco-marca' });
    if (b.tipo === 'lista') marca.textContent = '•';
    if (b.tipo === 'numerada') marca.textContent = `${num}.`;
    if (b.tipo === 'tarefa') {
      const caixa = el('input', { type: 'checkbox', checked: Boolean(b.feito), 'aria-label': 'Feito' });
      caixa.addEventListener('change', () => { b.feito = caixa.checked; marcar(); });
      marca.append(caixa);
    }
    let campo;
    if (b.tipo === 'codigo') {
      campo = el('textarea', { class: 'bloco-texto', spellcheck: 'false', 'aria-label': 'Código' });
      campo.value = b.texto;
      const lang = el('input', { class: 'codigo-lang', placeholder: 'linguagem', 'aria-label': 'Linguagem do código' });
      lang.value = b.lang || '';
      lang.addEventListener('input', () => { b.lang = lang.value.trim(); marcar(); });
      row.append(lang);
    } else {
      campo = el('div', { class: 'bloco-texto', role: 'textbox', 'aria-multiline': 'true', 'aria-label': DICA[b.tipo] ?? 'Texto', dados: { ph: DICA[b.tipo] ?? '' } }, b.texto || null);
      campo.contentEditable = 'plaintext-only';
    }
    campo.addEventListener('input', () => {
      b.texto = lerCampo(campo);
      if (campo.tagName === 'TEXTAREA') ajustarAltura(campo);
      if (b.tipo !== 'codigo' && /^\/\S*$/.test(b.texto)) abrirMenu(i, b.texto.slice(1)); else fecharMenu();
      marcar();
    });
    campo.addEventListener('keydown', (e) => teclas(e, b, i, campo));
    row.prepend(marca);
    row.append(campo);
    return row;
  }

  // ---------- edição ----------
  function remover(i) {
    blocos.splice(i, 1);
    if (!blocos.length) blocos.push({ tipo: 'paragrafo', texto: '' });
    desenhar();
    focar(Math.max(0, i - 1), 'fim');
    marcar();
  }

  function paraTexto(b) { b.tipo = 'paragrafo'; delete b.num; delete b.feito; delete b.lang; delete b.dobra; }

  function teclas(e, b, i, campo) {
    if (menu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); menu.sel = (menu.sel + (e.key === 'ArrowDown' ? 1 : -1) + menu.itens.length) % (menu.itens.length || 1); pintarMenu(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (menu.itens.length) aplicar(i, menu.itens[menu.sel][0]); else fecharMenu(); return; }
      if (e.key === 'Escape') { e.preventDefault(); fecharMenu(); return; }
    }
    const pos = posicao(campo);
    const simples = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
    const colapsado = campo.tagName === 'TEXTAREA' ? campo.selectionStart === campo.selectionEnd : getSelection().isCollapsed;
    if (e.key === 'Enter' && simples && b.tipo !== 'codigo') {
      e.preventDefault();
      const lista = LISTAS.includes(b.tipo);
      if (lista && b.texto === '') { paraTexto(b); desenhar(); focar(i, 0); marcar(); return; }
      const depois = b.texto.slice(pos);
      b.texto = b.texto.slice(0, pos);
      const novo = { tipo: lista ? b.tipo : 'paragrafo', texto: depois };
      if (b.tipo === 'tarefa') novo.feito = false;
      blocos.splice(i + 1, 0, novo);
      desenhar();
      focar(i + 1, 0);
      marcar();
    } else if (e.key === 'Backspace' && simples && colapsado && pos === 0) {
      if (b.tipo !== 'paragrafo') { e.preventDefault(); paraTexto(b); desenhar(); focar(i, 0); marcar(); return; }
      const ant = blocos[i - 1];
      if (!ant) return;
      e.preventDefault();
      if (ant.tipo === 'divisor' || ant.tipo === 'codigo') { if (b.texto === '') remover(i); return; }
      const junta = ant.texto.length;
      ant.texto += b.texto;
      blocos.splice(i, 1);
      desenhar();
      focar(i - 1, junta);
      marcar();
    } else if (e.key === 'ArrowUp' && simples && colapsado && pos === 0 && i > 0) {
      e.preventDefault(); focar(i - 1, 'fim');
    } else if (e.key === 'ArrowDown' && simples && colapsado && pos === b.texto.length && i < blocos.length - 1) {
      e.preventDefault(); focar(i + 1, 0);
    }
  }

  // ---------- menu "/" ----------
  function abrirMenu(i, consulta) {
    const q = norm(consulta);
    const itens = MENU.filter((m) => !q || m.slice(1).some((k) => norm(k).includes(q)));
    if (!menu) menu = { caixa: el('div', { class: 'menu editor-menu', role: 'listbox', 'aria-label': 'Tipos de bloco' }) };
    Object.assign(menu, { i, itens, sel: 0 });
    const row = corpo.querySelector(`[data-i="${i}"]`);
    menu.caixa.style.top = `${row.offsetTop + row.offsetHeight + 4}px`;
    menu.caixa.style.left = `${row.offsetLeft + 26}px`;
    if (!menu.caixa.isConnected) corpo.append(menu.caixa);
    pintarMenu();
  }
  function pintarMenu() {
    menu.caixa.replaceChildren(...(menu.itens.length
      ? menu.itens.map((m, k) => el('button', {
        type: 'button', role: 'option', 'aria-selected': String(k === menu.sel), class: k === menu.sel ? 'ativo' : '', tabindex: '-1',
        onmousedown: (e) => { e.preventDefault(); aplicar(menu.i, m[0]); },
      }, m[1]))
      : [el('p', { class: 'vazio' }, 'Nenhum bloco com esse nome')]));
  }
  function fecharMenu() { if (menu) { menu.caixa.remove(); menu = null; } }

  function aplicar(i, tipo) {
    const b = blocos[i];
    b.tipo = tipo;
    b.texto = '';
    for (const k of ['feito', 'num', 'lang', 'dobra', 'linhasEmBranco']) delete b[k];
    if (tipo === 'tarefa') b.feito = false;
    if (tipo === 'destaque') b.lang = 'note';
    if (tipo === 'divisor') { blocos.splice(i + 1, 0, { tipo: 'paragrafo', texto: '' }); desenhar(); focar(i + 1, 0); } else { desenhar(); focar(i, 0); }
    marcar();
  }

  fim.addEventListener('click', () => {
    const ultimo = blocos.at(-1);
    if (!ultimo || ultimo.tipo !== 'paragrafo' || ultimo.texto !== '') { blocos.push({ tipo: 'paragrafo', texto: '' }); desenhar(); marcar(); }
    focar(blocos.length - 1, 0);
  });

  async function carregar() {
    corpo.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
    try {
      const d = await api(url());
      mtime = d.mtime;
      const partes = separarFrontmatter(d.texto);
      cabeca = partes.cabeca;
      blocos = mdParaBlocos(partes.corpo);
      if (!blocos.length) blocos = [{ tipo: 'paragrafo', texto: '' }];
      estado.textContent = 'Salvo';
      desenhar();
    } catch (e) { corpo.replaceChildren(el('p', { class: 'vazio' }, e.message || 'Não consegui abrir esta página.')); }
  }
  carregar();

  return {
    limpar() {
      descarregar(false);
      window.removeEventListener('pagehide', aoSairDaPagina);
      window.removeEventListener('beforeunload', avisarSaida);
      fecharMenu();
    },
    // com conflito aberto, fechar perderia o texto: a guia fica e o aviso pisca
    podeFechar() {
      if (!conflito) return true;
      shell.abrir(guia);
      aviso.classList.remove('piscar');
      void aviso.offsetWidth;
      aviso.classList.add('piscar');
      return false;
    },
  };
}

shell.registrar('pagina', montarPagina);

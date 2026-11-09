// Desenho livre, notas adesivas e borracha sobre uma área de trabalho com câmera (Conversas e Criação).
// Os traços e as notas moram no objeto que alvo() devolve (alvo().tracos e alvo().notas); quem usa decide onde isso é salvo.
import { el, icone, botaoIcone } from './comum.js';
import * as G from './lousa-geo.js';

const SVG = 'http://www.w3.org/2000/svg';
const COR_NOTA = '#FFE066';
const FERRAMENTAS = [['caneta', 'caneta', 'Desenho livre'], ['nota', 'postit', 'Nota adesiva'], ['borracha', 'borracha', 'Borracha: apaga o traço inteiro']];
const CORES_TRACO = [['ink', 'Tinta'], ['#E2553B', 'Vermelho'], ['#E3A008', 'Amarelo'], ['#2F6FEB', 'Azul'], ['#0F8F6E', 'Verde']];

const caminhoSvg = (p) => {
  if (p.length === 1) return `M${p[0][0]} ${p[0][1]} l0.01 0`;
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) d += ` Q${p[i][0]} ${p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${(p[i][1] + p[i + 1][1]) / 2}`;
  return `${d} L${p.at(-1)[0]} ${p.at(-1)[1]}`;
};

// mundo: elemento que recebe a transformação da câmera; palco: onde o ponteiro é capturado.
// paraMundo(clientX, clientY) -> {x, y}; zoom() -> escala atual; salvar() grava; proximoZ() põe a nota por cima;
// aoMudar() avisa que algo foi criado ou apagado; adicionar (opcional) é o "+" que abre Conteúdos.
export function criarDesenho({ mundo, palco, alvo, paraMundo, zoom, salvar, proximoZ = () => 1, aoMudar = () => {}, adicionar = null }) {
  const tracosSvg = document.createElementNS(SVG, 'svg'); // por cima de tudo, sem pegar o mouse
  tracosSvg.setAttribute('class', 'video-tracos');
  tracosSvg.setAttribute('aria-hidden', 'true');
  mundo.append(tracosSvg);
  let ferr = null; // caneta, nota ou borracha (ou nenhuma)
  let corTraco = 'ink';
  const notas = new Map(); // id da nota -> elemento

  const botoesFerr = FERRAMENTAS.map(([id, ic, nome]) => el('button', {
    type: 'button', class: 'video-ferr', title: nome, 'aria-label': nome, 'aria-pressed': 'false', dados: { ferr: id }, onclick: () => escolher(ferr === id ? null : id),
  }, icone(ic)));
  const botoesCor = CORES_TRACO.map(([c, nome]) => el('button', {
    type: 'button', class: 'video-cor', title: nome, 'aria-label': `Cor: ${nome}`, 'aria-pressed': String(c === corTraco), dados: { cor: c },
    style: `background:${c === 'ink' ? 'var(--texto)' : c}`, onclick: () => { corTraco = c; for (const b of botoesCor) b.setAttribute('aria-pressed', String(b.dataset.cor === c)); },
  }));
  const barraCores = el('div', { class: 'video-cores', hidden: true }, botoesCor);
  const mais = adicionar ? [el('button', { type: 'button', class: 'video-ferr', title: 'Adicionar imagem ou vídeo (abre Conteúdos)', 'aria-label': 'Adicionar imagem ou vídeo', onclick: adicionar }, icone('mais')), el('span', { class: 'video-ferr-traco', 'aria-hidden': 'true' })] : [];
  const barra = el('div', { class: 'video-ferramentas', role: 'toolbar', 'aria-label': 'Desenho, notas e borracha' }, mais, botoesFerr, barraCores);

  const dados = () => {
    const a = alvo();
    if (!Array.isArray(a.tracos)) a.tracos = [];
    if (!Array.isArray(a.notas)) a.notas = [];
    return a;
  };

  function elementoTraco(t) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', caminhoSvg(t.p));
    p.setAttribute('class', 'video-traco');
    p.style.stroke = t.c === 'ink' ? 'var(--texto)' : t.c;
    p.style.strokeWidth = String(t.s);
    return p;
  }
  const pintarTracos = () => tracosSvg.replaceChildren(...dados().tracos.map(elementoTraco));

  function pintarNota(n) {
    let t;
    const area = el('textarea', { class: 'video-nota-texto', placeholder: 'Escreva aqui…', 'aria-label': 'Nota adesiva', rows: 4 });
    area.value = n.texto ?? '';
    area.addEventListener('input', () => { n.texto = area.value; clearTimeout(t); t = setTimeout(salvar, 400); });
    area.addEventListener('pointerdown', (e) => e.stopPropagation());
    const topo = el('div', { class: 'video-nota-topo' }, botaoIcone('x', 'Excluir nota', () => removerNota(n.id), 'pequeno video-nota-x'));
    const c = el('div', { class: 'video-nota', dados: { nota: n.id } }, topo, area);
    Object.assign(c.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${n.w}px`, height: `${n.h}px`, background: n.cor ?? COR_NOTA, zIndex: String(proximoZ()) });
    c.addEventListener('pointerdown', () => { c.style.zIndex = String(proximoZ()); });
    topo.addEventListener('pointerdown', (e) => arrastarNota(e, n, c));
    mundo.append(c);
    notas.set(n.id, c);
    return area;
  }
  function removerNota(id) {
    const a = dados();
    a.notas = a.notas.filter((n) => n.id !== id);
    notas.get(id)?.remove();
    notas.delete(id);
    aoMudar();
    salvar();
  }
  function arrastarNota(e, n, c) {
    if (e.button !== 0 || e.target.closest('button')) return;
    const ini = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y };
    e.preventDefault();
    e.stopPropagation();
    const topo = e.currentTarget;
    topo.setPointerCapture(e.pointerId);
    const mover = (m) => { n.x = Math.round(ini.nx + (m.clientX - ini.x) / zoom()); n.y = Math.round(ini.ny + (m.clientY - ini.y) / zoom()); c.style.left = `${n.x}px`; c.style.top = `${n.y}px`; };
    const soltar = () => { topo.removeEventListener('pointermove', mover); salvar(); };
    topo.addEventListener('pointermove', mover);
    topo.addEventListener('pointerup', soltar, { once: true });
    topo.addEventListener('pointercancel', soltar, { once: true });
  }

  function escolher(f) {
    ferr = f;
    for (const b of botoesFerr) b.setAttribute('aria-pressed', String(b.dataset.ferr === f));
    barraCores.hidden = f !== 'caneta';
    palco.classList.toggle('desenhando', !!f);
    palco.dataset.ferr = f ?? '';
  }

  // usa a ferramenta escolhida no ponto clicado
  function usar(e) {
    e.preventDefault();
    const p = paraMundo(e.clientX, e.clientY);
    if (ferr === 'nota') {
      const n = { id: crypto.randomUUID(), x: Math.round(p.x - 80), y: Math.round(p.y - 60), w: 170, h: 150, cor: COR_NOTA, texto: '' };
      dados().notas.push(n);
      const area = pintarNota(n);
      escolher(null);
      aoMudar();
      salvar();
      setTimeout(() => area.focus(), 0);
      return;
    }
    palco.setPointerCapture(e.pointerId);
    if (ferr === 'caneta') {
      const traco = { id: crypto.randomUUID(), t: 'stroke', tool: 'pen', c: corTraco, s: Math.max(2, 3 / zoom()), p: [[p.x, p.y]] };
      const vivo = elementoTraco(traco);
      tracosSvg.append(vivo);
      const mover = (m) => { const q = paraMundo(m.clientX, m.clientY); traco.p.push([q.x, q.y]); vivo.setAttribute('d', caminhoSvg(traco.p)); };
      const soltar = () => {
        palco.removeEventListener('pointermove', mover);
        if (traco.p.length < 2) traco.p.push([traco.p[0][0] + 0.01, traco.p[0][1]]);
        traco.p = G.densificar(traco.p, 3);
        dados().tracos.push(traco);
        pintarTracos();
        aoMudar();
        salvar();
      };
      palco.addEventListener('pointermove', mover);
      palco.addEventListener('pointerup', soltar, { once: true });
      palco.addEventListener('pointercancel', soltar, { once: true });
      return;
    }
    // borracha: passa por cima de um traço e ele some inteiro (cards, nós e notas não são tocados)
    let ultimo = p; let mudou = false;
    const apagar = (q) => {
      const r = G.apagarInteiro(dados().tracos, q.x, q.y, 10 / zoom());
      if (r.mudou) { alvo().tracos = r.objs; mudou = true; pintarTracos(); }
    };
    apagar(p);
    const mover = (m) => {
      const q = paraMundo(m.clientX, m.clientY);
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - ultimo.x, q.y - ultimo.y) * zoom() / 6));
      for (let i = 1; i <= n; i += 1) apagar({ x: ultimo.x + ((q.x - ultimo.x) * i) / n, y: ultimo.y + ((q.y - ultimo.y) * i) / n });
      ultimo = q;
    };
    const soltar = () => { palco.removeEventListener('pointermove', mover); if (mudou) { aoMudar(); salvar(); } };
    palco.addEventListener('pointermove', mover);
    palco.addEventListener('pointerup', soltar, { once: true });
    palco.addEventListener('pointercancel', soltar, { once: true });
  }

  // redesenha tudo a partir do alvo (ao trocar de sessão ou de conversa)
  function carregar() {
    for (const n of notas.values()) n.remove();
    notas.clear();
    dados().notas.forEach(pintarNota);
    pintarTracos();
  }

  return {
    barra,
    carregar,
    usar,
    escolher,
    ferramenta: () => ferr,
    temAlgo: () => dados().tracos.length > 0 || dados().notas.length > 0,
  };
}

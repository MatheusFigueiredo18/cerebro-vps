// Guia fixa do grafo: pastas, notas e mídias ligadas por links, com simulação de forças, zoom e arrastar.
import { el, api, icone } from './comum.js';
import { posicaoInicial, passo, raioDe } from './grafo-fisica.js';
import { zoomEm, pinca } from './camera.js';
import * as shell from './shell.js';
import { abrirCaminho } from './lateral.js';

const PASSOS_ANTES = 300;
const ZOOM = [0.1, 4];
const RITMO_FUNDO_MS = 120; // aba do navegador em segundo plano: segue andando, mais devagar

function montarGrafo(corpo) {
  const canvas = el('canvas', { class: 'grafo-canvas', role: 'img', 'aria-label': 'Grafo das notas, pastas e mídias do cérebro' });
  const etiqueta = el('div', { class: 'grafo-etiqueta', hidden: true });
  const legenda = el('div', { class: 'grafo-legenda' },
    ...[['pasta', 'Pasta'], ['nota', 'Nota'], ['midia', 'Mídia']].map(([t, n]) => el('span', {}, el('i', { class: `ponto ${t}` }), n)));
  const vazio = el('p', { class: 'vazio grafo-vazio', hidden: true }, 'Nada para mostrar ainda. Crie uma página na lateral.');
  // botões de zoom: no celular o gesto de pinça pode falhar em alguns navegadores, e no computador ajudam quem não usa a roda
  const botaoZoom = (nome, rotulo, acao) => {
    const b = el('button', { type: 'button', class: 'grafo-zoom-btn', 'aria-label': rotulo, title: rotulo }, icone(nome));
    b.addEventListener('click', acao);
    return b;
  };
  const zoomCentro = (fator) => {
    if (!cam) return;
    const r = canvas.getBoundingClientRect();
    cam = zoomEm(cam, r.width / 2, r.height / 2, fator, ...ZOOM);
    desenhar();
  };
  const zoomBotoes = el('div', { class: 'grafo-zoom' },
    botaoZoom('mais', 'Aproximar', () => zoomCentro(1.4)),
    botaoZoom('menos', 'Afastar', () => zoomCentro(1 / 1.4)),
    botaoZoom('alvo', 'Enquadrar tudo', () => { if (nos.length) { enquadrar(); desenhar(); } }));
  corpo.classList.add('grafo');
  corpo.append(canvas, legenda, zoomBotoes, etiqueta, vazio);
  const ctx = canvas.getContext('2d');

  let nos = [];
  let ligacoes = [];
  let vizinhos = new Map();
  const memoria = new Map(); // posição de cada nó entre aberturas
  let cam = null;
  let calor = 1;
  let visivel = true;
  let laco = null;
  let sobre = null;
  let arraste = null; // { tipo: 'no'|'fundo', ... }
  const dedos = new Map(); // ponteiros ativos (id -> posição relativa ao canvas), para a pinça de dois dedos
  let pincando = null; // { a0, b0, cam } no momento em que o segundo dedo tocou
  let cores = {};

  const lerCores = () => {
    const s = getComputedStyle(document.documentElement);
    cores = Object.fromEntries(['pasta', 'nota', 'midia', 'linha', 'acento', 'texto', 'texto-2', 'fundo'].map((k) => [k, s.getPropertyValue(`--grafo-${k}`).trim() || s.getPropertyValue(`--${k}`).trim()]));
  };
  document.addEventListener('tema-mudou', () => { lerCores(); desenhar(); });

  function medir() {
    const dpr = window.devicePixelRatio || 1;
    const w = corpo.clientWidth;
    const h = corpo.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    return { w, h, dpr };
  }

  function enquadrar() {
    const { w, h } = medir();
    if (!nos.length) { cam = { x: w / 2, y: h / 2, z: 1 }; return; }
    const xs = nos.map((n) => n.x);
    const ys = nos.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const z = Math.min(1.4, Math.max(ZOOM[0], Math.min((w - 120) / (x1 - x0 || 1), (h - 120) / (y1 - y0 || 1))));
    cam = { x: w / 2 - ((x0 + x1) / 2) * z, y: h / 2 - ((y0 + y1) / 2) * z, z };
  }

  async function carregar() {
    let d;
    try { d = await api('/api/grafo'); } catch { return; }
    const indice = new Map(d.nos.map((n, i) => [n.id, i]));
    const grau = new Map();
    ligacoes = d.ligacoes.filter((l) => indice.has(l.de) && indice.has(l.para)).map((l) => {
      grau.set(l.de, (grau.get(l.de) ?? 0) + 1);
      grau.set(l.para, (grau.get(l.para) ?? 0) + 1);
      return { a: indice.get(l.de), b: indice.get(l.para), tipo: l.tipo };
    });
    const novos = !memoria.size;
    nos = d.nos.map((n, i) => {
      const antes = memoria.get(n.id);
      return { ...n, ...(antes ?? posicaoInicial(i)), vx: 0, vy: 0, r: raioDe(n.tipo, grau.get(n.id) ?? 0), raiz: n.tipo === 'pasta' && !n.id.includes('/') };
    });
    vizinhos = new Map(nos.map((_, i) => [i, new Set()]));
    for (const l of ligacoes) { vizinhos.get(l.a).add(l.b); vizinhos.get(l.b).add(l.a); }
    vazio.hidden = nos.length > 0;
    if (novos) { for (let i = 0; i < PASSOS_ANTES; i += 1) passo(nos, ligacoes, 1 - i / PASSOS_ANTES); calor = 0.3; } else calor = 0.5;
    if (!cam || novos) enquadrar();
    lerCores();
    animar();
  }

  function desenhar() {
    if (!cam) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * cam.x, dpr * cam.y);
    const foco = sobre ?? (arraste?.tipo === 'no' ? arraste.i : null);
    const perto = foco === null ? null : vizinhos.get(foco);
    ctx.lineWidth = 1 / cam.z;
    for (const l of ligacoes) {
      const a = nos[l.a];
      const b = nos[l.b];
      const realce = foco !== null && (l.a === foco || l.b === foco);
      ctx.globalAlpha = foco === null ? (l.tipo === 'pasta' ? 0.35 : 0.6) : realce ? 0.95 : 0.08;
      ctx.strokeStyle = realce ? cores.acento : cores.linha;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    nos.forEach((n, i) => {
      ctx.globalAlpha = foco === null || i === foco || perto.has(i) ? 1 : 0.18;
      ctx.fillStyle = i === foco ? cores.acento : cores[n.tipo];
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.font = `${12 / cam.z}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    nos.forEach((n, i) => {
      const mostra = n.raiz || cam.z > 1.6 || i === foco || (perto?.has(i) && cam.z > 0.9);
      if (!mostra) return;
      ctx.globalAlpha = foco === null || i === foco || perto.has(i) ? 0.9 : 0.15;
      ctx.fillStyle = n.raiz ? cores.texto : cores['texto-2'];
      ctx.fillText(n.nome, n.x, n.y + n.r + 3 / cam.z);
    });
    ctx.globalAlpha = 1;
  }

  function quadro() {
    laco = null;
    if (!visivel) return;
    if (calor > 0.005 || arraste?.tipo === 'no') {
      const e = passo(nos, ligacoes, Math.max(calor, arraste?.tipo === 'no' ? 0.3 : 0));
      calor *= 0.985;
      if (e < 0.02 && !arraste) calor = 0;
    }
    desenhar();
    if (calor > 0.005 || arraste) laco = document.hidden ? setTimeout(quadro, RITMO_FUNDO_MS) : requestAnimationFrame(quadro);
  }
  function animar() { if (!laco) quadro(); else desenhar(); }

  // ---------- ponteiro ----------
  const mundo = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - cam.x) / cam.z, y: (e.clientY - r.top - cam.y) / cam.z, sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  function noEm(p) {
    let melhor = null;
    let dist = Infinity;
    nos.forEach((n, i) => { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < Math.max(n.r + 4 / cam.z, 8 / cam.z) && d < dist) { dist = d; melhor = i; } });
    return melhor;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!cam) return;
    canvas.setPointerCapture(e.pointerId);
    const p = mundo(e);
    dedos.set(e.pointerId, { x: p.sx, y: p.sy });
    if (dedos.size === 2) { // segundo dedo: passa a ser pinça e cancela qualquer arraste em andamento
      if (arraste?.tipo === 'no') nos[arraste.i].fixo = false;
      arraste = null;
      const [a, b] = [...dedos.values()];
      pincando = { a0: { ...a }, b0: { ...b }, cam: { ...cam } };
      return;
    }
    if (dedos.size > 2) return;
    const i = noEm(p);
    arraste = i === null ? { tipo: 'fundo', x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moveu: false } : { tipo: 'no', i, moveu: false, x: e.clientX, y: e.clientY };
    if (i !== null) { nos[i].fixo = true; calor = Math.max(calor, 0.3); animar(); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cam) return;
    const p = mundo(e);
    if (dedos.has(e.pointerId)) dedos.set(e.pointerId, { x: p.sx, y: p.sy });
    if (pincando && dedos.size >= 2) {
      const [a1, b1] = [...dedos.values()];
      cam = pinca(pincando.cam, pincando.a0, pincando.b0, a1, b1, ...ZOOM);
      desenhar();
      return;
    }
    if (arraste) {
      if (Math.hypot(e.clientX - arraste.x, e.clientY - arraste.y) > 4) arraste.moveu = true;
      if (arraste.tipo === 'fundo') { cam.x = arraste.cx + e.clientX - arraste.x; cam.y = arraste.cy + e.clientY - arraste.y; desenhar(); }
      else { const n = nos[arraste.i]; n.x = p.x; n.y = p.y; calor = Math.max(calor, 0.3); animar(); }
      return;
    }
    const i = noEm(p);
    canvas.style.cursor = i === null ? 'grab' : 'pointer';
    if (i !== sobre) { sobre = i; desenhar(); }
    etiqueta.hidden = i === null;
    if (i !== null) { etiqueta.textContent = nos[i].id; etiqueta.style.left = `${p.sx + 14}px`; etiqueta.style.top = `${p.sy + 10}px`; }
  });
  const soltar = (e) => {
    if (e?.pointerId !== undefined) dedos.delete(e.pointerId);
    if (pincando) { // acabou a pinça: não abre nota nem arrasta com o dedo que sobrou
      if (dedos.size < 2) pincando = null;
      arraste = null;
      animar();
      return;
    }
    if (!arraste) return;
    const a = arraste;
    arraste = null;
    if (a.tipo === 'no') {
      nos[a.i].fixo = false;
      if (!a.moveu && nos[a.i].tipo !== 'pasta') abrirCaminho(nos[a.i].id);
    }
    animar();
  };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('pointerleave', () => { if (!arraste && sobre !== null) { sobre = null; etiqueta.hidden = true; desenhar(); } });
  canvas.addEventListener('wheel', (e) => {
    if (!cam) return;
    e.preventDefault();
    const p = mundo(e);
    cam = zoomEm(cam, p.sx, p.sy, Math.exp(-e.deltaY * (e.ctrlKey ? 0.004 : 0.0015)), ...ZOOM);
    desenhar();
  }, { passive: false });

  const aoRedimensionar = () => { if (visivel && cam) { medir(); desenhar(); } };
  window.addEventListener('resize', aoRedimensionar);
  new ResizeObserver(aoRedimensionar).observe(corpo);

  carregar();
  return {
    mostrar() { visivel = true; carregar(); },
    esconder() {
      visivel = false;
      for (const n of nos) memoria.set(n.id, { x: n.x, y: n.y });
      if (laco) { cancelAnimationFrame(laco); clearTimeout(laco); laco = null; }
    },
  };
}

shell.registrar('grafo', montarGrafo);

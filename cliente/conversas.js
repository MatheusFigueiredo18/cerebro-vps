// Função Conversas: canvas com cards arrastáveis e zoom (terminal, subagentes, mídias), terminal xterm por WebSocket,
// lista de conversas à direita, "comece aqui", seletor de motor e o histórico das conversas do WhatsApp.
import { el, api, icone, botaoIcone, logo, ler, guardar, emitir, avisar, hora, botaoConfirmar } from './comum.js';
import { lerNota, nomeBase, tipoArquivo } from './formatos.js';
import { chaveDoMotor } from './marcas.js';
import { zoomEm, pinca as pincaCam, enquadrar, layoutFilhos } from './camera.js';
import { renderizar, urlArquivo } from './markdown.js';
import * as shell from './shell.js';
import { abrirFuncao } from './lateral.js';

const CONSULTA_MS = 2000;
const ZOOM = [0.2, 2];
const TERMINAL = { w: 860, h: 540 };
const HISTORICO = { w: 620, h: 600 };
const BOAS_VINDAS = { w: 520, h: 215 };
const VENDOR = '/vendor';

let lista = [];
let ativa = ler('conversaAtiva', null);
const assumidas = new Set(ler('assumidas', []));
const terminais = new Map(); // id -> { term, fit, host, ws, aberto }
let ui = null; // partes da tela quando a guia está montada
let primeiros = null;
let focarAoAbrir = null;

const conversa = (id) => lista.find((c) => c.id === id);
const chaveEspaco = () => `espaco:${ativa ?? 'mesa'}`;

// ---------- API pública (outras telas pedem conversas por aqui) ----------
export async function novaConversa({ motor, pedido } = {}) {
  abrirFuncao('conversas');
  fecharSeletor();
  let c;
  try { c = await api('/api/conversas', { metodo: 'POST', corpo: { motor, cols: 104, rows: 30, pedido } }); } catch (e) { avisar(e.message, 'erro'); return; }
  await atualizarEstado();
  if (!conversa(c.id)) lista.push({ ...c, titulo: `Conversa ${c.numero}`, nota: '', ativo: true, subagentes: [], midias: [], motorNome: c.motor });
  focarAoAbrir = c.id; // o terminal ganha foco quando terminar de montar
  trocar(c.id);
}
export const pedirNaConversa = (pedido) => novaConversa({ motor: 'claude', pedido });

// ---------- estado ----------
let assinaturaLista = '';
async function atualizarEstado() {
  try { lista = await api('/api/estado'); } catch { return; }
  if (ativa && !conversa(ativa)) { trocar(null); return; }
  if (!ui) return;
  pintarLista();
  atualizarEspaco();
}

function trocar(id) {
  ativa = id;
  guardar('conversaAtiva', id);
  if (!ui) return;
  assinaturaLista = '';
  pintarLista();
  pintarEspaco();
}

// ---------- terminal ----------
let xterm = null;
const carregarXterm = () => (xterm ??= Promise.all([
  import(`${VENDOR}/xterm/lib/xterm.mjs`), import(`${VENDOR}/addon-fit/lib/addon-fit.mjs`), import(`${VENDOR}/addon-unicode11/lib/addon-unicode11.mjs`),
]).then(([a, b, c]) => ({ Terminal: a.Terminal, FitAddon: b.FitAddon, Unicode11Addon: c.Unicode11Addon })));

async function terminalDe(id) {
  if (terminais.has(id)) return terminais.get(id);
  const { Terminal, FitAddon, Unicode11Addon } = await carregarXterm();
  if (terminais.has(id)) return terminais.get(id);
  const term = new Terminal({
    allowProposedApi: true, scrollback: 5000, cursorBlink: true, fontSize: 13,
    fontFamily: 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace',
    theme: { background: '#121318', foreground: '#e6e6e3', cursor: '#e6e6e3', selectionBackground: '#3b4252' },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';
  const T = { term, fit, host: el('div', { class: 'term-host' }), ws: null, aberto: false };
  const enviar = (m) => { if (T.ws?.readyState === 1) T.ws.send(JSON.stringify(m)); };
  term.onData((d) => enviar({ t: 'i', d }));
  term.onResize(({ cols, rows }) => enviar({ t: 'r', cols, rows }));
  new ResizeObserver(() => { if (T.aberto && T.host.isConnected && T.host.clientWidth) requestAnimationFrame(() => { try { fit.fit(); } catch { /* fora da tela */ } }); }).observe(T.host);
  T.conectar = () => {
    if (T.ws && T.ws.readyState <= 1) return;
    term.reset(); // o servidor reenvia o buffer inteiro
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?conversa=${encodeURIComponent(id)}&cols=${term.cols}&rows=${term.rows}`);
    ws.onopen = () => { try { fit.fit(); } catch { /* sem tamanho ainda */ } enviar({ t: 'r', cols: term.cols, rows: term.rows }); };
    ws.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : '');
    ws.onclose = () => { if (T.ws === ws) T.ws = null; };
    T.ws = ws;
  };
  terminais.set(id, T);
  return T;
}

async function montarTerminal(corpo, id) {
  const T = await terminalDe(id);
  if (!corpo.isConnected) return;
  corpo.replaceChildren(T.host);
  if (!T.aberto) { T.term.open(T.host); T.aberto = true; }
  try { T.fit.fit(); } catch { /* ainda sem tamanho */ }
  T.conectar();
  if (focarAoAbrir === id) { focarAoAbrir = null; T.term.focus(); }
}

function descartarTerminal(id) {
  const T = terminais.get(id);
  if (!T) return;
  T.ws?.close();
  T.term.dispose();
  terminais.delete(id);
}

// ---------- espaço (canvas) ----------
let espaco = { cam: null, pos: {} };
let cards = new Map(); // id do card -> { el, r: {x,y,w,h}, filho?: 'sub'|'midia', trabalhando? }
let topoZ = 1;

const salvarEspaco = () => guardar(chaveEspaco(), espaco);
let timerCam;
function aplicarCam(suave = false) {
  const { x, y, z } = espaco.cam;
  ui.mundo.classList.toggle('suave', suave);
  ui.mundo.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  ui.palco.style.backgroundPosition = `${x}px ${y}px`;
  ui.palco.style.backgroundSize = `${24 * z}px ${24 * z}px`;
  clearTimeout(timerCam);
  timerCam = setTimeout(salvarEspaco, 300);
  if (suave) setTimeout(() => ui?.mundo.classList.remove('suave'), 420);
}

let timerZoom;
function mostrarZoom() {
  ui.zoom.textContent = `${Math.round(espaco.cam.z * 100)}%`;
  ui.zoom.hidden = false;
  clearTimeout(timerZoom);
  timerZoom = setTimeout(() => { if (ui) ui.zoom.hidden = true; }, 800);
}

function centralizar(suave = true) {
  const rets = [...cards.values()].map((c) => c.r);
  espaco.cam = enquadrar(rets, { x: 0, y: 0, w: ui.palco.clientWidth, h: ui.palco.clientHeight }, 60, 1);
  aplicarCam(suave);
}

function focarCard(id) {
  const c = cards.get(id);
  if (!c) return;
  for (const o of cards.values()) o.el.classList.remove('focado');
  c.el.classList.add('focado');
  c.el.style.zIndex = String(++topoZ);
}

function criarCard(id, r, { icone: ic, titulo, sub, extras = [], classe = '' }) {
  const topo = el('div', { class: 'card-topo' }, icone(ic), el('div', { class: 'card-titulos' }, el('b', { class: 'card-titulo' }, titulo), el('small', { class: 'card-sub' }, sub ?? '')), el('div', { class: 'card-extras' }, extras));
  const corpo = el('div', { class: 'card-corpo' });
  const card = el('div', { class: `card ${classe}`.trim(), dados: { card: id } }, topo, corpo);
  const pos = espaco.pos[id];
  const rr = { ...r, ...(pos ? { x: pos.x, y: pos.y } : {}) };
  Object.assign(card.style, { left: `${rr.x}px`, top: `${rr.y}px`, width: `${rr.w}px`, height: `${rr.h}px` });
  card.addEventListener('pointerdown', () => focarCard(id));
  topo.addEventListener('pointerdown', (e) => arrastarCard(e, id));
  ui.mundo.append(card);
  const c = { el: card, r: rr, corpo, topo };
  cards.set(id, c);
  return c;
}

function arrastarCard(e, id) {
  if (e.button !== 0 || e.target.closest('button, a, input')) return;
  const c = cards.get(id);
  const inicio = { x: e.clientX, y: e.clientY, rx: c.r.x, ry: c.r.y };
  e.preventDefault();
  c.topo.setPointerCapture(e.pointerId);
  const mover = (m) => {
    c.r.x = inicio.rx + (m.clientX - inicio.x) / espaco.cam.z;
    c.r.y = inicio.ry + (m.clientY - inicio.y) / espaco.cam.z;
    c.el.style.left = `${c.r.x}px`;
    c.el.style.top = `${c.r.y}px`;
    pintarLigacoes();
  };
  const soltar = () => {
    c.topo.removeEventListener('pointermove', mover);
    espaco.pos[id] = { x: c.r.x, y: c.r.y };
    salvarEspaco();
  };
  c.topo.addEventListener('pointermove', mover);
  c.topo.addEventListener('pointerup', soltar, { once: true });
  c.topo.addEventListener('pointercancel', soltar, { once: true });
}

const SVG = 'http://www.w3.org/2000/svg';
function pintarLigacoes() {
  const t = cards.get('terminal') ?? cards.get('historico');
  ui.ligacoes.replaceChildren();
  if (!t) return;
  for (const c of cards.values()) {
    if (!c.filho) continue;
    let d;
    if (c.filho === 'sub') {
      const [x1, y1, x2, y2] = [t.r.x + t.r.w / 2, t.r.y + t.r.h, c.r.x + c.r.w / 2, c.r.y];
      d = `M${x1} ${y1} C${x1} ${y1 + 70} ${x2} ${y2 - 70} ${x2} ${y2}`;
    } else {
      const [x1, y1, x2, y2] = [t.r.x + t.r.w, t.r.y + t.r.h / 2, c.r.x, c.r.y + c.r.h / 2];
      d = `M${x1} ${y1} C${x1 + 70} ${y1} ${x2 - 70} ${y2} ${x2} ${y2}`;
    }
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', c.trabalhando ? 'ligacao viva' : 'ligacao');
    ui.ligacoes.append(p);
  }
}

const seloStatus = (c) => (c.trabalhando ? el('span', { class: 'selo trabalhando' }, 'trabalhando') : c.ativo ? el('span', { class: 'selo pronto' }, 'pronto') : el('span', { class: 'selo pausado' }, 'pausado'));
const ehWhats = (c) => c.origem === 'whatsapp' && !assumidas.has(c.id);

function pintarEspaco() {
  ui.mundo.querySelectorAll('.card').forEach((n) => n.remove());
  cards = new Map();
  espaco = ler(chaveEspaco(), null) ?? { cam: null, pos: {} };
  if (!espaco.pos) espaco.pos = {};
  const c = conversa(ativa);
  if (!c) {
    const b = criarCard('boas-vindas', { x: 0, y: 0, ...BOAS_VINDAS }, { icone: 'robo', titulo: 'Bem-vindo', sub: 'Mesa' });
    b.corpo.append(el('div', { class: 'boas-vindas' },
      el('p', {}, 'Cada conversa é um agente de IA de verdade rodando no servidor, com acesso a todas as pastas e notas do seu cérebro.'),
      el('p', { class: 'dica' }, 'Peça em linguagem simples: ele lê, escreve, organiza e cria conteúdo para você.'),
      el('button', { type: 'button', class: 'bt primario', onclick: abrirSeletor }, icone('mais'), 'Nova conversa')));
  } else if (ehWhats(c)) {
    const h = criarCard('historico', { x: 0, y: 0, ...HISTORICO }, { icone: 'whatsapp', titulo: c.titulo, sub: `WhatsApp · ${c.motorNome}`, extras: [seloStatus(c), el('button', { type: 'button', class: 'bt pequeno', onclick: () => assumir(c.id) }, icone('terminal'), 'Continuar no terminal')] });
    h.corpo.classList.add('rolavel');
    h.assinatura = '';
    pintarHistorico();
  } else {
    const t = criarCard('terminal', { x: 0, y: 0, ...TERMINAL }, { icone: 'terminal', titulo: c.titulo, sub: c.motorNome, extras: [seloStatus(c)], classe: 'card-terminal' });
    t.corpo.append(el('p', { class: 'vazio' }, 'Abrindo o terminal…'));
    t.el.addEventListener('click', () => { const T = terminais.get(c.id); if (T) { if (!T.ws) T.conectar(); T.term.focus(); } });
    montarTerminal(t.corpo, c.id);
  }
  if (c) atualizarFilhos(c);
  pintarLigacoes();
  if (espaco.cam) aplicarCam(); else requestAnimationFrame(() => { if (ui) centralizar(false); });
}

function atualizarEspaco() {
  const c = conversa(ativa);
  if (!c) return;
  const principal = cards.get('terminal') ?? cards.get('historico');
  if (principal) {
    principal.el.querySelector('.card-titulo').textContent = c.titulo;
    const extras = principal.el.querySelector('.card-extras');
    extras.firstChild?.replaceWith(seloStatus(c));
  }
  if (cards.has('historico')) pintarHistorico();
  atualizarFilhos(c);
  pintarLigacoes();
}

// Subagentes e mídias: criados uma vez e depois só atualizados.
function atualizarFilhos(c) {
  const t = (cards.get('terminal') ?? cards.get('historico')).r;
  const midias = c.midias ?? [];
  const lay = layoutFilhos({ x: 0, y: 0, w: t.w, h: t.h }, c.subagentes.length, midias.map((m) => (tipoArquivo(m) === 'video' ? 'video' : 'imagem')));
  c.subagentes.forEach((s, i) => {
    const id = `s:${s.id}`;
    let card = cards.get(id);
    if (!card) {
      card = criarCard(id, lay.subagentes[i], { icone: 'robo', titulo: s.descricao, sub: s.tipo || 'subagente', extras: [el('span')], classe: 'card-sub' });
      card.filho = 'sub';
      card.corpo.append(el('p', { class: 'sub-acao' }));
    }
    card.trabalhando = s.status === 'trabalhando';
    card.el.querySelector('.card-titulo').textContent = s.descricao;
    card.el.querySelector('.card-extras').replaceChildren(el('span', { class: `selo ${s.status}` }, { trabalhando: 'trabalhando', concluido: 'concluído', parado: 'parado' }[s.status] ?? s.status));
    card.corpo.querySelector('.sub-acao').textContent = s.ultimaAcao || 'Sem ação ainda.';
  });
  midias.forEach((m, i) => {
    const id = `m:${m}`;
    if (cards.has(id)) return;
    const card = criarCard(id, lay.midias[i], { icone: tipoArquivo(m) === 'video' ? 'video' : 'imagem', titulo: nomeBase(m), sub: 'gerado nesta conversa', classe: 'card-midia' });
    card.filho = 'midia';
    const conteudo = tipoArquivo(m) === 'video'
      ? el('video', { src: urlArquivo(m), controls: true, preload: 'metadata', playsInline: true })
      : el('img', { src: urlArquivo(m), alt: nomeBase(m), loading: 'lazy' });
    card.corpo.append(el('button', { type: 'button', class: 'midia-abrir', title: 'Abrir no visor', 'aria-label': `Abrir ${nomeBase(m)} no visor`, onclick: () => emitir('visor', { lista: midias, inicio: m }) }, conteudo));
  });
}

async function pintarHistorico() {
  const card = cards.get('historico');
  const id = ativa;
  let itens;
  try { itens = await api(`/api/conversas/${encodeURIComponent(id)}/historico`); } catch { return; }
  if (ativa !== id || cards.get('historico') !== card) return;
  const assinatura = `${itens.length}:${itens.at(-1)?.texto?.length ?? 0}`;
  if (assinatura === card.assinatura) return; // só redesenha quando muda
  card.assinatura = assinatura;
  if (!itens.length) { card.corpo.replaceChildren(el('p', { class: 'vazio' }, 'Os balões aparecem aqui quando o agente der a primeira resposta.')); return; }
  card.corpo.replaceChildren(...itens.map((it) => {
    if (it.papel === 'acao') return el('div', { class: 'balao-acao' }, icone('raio'), it.texto);
    const voce = it.papel === 'voce';
    return el('div', { class: `balao ${voce ? 'voce' : 'agente'}` },
      el('small', {}, `${voce ? 'Você' : 'Agente'}${it.quando ? ` · ${hora(it.quando)}` : ''}`),
      voce ? el('div', { class: 'balao-texto' }, it.texto) : renderizar(it.texto));
  }));
  card.corpo.scrollTop = card.corpo.scrollHeight;
}

function assumir(id) {
  const c = conversa(id);
  if (c?.processando) { avisar('O agente ainda está respondendo pelo WhatsApp. Espere ele terminar e tente de novo.'); return; }
  assumidas.add(id);
  guardar('assumidas', [...assumidas]);
  pintarEspaco();
}

// ---------- lista ----------
function pintarLista() {
  const sig = JSON.stringify([ativa, lista.map((c) => [c.id, c.titulo, c.nota, c.trabalhando, c.ativo, c.ultimaAcao, c.subagentes.map((s) => s.status), c.origem])]);
  if (sig === assinaturaLista) return;
  assinaturaLista = sig;
  const caixa = ui.lista;
  const tinhaFoco = caixa.contains(document.activeElement) ? document.activeElement.dataset.foco : null;
  if (!lista.length) { caixa.replaceChildren(el('p', { class: 'vazio' }, 'Nenhuma conversa ainda. Clique em "Nova conversa" para começar.')); return; }
  caixa.replaceChildren(...[...lista].reverse().map((c) => {
    const nota = lerNota(c.nota);
    const feitos = nota.checklist.filter((x) => x.feito).length;
    const status = c.trabalhando ? 'trabalhando' : c.ativo ? 'ativo' : 'inativo';
    const linha = el('button', { type: 'button', class: 'conversa-linha', dados: { foco: `c:${c.id}` }, 'aria-current': c.id === ativa ? 'true' : null, onclick: () => { if (c.id !== ativa) trocar(c.id); } },
      el('span', { class: `ponto-status ${status}`, title: { trabalhando: 'Trabalhando', ativo: 'Ativa', inativo: 'Inativa' }[status] }),
      c.origem === 'whatsapp' ? el('span', { class: 'selo-whats', title: 'Veio do WhatsApp' }, logo('whatsapp', 'WhatsApp', 'mini')) : null,
      el('span', { class: 'conversa-titulo' }, c.titulo),
      logo(chaveDoMotor(c.motorNome), c.motorNome, 'motor'),
      nota.checklist.length ? el('small', { class: 'progresso' }, `${feitos}/${nota.checklist.length}`) : null);
    const item = el('li', { class: `conversa${c.id === ativa ? ' ativa' : ''}` }, linha);
    if (c.id === ativa) {
      const pendentes = nota.checklist.filter((x) => !x.feito);
      const trabalhandoSubs = c.subagentes.filter((s) => s.status === 'trabalhando').length;
      item.append(el('div', { class: 'conversa-detalhe' },
        el('p', { class: 'resumo' }, nota.resumo || 'O resumo aparece aqui quando o agente criar a nota da conversa.'),
        nota.checklist.length ? el('p', { class: 'rotulo' }, pendentes.length ? `${pendentes.length} pendente(s)` : 'Tudo feito') : null,
        nota.checklist.length ? el('ul', { class: 'checklist' }, [...pendentes, ...nota.checklist.filter((x) => x.feito)].map((x) => el('li', { class: x.feito ? 'feito' : '' }, el('span', { class: 'caixa', 'aria-hidden': 'true' }, x.feito ? '✓' : ''), x.texto))) : null,
        c.subagentes.length ? el('p', { class: 'dica' }, `${c.subagentes.length} subagente(s), ${trabalhandoSubs} trabalhando`) : null,
        c.ultimaAcao ? el('p', { class: 'dica acao' }, c.ultimaAcao) : null,
        el('div', { class: 'conversa-botoes' },
          el('button', { type: 'button', class: 'bt pequeno', dados: { foco: `f:${c.id}` }, onclick: focarTerminal }, icone('alvo'), 'Focar'),
          botaoConfirmar('Encerrar', 'Encerrar mesmo? Fica salva no histórico', () => encerrar(c.id), 'bt pequeno'))));
    }
    return item;
  }));
  if (tinhaFoco) caixa.querySelector(`[data-foco="${CSS.escape(tinhaFoco)}"]`)?.focus();
}

function focarTerminal() {
  const t = cards.get('terminal') ?? cards.get('historico');
  if (!t) return;
  espaco.cam = enquadrar([t.r], { x: 0, y: 0, w: ui.palco.clientWidth, h: ui.palco.clientHeight }, 40, 1);
  aplicarCam(true);
  focarCard(cards.has('terminal') ? 'terminal' : 'historico');
  terminais.get(ativa)?.term.focus();
}

async function encerrar(id) {
  try { await api(`/api/conversas/${encodeURIComponent(id)}`, { metodo: 'DELETE' }); } catch (e) { if (e.status !== 404) { avisar(e.message, 'erro'); return; } }
  descartarTerminal(id);
  lista = lista.filter((c) => c.id !== id);
  trocar(null);
  atualizarEstado();
}

// ---------- comece aqui ----------
async function pintarComece() {
  try { primeiros ??= await api('/api/primeiros-testes'); } catch { primeiros = []; }
  if (!ui) return;
  ui.comece.hidden = !primeiros.length;
  const aberto = ler('comeceAberto', true);
  const corpo = el('ul', { class: 'comece-lista', hidden: !aberto }, primeiros.map((p) => el('li', {}, el('button', { type: 'button', class: 'comece-item', onclick: () => pedirNaConversa(p.pedido) },
    icone(p.icone), el('span', {}, el('b', {}, p.titulo), el('small', {}, p.faz))))));
  const alternar = el('button', { type: 'button', class: 'comece-topo', 'aria-expanded': String(aberto), onclick: () => {
    const novo = corpo.hidden;
    corpo.hidden = !novo;
    alternar.setAttribute('aria-expanded', String(novo));
    guardar('comeceAberto', novo);
  } }, el('span', { class: `no-seta${aberto ? ' aberta' : ''}` }, icone('seta')), 'Comece aqui');
  alternar.addEventListener('click', () => alternar.firstChild.classList.toggle('aberta', !corpo.hidden));
  ui.comece.replaceChildren(alternar, corpo);
}

// ---------- seletor de motor ----------
async function abrirSeletor() {
  if (!ui) { abrirFuncao('conversas'); return; }
  const caixa = el('div', { class: 'seletor-caixa', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Escolha o motor da conversa' },
    el('h2', {}, 'Nova conversa'), el('p', { class: 'dica' }, 'Escolha qual inteligência vai trabalhar nesta conversa.'), el('p', { class: 'vazio' }, 'Carregando…'));
  ui.seletor.replaceChildren(caixa);
  ui.seletor.hidden = false;
  let m;
  try { m = await api('/api/config/motores'); } catch (e) { caixa.lastChild.textContent = e.message; return; }
  const opcoes = Object.entries(m.motores).map(([id, x]) => el('button', {
    type: 'button', class: `motor-opcao${x.instalado ? '' : ' ausente'}`,
    onclick: async () => {
      if (!x.instalado) { pedirNaConversa(`Instale o ${x.nome} neste servidor, confira a versão instalada e me guie no login dele.`); return; }
      try { await api('/api/config/motores', { metodo: 'POST', corpo: { padrao: id } }); } catch { /* segue com o motor pedido */ }
      novaConversa({ motor: id });
    },
  }, logo(id, x.nome, 'motor grande'), el('span', {}, el('b', {}, x.nome), el('small', {}, { claude: 'Anthropic', codex: 'OpenAI', antigravity: 'Google' }[id] ?? '')),
  el('span', { class: `selo ${x.instalado ? (id === m.padrao ? 'pronto' : '') : 'pausado'}` }, x.instalado ? (id === m.padrao ? 'último usado' : 'pronto') : 'instalar')));
  caixa.lastChild.replaceWith(el('div', { class: 'motor-opcoes' }, opcoes));
  caixa.querySelector('.motor-opcao')?.focus();
}
function fecharSeletor() { if (ui && !ui.seletor.hidden) { ui.seletor.hidden = true; ui.seletor.replaceChildren(); return true; } return false; }

// ---------- montagem da guia ----------
function montar(corpo) {
  const mundo = el('div', { class: 'mundo' });
  const ligacoes = document.createElementNS(SVG, 'svg');
  ligacoes.setAttribute('class', 'ligacoes');
  ligacoes.setAttribute('aria-hidden', 'true');
  mundo.append(ligacoes);
  const zoom = el('div', { class: 'zoom-indicador', hidden: true });
  const zoomCentro = (fator) => {
    if (!espaco.cam) return;
    espaco.cam = zoomEm(espaco.cam, palco.clientWidth / 2, palco.clientHeight / 2, fator, ...ZOOM);
    aplicarCam();
    mostrarZoom();
  };
  const palco = el('div', { class: 'palco' }, mundo, zoom, el('div', { class: 'palco-acoes' },
    botaoIcone('mais', 'Aproximar', () => zoomCentro(1.25)),
    botaoIcone('menos', 'Afastar', () => zoomCentro(0.8)),
    botaoIcone('alvo', 'Centralizar em todos os cards', () => centralizar(true))));
  const listaEl = el('ul', { class: 'conversas-lista' });
  const comece = el('div', { class: 'comece', hidden: true });
  const coluna = el('aside', { class: 'coluna', 'aria-label': 'Lista de conversas' }, comece,
    el('div', { class: 'coluna-topo' }, el('h2', {}, 'Conversas'), el('button', { type: 'button', class: 'bt primario pequeno', onclick: abrirSeletor }, icone('mais'), 'Nova conversa')),
    listaEl);
  const seletor = el('div', { class: 'seletor', hidden: true, onclick: (e) => { if (e.target === seletor) fecharSeletor(); } });
  corpo.classList.add('conversas');
  corpo.append(palco, coluna, seletor);
  ui = { palco, mundo, ligacoes, zoom, lista: listaEl, comece, seletor };

  // câmera: arrastar o fundo desloca; rolar desloca; Ctrl ou Cmd mais rolagem dá zoom no ponteiro
  // pinça com dois dedos (celular): aproxima e afasta ao redor do ponto entre os dedos
  const dedos = new Map();
  let pinca0 = null;
  let pan = null;
  const ponto = (e) => { const r = palco.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  palco.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !espaco.cam || e.target.closest('.palco-acoes')) return;
    dedos.set(e.pointerId, ponto(e));
    if (dedos.size === 2) { const [a, b] = [...dedos.values()]; pinca0 = { a, b, cam: espaco.cam }; pan = null; }
  }, true);
  palco.addEventListener('pointermove', (e) => {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, ponto(e));
    if (!pinca0 || dedos.size < 2) return;
    const [a, b] = [...dedos.values()];
    espaco.cam = pincaCam(pinca0.cam, pinca0.a, pinca0.b, a, b, ...ZOOM);
    aplicarCam();
    mostrarZoom();
  }, true);
  const largarDedo = (e) => { dedos.delete(e.pointerId); if (dedos.size < 2) pinca0 = null; };
  palco.addEventListener('pointerup', largarDedo, true);
  palco.addEventListener('pointercancel', largarDedo, true);

  palco.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !espaco.cam || pinca0 || dedos.size > 1 || e.target.closest('.card, .palco-acoes')) return;
    const ini = { x: e.clientX, y: e.clientY, cx: espaco.cam.x, cy: espaco.cam.y };
    pan = ini;
    palco.setPointerCapture(e.pointerId);
    palco.classList.add('arrastando');
    const mover = (m) => { if (pan !== ini) return; espaco.cam = { ...espaco.cam, x: ini.cx + m.clientX - ini.x, y: ini.cy + m.clientY - ini.y }; aplicarCam(); };
    const soltar = () => { palco.removeEventListener('pointermove', mover); palco.classList.remove('arrastando'); if (pan === ini) pan = null; };
    palco.addEventListener('pointermove', mover);
    palco.addEventListener('pointerup', soltar, { once: true });
    palco.addEventListener('pointercancel', soltar, { once: true });
  });
  palco.addEventListener('wheel', (e) => {
    if (!espaco.cam) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const r = palco.getBoundingClientRect();
      espaco.cam = zoomEm(espaco.cam, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.003), ...ZOOM);
      aplicarCam();
      mostrarZoom();
      return;
    }
    const rolavel = e.target.closest('.xterm, .rolavel');
    if (rolavel && (rolavel.classList.contains('xterm') || rolavel.scrollHeight > rolavel.clientHeight)) return; // rola o conteúdo
    e.preventDefault();
    espaco.cam = { ...espaco.cam, x: espaco.cam.x - e.deltaX, y: espaco.cam.y - e.deltaY };
    aplicarCam();
  }, { passive: false });

  const tecla = (e) => { if (e.key === 'Escape' && document.getElementById('visor').hidden && fecharSeletor()) e.preventDefault(); };
  document.addEventListener('keydown', tecla);

  pintarComece();
  pintarLista();
  pintarEspaco();
  atualizarEstado();
  const relogio = setInterval(() => { if (!document.hidden) atualizarEstado(); }, CONSULTA_MS);
  return {
    mostrar: () => { atualizarEstado(); for (const T of terminais.values()) if (T.aberto && T.host.isConnected) { try { T.fit.fit(); } catch { /* */ } } },
    limpar() {
      clearInterval(relogio);
      document.removeEventListener('keydown', tecla);
      for (const id of [...terminais.keys()]) descartarTerminal(id);
      ui = null;
      cards = new Map();
      assinaturaLista = '';
    },
  };
}

shell.registrar('conversas', montar);

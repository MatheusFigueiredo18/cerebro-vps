// Função Conversas: canvas com cards arrastáveis e zoom (terminal, subagentes, mídias), terminal xterm por WebSocket,
// lista de conversas à direita, "comece aqui", seletor de motor e o histórico das conversas do WhatsApp.
import { el, api, icone, botaoIcone, logo, ler, guardar, emitir, ouvir, avisar, hora, botaoConfirmar } from './comum.js';
import { lerNota, nomeBase, tipoArquivo } from './formatos.js';
import { chaveDoMotor } from './marcas.js';
import { zoomEm, pinca as pincaCam, enquadrar, layoutFilhos, TAM } from './camera.js';
import { referenciaPrompt, caminhosDoArrasto, arrastoTemArquivos, posicaoSolta, pontaLigacao, caminhoCurvo, adicionarAnexos } from './anexos.js';
import { enviarArquivos } from './envio.js';
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
  // Copiar e colar: sem isto Ctrl+C/Ctrl+V vão como tecla para o Claude Code (^C interrompe, ^V tenta ler a área de transferência do servidor).
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey) || e.altKey) return true;
    const k = e.key.toLowerCase();
    if (k === 'c' && (term.hasSelection() || e.shiftKey)) { // com seleção copia; sem seleção, Ctrl+C continua interrompendo
      const txt = term.getSelection();
      if (txt) navigator.clipboard?.writeText(txt).catch(() => { /* sem permissão: Ctrl+Insert ainda copia */ });
      return false;
    }
    return k !== 'v'; // false: o xterm não manda ^V e o navegador dispara o evento paste, tratado no xterm (texto) ou abaixo (imagem)
  });
  // Imagem/arquivo copiado: envia ao cérebro e escreve o caminho no prompt. Texto segue o paste normal do xterm.
  T.host.addEventListener('paste', async (e) => {
    const arquivos = [...(e.clipboardData?.files ?? [])];
    if (!arquivos.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const nomeados = arquivos.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `colado-${Date.now()}-${i}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type })));
    const caminhos = await enviarArquivos(nomeados);
    if (!caminhos.length) { avisar('Não consegui enviar o arquivo colado.', 'erro'); return; }
    enviar({ t: 'i', d: referenciaPrompt(caminhos, chaveDoMotor(conversa(id)?.motorNome)) });
  }, true);
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
  ui.mundo.style.setProperty('--z', z);
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
  if (t) pintarFilhasDoTerminal(t);
  // ligações feitas à mão pelas bolinhas: arquivo com prompt, arquivo com arquivo, prompt com nova conversa
  for (const l of espaco.links) {
    const a = cards.get(l.a);
    const b = cards.get(l.b);
    if (!a || !b) continue;
    const d = caminhoCurvo(pontaLigacao(a.r, b.r));
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'ligacao anexo');
    const alvo = document.createElementNS(SVG, 'path'); // faixa larga e invisível para dar duplo clique
    alvo.setAttribute('d', d);
    alvo.setAttribute('class', 'ligacao-alvo');
    alvo.addEventListener('dblclick', () => desligar(l));
    const dica = document.createElementNS(SVG, 'title');
    dica.textContent = 'Duplo clique para desfazer a ligação';
    alvo.append(dica);
    ui.ligacoes.append(p, alvo);
  }
  pintarAlcas();
}

function pintarFilhasDoTerminal(t) {
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

// ---------- bolinhas de ligação: nos 4 lados do prompt e dos arquivos ----------
const LADOS = ['cima', 'direita', 'baixo', 'esquerda'];
const comAlca = (id) => id === 'terminal' || id.startsWith('a:');
const pontoDoLado = (r, lado) => ({ cima: [r.x + r.w / 2, r.y], direita: [r.x + r.w, r.y + r.h / 2], baixo: [r.x + r.w / 2, r.y + r.h], esquerda: [r.x, r.y + r.h / 2] }[lado]);

function pintarAlcas() {
  ui.alcas.replaceChildren();
  for (const [id, c] of cards) {
    if (!comAlca(id)) continue;
    for (const lado of LADOS) {
      const [x, y] = pontoDoLado(c.r, lado);
      ui.alcas.append(el('button', {
        type: 'button', class: `alca alca-${lado}`, title: id === 'terminal' ? 'Arraste para ligar a um arquivo ou criar uma nova conversa' : 'Arraste para ligar ao prompt ou a outro arquivo',
        'aria-label': 'Ligar', style: `left:${x}px;top:${y}px`, dados: { alca: id }, onpointerdown: (e) => ligarDe(e, id, lado),
      }));
    }
  }
}

function ligarDe(e, deId, lado) {
  if (e.button !== 0 || !espaco.cam) return;
  e.preventDefault();
  e.stopPropagation();
  const de = cards.get(deId);
  const palco = ui.palco.getBoundingClientRect();
  const mundoDe = (cx, cy) => ({ x: (cx - palco.left - espaco.cam.x) / espaco.cam.z, y: (cy - palco.top - espaco.cam.y) / espaco.cam.z });
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('class', 'ligacao anexo provisoria');
  ui.ligacoes.append(p);
  ui.palco.classList.add('ligando');
  const desenhar = (m) => {
    const q = mundoDe(m.clientX, m.clientY);
    p.setAttribute('d', caminhoCurvo(pontaLigacao(de.r, { x: q.x - 1, y: q.y - 1, w: 2, h: 2 })));
  };
  desenhar(e);
  const mover = (m) => desenhar(m);
  const fim = (m) => {
    document.removeEventListener('pointermove', mover);
    document.removeEventListener('pointerup', fim);
    document.removeEventListener('pointercancel', fim);
    ui?.palco.classList.remove('ligando');
    p.remove();
    if (!ui || m.type === 'pointercancel') return;
    const alvo = document.elementFromPoint(m.clientX, m.clientY)?.closest('[data-card], [data-alca]');
    const alvoId = alvo?.dataset.alca ?? alvo?.dataset.card;
    if (alvoId && alvoId !== deId) ligar(deId, alvoId);
    else if (!alvoId && deId === 'terminal') novaConversaLigada(mundoDe(m.clientX, m.clientY));
  };
  document.addEventListener('pointermove', mover);
  document.addEventListener('pointerup', fim);
  document.addEventListener('pointercancel', fim);
}

function ligar(a, b) {
  if (!comAlca(a) || !comAlca(b) || !cards.has(a) || !cards.has(b)) return;
  if (espaco.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) { avisar('Esses dois já estão ligados.'); return; }
  espaco.links.push({ a, b });
  salvarEspaco();
  pintarLigacoes();
  const arquivo = [a, b].find((i) => i.startsWith('a:'));
  if (arquivo && (a === 'terminal' || b === 'terminal') && enviarAoPrompt([caminhoDeId(arquivo)])) avisar('Arquivo ligado e escrito no prompt');
}

function desligar(l) {
  espaco.links = espaco.links.filter((o) => o !== l);
  salvarEspaco();
  pintarLigacoes();
}

// Prompt ligado a prompt: a bolinha do prompt solta no vazio abre outra conversa, na mesma pasta do cérebro.
// Worktree de verdade não é possível aqui: a pasta do cérebro não é um repositório git.
async function novaConversaLigada(pos) {
  const mae = conversa(ativa);
  if (!mae || ehWhats(mae)) return;
  let c;
  try { c = await api('/api/conversas', { metodo: 'POST', corpo: { motor: mae.motor, cols: 104, rows: 30 } }); } catch (e) { avisar(e.message, 'erro'); return; }
  if (!ui || mae.id !== ativa) return;
  espaco.filhas.push({ id: c.id, x: Math.round(pos.x - 150), y: Math.round(pos.y - 60) });
  espaco.links.push({ a: 'terminal', b: `c:${c.id}` });
  salvarEspaco();
  await atualizarEstado();
  pintarFilhas();
  pintarLigacoes();
  avisar('Nova conversa criada e ligada a esta.');
}

function pintarFilhas() {
  for (const f of espaco.filhas) {
    const id = `c:${f.id}`;
    const c = conversa(f.id);
    if (!c) continue;
    const existente = cards.get(id);
    if (existente) { existente.el.querySelector('.card-titulo').textContent = c.titulo; continue; }
    criarCard(id, { x: f.x, y: f.y, w: 300, h: 110 }, {
      icone: 'terminal', titulo: c.titulo, sub: `${c.motorNome} · ligada a esta conversa`, classe: 'card-filha',
      extras: [el('button', { type: 'button', class: 'bt pequeno', onclick: () => { focarAoAbrir = f.id; trocar(f.id); } }, 'Abrir')],
    }).corpo.append(el('p', { class: 'dica' }, 'Mesma pasta do cérebro. Clique em Abrir para trabalhar nela.'));
  }
}

const seloStatus = (c) => (c.trabalhando ? el('span', { class: 'selo trabalhando' }, 'trabalhando') : c.ativo ? el('span', { class: 'selo pronto' }, 'pronto') : el('span', { class: 'selo pausado' }, 'pausado'));
const ehWhats = (c) => c.origem === 'whatsapp' && !assumidas.has(c.id);

function pintarEspaco() {
  ui.mundo.querySelectorAll('.card').forEach((n) => n.remove());
  cards = new Map();
  espaco = ler(chaveEspaco(), null) ?? { cam: null, pos: {} };
  if (!espaco.pos) espaco.pos = {};
  if (!Array.isArray(espaco.anexos)) espaco.anexos = []; // arquivos soltos nesta área de trabalho
  if (!Array.isArray(espaco.links)) espaco.links = []; // ligações feitas pelas bolinhas: { a, b } com ids de cards
  if (!Array.isArray(espaco.filhas)) espaco.filhas = []; // conversas abertas a partir do prompt desta
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
  pintarAnexos();
  pintarFilhas();
  pintarLigacoes();
  if (espaco.cam) aplicarCam(); else requestAnimationFrame(() => { if (ui) centralizar(false); });
}

// ---------- arquivos soltos na área de trabalho (vindos de Conteúdos ou do computador) ----------
const TAM_ANEXO = { imagem: TAM.imagem, video: { w: 280, h: 340 }, arquivo: { w: 260, h: 130 } };

// Cada card de arquivo tem id próprio; cópias (botão Duplicar) do mesmo arquivo ganham o sufixo #k.
const idAnexo = (a) => `a:${a.caminho}${a.k ? `#${a.k}` : ''}`;
const caminhoDeId = (id) => id.slice(2).replace(/#\d+$/, '');

function duplicarAnexo(a) {
  const k = Math.max(0, ...espaco.anexos.filter((o) => o.caminho === a.caminho).map((o) => o.k ?? 0)) + 1;
  espaco.anexos.push({ caminho: a.caminho, k, x: a.x + 32, y: a.y + 32 });
  pintarAnexos();
  salvarEspaco();
}

function pintarAnexos() {
  for (const a of espaco.anexos) {
    const id = idAnexo(a);
    if (cards.has(id)) continue;
    const tipo = tipoArquivo(a.caminho);
    const tam = TAM_ANEXO[tipo] ?? TAM_ANEXO.arquivo;
    const card = criarCard(id, { x: a.x, y: a.y, ...tam }, {
      icone: tipo === 'video' ? 'video' : tipo === 'imagem' ? 'imagem' : 'doc', titulo: nomeBase(a.caminho), sub: 'arraste uma bolinha para ligar', classe: 'card-midia card-anexo',
      extras: [
        botaoIcone('copiar', 'Duplicar', () => duplicarAnexo(a), 'pequeno'),
        botaoIcone('terminal', 'Enviar ao prompt', () => enviarAoPrompt([a.caminho]), 'pequeno'),
        botaoIcone('x', 'Tirar da área de trabalho', () => removerAnexo(a), 'pequeno')],
    });
    const conteudo = tipo === 'video' ? el('video', { src: urlArquivo(a.caminho), controls: true, preload: 'metadata', playsInline: true })
      : tipo === 'imagem' ? el('img', { src: urlArquivo(a.caminho), alt: nomeBase(a.caminho), loading: 'lazy', draggable: false })
        : el('span', { class: 'capa-icone' }, icone('doc'), el('small', {}, (/\.([^.]+)$/.exec(a.caminho)?.[1] ?? 'arquivo').toUpperCase()));
    card.corpo.append(tipo === 'arquivo' ? conteudo : el('button', { type: 'button', class: 'midia-abrir', title: 'Abrir no visor', 'aria-label': `Abrir ${nomeBase(a.caminho)} no visor`, onclick: () => emitir('visor', { lista: [a.caminho], inicio: a.caminho }) }, conteudo));
  }
}

function removerAnexo(anexo) {
  const id = idAnexo(anexo);
  espaco.anexos = espaco.anexos.filter((a) => idAnexo(a) !== id);
  delete espaco.pos[id];
  espaco.links = espaco.links.filter((l) => l.a !== id && l.b !== id);
  cards.get(id)?.el.remove();
  cards.delete(id);
  pintarLigacoes();
  salvarEspaco();
}

// Escreve a referência dos arquivos no prompt da conversa (sem apertar Enter: o Matheus completa o pedido).
function enviarAoPrompt(caminhos) {
  const c = conversa(ativa);
  const T = c && terminais.get(c.id);
  if (!c || ehWhats(c) || !T) { avisar('Abra uma conversa com terminal para mandar o arquivo ao prompt.'); return false; }
  if (T.ws?.readyState !== 1) { T.conectar(); avisar('O terminal está reconectando. Tente de novo em um instante.'); return false; }
  T.ws.send(JSON.stringify({ t: 'i', d: referenciaPrompt(caminhos, chaveDoMotor(c.motorNome)) }));
  T.term.focus();
  return true;
}

// Soltar na área de trabalho vira card ligado à conversa; soltar em cima do terminal também escreve no prompt.
async function soltarNaArea(e) {
  const dt = e.dataTransfer;
  const caminhos = caminhosDoArrasto(dt);
  // ler antes de qualquer await: depois o navegador esvazia o dataTransfer.
  // Se veio da galeria, ignora dt.files: o navegador anexa uma cópia da imagem arrastada e ela seria enviada de novo (duplicada).
  const arquivos = caminhos.length ? [] : [...(dt.files ?? [])];
  const noPrompt = !!e.target.closest?.('.card-terminal');
  const alvoId = ativa;
  if (arquivos.length) caminhos.push(...await enviarArquivos(arquivos));
  if (alvoId === ativa) colocarNaArea(caminhos, { x: e.clientX, y: e.clientY }, noPrompt);
}

// põe os arquivos na área de trabalho, com o centro em ponto (coordenadas da janela); sem ponto, no meio do palco
function colocarNaArea(caminhos, ponto, noPrompt = false) {
  if (!caminhos.length || !ui) return;
  if (!ponto) { const r = ui.palco.getBoundingClientRect(); ponto = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  const principal = cards.get('terminal') ?? cards.get('historico');
  let pos;
  if (noPrompt && principal) pos = { x: principal.r.x + principal.r.w + 80, y: principal.r.y }; // ao lado do terminal, ligado a ele
  else pos = posicaoSolta(espaco.cam ?? { x: 0, y: 0, z: 1 }, ui.palco.getBoundingClientRect(), ponto.x, ponto.y, TAM_ANEXO.imagem.w, 120);
  const antes = espaco.anexos.length;
  espaco.anexos = adicionarAnexos(espaco.anexos, caminhos, pos);
  pintarAnexos();
  pintarLigacoes();
  salvarEspaco();
  if (noPrompt) { if (enviarAoPrompt(caminhos)) avisar(`${caminhos.length} arquivo${caminhos.length === 1 ? '' : 's'} no prompt`); }
  else if (espaco.anexos.length === antes) avisar('Esse arquivo já está na área de trabalho.');
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
  }, logo(id, x.nome, 'motor grande'), el('span', {}, el('b', {}, x.nome), el('small', {}, { claude: 'Anthropic', codex: 'OpenAI', antigravity: 'Google', grok: 'xAI' }[id] ?? '')),
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
  const alcas = el('div', { class: 'alcas' });
  mundo.append(ligacoes, alcas);
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
    botaoIcone('alvo', 'Centralizar em todos os cards', () => centralizar(true)),
    botaoIcone('lateralDireita', 'Recolher ou mostrar a barra da direita', () => {
      const recolhida = corpo.classList.toggle('sem-coluna');
      guardar('colunaRecolhida', recolhida);
      requestAnimationFrame(() => { for (const T of terminais.values()) if (T.aberto && T.host.isConnected) { try { T.fit.fit(); } catch { /* sem tamanho */ } } });
    })));
  const listaEl = el('ul', { class: 'conversas-lista' });
  const comece = el('div', { class: 'comece', hidden: true });
  const coluna = el('aside', { class: 'coluna', 'aria-label': 'Lista de conversas' }, comece,
    el('div', { class: 'coluna-topo' }, el('h2', {}, 'Conversas'), el('button', { type: 'button', class: 'bt primario pequeno', onclick: abrirSeletor }, icone('mais'), 'Nova conversa')),
    listaEl);
  const seletor = el('div', { class: 'seletor', hidden: true, onclick: (e) => { if (e.target === seletor) fecharSeletor(); } });
  corpo.classList.add('conversas');
  corpo.classList.toggle('sem-coluna', ler('colunaRecolhida', false) === true);
  corpo.append(palco, coluna, seletor);
  ui = { palco, mundo, ligacoes, alcas, zoom, lista: listaEl, comece, seletor };

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

  // arrastar arquivos (da janela de Conteúdos ou do computador) para a área de trabalho ou para o terminal
  const marcarAlvo = (e) => {
    const noPrompt = !!e.target.closest?.('.card-terminal');
    palco.classList.toggle('alvo-solta', !noPrompt);
    ui.mundo.querySelector('.card-terminal')?.classList.toggle('alvo-prompt', noPrompt);
  };
  const limparAlvo = () => { palco.classList.remove('alvo-solta'); ui.mundo.querySelector('.card-terminal')?.classList.remove('alvo-prompt'); };
  palco.addEventListener('dragover', (e) => {
    if (!arrastoTemArquivos(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    marcarAlvo(e);
  });
  palco.addEventListener('dragleave', (e) => { if (!palco.contains(e.relatedTarget)) limparAlvo(); });
  palco.addEventListener('drop', (e) => {
    if (!arrastoTemArquivos(e.dataTransfer)) return;
    e.preventDefault();
    limparAlvo();
    document.body.classList.remove('arrastando-arquivo');
    soltarNaArea(e);
  });

  const tecla = (e) => { if (e.key === 'Escape' && document.getElementById('visor').hidden && fecharSeletor()) e.preventDefault(); };
  document.addEventListener('keydown', tecla);

  pintarComece();
  pintarLista();
  pintarEspaco();
  atualizarEstado();
  const relogio = setInterval(() => { if (!document.hidden) atualizarEstado(); }, CONSULTA_MS);
  const paraArea = ouvir('conteudos-para-area', (caminhos) => colocarNaArea(caminhos));
  return {
    mostrar: () => { atualizarEstado(); for (const T of terminais.values()) if (T.aberto && T.host.isConnected) { try { T.fit.fit(); } catch { /* */ } } },
    limpar() {
      clearInterval(relogio);
      paraArea();
      document.removeEventListener('keydown', tecla);
      for (const id of [...terminais.keys()]) descartarTerminal(id);
      ui = null;
      cards = new Map();
      assinaturaLista = '';
    },
  };
}

shell.registrar('conversas', montar);

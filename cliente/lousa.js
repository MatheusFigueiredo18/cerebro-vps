// Função Lousas: quadro infinito de desenho livre, post-its, formas e setas, com salvamento automático no servidor.
// A geometria (seleção, formas, borrachas, transformações) fica em lousa-geo.js e a câmera em camera.js; aqui ficam a tela,
// o teclado e a conversa com a API (/api/lousas). Cada lousa é um arquivo JSON na pasta de dados; nada é apagado.
import { el, icone, api, ler, guardar, avisar, ouvir } from './comum.js';
import { zoomEm, enquadrar, pinca } from './camera.js';
import * as G from './lousa-geo.js';
import * as shell from './shell.js';

const ZOOM = [0.1, 8];
const CORES = [['ink', 'Tinta'], ['#8A939B', 'Cinza'], ['#E2553B', 'Vermelho'], ['#F08A3C', 'Laranja'], ['#E3A008', 'Amarelo'], ['#0F8F6E', 'Verde'], ['#2FA8C9', 'Ciano'], ['#2F6FEB', 'Azul'], ['#7B5CE0', 'Violeta'], ['#D14F9E', 'Rosa']];
const POSTITS = ['#FFE066', '#FFB86B', '#FF9AA2', '#F5A6E6', '#B9A7FF', '#8FD3FF', '#8FE3B4', '#E3E7E9'];
const FERRAMENTAS = [
  ['select', 'cursor', 'Selecionar (V)'], ['hand', 'mao', 'Mão: arrastar o quadro (H)'], '-',
  ['pen', 'caneta', 'Caneta (P)'], ['hl', 'marca', 'Marca-texto (Shift+P)'], ['smart', 'inteligente', 'Desenho inteligente: vira forma (D)'],
  ['er', 'borracha', 'Borracha: apaga o traço inteiro (E)'], ['pre', 'precisao', 'Borracha de precisão: apaga um pedaço (Shift+E)'], ['lasso', 'laco', 'Laço: seleciona vários (Q)'], '-',
  ['sticky', 'postit', 'Post-it (N)'], ['text', 'texto', 'Texto (T)'], ['formas', 'formas', 'Formas (S)'], ['linhas', 'setaDiag', 'Linhas e setas (L)'], ['frame', 'quadro', 'Moldura (F)'],
];
const FORMAS = [['rect', 'retangulo', 'Retângulo (R)'], ['ellipse', 'oval', 'Oval (O)'], ['tri', 'triangulo', 'Triângulo'], ['diamond', 'losango', 'Losango']];
const LINHAS = [['line', 'linha', 'Linha'], ['arrow', 'setaDiag', 'Seta (L)']];
const DICAS = {
  select: 'Clique para selecionar, arraste para mover. Dois cliques escrevem texto. Arraste num espaço vazio para selecionar vários.',
  hand: 'Arraste para mover o quadro. Dica: segure Espaço em qualquer ferramenta.',
  pen: 'Arraste para desenhar. Escolha cor e espessura abaixo. Ctrl+Z desfaz.',
  hl: 'Arraste sobre o que quiser destacar. O marca-texto é transparente.',
  smart: 'Desenhe um retângulo, círculo, triângulo ou linha, mesmo torto: ele endireita sozinho.',
  er: 'Passe sobre um traço para apagá-lo inteiro. Só apaga desenhos, não post-its nem formas.',
  pre: 'Passe sobre um traço para apagar só aquele pedaço.',
  lasso: 'Contorne com o mouse o que quer selecionar e solte.',
  sticky: 'Clique no quadro para colocar um post-it e já escreva.',
  text: 'Clique no quadro e escreva. Enter quebra a linha, Esc termina.',
  rect: 'Arraste para desenhar o retângulo (Shift deixa quadrado).', ellipse: 'Arraste para desenhar a oval (Shift deixa círculo).',
  tri: 'Arraste para desenhar o triângulo.', diamond: 'Arraste para desenhar o losango.',
  line: 'Arraste para traçar uma linha. Solte sobre um objeto para prender.',
  arrow: 'Arraste para traçar uma seta. Comece e termine sobre objetos para prendê-la a eles.',
  frame: 'Arraste para criar uma moldura que agrupa e apresenta um conjunto de objetos.',
};
const CURSOR = { select: 'default', hand: 'grab', pen: 'crosshair', hl: 'crosshair', smart: 'crosshair', er: 'cell', pre: 'cell', lasso: 'crosshair', sticky: 'copy', text: 'text' };
const TECLAS = { v: 'select', h: 'hand', p: 'pen', e: 'er', t: 'text', n: 'sticky', r: 'rect', o: 'ellipse', l: 'arrow', f: 'frame', d: 'smart', q: 'lasso', s: 'rect' };
const GRUPO_FORMAS = new Set(['rect', 'ellipse', 'tri', 'diamond']);
const GRUPO_LINHAS = new Set(['line', 'arrow']);
const uid = () => Math.random().toString(36).slice(2, 10);
const quando = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const bt = (cls, titulo, nome, onclick, extra = {}) => el('button', { type: 'button', class: cls, title: titulo, 'aria-label': titulo, onclick, ...extra }, icone(nome));

function montar(corpo) {
  corpo.classList.add('lousa-espaco');
  const estreita = () => window.matchMedia('(max-width: 820px)').matches;
  const GROSSO = window.matchMedia('(pointer: coarse)').matches; // dedo: alvos maiores
  corpo.classList.toggle('sem-coluna', ler('lousaColunaRecolhida', estreita()) === true);
  const prefs = ler('lousaPrefs', {});
  const S = {
    ferr: 'select', sel: [], grade: prefs.grade !== false, mini: prefs.mini === true, er: 20, penIdx: 0, espaco: false,
    pens: [{ c: 'ink', s: 3 }, { c: '#E2553B', s: 6 }, { c: '#0F8F6E', s: 14 }], hl: { c: '#E3A008', s: 10 },
    forma: { c: 'ink', f: null, s: 3 }, postit: POSTITS[0], txt: { c: 'ink', fs: 22 },
  };
  let lista = []; // lousas (sem os desenhos), como o servidor listou
  let cur = null; // lousa aberta: { id, titulo, versao }
  let objs = [];
  let cam = { x: 80, y: 80, z: 1 };
  let hist = []; let hi = -1; let clip = []; let clipN = 0;
  let vivo = null; let arrasto = null; let hover = null; let editando = null; let quadro = 0;
  let sujo = false; let enviando = false; let falhou = false; let timerSalvar = 0; let timerRetry = 0;
  let vistaMod = 'lista'; const pontos = new Map();
  let TH = { ink: '#1d1d1b', papel: '#f5f4f0', grade: '#e3e1da', quadro: '#fff', mudo: '#57564f', acento: '#2f5bd3' };
  let W = 0; let H = 0; let DPR = 1;

  // ---------- estrutura ----------
  const tela = el('canvas', { class: 'lousa-tela', 'aria-label': 'Quadro infinito de desenho livre' });
  const g = tela.getContext('2d');
  const mini = el('canvas', { class: 'lousa-mini lousa-painel', 'aria-label': 'Minimapa' });
  const vazio = el('div', { class: 'lousa-vazio', hidden: true }, el('b', {}, 'Quadro em branco'), GROSSO ? 'Escolha a caneta lá embaixo e desenhe com o dedo. Toque duas vezes num espaço vazio para escrever.' : 'Escolha a caneta (P) e desenhe, ou aperte N para um post-it. Dê dois cliques para escrever um texto.');
  const barra = el('nav', { class: 'lousa-ferramentas lousa-painel', 'aria-label': 'Ferramentas' });
  const gavetaFormas = el('div', { class: 'lousa-gaveta lousa-painel', hidden: true });
  const gavetaLinhas = el('div', { class: 'lousa-gaveta lousa-painel', hidden: true });
  const opcoes = el('div', { class: 'lousa-opcoes lousa-painel', hidden: true });
  const dica = el('div', { class: 'lousa-dica' });
  const btnDesfazer = bt('lousa-bt', 'Desfazer (Ctrl+Z)', 'desfazer', () => desfazer(), { disabled: true });
  const btnRefazer = bt('lousa-bt', 'Refazer (Ctrl+Y)', 'refazer', () => refazer(), { disabled: true });
  const pilula = el('div', { class: 'lousa-desfazer lousa-painel' }, btnDesfazer, btnRefazer);
  const pct = el('button', { type: 'button', class: 'lousa-pct', title: 'Opções de zoom', onclick: () => menuZoom() }, '100%');
  const btnGrade = bt('lousa-bt', 'Grade (G)', 'grade', () => alternarGrade());
  const btnMini = bt('lousa-bt', 'Minimapa (M)', 'mapa', () => alternarMini());
  const zoom = el('div', { class: 'lousa-zoom lousa-painel' }, btnGrade, btnMini,
    bt('lousa-bt', 'Menos zoom (−)', 'menos', () => zoomCentro(0.8)), pct, bt('lousa-bt', 'Mais zoom (+)', 'mais', () => zoomCentro(1.25)),
    bt('lousa-bt', 'Ajustar à tela (Alt+1)', 'ajustar', () => ajustar()));
  const menu = el('div', { class: 'lousa-menu lousa-painel', hidden: true });
  const ctx = el('div', { class: 'lousa-ctx lousa-painel', hidden: true });
  const pop = el('div', { class: 'lousa-pop lousa-painel', hidden: true });
  const editor = el('textarea', { class: 'lousa-editor', hidden: true, 'aria-label': 'Editar texto' });
  const titulo = el('input', { type: 'text', class: 'lousa-titulo', 'aria-label': 'Nome do quadro (clique para renomear)', title: 'Clique para renomear', autocomplete: 'off', disabled: true });
  const statusTxt = el('span', {}, 'Abrindo…');
  const btnRecarregar = el('button', { type: 'button', class: 'bt pequeno', hidden: true, onclick: () => abrir(cur.id, true) }, 'Recarregar');
  const statusEl = el('div', { class: 'lousa-status', role: 'status', dados: { s: 'ok' } }, el('span', { class: 'lousa-ponto' }), statusTxt, btnRecarregar);
  const topo = el('div', { class: 'lousa-topo lousa-painel' }, titulo, statusEl,
    el('button', { type: 'button', class: 'bt pequeno', title: 'Exportar como imagem PNG', onclick: () => abrirExportar() }, icone('baixar'), el('span', { class: 'lousa-rot' }, 'Exportar')),
    el('button', { type: 'button', class: 'bt pequeno', title: 'Atalhos de teclado (?)', onclick: () => abrirAtalhos() }, icone('ajuda'), el('span', { class: 'lousa-rot' }, 'Atalhos')),
    bt('bt-icone', 'Recolher ou mostrar a lista de quadros', 'lateralDireita', () => guardar('lousaColunaRecolhida', corpo.classList.toggle('sem-coluna'))));
  const cartao = el('div', { class: 'lousa-cartao lousa-painel', hidden: ler('lousaDica', false) === true },
    bt('bt-icone pequeno lousa-cartao-x', 'Fechar dicas', 'x', () => { cartao.hidden = true; guardar('lousaDica', true); }),
    el('h2', {}, 'Comece em 4 passos'),
    GROSSO
      ? el('ul', {}, el('li', {}, el('b', {}, 'Desenhar: '), 'escolha a caneta embaixo e arraste o dedo.'), el('li', {}, el('b', {}, 'Errou? '), 'toque na seta curva, no alto à esquerda.'),
        el('li', {}, el('b', {}, 'Mover e dar zoom: '), 'use dois dedos (pinça), ou a mão.'), el('li', {}, el('b', {}, 'Lista de quadros: '), 'toque no ícone do canto de cima, à direita.'))
      : el('ul', {}, el('li', {}, el('b', {}, 'Desenhar: '), 'escolha a caneta e arraste.'), el('li', {}, el('b', {}, 'Errou? '), 'Ctrl+Z ou a seta curva, embaixo à esquerda.'),
        el('li', {}, el('b', {}, 'Mover o quadro: '), 'segure Espaço e arraste, ou use a mão.'), el('li', {}, el('b', {}, 'Tudo salva sozinho: '), 'veja o aviso "Salvo" no topo.')));
  const expImg = el('img', { class: 'lousa-exp-img', alt: 'Pré-visualização da exportação' });
  const expInfo = el('span', { class: 'lousa-exp-info' });
  const expTudo = el('input', { type: 'radio', name: 'lousa-exp', value: 'tudo', checked: true, onchange: () => renderExport() });
  const expSel = el('input', { type: 'radio', name: 'lousa-exp', value: 'sel', onchange: () => renderExport() });
  const expFundo = el('select', { onchange: () => renderExport() }, el('option', { value: 'papel' }, 'Cor do quadro'), el('option', { value: 'branco' }, 'Branco'), el('option', { value: 'nenhum' }, 'Transparente'));
  const expEsc = el('select', { onchange: () => renderExport() }, el('option', { value: '1' }, '1x'), el('option', { value: '2', selected: true }, '2x'));
  const modalExp = el('div', { class: 'lousa-modal', hidden: true }, el('div', { class: 'lousa-card lousa-painel', role: 'dialog', 'aria-label': 'Exportar imagem' },
    el('h2', {}, 'Exportar como imagem'),
    el('div', { class: 'lousa-linha' }, el('label', {}, expTudo, ' Tudo'), el('label', {}, expSel, ' Só a seleção'), el('span', { class: 'lousa-espaco-flex' }),
      el('label', {}, 'Fundo ', expFundo), el('label', {}, 'Tamanho ', expEsc)),
    expImg,
    el('div', { class: 'lousa-linha' }, expInfo, el('span', { class: 'lousa-espaco-flex' }),
      el('button', { type: 'button', class: 'bt', onclick: () => copiarImagem() }, icone('copiar'), 'Copiar'),
      el('button', { type: 'button', class: 'bt primario', onclick: () => baixarImagem() }, icone('baixar'), 'Baixar PNG'),
      el('button', { type: 'button', class: 'bt', onclick: () => { modalExp.hidden = true; } }, 'Fechar'))));
  const corpoAtalhos = el('div', { class: 'lousa-atalhos' });
  const modalAtalhos = el('div', { class: 'lousa-modal', hidden: true }, el('div', { class: 'lousa-card lousa-painel lousa-card-larga', role: 'dialog', 'aria-label': 'Atalhos de teclado' },
    el('h2', {}, 'Atalhos de teclado'), corpoAtalhos, el('div', { class: 'lousa-linha' }, el('span', { class: 'lousa-espaco-flex' }), el('button', { type: 'button', class: 'bt primario', onclick: () => { modalAtalhos.hidden = true; } }, 'Fechar'))));
  const palco = el('div', { class: 'palco lousa-palco' }, tela, mini, vazio, topo, barra, gavetaFormas, gavetaLinhas, opcoes, dica, pilula, zoom, menu, ctx, pop, editor, cartao, modalExp, modalAtalhos);

  const busca = el('input', { type: 'search', class: 'lousa-busca', placeholder: 'Buscar quadro', 'aria-label': 'Buscar quadro', oninput: () => pintarLista() });
  const ordem = el('select', { class: 'lousa-ordem', 'aria-label': 'Ordenar', onchange: () => pintarLista() },
    el('option', { value: 'mod' }, 'Última modificação'), el('option', { value: 'nome' }, 'Alfabeticamente'), el('option', { value: 'cri' }, 'Última criação'));
  const btLista = bt('bt-icone pequeno ligado', 'Ver em lista', 'conteudos', () => { vistaMod = 'lista'; pintarLista(); });
  const btGrade = bt('bt-icone pequeno', 'Ver em grade', 'grade', () => { vistaMod = 'grade'; pintarLista(); });
  const ul = el('ul', { class: 'lousa-lista' });
  const coluna = el('aside', { class: 'coluna lousa-coluna', 'aria-label': 'Quadros' },
    el('div', { class: 'coluna-topo' }, el('h2', {}, 'Quadros'), el('button', { type: 'button', class: 'bt primario pequeno', onclick: () => novaLousa() }, icone('mais'), 'Novo')),
    el('div', { class: 'lousa-filtros' }, busca, ordem, btLista, btGrade), ul);
  corpo.append(palco, coluna);

  // ---------- tema e tamanho ----------
  function tema() {
    const cs = getComputedStyle(corpo); const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    TH = { ink: v('--texto', '#1d1d1b'), papel: v('--fundo', '#f5f4f0'), grade: v('--linha', '#e3e1da'), quadro: v('--card', '#fff'), mudo: v('--texto-2', '#57564f'), acento: v('--acento', '#2f5bd3') };
  }
  const cor = (c) => (c === 'ink' ? TH.ink : c);
  function medir() {
    DPR = window.devicePixelRatio || 1; W = palco.clientWidth; H = palco.clientHeight;
    if (!W || !H) return;
    tela.width = Math.round(W * DPR); tela.height = Math.round(H * DPR); redesenhar();
  }
  const observador = new ResizeObserver(medir);
  observador.observe(palco);
  const porId = () => G.porIdDe(objs);
  const porIdFn = (id) => objs.find((o) => o.id === id) ?? null;
  const tol = () => (GROSSO ? 14 : 6) / cam.z;
  const paraTela = (x, y) => [x * cam.z + cam.x, y * cam.z + cam.y];
  const paraMundo = (x, y) => [(x - cam.x) / cam.z, (y - cam.y) / cam.z];
  const selObjs = () => S.sel.map(porIdFn).filter(Boolean);
  const selCaixa = () => { const l = selObjs(); return l.length ? G.uniao(l, porId()) : null; };

  // ---------- desenho ----------
  function embrulhar(c, texto, maxW) {
    const saida = [];
    for (const par of String(texto).split('\n')) {
      let linha = '';
      for (const w of par.split(' ')) { const t = linha ? `${linha} ${w}` : w; if (c.measureText(t).width > maxW && linha) { saida.push(linha); linha = w; } else linha = t; }
      saida.push(linha);
    }
    return saida;
  }
  function bloco(c, texto, x, y, w, h, fs, corTxt, alinha, vmeio) {
    if (!texto) return;
    c.font = `${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`; c.fillStyle = corTxt; c.textBaseline = 'top'; c.textAlign = alinha;
    const ls = embrulhar(c, texto, w); const lh = fs * 1.25; const y0 = vmeio ? y + (h - ls.length * lh) / 2 : y; const x0 = alinha === 'center' ? x + w / 2 : x;
    ls.forEach((ln, i) => c.fillText(ln, x0, y0 + i * lh));
  }
  const cacheFs = new Map();
  function fsPostit(c, o) {
    const k = `${o.text}|${o.w}|${o.h}`; if (cacheFs.has(k)) return cacheFs.get(k);
    let f = 26; for (; f > 11; f -= 2) { c.font = `${f}px system-ui, sans-serif`; if (embrulhar(c, o.text || ' ', o.w - 24).length * f * 1.25 <= o.h - 24) break; }
    if (cacheFs.size > 500) cacheFs.clear(); cacheFs.set(k, f); return f;
  }
  function caminho(c, p) {
    c.beginPath(); c.moveTo(p[0][0], p[0][1]);
    if (p.length === 1) { c.lineTo(p[0][0] + 0.01, p[0][1]); return; }
    for (let i = 1; i < p.length - 1; i++) c.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
    c.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
  }
  function formaCaminho(c, o) {
    const { w, h } = o; c.beginPath();
    if (o.k === 'ellipse') c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else if (o.k === 'tri') { c.moveTo(w / 2, 0); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); }
    else if (o.k === 'diamond') { c.moveTo(w / 2, 0); c.lineTo(w, h / 2); c.lineTo(w / 2, h); c.lineTo(0, h / 2); c.closePath(); }
    else c.rect(0, 0, w, h);
  }
  function objeto(c, o, z, pid, semTexto) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (o.t === 'stroke') { c.globalAlpha = o.tool === 'hl' ? 0.35 : 1; c.strokeStyle = cor(o.c); c.lineWidth = o.tool === 'hl' ? o.s * 3 : o.s; caminho(c, o.p); c.stroke(); }
    else if (o.t === 'line') {
      const [a, b] = G.pontasDaLinha(o, pid); c.strokeStyle = cor(o.c); c.fillStyle = cor(o.c); c.lineWidth = o.s;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      if (o.k === 'arrow') { const an = Math.atan2(b[1] - a[1], b[0] - a[0]); const L = Math.max(10, o.s * 3.4); c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(b[0] - L * Math.cos(an - 0.45), b[1] - L * Math.sin(an - 0.45)); c.lineTo(b[0] - L * Math.cos(an + 0.45), b[1] - L * Math.sin(an + 0.45)); c.closePath(); c.fill(); }
    } else {
      const ce = G.centro(o); c.translate(ce[0], ce[1]); c.rotate(o.r || 0); c.translate(-o.w / 2, -o.h / 2);
      if (o.t === 'shape') { formaCaminho(c, o); if (o.f) { c.fillStyle = cor(o.f); c.fill(); } c.strokeStyle = cor(o.c); c.lineWidth = o.s; c.stroke(); if (!semTexto) bloco(c, o.text, 8, 0, o.w - 16, o.h, o.fs, cor(o.c), 'center', true); }
      else if (o.t === 'sticky') { c.shadowColor = 'rgba(0,0,0,.22)'; c.shadowBlur = 10; c.shadowOffsetY = 3; c.fillStyle = o.f; c.fillRect(0, 0, o.w, o.h); c.shadowColor = 'transparent'; if (!semTexto) bloco(c, o.text, 12, 0, o.w - 24, o.h, fsPostit(c, o), '#1d1d1b', 'center', true); }
      else if (o.t === 'text') { if (!semTexto) bloco(c, o.text, 0, 0, 1e5, o.h, o.fs, cor(o.c), 'left', false); }
      else if (o.t === 'frame') {
        c.fillStyle = TH.quadro; c.fillRect(0, 0, o.w, o.h); c.strokeStyle = TH.grade; c.lineWidth = 1 / z; c.strokeRect(0, 0, o.w, o.h);
        if (!semTexto) { c.font = `${14 / z}px system-ui, sans-serif`; c.fillStyle = TH.mudo; c.textBaseline = 'bottom'; c.textAlign = 'left'; c.fillText(o.title || 'Moldura', 0, -6 / z); }
      }
    }
    c.restore();
  }
  function pontilhado() {
    const sp = 32 * cam.z; if (sp < 9) return;
    g.fillStyle = TH.grade; const x0 = ((cam.x % sp) + sp) % sp; const y0 = ((cam.y % sp) + sp) % sp; const r = Math.max(0.8, Math.min(1.6, cam.z * 1.1));
    for (let x = x0; x < W; x += sp) for (let y = y0; y < H; y += sp) g.fillRect(x - r / 2, y - r / 2, r, r);
  }
  const redesenhar = () => { if (!quadro) quadro = requestAnimationFrame(desenhar); };
  function desenhar() {
    quadro = 0; if (!W || !H) return; tema();
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H); if (S.grade) pontilhado();
    const pid = porId(); g.save(); g.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, DPR * cam.x, DPR * cam.y);
    for (const o of objs) objeto(g, o, cam.z, pid, editando && editando.id === o.id);
    if (vivo) objeto(g, vivo, cam.z, pid);
    g.restore(); sobreposicao(pid); posCtx(); desenharMini(pid); pct.textContent = `${Math.round(cam.z * 100)}%`;
  }
  function alcas() {
    const b = selCaixa(); if (!b) return null;
    const a = paraTela(b.x, b.y); const z = paraTela(b.x + b.w, b.y + b.h);
    return { pts: [[a[0], a[1]], [z[0], a[1]], [z[0], z[1]], [a[0], z[1]]], rot: [(a[0] + z[0]) / 2, a[1] - (GROSSO ? 40 : 28)], x0: a[0], y0: a[1], x1: z[0] };
  }
  // o X de excluir fica no canto de cima, à direita, de cada nota adesiva
  const xDaNota = (o) => { const c = G.cantos(o)[1]; return paraTela(c[0], c[1]); };
  function desenharXNotas() {
    g.save(); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.lineWidth = 1.6; g.lineCap = 'round';
    for (const o of objs) {
      if (o.t !== 'sticky' || o.lock) continue;
      const [x, y] = xDaNota(o); const rb = GROSSO ? 13 : 9; const k = GROSSO ? 5 : 3.5; g.beginPath(); g.arc(x, y, rb, 0, Math.PI * 2); g.fillStyle = TH.quadro; g.fill(); g.strokeStyle = TH.mudo; g.stroke();
      g.beginPath(); g.moveTo(x - k, y - k); g.lineTo(x + k, y + k); g.moveTo(x + k, y - k); g.lineTo(x - k, y + k); g.stroke();
    }
    g.restore();
  }
  function sobreposicao(pid) {
    desenharXNotas();
    g.save(); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.lineWidth = 1.5; g.strokeStyle = TH.acento; g.fillStyle = TH.acento;
    if (hover) { const o = porIdFn(hover); if (o) { const b = G.limites(o, pid); const a = paraTela(b.x, b.y); g.setLineDash([5, 4]); g.strokeRect(a[0] - 3, a[1] - 3, b.w * cam.z + 6, b.h * cam.z + 6); g.setLineDash([]); } }
    if (!editando) {
      for (const o of selObjs()) {
        if (G.ehCaixa(o)) { const cs = G.cantos(o).map((p) => paraTela(p[0], p[1])); g.beginPath(); cs.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke(); }
        else { const b = G.limites(o, pid); const a = paraTela(b.x, b.y); g.setLineDash([4, 3]); g.strokeRect(a[0], a[1], b.w * cam.z, b.h * cam.z); g.setLineDash([]); }
      }
      const h = alcas();
      if (h && !selObjs().every((o) => o.lock)) {
        g.setLineDash([]); g.beginPath(); g.moveTo((h.x0 + h.x1) / 2, h.y0); g.lineTo(h.rot[0], h.rot[1]); g.stroke();
        const hs = GROSSO ? 9 : 5; g.fillStyle = TH.quadro; for (const p of h.pts) { g.beginPath(); g.rect(p[0] - hs, p[1] - hs, hs * 2, hs * 2); g.fill(); g.stroke(); }
        g.beginPath(); g.arc(h.rot[0], h.rot[1], GROSSO ? 10 : 6, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
    if (arrasto?.tipo === 'marquee') { g.fillStyle = 'rgba(47,91,211,.10)'; g.fillRect(arrasto.sx, arrasto.sy, arrasto.cx - arrasto.sx, arrasto.cy - arrasto.sy); g.strokeRect(arrasto.sx, arrasto.sy, arrasto.cx - arrasto.sx, arrasto.cy - arrasto.sy); }
    if (arrasto?.tipo === 'laco') { g.setLineDash([6, 4]); g.beginPath(); arrasto.pts.forEach((p, i) => { const s = paraTela(p[0], p[1]); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); g.stroke(); g.setLineDash([]); }
    if ((S.ferr === 'er' || S.ferr === 'pre') && arrasto?.mouse) { g.setLineDash([]); g.beginPath(); g.arc(arrasto.mouse[0], arrasto.mouse[1], S.er / 2, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }
  let mm = null;
  function desenharMini(pid) {
    if (!S.mini) return; const d = window.devicePixelRatio || 1; const mw = 190; const mh = 122;
    if (mini.width !== mw * d) { mini.width = mw * d; mini.height = mh * d; }
    const c = mini.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, mw, mh);
    const a = paraMundo(0, 0); const b = paraMundo(W, H); const todos = G.uniao(objs, pid);
    const x0 = Math.min(a[0], todos ? todos.x : a[0]); const y0 = Math.min(a[1], todos ? todos.y : a[1]); const x1 = Math.max(b[0], todos ? todos.x + todos.w : b[0]); const y1 = Math.max(b[1], todos ? todos.y + todos.h : b[1]);
    const k = Math.min((mw - 12) / (x1 - x0), (mh - 12) / (y1 - y0)); mm = { x0, y0, k, ox: (mw - (x1 - x0) * k) / 2, oy: (mh - (y1 - y0) * k) / 2 };
    c.globalAlpha = 0.7; for (const o of objs) { const l = G.limites(o, pid); c.fillStyle = o.t === 'sticky' ? o.f : (o.t === 'stroke' ? cor(o.c) : TH.mudo); c.fillRect(mm.ox + (l.x - x0) * k, mm.oy + (l.y - y0) * k, Math.max(2, l.w * k), Math.max(2, l.h * k)); }
    c.globalAlpha = 1; c.strokeStyle = TH.acento; c.lineWidth = 2; c.strokeRect(mm.ox + (a[0] - x0) * k, mm.oy + (a[1] - y0) * k, (b[0] - a[0]) * k, (b[1] - a[1]) * k);
  }
  mini.addEventListener('pointerdown', (e) => {
    if (!mm) return; const r = mini.getBoundingClientRect();
    const ir = (ev) => { const wx = (ev.clientX - r.left - mm.ox) / mm.k + mm.x0; const wy = (ev.clientY - r.top - mm.oy) / mm.k + mm.y0; cam = { ...cam, x: W / 2 - wx * cam.z, y: H / 2 - wy * cam.z }; redesenhar(); };
    ir(e); const mv = (ev) => ir(ev); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); salvarSoon(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });

  // ---------- zoom ----------
  function zoomCentro(f) { cam = zoomEm(cam, W / 2, H / 2, f, ...ZOOM); redesenhar(); salvarSoon(); }
  function ajustarA(rets, margem) {
    cam = rets ? enquadrar([rets], estreita() ? { x: 8, y: 58, w: W - 16, h: H - 140 } : { x: 64, y: 56, w: W - 74, h: H - 66 }, margem, 2) : { x: W / 2 - 300, y: H / 2 - 200, z: 1 }; redesenhar(); salvarSoon();
  }
  const ajustar = () => ajustarA(G.uniao(objs, porId()), 50);
  const ajustarSel = () => { const b = selCaixa(); if (b) ajustarA(b, 70); else ajustar(); };
  palco.addEventListener('wheel', (e) => {
    if (e.target.closest('.lousa-painel') || e.target.closest('.lousa-modal')) return;
    e.preventDefault(); const r = tela.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) cam = zoomEm(cam, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0022), ...ZOOM);
    else cam = { ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY };
    redesenhar(); salvarSoon();
  }, { passive: false });
  function alternarGrade() { S.grade = !S.grade; btnGrade.classList.toggle('ligado', S.grade); guardar('lousaPrefs', { grade: S.grade, mini: S.mini }); redesenhar(); }
  function alternarMini() { S.mini = !S.mini; mini.style.display = S.mini ? 'block' : 'none'; btnMini.classList.toggle('ligado', S.mini); guardar('lousaPrefs', { grade: S.grade, mini: S.mini }); redesenhar(); }
  function menuZoom() {
    if (!menu.hidden) { menu.hidden = true; return; }
    const itens = [['Ajustar à tela', 'Alt+1', ajustar], ['Zoom na seleção', 'Alt+2', ajustarSel], ['50%', '', () => zoomCentro(0.5 / cam.z)], ['100%', 'Ctrl+0', () => zoomCentro(1 / cam.z)], ['200%', '', () => zoomCentro(2 / cam.z)]];
    menu.replaceChildren(...itens.map(([nome, tecla2, fn]) => el('button', { type: 'button', onclick: () => { fn(); menu.hidden = true; } }, el('span', {}, nome), el('kbd', {}, tecla2))));
    menu.hidden = false;
  }

  // ---------- histórico e salvamento ----------
  function botoes() { btnDesfazer.disabled = hi <= 0; btnRefazer.disabled = hi >= hist.length - 1; vazio.hidden = objs.length > 0 || !!editando || !!vivo || !cur; }
  function foto() { hist = hist.slice(0, hi + 1); hist.push(JSON.stringify(objs)); if (hist.length > 120) hist.shift(); hi = hist.length - 1; botoes(); salvarSoon(); }
  function voltarPara(i) { hi = i; objs = JSON.parse(hist[hi]); S.sel = S.sel.filter((id) => porIdFn(id)); botoes(); pintarCtx(); redesenhar(); salvarSoon(); }
  const desfazer = () => { if (hi > 0) voltarPara(hi - 1); };
  const refazer = () => { if (hi < hist.length - 1) voltarPara(hi + 1); };
  function status(s, t, recarregar = false) { statusEl.dataset.s = s; statusTxt.textContent = t; btnRecarregar.hidden = !recarregar; }
  function miniatura() {
    const c = document.createElement('canvas'); c.width = 152; c.height = 96; const x = c.getContext('2d'); x.fillStyle = TH.papel; x.fillRect(0, 0, 152, 96);
    if (objs.length) { const pid = porId(); const b = G.uniao(objs, pid); const k = Math.min(136 / Math.max(b.w, 1), 80 / Math.max(b.h, 1), 1.2); x.save(); x.translate(76 - (b.x + b.w / 2) * k, 48 - (b.y + b.h / 2) * k); x.scale(k, k); for (const o of objs) objeto(x, o, k, pid); x.restore(); }
    return c.toDataURL('image/png');
  }
  function salvarSoon() { if (!cur) return; sujo = true; if (!falhou) status('salvando', 'Salvando…'); clearTimeout(timerSalvar); timerSalvar = setTimeout(enviar, 700); }
  async function enviar() {
    clearTimeout(timerSalvar); clearTimeout(timerRetry);
    if (!cur || !sujo) return;
    if (enviando) { timerSalvar = setTimeout(enviar, 300); return; }
    enviando = true; sujo = false; tema();
    const id = cur.id;
    try {
      const r = await api(`/api/lousas/${id}`, { metodo: 'PUT', corpo: { versao: cur.versao, titulo: cur.titulo, vista: cam, objs, miniatura: miniatura() } });
      if (cur?.id === id) { cur.versao = r.versao; falhou = false; if (!sujo) status('ok', `Salvo às ${new Date().toLocaleTimeString('pt-BR')}`); }
      const item = lista.find((l) => l.id === id); if (item) { item.titulo = cur.titulo; item.atualizada = r.atualizada; item.versao = r.versao; item.objetos = objs.length; }
      pintarLista();
    } catch (e) {
      sujo = true; falhou = true;
      if (e.status === 409) { status('erro', 'Mudou em outra aba ou aparelho', true); avisar('Este quadro foi alterado em outro lugar. Recarregue para ver a versão salva.', 'erro'); }
      else { status('erro', 'Sem conexão: tentando de novo…'); timerRetry = setTimeout(enviar, 4000); }
    } finally { enviando = false; }
    if (sujo && !falhou) timerSalvar = setTimeout(enviar, 200);
  }

  // ---------- lista e lousa aberta ----------
  async function carregarLista() {
    try { lista = await api('/api/lousas'); } catch (e) { avisar(e.message, 'erro'); lista = []; }
    pintarLista();
  }
  function pintarLista() {
    btLista.classList.toggle('ligado', vistaMod === 'lista'); btGrade.classList.toggle('ligado', vistaMod === 'grade'); ul.classList.toggle('grade', vistaMod === 'grade');
    const q = busca.value.trim().toLocaleLowerCase('pt'); const o = ordem.value;
    const itens = lista.filter((l) => (l.titulo || '').toLocaleLowerCase('pt').includes(q));
    itens.sort((a, b) => (o === 'nome' ? (a.titulo || '').localeCompare(b.titulo || '', 'pt') : o === 'cri' ? b.criada - a.criada : b.atualizada - a.atualizada));
    ul.replaceChildren(...(itens.length ? itens.map((l) => el('li', { class: `lousa-item${cur?.id === l.id ? ' ativa' : ''}` },
      el('button', { type: 'button', class: 'lousa-item-abrir', 'aria-pressed': String(cur?.id === l.id), onclick: () => abrir(l.id) },
        l.miniatura ? el('img', { class: 'lousa-miniatura', alt: '', src: l.miniatura }) : el('span', { class: 'lousa-miniatura vazia' }, icone('lousa')),
        el('span', {}, el('b', {}, l.titulo || 'Quadro sem título'), el('small', {}, `editada ${quando(l.atualizada)}`))),
      bt('bt-icone pequeno lousa-dup', 'Duplicar quadro', 'copiar', () => duplicar(l.id)))) : [el('li', { class: 'vazio' }, lista.length ? 'Nenhum quadro encontrado.' : 'Nenhum quadro ainda. Use "Novo".')]));
  }
  async function abrir(id, descartar = false) {
    if (descartar) { sujo = false; falhou = false; } else if (cur && sujo) { await enviar(); if (sujo) { avisar('Não consegui salvar o quadro atual. Tente de novo em instantes.', 'erro'); return; } }
    try {
      const l = await api(`/api/lousas/${id}`);
      cur = { id: l.id, titulo: l.titulo, versao: l.versao }; objs = l.objs; cam = l.vista ?? { x: 80, y: 80, z: 1 };
      S.sel = []; hist = [JSON.stringify(objs)]; hi = 0; falhou = false; sujo = false; editando = null; editor.hidden = true; vivo = null;
      titulo.value = cur.titulo; titulo.disabled = false; status('ok', 'Salvo'); guardar('lousaAtiva', id);
      if (estreita()) corpo.classList.add('sem-coluna'); // no celular a lista fecha e o quadro aparece
      botoes(); escolherFerr('select'); pintarCtx(); carregarLista(); redesenhar();
    } catch (e) { avisar(e.message, 'erro'); if (e.status === 404) { guardar('lousaAtiva', null); carregarLista(); } }
  }
  async function novaLousa() {
    try { const l = await api('/api/lousas', { metodo: 'POST', corpo: { titulo: 'Quadro sem título' } }); await abrir(l.id); if (!GROSSO) { titulo.focus(); titulo.select(); } }
    catch (e) { avisar(e.message, 'erro'); }
  }
  async function duplicar(id) {
    try { const l = await api(`/api/lousas/${id}/duplicar`, { metodo: 'POST' }); await abrir(l.id); } catch (e) { avisar(e.message, 'erro'); }
  }
  titulo.addEventListener('input', () => { if (cur) { cur.titulo = titulo.value; const it = lista.find((l) => l.id === cur.id); if (it) it.titulo = titulo.value; salvarSoon(); } });
  titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') titulo.blur(); e.stopPropagation(); });

  // ---------- barra de ferramentas ----------
  function montarBarra() {
    barra.replaceChildren(...FERRAMENTAS.map((f) => (f === '-' ? el('div', { class: 'lousa-sep' }) : el('button', { type: 'button', class: 'lousa-bt', title: f[2], 'aria-label': f[2], 'aria-pressed': 'false', dados: { f: f[0] },
      onclick: () => escolherFerr(f[0] === 'formas' ? S.ultimaForma ?? 'rect' : f[0] === 'linhas' ? S.ultimaLinha ?? 'arrow' : f[0]) }, icone(f[1])))));
    for (const [gav, itens] of [[gavetaFormas, FORMAS], [gavetaLinhas, LINHAS]]) gav.replaceChildren(...itens.map((f) => el('button', { type: 'button', class: 'lousa-bt', title: f[2], 'aria-label': f[2], dados: { f: f[0] }, onclick: () => escolherFerr(f[0]) }, icone(f[1]))));
    btnGrade.classList.toggle('ligado', S.grade); btnMini.classList.toggle('ligado', S.mini); mini.style.display = S.mini ? 'block' : 'none';
  }
  function escolherFerr(t) {
    if (editando) fimEdicao();
    S.ferr = t; if (GRUPO_FORMAS.has(t)) S.ultimaForma = t; if (GRUPO_LINHAS.has(t)) S.ultimaLinha = t;
    if (!['select', 'lasso', 'hand'].includes(t)) S.sel = [];
    for (const b of barra.querySelectorAll('[data-f]')) { const d = b.dataset.f; b.setAttribute('aria-pressed', String(d === t || (d === 'formas' && GRUPO_FORMAS.has(t)) || (d === 'linhas' && GRUPO_LINHAS.has(t)))); }
    for (const b of [...gavetaFormas.children, ...gavetaLinhas.children]) b.setAttribute('aria-pressed', String(b.dataset.f === t));
    gavetaFormas.hidden = !GRUPO_FORMAS.has(t); gavetaLinhas.hidden = !GRUPO_LINHAS.has(t);
    const alvo = (nome) => barra.querySelector(`[data-f="${nome}"]`);
    if (!gavetaFormas.hidden) gavetaFormas.style.top = `${alvo('formas').offsetTop + barra.offsetTop - barra.scrollTop}px`;
    if (!gavetaLinhas.hidden) gavetaLinhas.style.top = `${alvo('linhas').offsetTop + barra.offsetTop - barra.scrollTop}px`;
    tela.style.cursor = CURSOR[t] ?? 'crosshair'; dica.textContent = DICAS[t] ?? ''; pintarOpcoes(); pintarCtx(); redesenhar();
  }
  function amostras(itens, atual, aoEscolher, semNenhum) {
    const caixa = el('div', { class: 'lousa-grupo' });
    if (semNenhum) caixa.append(el('button', { type: 'button', class: 'lousa-cor nenhum', title: 'Sem preenchimento', 'aria-label': 'Sem preenchimento', 'aria-pressed': String(!atual), onclick: () => aoEscolher(null) }));
    for (const c of itens) {
      const v = Array.isArray(c) ? c[0] : c; const nome = Array.isArray(c) ? c[1] : c;
      caixa.append(el('button', { type: 'button', class: 'lousa-cor', title: nome, 'aria-label': nome, 'aria-pressed': String(atual === v), style: `background:${v === 'ink' ? 'var(--texto)' : v}`, onclick: () => aoEscolher(v) }));
    }
    caixa.append(el('input', { type: 'color', class: 'lousa-cor-livre', title: 'Cor personalizada', 'aria-label': 'Cor personalizada', value: /^#[0-9a-f]{6}$/i.test(atual || '') ? atual : '#2f6feb', oninput: (e) => aoEscolher(e.target.value) }));
    return caixa;
  }
  function deslizante(rotulo, min, max, valor, aoMudar) {
    const n = el('span', { class: 'lousa-num' }, String(valor));
    return el('div', { class: 'lousa-grupo' }, el('label', {}, rotulo), el('input', { type: 'range', min, max, value: valor, 'aria-label': rotulo, oninput: (e) => { n.textContent = e.target.value; aoMudar(+e.target.value); } }), n);
  }
  function pintarOpcoes() {
    const t = S.ferr; const f = [];
    if (t === 'pen' || t === 'smart') {
      const p = S.pens[S.penIdx];
      f.push(el('div', { class: 'lousa-grupo' }, S.pens.map((q, i) => el('button', { type: 'button', class: 'lousa-predef', title: `Predefinição ${i + 1}`, 'aria-label': `Predefinição ${i + 1}`, 'aria-pressed': String(i === S.penIdx), onclick: () => { S.penIdx = i; pintarOpcoes(); } },
        el('i', { style: `width:${Math.min(22, q.s + 4)}px;height:${Math.min(22, q.s + 4)}px;background:${q.c === 'ink' ? 'var(--texto)' : q.c}` })))));
      f.push(amostras(CORES, p.c, (v) => { p.c = v; pintarOpcoes(); }), deslizante('Espessura', 1, 30, p.s, (v) => { p.s = v; }));
    } else if (t === 'hl') f.push(amostras(CORES.slice(2), S.hl.c, (v) => { S.hl.c = v; pintarOpcoes(); }), deslizante('Espessura', 4, 40, S.hl.s, (v) => { S.hl.s = v; }));
    else if (t === 'er' || t === 'pre') f.push(deslizante('Tamanho', 8, 80, S.er, (v) => { S.er = v; }));
    else if (GRUPO_FORMAS.has(t) || GRUPO_LINHAS.has(t)) {
      f.push(el('label', {}, 'Contorno'), amostras(CORES, S.forma.c, (v) => { S.forma.c = v; pintarOpcoes(); }));
      if (GRUPO_FORMAS.has(t)) f.push(el('label', {}, 'Preenchimento'), amostras(CORES.slice(1), S.forma.f, (v) => { S.forma.f = v; pintarOpcoes(); }, true));
      f.push(deslizante('Linha', 1, 16, S.forma.s, (v) => { S.forma.s = v; }));
    } else if (t === 'sticky') f.push(el('label', {}, 'Cor do post-it'), amostras(POSTITS, S.postit, (v) => { S.postit = v; pintarOpcoes(); }));
    else if (t === 'text') f.push(amostras(CORES, S.txt.c, (v) => { S.txt.c = v; pintarOpcoes(); }), deslizante('Tamanho', 12, 72, S.txt.fs, (v) => { S.txt.fs = v; }));
    else if (t === 'frame') f.push(el('label', {}, 'Dê um nome à moldura com dois cliques no título'));
    opcoes.replaceChildren(...f); opcoes.hidden = !f.length;
  }

  // ---------- edição de texto ----------
  function iniciarEdicao(o) {
    if (!o || o.lock) return; if (editando) fimEdicao(); editando = o; S.sel = [o.id];
    const chave = o.t === 'frame' ? 'title' : 'text'; const sp = paraTela(o.x, o.y); const z = cam.z;
    editor.hidden = false; editor.value = o[chave] || ''; editor.removeAttribute('style');
    Object.assign(editor.style, { left: `${sp[0]}px`, top: `${sp[1]}px`, width: `${Math.max(60, o.w * z)}px`, height: `${Math.max(24, o.h * z)}px`, fontSize: `${(o.t === 'sticky' ? fsPostit(g, o) : (o.fs || 16)) * z}px`,
      color: o.t === 'sticky' ? '#1d1d1b' : (o.t === 'frame' ? TH.mudo : cor(o.c)), textAlign: o.t === 'text' || o.t === 'frame' ? 'left' : 'center', transform: `rotate(${o.r || 0}rad)`, transformOrigin: 'center' });
    if (o.t === 'sticky') editor.style.background = o.f;
    if (o.t === 'frame') { const tp = paraTela(o.x, o.y - 26 / z); Object.assign(editor.style, { top: `${tp[1]}px`, height: '22px', fontSize: '14px' }); }
    const ajustarPad = () => { if (o.t !== 'sticky' && o.t !== 'shape') return; const fs = (o.t === 'sticky' ? fsPostit(g, o) : o.fs) * z; g.font = `${fs / z}px system-ui, sans-serif`; editor.style.paddingTop = `${Math.max(0, (o.h * z - embrulhar(g, editor.value || ' ', o.w - 24).length * fs * 1.25) / 2)}px`; };
    editor.oninput = () => {
      o[chave] = editor.value;
      if (o.t === 'text') { const ls = editor.value.split('\n'); g.font = `${o.fs}px system-ui, sans-serif`; o.w = Math.max(40, Math.max(...ls.map((l) => g.measureText(l).width)) + 10); o.h = ls.length * o.fs * 1.25; editor.style.width = `${o.w * z}px`; editor.style.height = `${o.h * z}px`; }
      ajustarPad(); redesenhar();
    };
    ajustarPad(); editor.focus(); editor.select(); redesenhar(); pintarCtx(); botoes();
  }
  function fimEdicao() {
    if (!editando) return; const o = editando; editando = null; editor.hidden = true; editor.oninput = null;
    if (o.t === 'text' && !o.text.trim()) { objs = objs.filter((x) => x !== o); S.sel = []; }
    foto(); redesenhar(); pintarCtx(); botoes();
  }
  editor.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); fimEdicao(); escolherFerr('select'); } });
  editor.addEventListener('blur', () => setTimeout(() => { if (editando) fimEdicao(); }, 0));

  // ---------- ponteiro ----------
  const ptr = (e) => { const r = tela.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function alcaEm(p) {
    const h = alcas(); if (!h || selObjs().every((o) => o.lock)) return null;
    if (Math.hypot(p[0] - h.rot[0], p[1] - h.rot[1]) < (GROSSO ? 24 : 11)) return 'rot';
    for (let i = 0; i < 4; i++) if (Math.abs(p[0] - h.pts[i][0]) < (GROSSO ? 20 : 9) && Math.abs(p[1] - h.pts[i][1]) < (GROSSO ? 20 : 9)) return i;
    return null;
  }
  function apagarEm(p) {
    const w = paraMundo(p[0], p[1]); const raio = S.er / 2 / cam.z;
    const r = S.ferr === 'er' ? G.apagarInteiro(objs, w[0], w[1], raio) : G.apagarPedaco(objs, w[0], w[1], raio, 2.5 / cam.z + 1, uid);
    if (r.mudou) { objs = r.objs; S.sel = S.sel.filter((id) => porIdFn(id)); arrasto.mudou = true; redesenhar(); }
  }
  const novaForma = (k, x, y) => ({ id: uid(), t: 'shape', k, x, y, w: 0, h: 0, r: 0, c: S.forma.c, f: S.forma.f, s: S.forma.s, text: '', fs: 18 });
  const novoTexto = (x, y) => ({ id: uid(), t: 'text', x, y: y - S.txt.fs * 0.6, w: 40, h: S.txt.fs * 1.25, r: 0, c: S.txt.c, text: '', fs: S.txt.fs });

  tela.addEventListener('pointerdown', (e) => {
    if (!cur) return;
    if (editando) fimEdicao(); fecharPop(); menu.hidden = true;
    const p = ptr(e); pontos.set(e.pointerId, p); tela.setPointerCapture(e.pointerId); toqueIni = { x: p[0], y: p[1], t: Date.now() };
    if (e.pointerType === 'touch' && pontos.size === 2) { const [a, b] = [...pontos.values()]; arrasto = { tipo: 'pinca', a0: { x: a[0], y: a[1] }, b0: { x: b[0], y: b[1] }, cam0: { ...cam } }; vivo = null; redesenhar(); return; }
    if (arrasto?.tipo === 'pinca') return;
    const w = paraMundo(p[0], p[1]); const t = S.ferr;
    if (e.button === 1 || S.espaco || t === 'hand') { arrasto = { tipo: 'pan', sx: p[0], sy: p[1], cx: cam.x, cy: cam.y }; tela.style.cursor = 'grabbing'; return; }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const pid = porId();
    if (t === 'select') {
      for (let i = objs.length - 1; i >= 0; i--) { // X da nota adesiva: exclui na hora (Ctrl+Z volta)
        const o = objs[i]; if (o.t !== 'sticky' || o.lock) continue;
        const [x, y] = xDaNota(o); if (Math.hypot(p[0] - x, p[1] - y) < (GROSSO ? 20 : 11)) { S.sel = [o.id]; excluirSel(); return; }
      }
      const al = alcaEm(p);
      if (al !== null) { const l = selObjs().filter((o) => !o.lock); const b = G.uniao(l, pid); arrasto = { tipo: al === 'rot' ? 'girar' : 'redim', al, caixa: b, snap: l.map((o) => [o, structuredClone(o)]), a0: Math.atan2(w[1] - (b.y + b.h / 2), w[0] - (b.x + b.w / 2)) }; return; }
      const o = G.escolher(objs, w[0], w[1], tol());
      if (o) {
        const ids = G.idsDoGrupo(objs, o);
        if (e.shiftKey || e.ctrlKey || e.metaKey) S.sel = S.sel.includes(o.id) ? S.sel.filter((i) => !ids.includes(i)) : S.sel.concat(ids.filter((i) => !S.sel.includes(i)));
        else if (!S.sel.includes(o.id)) S.sel = ids;
        arrasto = { tipo: 'mover', w0: w, snap: selObjs().filter((x) => !x.lock).map((x) => [x, structuredClone(x)]), moveu: false }; pintarCtx(); redesenhar(); return;
      }
      if (!e.shiftKey) S.sel = [];
      arrasto = { tipo: 'marquee', sx: p[0], sy: p[1], cx: p[0], cy: p[1], base: S.sel.slice() }; pintarCtx(); redesenhar(); return;
    }
    if (t === 'pen' || t === 'hl' || t === 'smart') { const st = t === 'hl' ? S.hl : S.pens[S.penIdx]; vivo = { id: uid(), t: 'stroke', tool: t === 'hl' ? 'hl' : 'pen', c: st.c, s: st.s, p: [w] }; arrasto = { tipo: 'desenhar', inteligente: t === 'smart' }; S.sel = []; botoes(); redesenhar(); pintarCtx(); return; }
    if (t === 'er' || t === 'pre') { arrasto = { tipo: 'apagar', mudou: false, mouse: p }; apagarEm(p); return; }
    if (t === 'lasso') { S.sel = []; arrasto = { tipo: 'laco', pts: [w] }; pintarCtx(); redesenhar(); return; }
    if (t === 'sticky') { const o = { id: uid(), t: 'sticky', x: w[0] - 85, y: w[1] - 85, w: 170, h: 170, r: 0, f: S.postit, text: '' }; objs.push(o); escolherFerr('select'); S.sel = [o.id]; setTimeout(() => iniciarEdicao(o), 0); return; }
    if (t === 'text') { const o = novoTexto(w[0], w[1]); objs.push(o); escolherFerr('select'); S.sel = [o.id]; setTimeout(() => iniciarEdicao(o), 0); return; }
    if (GRUPO_FORMAS.has(t) || t === 'frame') {
      const nb = t === 'frame' ? { id: uid(), t: 'frame', x: w[0], y: w[1], w: 0, h: 0, r: 0, title: 'Moldura' } : novaForma(t, w[0], w[1]);
      if (t === 'frame') objs.unshift(nb); else objs.push(nb);
      arrasto = { tipo: 'forma', o: nb, ox: w[0], oy: w[1], quadro: t === 'frame' }; redesenhar(); return;
    }
    if (GRUPO_LINHAS.has(t)) { const alvo = G.ondePrender(objs, w[0], w[1], tol()); const l = { id: uid(), t: 'line', k: t, x1: w[0], y1: w[1], x2: w[0], y2: w[1], a: alvo ? { id: alvo.id } : null, b: null, c: S.forma.c, s: S.forma.s }; objs.push(l); arrasto = { tipo: 'linha', o: l }; redesenhar(); }
  });
  tela.addEventListener('pointermove', (e) => {
    const p = ptr(e); if (pontos.has(e.pointerId)) pontos.set(e.pointerId, p); const w = paraMundo(p[0], p[1]);
    if (arrasto?.tipo === 'pinca') { const v = [...pontos.values()]; if (v.length >= 2) { cam = pinca(arrasto.cam0, arrasto.a0, arrasto.b0, { x: v[0][0], y: v[0][1] }, { x: v[1][0], y: v[1][1] }, ...ZOOM); redesenhar(); } return; }
    if (!arrasto) {
      if (GRUPO_LINHAS.has(S.ferr)) { const h = G.ondePrender(objs, w[0], w[1], tol())?.id ?? null; if (h !== hover) { hover = h; redesenhar(); } } else if (hover) { hover = null; redesenhar(); }
      return;
    }
    const a = arrasto;
    if (a.tipo === 'pan') { cam = { ...cam, x: a.cx + (p[0] - a.sx), y: a.cy + (p[1] - a.sy) }; redesenhar(); return; }
    if (a.tipo === 'desenhar') { vivo.p.push(w); redesenhar(); return; }
    if (a.tipo === 'apagar') { const lp = a.mouse; const n = Math.max(1, Math.ceil(Math.hypot(p[0] - lp[0], p[1] - lp[1]) / Math.max(2, S.er / 3))); for (let q = 1; q <= n; q++) apagarEm([lp[0] + ((p[0] - lp[0]) * q) / n, lp[1] + ((p[1] - lp[1]) * q) / n]); a.mouse = p; redesenhar(); return; }
    if (a.tipo === 'laco') { a.pts.push(w); redesenhar(); return; }
    if (a.tipo === 'marquee') {
      a.cx = p[0]; a.cy = p[1]; const m0 = paraMundo(Math.min(a.sx, p[0]), Math.min(a.sy, p[1])); const m1 = paraMundo(Math.max(a.sx, p[0]), Math.max(a.sy, p[1])); const ids = a.base.slice(); const pid = porId();
      for (const o of objs) { const b = G.limites(o, pid); const toca = b.x < m1[0] && b.x + b.w > m0[0] && b.y < m1[1] && b.y + b.h > m0[1]; const todo = b.x >= m0[0] && b.y >= m0[1] && b.x + b.w <= m1[0] && b.y + b.h <= m1[1]; if ((o.t === 'frame' ? todo : toca) && !ids.includes(o.id)) ids.push(o.id); }
      S.sel = ids; redesenhar(); return;
    }
    const pid = porId();
    if (a.tipo === 'mover') { let dx = w[0] - a.w0[0]; let dy = w[1] - a.w0[1]; if (!a.moveu && Math.hypot(dx, dy) * cam.z < 3) return; a.moveu = true; if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } for (const [o, s] of a.snap) Object.assign(o, G.movido(s, dx, dy, pid)); redesenhar(); return; }
    if (a.tipo === 'redim') {
      const b = a.caixa; const i = a.al; const ox = i === 0 || i === 3 ? b.x + b.w : b.x; const oy = i === 0 || i === 1 ? b.y + b.h : b.y; const hx = i === 0 || i === 3 ? b.x : b.x + b.w; const hy = i === 0 || i === 1 ? b.y : b.y + b.h;
      let sx = Math.max(0.05, (w[0] - ox) / (hx - ox || 1)); let sy = Math.max(0.05, (w[1] - oy) / (hy - oy || 1));
      if (e.shiftKey || a.snap.some(([o]) => o.t === 'stroke' || o.t === 'line' || o.t === 'sticky')) sx = sy = Math.max(sx, sy);
      for (const [o, s] of a.snap) Object.assign(o, G.escalado(s, ox, oy, sx, sy, pid)); redesenhar(); return;
    }
    if (a.tipo === 'girar') { const b = a.caixa; const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; let da = Math.atan2(w[1] - cy, w[0] - cx) - a.a0; if (e.shiftKey) da = Math.round(da / (Math.PI / 12)) * (Math.PI / 12); for (const [o, s] of a.snap) Object.assign(o, G.girado(s, cx, cy, da, pid)); redesenhar(); return; }
    if (a.tipo === 'forma') {
      const o = a.o; let ww = w[0] - a.ox; let hh = w[1] - a.oy; if (e.shiftKey && !a.quadro) { const m = Math.max(Math.abs(ww), Math.abs(hh)); ww = Math.sign(ww || 1) * m; hh = Math.sign(hh || 1) * m; }
      o.x = Math.min(a.ox, a.ox + ww); o.y = Math.min(a.oy, a.oy + hh); o.w = Math.abs(ww); o.h = Math.abs(hh); redesenhar(); return;
    }
    if (a.tipo === 'linha') { const l = a.o; const alvo = G.ondePrender(objs, w[0], w[1], tol()); hover = alvo && (!l.a || alvo.id !== l.a.id) ? alvo.id : null; l.x2 = w[0]; l.y2 = w[1]; l.b = hover ? { id: hover } : null; redesenhar(); }
  });
  function soltar(e) {
    pontos.delete(e.pointerId);
    if (arrasto?.tipo === 'pinca') { if (pontos.size < 2) { arrasto = null; salvarSoon(); } return; }
    const a = arrasto; if (!a) return; arrasto = null; tela.style.cursor = CURSOR[S.ferr] ?? 'crosshair'; const p = ptr(e); const w = paraMundo(p[0], p[1]);
    if (e.pointerType === 'touch' && S.ferr === 'select' && toqueIni && Date.now() - toqueIni.t < 350 && Math.hypot(p[0] - toqueIni.x, p[1] - toqueIni.y) < 10) { // dois toques rápidos no mesmo lugar
      if (ultimoToque && Date.now() - ultimoToque.t < 450 && Math.hypot(p[0] - ultimoToque.x, p[1] - ultimoToque.y) < 30) { ultimoToque = null; duploToque(p); return; }
      ultimoToque = { x: p[0], y: p[1], t: Date.now() };
    }
    if (a.tipo === 'pan') { salvarSoon(); return; }
    if (a.tipo === 'desenhar') {
      const st = vivo; vivo = null; if (st.p.length < 2) st.p.push([st.p[0][0] + 0.01, st.p[0][1]]); st.p = G.densificar(st.p, 3);
      const res = a.inteligente ? G.reconhecer(st, 24 / cam.z, uid) : null; objs.push(res ?? st); if (res) S.sel = [res.id]; foto(); redesenhar(); pintarCtx(); return;
    }
    if (a.tipo === 'apagar') { if (a.mudou) foto(); redesenhar(); return; }
    if (a.tipo === 'laco') { const poli = a.pts; S.sel = objs.filter((o) => (o.t === 'stroke' ? o.p.some((q) => G.dentroDoPoligono(q, poli)) : G.dentroDoPoligono(G.centro(o.t === 'line' ? { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x1 - o.x2), h: Math.abs(o.y1 - o.y2) } : o), poli))).map((o) => o.id); escolherFerr('select'); return; }
    if (a.tipo === 'marquee') { pintarCtx(); redesenhar(); return; }
    if (a.tipo === 'mover') { if (a.moveu) foto(); pintarCtx(); redesenhar(); return; }
    if (a.tipo === 'redim' || a.tipo === 'girar') { foto(); pintarCtx(); redesenhar(); return; }
    if (a.tipo === 'forma') { const o = a.o; if (o.w < 8 && o.h < 8) { o.w = a.quadro ? 420 : 170; o.h = a.quadro ? 280 : 110; o.x = w[0] - o.w / 2; o.y = w[1] - o.h / 2; } foto(); escolherFerr('select'); S.sel = [o.id]; pintarCtx(); redesenhar(); return; }
    if (a.tipo === 'linha') {
      const l = a.o; hover = null;
      if (Math.hypot(l.x2 - l.x1, l.y2 - l.y1) * cam.z < 8 && !l.b) objs = objs.filter((x) => x !== l); else { if (l.a && l.b && l.a.id === l.b.id) l.b = null; foto(); escolherFerr('select'); S.sel = [l.id]; }
      pintarCtx(); redesenhar();
    }
  }
  tela.addEventListener('pointerup', soltar);
  tela.addEventListener('pointercancel', (e) => { pontos.delete(e.pointerId); if (arrasto?.tipo === 'pinca') arrasto = null; else if (arrasto?.tipo === 'desenhar') { vivo = null; arrasto = null; redesenhar(); } });
  function duploToque(p) {
    if (!cur || S.ferr !== 'select') return; const w = paraMundo(p[0], p[1]); const o = G.escolher(objs, w[0], w[1], tol());
    if (o && G.ehCaixa(o)) iniciarEdicao(o); else if (!o) { const t = novoTexto(w[0], w[1]); objs.push(t); S.sel = [t.id]; iniciarEdicao(t); }
  }
  tela.addEventListener('dblclick', (e) => duploToque(ptr(e)));
  let toqueIni = null; let ultimoToque = null;
  tela.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- barra contextual ----------
  function fecharPop() { pop.hidden = true; }
  function abrirPop(ancora, encher) {
    pop.replaceChildren(); encher(pop); pop.hidden = false; const r = ancora.getBoundingClientRect(); const q = palco.getBoundingClientRect();
    pop.style.left = `${Math.max(6, Math.min(r.left - q.left, q.width - 250))}px`;
    const acima = r.top - q.top - pop.offsetHeight - 8; pop.style.top = `${acima < 6 ? r.bottom - q.top + 8 : acima}px`;
  }
  function mudar(chave, valor, itens) { for (const o of itens) o[chave] = valor; foto(); redesenhar(); pintarCtx(); }
  function pintarCtx() {
    fecharPop(); const l = selObjs();
    if (!l.length || editando || (arrasto && ['mover', 'redim', 'girar'].includes(arrasto.tipo))) { ctx.hidden = true; ctx.replaceChildren(); return; }
    const bloqueado = l.every((o) => o.lock); const tem = (t) => l.some((o) => o.t === t); const f = [];
    if (!bloqueado) {
      const primeiro = l.find((o) => o.c);
      if (l.some((o) => ['stroke', 'shape', 'line', 'text'].includes(o.t))) { const b = bt('lousa-bt', 'Cor', 'paleta', () => abrirPop(b, (p) => p.append(amostras(CORES, primeiro?.c, (v) => { mudar('c', v, l.filter((o) => o.c !== undefined)); })))); f.push(b); }
      if (tem('sticky')) { const b = bt('lousa-bt', 'Cor do post-it', 'paleta', () => abrirPop(b, (p) => p.append(amostras(POSTITS, null, (v) => mudar('f', v, l.filter((o) => o.t === 'sticky')))))); f.push(b); }
      if (tem('shape')) { const sh = l.filter((o) => o.t === 'shape'); const b = bt('lousa-bt', 'Preenchimento', 'balde', () => abrirPop(b, (p) => p.append(amostras(CORES.slice(1), sh[0].f, (v) => mudar('f', v, sh), true)))); f.push(b); }
      const ws = l.filter((o) => o.s !== undefined);
      if (ws.length) f.push(el('input', { type: 'range', min: 1, max: 30, value: ws[0].s, class: 'lousa-ctx-faixa', title: 'Espessura', 'aria-label': 'Espessura', oninput: (e) => { for (const o of ws) o.s = +e.target.value; redesenhar(); }, onchange: () => foto() }));
      const tx = l.filter((o) => o.fs);
      if (tx.length) { const alt = (d) => { for (const o of tx) { o.fs = Math.max(8, Math.min(120, o.fs + d)); if (o.t === 'text') o.h = o.fs * 1.25 * G.linhasDoTexto(o); } foto(); redesenhar(); }; f.push(bt('lousa-bt', 'Letra menor', 'menos', () => alt(-2)), bt('lousa-bt', 'Letra maior', 'mais', () => alt(2))); }
      if (l.length === 1 && l[0].t === 'line') f.push(bt('lousa-bt', l[0].k === 'arrow' ? 'Trocar por linha' : 'Trocar por seta', l[0].k === 'arrow' ? 'linha' : 'setaDiag', () => { l[0].k = l[0].k === 'arrow' ? 'line' : 'arrow'; foto(); pintarCtx(); redesenhar(); }));
      if (l.length === 1 && G.ehCaixa(l[0])) f.push(bt('lousa-bt', 'Editar texto (Enter)', 'texto', () => iniciarEdicao(l[0])));
      f.push(el('span', { class: 'lousa-sep-v' }), bt('lousa-bt', 'Duplicar (Ctrl+D)', 'copiar', duplicarSel), bt('lousa-bt', 'Trazer para a frente (PgUp)', 'frente', () => camada(1)), bt('lousa-bt', 'Enviar para trás (PgDn)', 'tras', () => camada(-1)));
    }
    if (l.length > 1 || l[0].g) { const agrupado = l.every((o) => o.g); f.push(bt('lousa-bt', agrupado ? 'Desagrupar (Ctrl+Shift+G)' : 'Agrupar (Ctrl+G)', 'agrupar', alternarGrupo)); }
    f.push(bt('lousa-bt', bloqueado ? 'Desbloquear' : 'Bloquear (Ctrl+Shift+L)', bloqueado ? 'destravar' : 'cadeado', alternarTrava));
    if (!bloqueado) f.push(bt('lousa-bt', 'Excluir (Backspace)', 'lixeira', excluirSel));
    ctx.replaceChildren(...f); ctx.hidden = false; posCtx();
  }
  function posCtx() {
    if (ctx.hidden) return; const b = selCaixa(); if (!b) { ctx.hidden = true; return; }
    const a = paraTela(b.x, b.y); const bw = b.w * cam.z; const bh = b.h * cam.z; const cw = ctx.offsetWidth; const ch = ctx.offsetHeight;
    const x = Math.max(estreita() ? 8 : 70, Math.min(a[0] + bw / 2 - cw / 2, W - cw - 8)); let y = a[1] - ch - 40; if (y < 56) y = Math.min(a[1] + bh + 14, H - ch - 60);
    ctx.style.left = `${x}px`; ctx.style.top = `${Math.max(56, y)}px`;
  }

  // ---------- ações ----------
  function excluirSel() {
    const ids = S.sel.filter((id) => { const o = porIdFn(id); return o && !o.lock; }); if (!ids.length) return; const pid = porId();
    for (const o of objs) if (o.t === 'line') { const [p1, p2] = G.pontasDaLinha(o, pid); if (o.a && ids.includes(o.a.id)) { o.x1 = p1[0]; o.y1 = p1[1]; o.a = null; } if (o.b && ids.includes(o.b.id)) { o.x2 = p2[0]; o.y2 = p2[1]; o.b = null; } }
    objs = objs.filter((o) => !ids.includes(o.id)); S.sel = []; foto(); pintarCtx(); redesenhar();
  }
  function clonar(itens, d) {
    const mapa = new Map(); const grupos = new Map();
    const c = itens.map((o) => { const q = structuredClone(o); q.id = uid(); mapa.set(o.id, q.id); if (q.g) { if (!grupos.has(q.g)) grupos.set(q.g, uid()); q.g = grupos.get(q.g); } return q; });
    const pid = G.porIdDe(itens);
    c.forEach((q, i) => {
      if (q.t === 'stroke') q.p = q.p.map((p) => [p[0] + d, p[1] + d]);
      else if (q.t === 'line') {
        const [p1, p2] = G.pontasDaLinha(itens[i], pid);
        q.a = q.a && mapa.has(q.a.id) ? { id: mapa.get(q.a.id) } : null; q.b = q.b && mapa.has(q.b.id) ? { id: mapa.get(q.b.id) } : null;
        if (!q.a) { q.x1 = p1[0] + d; q.y1 = p1[1] + d; } if (!q.b) { q.x2 = p2[0] + d; q.y2 = p2[1] + d; }
      } else { q.x += d; q.y += d; }
    });
    return c;
  }
  function duplicarSel() { const l = selObjs().filter((o) => !o.lock); if (!l.length) return; const c = clonar(l, 24); objs = objs.concat(c); S.sel = c.map((q) => q.id); foto(); pintarCtx(); redesenhar(); }
  const copiarSel = () => { const l = selObjs(); if (l.length) { clip = l.map((o) => structuredClone(o)); clipN = 0; } };
  function colar() { if (!clip.length) return; clipN += 1; const c = clonar(clip, 24 * clipN); objs = objs.concat(c); S.sel = c.map((q) => q.id); foto(); pintarCtx(); redesenhar(); }
  function camada(dir) { const l = selObjs(); if (!l.length) return; const ids = l.map((o) => o.id); const resto = objs.filter((o) => !ids.includes(o.id)); objs = dir > 0 ? resto.concat(l) : l.concat(resto); foto(); redesenhar(); }
  function alternarTrava() { const l = selObjs(); const v = !l.every((o) => o.lock); for (const o of l) o.lock = v; foto(); pintarCtx(); redesenhar(); }
  function alternarGrupo() { const l = selObjs(); const agrupado = l.every((o) => o.g); const id = uid(); for (const o of l) { if (agrupado) delete o.g; else o.g = id; } foto(); pintarCtx(); }
  function selecionarTudo() { escolherFerr('select'); S.sel = objs.map((o) => o.id); pintarCtx(); redesenhar(); }
  function empurrar(dx, dy) { const l = selObjs().filter((o) => !o.lock); if (!l.length) return; const pid = porId(); for (const o of l) Object.assign(o, G.movido(structuredClone(o), dx, dy, pid)); foto(); redesenhar(); }

  // ---------- teclado ----------
  const noCampo = (e) => { const t = e.target; return t instanceof HTMLElement && t.closest('input, textarea, select, [contenteditable="true"], .xterm') !== null && !(t instanceof HTMLInputElement && t.type === 'range'); };
  function tecla(e) {
    if (corpo.hidden || document.body.dataset.guia !== 'lousa' || noCampo(e)) return;
    const k = e.key; const K = k.toLowerCase(); const mod = e.ctrlKey || e.metaKey;
    if (!modalExp.hidden || !modalAtalhos.hidden) { if (k === 'Escape') { modalExp.hidden = true; modalAtalhos.hidden = true; } return; }
    if (k === ' ' && !S.espaco) { S.espaco = true; tela.style.cursor = 'grab'; e.preventDefault(); return; }
    if (!cur) return;
    const pare = () => e.preventDefault();
    if (mod && K === 'z') { pare(); if (e.shiftKey) refazer(); else desfazer(); return; }
    if (mod && K === 'y') { pare(); refazer(); return; }
    if (mod && K === 'a') { pare(); selecionarTudo(); return; }
    if (mod && K === 'c') { copiarSel(); return; }
    if (mod && K === 'x') { copiarSel(); excluirSel(); return; }
    if (mod && K === 'v') { pare(); colar(); return; }
    if (mod && K === 'd') { pare(); duplicarSel(); return; }
    if (mod && K === 'g') { pare(); const l = selObjs(); if (e.shiftKey) { for (const o of l) delete o.g; foto(); pintarCtx(); } else if (l.length > 1) { const id = uid(); for (const o of l) o.g = id; foto(); pintarCtx(); } return; }
    if (mod && e.shiftKey && K === 'l') { pare(); alternarTrava(); return; }
    if (mod && k === '0') { pare(); zoomCentro(1 / cam.z); return; }
    if (mod && (k === '+' || k === '=')) { pare(); zoomCentro(1.25); return; }
    if (mod && k === '-') { pare(); zoomCentro(0.8); return; }
    if (e.altKey && k === '1') { pare(); ajustar(); return; }
    if (e.altKey && k === '2') { pare(); ajustarSel(); return; }
    if (mod || e.altKey) return;
    if (k === 'Backspace' || k === 'Delete') { pare(); excluirSel(); return; }
    if (k === 'Escape') { if (S.sel.length) { S.sel = []; pintarCtx(); redesenhar(); } escolherFerr('select'); fecharPop(); return; }
    if (k === 'Enter') { const u = selObjs(); if (u.length === 1 && G.ehCaixa(u[0])) { pare(); iniciarEdicao(u[0]); } return; }
    if (k === 'PageUp') { pare(); camada(1); return; }
    if (k === 'PageDown') { pare(); camada(-1); return; }
    if (k.startsWith('Arrow') && S.sel.length) { pare(); const st = e.shiftKey ? 10 : 1; const m = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[k]; empurrar(m[0], m[1]); return; }
    if (k === '+' || k === '=') { zoomCentro(1.25); return; }
    if (k === '-') { zoomCentro(0.8); return; }
    if (k === '?') { abrirAtalhos(); return; }
    if (k === 'P' && e.shiftKey) { escolherFerr('hl'); return; }
    if (k === 'E' && e.shiftKey) { escolherFerr('pre'); return; }
    if (K === 'g') { alternarGrade(); return; }
    if (K === 'm') { alternarMini(); return; }
    if (TECLAS[K]) escolherFerr(TECLAS[K]);
  }
  const soltarTecla = (e) => { if (e.key === ' ' && S.espaco) { S.espaco = false; tela.style.cursor = CURSOR[S.ferr] ?? 'crosshair'; } };
  document.addEventListener('keydown', tecla); document.addEventListener('keyup', soltarTecla);

  // ---------- atalhos e exportar ----------
  function abrirAtalhos() {
    const D = [['Ferramentas', [['V / H', 'Selecionar / Mão'], ['P', 'Caneta'], ['Shift+P', 'Marca-texto'], ['D', 'Desenho inteligente'], ['E', 'Borracha'], ['Shift+E', 'Borracha de precisão'], ['Q', 'Laço'], ['N', 'Post-it'], ['T', 'Texto'], ['R / O', 'Retângulo / Oval'], ['L', 'Seta'], ['F', 'Moldura']]],
      ['Editar', [['Ctrl+Z', 'Desfazer'], ['Ctrl+Y', 'Refazer'], ['Ctrl+C / V / X', 'Copiar, colar, recortar'], ['Ctrl+D', 'Duplicar'], ['Ctrl+A', 'Selecionar tudo'], ['Backspace', 'Excluir'], ['Enter', 'Editar texto'], ['Ctrl+G', 'Agrupar'], ['Ctrl+Shift+G', 'Desagrupar'], ['Ctrl+Shift+L', 'Bloquear'], ['PgUp / PgDn', 'Frente / trás'], ['Setas', 'Mover (Shift = 10x)']]],
      ['Navegação', [['Espaço + arrastar', 'Mover o quadro'], ['Ctrl + roda', 'Zoom'], ['+ / −', 'Zoom'], ['Ctrl+0', '100%'], ['Alt+1', 'Ajustar à tela'], ['Alt+2', 'Zoom na seleção'], ['G', 'Grade'], ['M', 'Minimapa'], ['?', 'Esta lista'], ['Esc', 'Soltar seleção']]]];
    corpoAtalhos.replaceChildren(...D.flatMap(([titulo2, itens]) => [el('h3', {}, titulo2), ...itens.map(([t, d]) => el('div', {}, el('span', {}, d), el('kbd', {}, t)))]));
    modalAtalhos.hidden = false;
  }
  function telaExport() {
    const so = expSel.checked && S.sel.length; const l = so ? selObjs() : objs; if (!l.length) return null; tema();
    const pid = porId(); const b = G.uniao(l, pid); const sc = +expEsc.value; const pad = 24;
    const c = document.createElement('canvas'); c.width = Math.ceil((b.w + 2 * pad) * sc); c.height = Math.ceil((b.h + 2 * pad) * sc); const x = c.getContext('2d');
    if (expFundo.value !== 'nenhum') { x.fillStyle = expFundo.value === 'branco' ? '#fff' : TH.papel; x.fillRect(0, 0, c.width, c.height); }
    x.scale(sc, sc); x.translate(pad - b.x, pad - b.y); for (const o of l) objeto(x, o, sc, pid); return c;
  }
  function renderExport() { const c = telaExport(); if (!c) { expImg.removeAttribute('src'); expInfo.textContent = 'Nada para exportar: o quadro está vazio.'; return; } expImg.src = c.toDataURL('image/png'); expInfo.textContent = `${c.width} × ${c.height} px`; }
  function abrirExportar() { expSel.disabled = !S.sel.length; if (!S.sel.length) expTudo.checked = true; modalExp.hidden = false; renderExport(); }
  function baixarImagem() {
    const c = telaExport(); if (!c) return;
    c.toBlob((b) => { const url = URL.createObjectURL(b); const a = el('a', { href: url, download: `${(cur?.titulo || 'lousa').replace(/[\\/:*?"<>|]/g, ' ').trim() || 'lousa'}.png` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); });
  }
  function copiarImagem() {
    const c = telaExport(); if (!c) return;
    c.toBlob(async (b) => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); expInfo.textContent = 'Imagem copiada. Cole onde quiser.'; } catch { expInfo.textContent = 'O navegador não deixou copiar. Use "Baixar PNG".'; } });
  }

  const aoPressionar = (e) => { if (!e.target.closest?.('.lousa-pop') && !e.target.closest?.('.lousa-ctx')) fecharPop(); if (!e.target.closest?.('.lousa-menu') && !e.target.closest?.('.lousa-pct')) menu.hidden = true; };
  document.addEventListener('pointerdown', aoPressionar, true);
  const aoMudarTema = ouvir('tema-mudou', () => redesenhar());
  const mq = matchMedia('(prefers-color-scheme: dark)'); const aoMudarSistema = () => redesenhar(); mq.addEventListener('change', aoMudarSistema);

  // ---------- início ----------
  montarBarra(); escolherFerr('select');
  (async () => {
    await carregarLista();
    const ultima = ler('lousaAtiva', null); const alvo = lista.find((l) => l.id === ultima) ?? lista[0];
    if (alvo) await abrir(alvo.id); else { status('ok', 'Crie seu primeiro quadro'); vazio.hidden = false; if (estreita()) corpo.classList.remove('sem-coluna'); }
  })();

  return {
    mostrar: () => { medir(); redesenhar(); },
    esconder: () => { enviar(); },
    podeFechar: () => { if (sujo && falhou) { avisar('Há alterações que ainda não foram salvas no servidor. Espere voltar a conexão.', 'erro'); return false; } enviar(); return true; },
    limpar: () => { enviar(); observador.disconnect(); document.removeEventListener('keydown', tecla); document.removeEventListener('keyup', soltarTecla); document.removeEventListener('pointerdown', aoPressionar, true); mq.removeEventListener('change', aoMudarSistema); aoMudarTema(); clearTimeout(timerSalvar); clearTimeout(timerRetry); },
  };
}

shell.registrar('lousa', montar);

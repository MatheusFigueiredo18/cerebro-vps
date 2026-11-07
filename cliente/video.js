// Função Criação de vídeo: espaço novo, ao lado dos outros.
// Barra da direita = sessões (cada vídeo é uma sessão com o próprio canvas). No canvas: mover, zoom, nós que se criam ao clicar,
// arquivos de Conteúdos (vídeo ou imagem) que viram Referência ao soltar, e ligações por tipo entre os nós.
// Ainda não gera nada: o gerador (Remotion) entra na fase 3 (docs/AREA-VIDEO.md). Sessões e grafos ficam no navegador por enquanto.
import { el, icone, botaoIcone, botaoConfirmar, ler, guardar, avisar } from './comum.js';
import { abrirJanela } from './conteudos.js';
import { nomeBase, tipoArquivo } from './formatos.js';
import { urlArquivo } from './markdown.js';
import { zoomEm, enquadrar } from './camera.js';
import { caminhosDoArrasto, arrastoTemArquivos } from './anexos.js';
import { enviarArquivos } from './envio.js';
import * as shell from './shell.js';
import * as G from './lousa-geo.js';

const ZOOM = [0.2, 2];
const FERRAMENTAS = [['caneta', 'caneta', 'Desenho livre'], ['nota', 'postit', 'Nota adesiva'], ['borracha', 'borracha', 'Borracha: apaga o traço inteiro']];
const CORES_TRACO = [['ink', 'Tinta'], ['#E2553B', 'Vermelho'], ['#E3A008', 'Amarelo'], ['#2F6FEB', 'Azul'], ['#0F8F6E', 'Verde']];
const COR_NOTA = '#FFE066';
const CAB = 20; // altura do ponto das portas, a partir do topo do card

// saida/entradas usam tipos de ligação: midia (vídeo ou imagem), lista, texto, video
const TIPOS = {
  principal: { nome: 'Conteúdo principal', sub: 'vídeo ou imagem', icone: 'filme', w: 240, h: 360, entradas: [], saida: 'midia', faz: 'O vídeo ou a imagem que é todo o contexto do vídeo: arraste de Conteúdos' },
  referencia: { nome: 'Referência', sub: 'vídeo ou imagem', icone: 'imagem', w: 220, h: 230, entradas: [], saida: 'midia', faz: 'Arraste um vídeo ou imagem de Conteúdos para o canvas' },
  lista: { nome: 'Lista', sub: 'lista', icone: 'conteudos', w: 190, h: 120, entradas: ['midia'], saida: 'lista', faz: 'Agrupa várias referências' },
  prompt: { nome: 'Prompt', sub: 'texto', icone: 'doc', w: 280, h: 190, entradas: [], saida: 'texto', faz: 'Texto livre: estilo, motion, efeitos, música, legenda' },
  remotion: { nome: 'Gerador Remotion', sub: 'vídeo', icone: 'filme', w: 260, h: 220, entradas: ['lista', 'texto', 'midia'], saida: 'video', faz: 'Monta e renderiza o vídeo na VPS' },
  magnific: { nome: 'Gerador Magnific', sub: 'opcional', icone: 'brilho', w: 260, h: 170, entradas: ['texto', 'midia'], saida: 'video', faz: 'Clipe ou imagem por IA; exige plano pago e chave da API', opcional: true },
  saida: { nome: 'Vídeo', sub: 'saída', icone: 'video', w: 220, h: 330, entradas: ['video'], saida: null, faz: 'Preview, versões e download' },
};
const CORES = { midia: 'var(--t-midia)', lista: 'var(--t-lista)', texto: 'var(--t-texto)', video: 'var(--t-video)' };

const quando = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const SVG = 'http://www.w3.org/2000/svg';

function montar(corpo) {
  let sessoes = ler('videoSessoes', []);
  let ativa = ler('videoAtiva', null);
  if (ativa && !sessoes.some((s) => s.id === ativa)) ativa = null;
  let grafo = { cam: null, nos: [], links: [] };
  let cards = new Map(); // id do nó -> { el, no }
  let topoZ = 1;

  corpo.classList.add('video-espaco');
  corpo.classList.toggle('sem-coluna', ler('videoColunaRecolhida', false) === true);

  const salvarSessoes = () => { guardar('videoSessoes', sessoes); guardar('videoAtiva', ativa); };
  const salvarGrafo = () => { if (ativa) guardar(`videoGrafo:${ativa}`, grafo); };

  // ---------- estrutura da tela ----------
  const mundo = el('div', { class: 'mundo' });
  const ligacoes = document.createElementNS(SVG, 'svg');
  ligacoes.setAttribute('class', 'ligacoes');
  ligacoes.setAttribute('aria-hidden', 'true');
  mundo.append(ligacoes);
  const tracosSvg = document.createElementNS(SVG, 'svg'); // desenho livre: por cima de tudo, sem pegar o mouse
  tracosSvg.setAttribute('class', 'video-tracos');
  tracosSvg.setAttribute('aria-hidden', 'true');
  mundo.append(tracosSvg);
  let ferr = null; // caneta, nota ou borracha (ou nenhuma)
  let corTraco = 'ink';
  const notas = new Map(); // id da nota -> elemento
  const vazio = el('div', { class: 'video-vazio' });
  const botoesNos = Object.entries(TIPOS).map(([tipo, t]) => el('button', {
    type: 'button', class: `video-no-chip${t.opcional ? ' c-opc' : ''}`, title: t.faz, onclick: () => adicionar(tipo),
  }, icone('mais'), t.nome, el('small', {}, t.sub)));
  const barraNos = el('div', { class: 'video-nos', role: 'group', 'aria-label': 'Adicionar nó' }, botoesNos);
  const zoomIndicador = el('div', { class: 'zoom-indicador', hidden: true });
  const acoes = el('div', { class: 'palco-acoes' },
    botaoIcone('mais', 'Aproximar', () => zoomCentro(1.25)),
    botaoIcone('menos', 'Afastar', () => zoomCentro(0.8)),
    botaoIcone('alvo', 'Enquadrar todos os nós', () => centralizar(true)),
    botaoIcone('lateralDireita', 'Recolher ou mostrar a barra de sessões', () => {
      guardar('videoColunaRecolhida', corpo.classList.toggle('sem-coluna'));
    }));
  const botoesFerr = FERRAMENTAS.map(([id, ic, nome]) => el('button', {
    type: 'button', class: 'video-ferr', title: nome, 'aria-label': nome, 'aria-pressed': 'false', dados: { ferr: id }, onclick: () => escolherFerr(ferr === id ? null : id),
  }, icone(ic)));
  const botoesCor = CORES_TRACO.map(([c, nome]) => el('button', {
    type: 'button', class: 'video-cor', title: nome, 'aria-label': `Cor: ${nome}`, 'aria-pressed': String(c === corTraco), dados: { cor: c },
    style: `background:${c === 'ink' ? 'var(--texto)' : c}`, onclick: () => { corTraco = c; for (const b of botoesCor) b.setAttribute('aria-pressed', String(b.dataset.cor === c)); },
  }));
  const barraCores = el('div', { class: 'video-cores', hidden: true }, botoesCor);
  const barraFerr = el('div', { class: 'video-ferramentas', role: 'toolbar', 'aria-label': 'Desenho, notas e borracha' }, botoesFerr, barraCores);
  const palco = el('div', { class: 'palco video-palco' }, mundo, vazio, barraNos, zoomIndicador, acoes, barraFerr);

  const lista = el('ul', { class: 'video-lista' });
  const coluna = el('aside', { class: 'coluna video-sessoes', 'aria-label': 'Sessões de vídeo' },
    el('div', { class: 'coluna-topo' }, el('h2', {}, 'Sessões'),
      el('button', { type: 'button', class: 'bt primario pequeno', onclick: () => novoVideo() }, icone('mais'), 'Novo vídeo')),
    lista);
  corpo.append(palco, coluna);

  // ---------- câmera ----------
  const aplicarCam = (suave = false) => {
    const { x, y, z } = grafo.cam;
    mundo.classList.toggle('suave', suave);
    mundo.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  };
  let timerZoom;
  const mostrarZoom = () => {
    zoomIndicador.textContent = `${Math.round(grafo.cam.z * 100)}%`;
    zoomIndicador.hidden = false;
    clearTimeout(timerZoom);
    timerZoom = setTimeout(() => { zoomIndicador.hidden = true; }, 900);
    salvarGrafo();
  };
  function zoomCentro(fator) {
    if (!ativa) return;
    grafo.cam = zoomEm(grafo.cam, palco.clientWidth / 2, palco.clientHeight / 2, fator, ...ZOOM);
    aplicarCam();
    mostrarZoom();
  }
  function centralizar(suave) {
    if (!ativa) return;
    grafo.cam = grafo.nos.length
      ? enquadrar(grafo.nos.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h })), { x: 0, y: 0, w: palco.clientWidth, h: palco.clientHeight }, 70, 1)
      : { x: 40, y: 80, z: 1 };
    aplicarCam(suave);
    salvarGrafo();
  }
  const paraMundo = (cx, cy) => {
    const r = palco.getBoundingClientRect();
    return { x: (cx - r.left - grafo.cam.x) / grafo.cam.z, y: (cy - r.top - grafo.cam.y) / grafo.cam.z };
  };

  // ---------- sessões ----------
  function novoVideo() {
    const numero = sessoes.reduce((m, s) => Math.max(m, s.numero), 0) + 1;
    const s = { id: crypto.randomUUID(), numero, titulo: `Vídeo ${numero}`, criada: Date.now() };
    sessoes = [s, ...sessoes];
    abrir(s.id);
    return s;
  }
  function abrir(id) {
    ativa = id;
    salvarSessoes();
    carregarGrafo();
    pintarLista();
  }
  function remover(id) {
    sessoes = sessoes.filter((s) => s.id !== id);
    try { localStorage.removeItem(`videoGrafo:${id}`); } catch { /* sem armazenamento */ }
    if (ativa === id) ativa = sessoes[0]?.id ?? null;
    salvarSessoes();
    carregarGrafo();
    pintarLista();
  }
  function pintarLista() {
    lista.replaceChildren(...(sessoes.length
      ? sessoes.map((s) => el('li', { class: `video-sessao${s.id === ativa ? ' ativa' : ''}` },
        el('button', { type: 'button', class: 'video-sessao-abrir', 'aria-pressed': String(s.id === ativa), onclick: () => abrir(s.id) },
          icone('filme'), el('span', {}, el('b', {}, s.titulo), el('small', {}, `criada ${quando(s.criada)}`))),
        botaoConfirmar('Remover', 'Remover mesmo?', () => remover(s.id), 'bt pequeno')))
      : [el('li', { class: 'vazio' }, 'Nenhuma sessão ainda. Use "Novo vídeo".')]));
  }

  // ---------- nós ----------
  function carregarGrafo() {
    for (const c of cards.values()) c.el.remove();
    for (const n of notas.values()) n.remove();
    cards = new Map();
    notas.clear();
    ligacoes.replaceChildren();
    grafo = ativa ? ler(`videoGrafo:${ativa}`, null) ?? { cam: null, nos: [], links: [] } : { cam: null, nos: [], links: [] };
    if (!grafo.cam) grafo.cam = { x: 40, y: 80, z: 1 };
    if (!Array.isArray(grafo.nos)) grafo.nos = [];
    if (!Array.isArray(grafo.links)) grafo.links = [];
    if (!Array.isArray(grafo.tracos)) grafo.tracos = [];
    if (!Array.isArray(grafo.notas)) grafo.notas = [];
    grafo.nos.forEach(pintarNo);
    grafo.notas.forEach(pintarNota);
    pintarTracos();
    aplicarCam();
    pintarLigacoes();
    pintarVazio();
  }

  // ---------- desenho livre, notas adesivas e borracha ----------
  const caminhoSvg = (p) => {
    if (p.length === 1) return `M${p[0][0]} ${p[0][1]} l0.01 0`;
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length - 1; i++) d += ` Q${p[i][0]} ${p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${(p[i][1] + p[i + 1][1]) / 2}`;
    return `${d} L${p.at(-1)[0]} ${p.at(-1)[1]}`;
  };
  function elementoTraco(t) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', caminhoSvg(t.p));
    p.setAttribute('class', 'video-traco');
    p.style.stroke = t.c === 'ink' ? 'var(--texto)' : t.c;
    p.style.strokeWidth = String(t.s);
    return p;
  }
  function pintarTracos() { tracosSvg.replaceChildren(...grafo.tracos.map(elementoTraco)); }

  function pintarNota(n) {
    let t;
    const area = el('textarea', { class: 'video-nota-texto', placeholder: 'Escreva aqui…', 'aria-label': 'Nota adesiva', rows: 4 });
    area.value = n.texto ?? '';
    area.addEventListener('input', () => { n.texto = area.value; clearTimeout(t); t = setTimeout(salvarGrafo, 400); });
    area.addEventListener('pointerdown', (e) => e.stopPropagation());
    const topo = el('div', { class: 'video-nota-topo' }, botaoIcone('x', 'Excluir nota', () => removerNota(n.id), 'pequeno video-nota-x'));
    const c = el('div', { class: 'video-nota', dados: { nota: n.id } }, topo, area);
    Object.assign(c.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${n.w}px`, height: `${n.h}px`, background: n.cor ?? COR_NOTA, zIndex: String(++topoZ) });
    c.addEventListener('pointerdown', () => { c.style.zIndex = String(++topoZ); });
    topo.addEventListener('pointerdown', (e) => arrastarNota(e, n, c));
    mundo.append(c);
    notas.set(n.id, c);
    return area;
  }
  function removerNota(id) {
    grafo.notas = grafo.notas.filter((n) => n.id !== id);
    notas.get(id)?.remove();
    notas.delete(id);
    pintarVazio();
    salvarGrafo();
  }
  function arrastarNota(e, n, c) {
    if (e.button !== 0 || e.target.closest('button')) return;
    const ini = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y };
    e.preventDefault();
    e.stopPropagation();
    const topo = e.currentTarget;
    topo.setPointerCapture(e.pointerId);
    const mover = (m) => { n.x = Math.round(ini.nx + (m.clientX - ini.x) / grafo.cam.z); n.y = Math.round(ini.ny + (m.clientY - ini.y) / grafo.cam.z); c.style.left = `${n.x}px`; c.style.top = `${n.y}px`; };
    const soltar = () => { topo.removeEventListener('pointermove', mover); salvarGrafo(); };
    topo.addEventListener('pointermove', mover);
    topo.addEventListener('pointerup', soltar, { once: true });
    topo.addEventListener('pointercancel', soltar, { once: true });
  }

  function escolherFerr(f) {
    ferr = f;
    for (const b of botoesFerr) b.setAttribute('aria-pressed', String(b.dataset.ferr === f));
    barraCores.hidden = f !== 'caneta';
    palco.classList.toggle('desenhando', !!f);
    palco.dataset.ferr = f ?? '';
  }

  // usa a ferramenta escolhida no ponto clicado; devolve true se tratou o gesto
  function usarFerramenta(e) {
    e.preventDefault();
    const p = paraMundo(e.clientX, e.clientY);
    if (ferr === 'nota') {
      const n = { id: crypto.randomUUID(), x: Math.round(p.x - 80), y: Math.round(p.y - 60), w: 170, h: 150, cor: COR_NOTA, texto: '' };
      grafo.notas.push(n);
      const area = pintarNota(n);
      escolherFerr(null);
      pintarVazio();
      salvarGrafo();
      setTimeout(() => area.focus(), 0);
      return;
    }
    palco.setPointerCapture(e.pointerId);
    if (ferr === 'caneta') {
      const traco = { id: crypto.randomUUID(), t: 'stroke', tool: 'pen', c: corTraco, s: Math.max(2, 3 / grafo.cam.z), p: [[p.x, p.y]] };
      const vivo = elementoTraco(traco);
      tracosSvg.append(vivo);
      const mover = (m) => { const q = paraMundo(m.clientX, m.clientY); traco.p.push([q.x, q.y]); vivo.setAttribute('d', caminhoSvg(traco.p)); };
      const soltar = () => {
        palco.removeEventListener('pointermove', mover);
        if (traco.p.length < 2) traco.p.push([traco.p[0][0] + 0.01, traco.p[0][1]]);
        traco.p = G.densificar(traco.p, 3);
        grafo.tracos.push(traco);
        pintarTracos();
        pintarVazio();
        salvarGrafo();
      };
      palco.addEventListener('pointermove', mover);
      palco.addEventListener('pointerup', soltar, { once: true });
      palco.addEventListener('pointercancel', soltar, { once: true });
      return;
    }
    // borracha: passa por cima de um traço e ele some inteiro (nós e notas não são tocados)
    let ultimo = p; let mudou = false;
    const apagar = (q) => {
      const r = G.apagarInteiro(grafo.tracos, q.x, q.y, 10 / grafo.cam.z);
      if (r.mudou) { grafo.tracos = r.objs; mudou = true; pintarTracos(); }
    };
    apagar(p);
    const mover = (m) => {
      const q = paraMundo(m.clientX, m.clientY);
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - ultimo.x, q.y - ultimo.y) * grafo.cam.z / 6));
      for (let i = 1; i <= n; i += 1) apagar({ x: ultimo.x + ((q.x - ultimo.x) * i) / n, y: ultimo.y + ((q.y - ultimo.y) * i) / n });
      ultimo = q;
    };
    const soltar = () => { palco.removeEventListener('pointermove', mover); if (mudou) { pintarVazio(); salvarGrafo(); } };
    palco.addEventListener('pointermove', mover);
    palco.addEventListener('pointerup', soltar, { once: true });
    palco.addEventListener('pointercancel', soltar, { once: true });
  }

  function pintarVazio() {
    const atual = sessoes.find((s) => s.id === ativa);
    vazio.hidden = !!atual && (grafo.nos.length > 0 || grafo.tracos.length > 0 || grafo.notas.length > 0);
    vazio.replaceChildren(
      el('span', { class: 'video-vazio-icone' }, icone('filme')),
      ...(atual
        ? [el('h2', {}, atual.titulo), el('p', {}, 'Clique em um nó na faixa de baixo para criar, ou arraste um vídeo ou imagem de Conteúdos para cá.')]
        : [el('h2', {}, 'Criação de vídeo'), el('p', {}, 'Crie uma sessão para começar: cada vídeo é uma sessão com o próprio canvas.'),
          el('button', { type: 'button', class: 'bt primario', onclick: () => novoVideo() }, icone('mais'), 'Novo vídeo')]));
  }

  function adicionar(tipo, extra = {}) {
    if (!ativa) novoVideo();
    if ((tipo === 'referencia' || tipo === 'principal') && !extra.caminho) {
      abrirJanela(); // abre a galeria; a pessoa arrasta o arquivo para o canvas
      avisar('Arraste um vídeo ou imagem de Conteúdos para o canvas.');
      return null;
    }
    const t = TIPOS[tipo];
    const centro = extra.x !== undefined ? { x: extra.x, y: extra.y } : paraMundo(palco.getBoundingClientRect().left + palco.clientWidth / 2 - (t.w * grafo.cam.z) / 2, palco.getBoundingClientRect().top + palco.clientHeight / 2 - (t.h * grafo.cam.z) / 2);
    const desloc = (grafo.nos.length % 6) * 24;
    const no = { id: crypto.randomUUID(), tipo, x: Math.round(centro.x + desloc), y: Math.round(centro.y + desloc), w: t.w, h: t.h, dados: extra.caminho ? { caminho: extra.caminho } : {} };
    grafo.nos.push(no);
    pintarNo(no);
    focar(no.id);
    pintarLigacoes();
    pintarVazio();
    salvarGrafo();
    return no;
  }

  function focar(id) {
    for (const [i, c] of cards) c.el.classList.toggle('focado', i === id);
    const c = cards.get(id);
    if (c) c.el.style.zIndex = String(++topoZ);
  }

  function corpoDoNo(no) {
    if (no.tipo === 'referencia' || no.tipo === 'principal') {
      const c = no.dados.caminho;
      const tipo = tipoArquivo(c);
      const miniatura = tipo === 'video'
        ? el('video', { src: `${urlArquivo(c)}#t=0.1`, muted: true, loop: true, preload: 'metadata', playsInline: true, title: 'Passe o mouse para ver a prévia' })
        : el('img', { src: urlArquivo(c), alt: nomeBase(c), draggable: false, loading: 'lazy' });
      return el('div', { class: `video-ref${no.tipo === 'principal' ? ' principal' : ''}` }, miniatura, el('small', { title: c }, nomeBase(c)));
    }
    if (no.tipo === 'prompt') {
      const area = el('textarea', { class: 'video-prompt', placeholder: 'Descreva o vídeo: estilo, motion, efeitos, música, legenda…', rows: 6, 'aria-label': 'Prompt' });
      area.value = no.dados.texto ?? '';
      let t;
      area.addEventListener('input', () => { no.dados.texto = area.value; clearTimeout(t); t = setTimeout(salvarGrafo, 400); });
      area.addEventListener('pointerdown', (e) => e.stopPropagation());
      return area;
    }
    if (no.tipo === 'lista') {
      const n = grafo.links.filter((l) => l.b === no.id).length;
      return el('div', { class: 'video-info' }, el('b', {}, `${n} item${n === 1 ? '' : 's'}`), el('small', {}, 'Ligue referências na bolinha da esquerda.'));
    }
    if (no.tipo === 'remotion' || no.tipo === 'magnific') {
      const t = TIPOS[no.tipo];
      return el('div', { class: 'video-info' }, el('small', {}, t.faz),
        el('button', { type: 'button', class: 'bt primario pequeno', disabled: true, title: 'Entra na fase 3' }, icone('play'), 'Rodar (em breve)'),
        t.opcional ? el('small', {}, 'Desligado: exige plano pago da Magnific e chave da API.') : el('small', {}, 'Liga lista, prompt e referências aqui.'));
    }
    return el('div', { class: 'video-saida' }, icone('filme'), el('small', {}, 'O vídeo pronto aparece aqui.'));
  }

  function pintarNo(no) {
    const t = TIPOS[no.tipo];
    if (!t) return;
    const topo = el('div', { class: 'card-topo' }, icone(t.icone), el('div', { class: 'card-titulos' }, el('b', { class: 'card-titulo' }, t.nome), el('small', { class: 'card-sub' }, t.sub)),
      el('div', { class: 'card-extras' }, botaoIcone('x', 'Remover nó', () => removerNo(no.id), 'pequeno')));
    const c = el('div', { class: `card video-no${t.opcional ? ' opc' : ''}`, dados: { no: no.id } }, topo, el('div', { class: 'card-corpo' }, corpoDoNo(no)));
    Object.assign(c.style, { left: `${no.x}px`, top: `${no.y}px`, width: `${no.w}px`, height: `${no.h}px` });
    if (t.entradas.length) c.append(el('span', { class: 'video-porta e', title: `Entrada: ${t.entradas.join(', ')}`, dados: { porta: 'e', no: no.id } }));
    if (t.saida) c.append(el('span', { class: 'video-porta s', style: `background:${CORES[t.saida]}`, title: `Saída: ${t.saida}. Arraste até a entrada de outro nó`, dados: { porta: 's', no: no.id },
      onpointerdown: (e) => ligarDe(e, no) }));
    c.addEventListener('pointerdown', () => focar(no.id));
    topo.addEventListener('pointerdown', (e) => arrastarNo(e, no));
    mundo.append(c);
    cards.set(no.id, { el: c, no });
  }

  function removerNo(id) {
    grafo.nos = grafo.nos.filter((n) => n.id !== id);
    grafo.links = grafo.links.filter((l) => l.a !== id && l.b !== id);
    cards.get(id)?.el.remove();
    cards.delete(id);
    atualizarListas();
    pintarLigacoes();
    pintarVazio();
    salvarGrafo();
  }

  function atualizarListas() {
    for (const { el: c, no } of cards.values()) if (no.tipo === 'lista') c.querySelector('.card-corpo').replaceChildren(corpoDoNo(no));
  }

  function arrastarNo(e, no) {
    if (e.button !== 0 || e.target.closest('button, a, input, textarea')) return;
    const c = cards.get(no.id).el;
    const ini = { x: e.clientX, y: e.clientY, nx: no.x, ny: no.y };
    e.preventDefault();
    e.stopPropagation();
    const topo = e.currentTarget;
    topo.setPointerCapture(e.pointerId);
    const mover = (m) => {
      no.x = Math.round(ini.nx + (m.clientX - ini.x) / grafo.cam.z);
      no.y = Math.round(ini.ny + (m.clientY - ini.y) / grafo.cam.z);
      c.style.left = `${no.x}px`;
      c.style.top = `${no.y}px`;
      pintarLigacoes();
    };
    const soltar = () => { topo.removeEventListener('pointermove', mover); salvarGrafo(); };
    topo.addEventListener('pointermove', mover);
    topo.addEventListener('pointerup', soltar, { once: true });
    topo.addEventListener('pointercancel', soltar, { once: true });
  }

  // ---------- ligações ----------
  const curva = (x1, y1, x2, y2) => `M${x1} ${y1} C${x1 + 70} ${y1} ${x2 - 70} ${y2} ${x2} ${y2}`;
  function pintarLigacoes() {
    ligacoes.replaceChildren();
    for (const l of grafo.links) {
      const a = grafo.nos.find((n) => n.id === l.a);
      const b = grafo.nos.find((n) => n.id === l.b);
      if (!a || !b) continue;
      const d = curva(a.x + a.w, a.y + CAB, b.x, b.y + CAB);
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', 'video-fio');
      p.style.stroke = CORES[TIPOS[a.tipo].saida];
      const alvo = document.createElementNS(SVG, 'path');
      alvo.setAttribute('d', d);
      alvo.setAttribute('class', 'ligacao-alvo');
      alvo.addEventListener('dblclick', () => { grafo.links = grafo.links.filter((o) => o !== l); atualizarListas(); pintarLigacoes(); salvarGrafo(); });
      const dica = document.createElementNS(SVG, 'title');
      dica.textContent = 'Duplo clique para desfazer a ligação';
      alvo.append(dica);
      ligacoes.append(p, alvo);
    }
  }

  function compativel(a, b) {
    return a.id !== b.id && !!TIPOS[a.tipo].saida && TIPOS[b.tipo].entradas.includes(TIPOS[a.tipo].saida)
      && !grafo.links.some((l) => l.a === a.id && l.b === b.id);
  }

  function ligarDe(e, no) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const provisoria = document.createElementNS(SVG, 'path');
    provisoria.setAttribute('class', 'video-fio provisoria');
    provisoria.style.stroke = CORES[TIPOS[no.tipo].saida];
    ligacoes.append(provisoria);
    palco.classList.add('ligando');
    const desenhar = (m) => { const q = paraMundo(m.clientX, m.clientY); provisoria.setAttribute('d', curva(no.x + no.w, no.y + CAB, q.x, q.y)); };
    desenhar(e);
    const fim = (m) => {
      document.removeEventListener('pointermove', desenhar);
      document.removeEventListener('pointerup', fim);
      document.removeEventListener('pointercancel', fim);
      palco.classList.remove('ligando');
      provisoria.remove();
      if (m.type === 'pointercancel') return;
      const alvoEl = document.elementFromPoint(m.clientX, m.clientY)?.closest('.video-no');
      const alvo = alvoEl && grafo.nos.find((n) => n.id === alvoEl.dataset.no);
      if (!alvo) return;
      if (!compativel(no, alvo)) { avisar(`${TIPOS[no.tipo].nome} não liga em ${TIPOS[alvo.tipo].nome}: tipos diferentes.`); return; }
      grafo.links.push({ a: no.id, b: alvo.id });
      atualizarListas();
      pintarLigacoes();
      salvarGrafo();
    };
    document.addEventListener('pointermove', desenhar);
    document.addEventListener('pointerup', fim);
    document.addEventListener('pointercancel', fim);
  }

  // ---------- mover o canvas, zoom e soltar arquivos ----------
  palco.addEventListener('pointerdown', (e) => {
    if (e.button === 0 && ativa && ferr && !e.target.closest('.palco-acoes, .video-nos, .video-ferramentas, button, .video-vazio .bt, .video-nota')) { usarFerramenta(e); return; }
    if (e.button !== 0 || !ativa || e.target.closest('.video-no, .video-nota, .video-ferramentas, .palco-acoes, .video-nos, button, .video-vazio .bt')) return;
    e.preventDefault(); // mover o canvas não seleciona texto
    const ini = { x: e.clientX, y: e.clientY, cx: grafo.cam.x, cy: grafo.cam.y };
    palco.setPointerCapture(e.pointerId);
    palco.classList.add('arrastando');
    const mover = (m) => { grafo.cam = { ...grafo.cam, x: ini.cx + m.clientX - ini.x, y: ini.cy + m.clientY - ini.y }; aplicarCam(); };
    const soltar = () => { palco.removeEventListener('pointermove', mover); palco.classList.remove('arrastando'); salvarGrafo(); };
    palco.addEventListener('pointermove', mover);
    palco.addEventListener('pointerup', soltar, { once: true });
    palco.addEventListener('pointercancel', soltar, { once: true });
  });
  palco.addEventListener('wheel', (e) => {
    if (!ativa) return;
    if (e.target.closest('textarea')) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const r = palco.getBoundingClientRect();
      grafo.cam = zoomEm(grafo.cam, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.003), ...ZOOM);
      aplicarCam();
      mostrarZoom();
      return;
    }
    grafo.cam = { ...grafo.cam, x: grafo.cam.x - e.deltaX, y: grafo.cam.y - e.deltaY };
    aplicarCam();
    salvarGrafo();
  }, { passive: false });

  async function soltar(e) {
    const dt = e.dataTransfer;
    const caminhos = caminhosDoArrasto(dt);
    const arquivos = caminhos.length ? [] : [...(dt.files ?? [])]; // ler antes de qualquer await
    const ponto = { x: e.clientX, y: e.clientY };
    if (!ativa) novoVideo();
    if (arquivos.length) caminhos.push(...await enviarArquivos(arquivos));
    const midias = caminhos.filter((c) => ['imagem', 'video'].includes(tipoArquivo(c)));
    if (caminhos.length > midias.length) avisar('Só vídeo ou imagem entra no canvas; os outros arquivos foram ignorados.');
    const base = paraMundo(ponto.x, ponto.y);
    // o primeiro vídeo ou imagem vira o Conteúdo principal; os seguintes entram como Referência
    let temPrincipal = grafo.nos.some((n) => n.tipo === 'principal');
    midias.forEach((c, i) => {
      const tipo = temPrincipal ? 'referencia' : 'principal';
      temPrincipal = true;
      adicionar(tipo, { caminho: c, x: Math.round(base.x - TIPOS[tipo].w / 2 + i * 30), y: Math.round(base.y - 40 + i * 30) });
    });
  }
  palco.addEventListener('dragover', (e) => {
    if (!arrastoTemArquivos(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    palco.classList.add('alvo-solta');
  });
  palco.addEventListener('dragleave', (e) => { if (!palco.contains(e.relatedTarget)) palco.classList.remove('alvo-solta'); });
  palco.addEventListener('drop', (e) => {
    if (!arrastoTemArquivos(e.dataTransfer)) return;
    e.preventDefault();
    palco.classList.remove('alvo-solta');
    document.body.classList.remove('arrastando-arquivo');
    soltar(e);
  });

  pintarLista();
  carregarGrafo();
  return {
    mostrar: () => { if (ativa) aplicarCam(); },
  };
}

shell.registrar('video', montar);

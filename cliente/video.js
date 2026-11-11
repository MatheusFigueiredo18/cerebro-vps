// Função Criação de vídeo: espaço novo, ao lado dos outros.
// Barra da direita = sessões (cada vídeo é uma sessão com o próprio canvas). No canvas: mover, zoom, nós que se criam ao clicar,
// arquivos de Conteúdos (vídeo ou imagem) que viram Referência ao soltar, e ligações por tipo entre os nós.
// "Gerar vídeo" (fase 3, docs/AREA-VIDEO.md): o servidor roda um Claude sem tela que faz o vídeo no Remotion; o nó Claude continua a mesma sessão para ajustes.
// Cada sessão fica no servidor (/api/video, um JSON por sessão; geração em /api/video/:id/gerar); o navegador só lembra qual estava aberta.
import { el, icone, botaoIcone, botaoConfirmar, ler, guardar, avisar, api } from './comum.js';
import { abrirJanela } from './conteudos.js';
import { nomeBase, tipoArquivo } from './formatos.js';
import { urlArquivo } from './markdown.js';
import { zoomEm, enquadrar } from './camera.js';
import { caminhosDoArrasto, arrastoTemArquivos } from './anexos.js';
import { enviarArquivos } from './envio.js';
import * as shell from './shell.js';
import * as G from './lousa-geo.js';
import { entradasDe, ligadoEm, ehAudio, clonar, nosNaArea } from './video-grafo.js';

const ZOOM = [0.2, 2];
// as duas primeiras ficam antes do +; as outras depois dele
const FERRAMENTAS = [['selecao', 'cursor', 'Seleção: clique ou arraste para selecionar nós'], ['mao', 'mao', 'Mão: arrastar o canvas'],
  ['tesoura', 'precisao', 'Tesoura: passe por cima de uma ligação para cortar'], ['caneta', 'caneta', 'Desenho livre'], ['nota', 'postit', 'Nota adesiva'], ['borracha', 'borracha', 'Borracha: apaga o traço inteiro']];
const DESENHO = new Set(['tesoura', 'caneta', 'nota', 'borracha']); // ferramentas que agem no canvas e deixam os nós sem clique
const CORES_TRACO = [['ink', 'Tinta'], ['#E2553B', 'Vermelho'], ['#E3A008', 'Amarelo'], ['#2F6FEB', 'Azul'], ['#0F8F6E', 'Verde']];
const COR_NOTA = '#FFE066';
const CAB = 20; // altura do ponto das portas, a partir do topo do card

// saida/entradas usam tipos de ligação: midia (vídeo ou imagem), audio, lista, texto, video. Em todo card a entrada fica à esquerda e a saída à direita.
const TIPOS = {
  principal: { nome: 'Conteúdo principal', sub: 'vídeo ou imagem', icone: 'filme', w: 240, h: 360, entradas: [], saida: 'midia', faz: 'O vídeo ou a imagem que é todo o contexto do vídeo: arraste de Conteúdos' },
  referencia: { nome: 'Referência', sub: 'vídeo ou imagem', icone: 'imagem', w: 240, h: 360, entradas: [], saida: 'midia', faz: 'Arraste um vídeo ou imagem de Conteúdos para o canvas' },
  modelo: { nome: 'Modelo base', sub: 'vídeo de modelo', icone: 'modelo', w: 260, h: 480, entradas: [], saida: 'midia', faz: 'Um vídeo que serve de base: escolha o que copiar dele (texto, edição, fundo, animações)' },
  lista: { nome: 'Lista', sub: 'lista', icone: 'conteudos', w: 280, h: 300, entradas: ['midia'], saida: 'lista', faz: 'Agrupa várias referências: a mídia ligada nela entra para dentro da lista' },
  musica: { nome: 'Música', sub: 'áudio de fundo', icone: 'musica', w: 260, h: 150, entradas: [], saida: 'audio', faz: 'Trilha por baixo da fala: arraste um áudio de Conteúdos para este card' },
  efeito: { nome: 'Efeito sonoro', sub: 'áudio curto', icone: 'ondas', w: 260, h: 150, entradas: [], saida: 'audio', faz: 'Whoosh, pop, clique: arraste um áudio de Conteúdos para este card' },
  prompt: { nome: 'Prompt', sub: 'texto', icone: 'doc', w: 280, h: 190, entradas: ['midia', 'audio'], saida: 'texto', faz: 'Texto livre sobre a mídia ligada nele: estilo, motion, efeitos, música, legenda' },
  claude: { nome: 'Claude', sub: 'acompanhar e corrigir', icone: 'terminal', w: 320, h: 380, entradas: ['midia', 'audio', 'texto', 'lista'], saida: 'texto', faz: 'Converse com o Claude que faz o vídeo: peça ajustes sem encerrar a sessão' },
  remotion: { nome: 'Gerar vídeo', sub: 'Remotion', icone: 'filme', w: 260, h: 260, entradas: ['lista', 'texto', 'midia', 'audio'], saida: 'video', faz: 'O Claude monta o vídeo no Remotion e renderiza na VPS' },
  magnific: { nome: 'Gerador Magnific', sub: 'opcional', icone: 'brilho', w: 260, h: 170, entradas: ['texto', 'midia'], saida: 'video', faz: 'Clipe ou imagem por IA; exige plano pago e chave da API', opcional: true },
  saida: { nome: 'Vídeo Final', sub: 'saída', icone: 'video', w: 220, h: 330, entradas: ['video'], saida: null, faz: 'Preview, versões e download' },
};
// o que dá para copiar do Modelo base; as chaves são as mesmas de EXTRAIR em servidor/geracao.js
const EXTRAIR = [['texto', 'Estilo de texto'], ['edicao', 'Estilo de edição'], ['fundo', 'Fundo do vídeo'], ['edicoes', 'Edições do vídeo'], ['animacao', 'Animação']];
const subDe = (no) => (['principal', 'referencia'].includes(no.tipo) && no.dados?.caminho ? (tipoArquivo(no.dados.caminho) === 'video' ? 'Vídeo' : 'Imagem') : TIPOS[no.tipo].sub);
const CORES = { midia: 'var(--t-midia)', audio: 'var(--t-audio)', lista: 'var(--t-lista)', texto: 'var(--t-texto)', video: 'var(--t-video)' };

const quando = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const SVG = 'http://www.w3.org/2000/svg';

function montar(corpo) {
  let sessoes = []; // vêm do servidor (iniciar)
  let ativa = ler('videoAtiva', null);
  let grafo = { cam: null, nos: [], links: [] };
  const versoes = new Map(); // id da sessão -> versão no servidor
  const criadas = new Map(); // id da sessão -> promessa da criação no servidor
  let carregando = false; let sujo = false; let enviando = false; let falhou = false; let timerEnvio = 0;
  let cards = new Map(); // id do nó -> { el, no }
  let topoZ = 1;
  // geração da sessão aberta (servidor): estado, conversa com o Claude e vídeos prontos (o mais novo primeiro)
  const GER_VAZIA = { estado: 'parado', chat: [], videos: [] };
  let ger = GER_VAZIA; let timerGer = 0;
  const rascunhos = new Map(); // id do nó Claude -> texto ainda não enviado
  const vendoSkills = new Set(); // ids dos Gerar vídeo com a lista de habilidades aberta
  let skills = null; // skills do cérebro (/api/video/habilidades), lidas uma vez

  corpo.classList.add('video-espaco');
  corpo.classList.toggle('sem-coluna', ler('videoColunaRecolhida', false) === true);

  const salvarSessoes = () => { guardar('videoAtiva', ativa); };
  // salva a sessão aberta no servidor, sem pressa (700 ms depois da última mudança); tenta de novo se a conexão cair
  function salvarGrafo() {
    if (!ativa || carregando) return;
    sujo = true;
    clearTimeout(timerEnvio);
    timerEnvio = setTimeout(enviarGrafo, 700);
  }
  async function enviarGrafo() {
    clearTimeout(timerEnvio);
    if (!ativa || !sujo || carregando) return;
    if (enviando) { timerEnvio = setTimeout(enviarGrafo, 300); return; }
    const id = ativa; const g = grafo; enviando = true; sujo = false; // g: o canvas desta sessão, mesmo que a tela já troque de sessão
    try {
      await criadas.get(id);
      const r = await api(`/api/video/${id}`, { metodo: 'PUT', corpo: { versao: versoes.get(id), titulo: sessoes.find((x) => x.id === id)?.titulo, grafo: g } });
      versoes.set(id, r.versao); falhou = false;
    } catch (e) {
      sujo = true; falhou = true;
      if (e.status === 409) avisar('Esta sessão foi alterada em outro lugar. Recarregue a página para ver a versão salva.', 'erro');
      else timerEnvio = setTimeout(enviarGrafo, 4000);
    } finally { enviando = false; }
    if (sujo && !falhou) timerEnvio = setTimeout(enviarGrafo, 200);
  }

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
  let ferr = 'selecao'; // selecao, mao, tesoura, caneta, nota ou borracha
  let selecao = new Set(); // ids dos nós selecionados
  let corTraco = 'ink';
  const notas = new Map(); // id da nota -> elemento
  const vazio = el('div', { class: 'video-vazio' });
  const botoesNos = Object.entries(TIPOS).map(([tipo, t]) => el('button', {
    type: 'button', class: `video-no-chip${t.opcional ? ' c-opc' : ''}`, title: t.faz, onclick: () => { abrirMenuNos(false); adicionar(tipo); },
  }, icone('mais'), t.nome, el('small', {}, t.sub)));
  // os nós ficam dentro do + da barra de ferramentas
  const barraNos = el('div', { class: 'video-nos', id: 'video-menu-nos', role: 'group', 'aria-label': 'Adicionar nó', hidden: true }, botoesNos);
  const botaoMais = el('button', { type: 'button', class: 'video-ferr', title: 'Adicionar nó', 'aria-label': 'Adicionar nó', 'aria-expanded': 'false', 'aria-controls': 'video-menu-nos', onclick: () => abrirMenuNos(barraNos.hidden) }, icone('mais'));
  function abrirMenuNos(abrir) {
    barraNos.hidden = !abrir;
    botaoMais.setAttribute('aria-expanded', String(abrir));
  }
  document.addEventListener('pointerdown', (e) => { if (!barraNos.hidden && !e.target.closest('.video-ferramentas')) abrirMenuNos(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !barraNos.hidden) abrirMenuNos(false); });
  const alternarColuna = () => guardar('videoColunaRecolhida', corpo.classList.toggle('sem-coluna'));
  const zoomIndicador = el('div', { class: 'zoom-indicador', hidden: true });
  const acoes = el('div', { class: 'palco-acoes' },
    botaoIcone('mais', 'Aproximar', () => zoomCentro(1.25)),
    botaoIcone('menos', 'Afastar', () => zoomCentro(0.8)),
    botaoIcone('alvo', 'Enquadrar todos os nós', () => centralizar(true)),
    botaoIcone('lateralDireita', 'Recolher ou mostrar a barra de sessões', alternarColuna));
  const botoesFerr = FERRAMENTAS.map(([id, ic, nome]) => el('button', {
    type: 'button', class: 'video-ferr', title: nome, 'aria-label': nome, 'aria-pressed': String(id === ferr), dados: { ferr: id }, onclick: () => escolherFerr(ferr === id ? 'selecao' : id),
  }, icone(ic)));
  const botoesCor = CORES_TRACO.map(([c, nome]) => el('button', {
    type: 'button', class: 'video-cor', title: nome, 'aria-label': `Cor: ${nome}`, 'aria-pressed': String(c === corTraco), dados: { cor: c },
    style: `background:${c === 'ink' ? 'var(--texto)' : c}`, onclick: () => { corTraco = c; for (const b of botoesCor) b.setAttribute('aria-pressed', String(b.dataset.cor === c)); },
  }));
  const barraCores = el('div', { class: 'video-cores', hidden: true }, botoesCor);
  const barraFerr = el('div', { class: 'video-ferramentas', role: 'toolbar', 'aria-label': 'Seleção, mão, nós, tesoura, desenho, notas e borracha' },
    barraNos, botoesFerr.slice(0, 2), botaoMais, botoesFerr.slice(2), barraCores);
  const menuCtx = el('div', { class: 'video-menu-ctx', role: 'menu', hidden: true });
  const areaSel = el('div', { class: 'video-area-selecao', hidden: true });
  mundo.append(areaSel);
  const palco = el('div', { class: 'palco video-palco', dados: { ferr } }, mundo, vazio, zoomIndicador, acoes, barraFerr, menuCtx);

  const lista = el('ul', { class: 'video-lista' });
  const coluna = el('aside', { class: 'coluna video-sessoes', 'aria-label': 'Sessões de vídeo' },
    el('div', { class: 'coluna-topo' }, el('h2', {}, 'Sessões'),
      el('span', { class: 'lousa-coluna-acoes' },
        el('button', { type: 'button', class: 'bt primario pequeno', onclick: () => novoVideo() }, icone('mais'), 'Novo vídeo'),
        botaoIcone('lateralDireita', 'Recolher a barra de sessões', alternarColuna))),
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
    versoes.set(s.id, 1);
    criadas.set(s.id, api('/api/video', { metodo: 'POST', corpo: { id: s.id, numero, titulo: s.titulo, criada: s.criada } }).then((r) => { versoes.set(s.id, r.versao); }).catch(() => avisar('Não consegui criar a sessão no servidor.', 'erro')));
    abrir(s.id, true); // sessão nova: o canvas já abre vazio, sem esperar o servidor
    return s;
  }
  async function abrir(id, nova = false) {
    if (nova) { // sessão nova: troca na hora (quem chamou já usa o canvas), e o que estava aberto segue sendo salvo
      if (ativa && sujo) enviarGrafo();
      ativa = id; carregando = false; sujo = false; ger = GER_VAZIA; clearTimeout(timerGer);
      salvarSessoes(); pintarLista(); carregarGrafo(null);
      return;
    }
    if (ativa && ativa !== id && sujo) await enviarGrafo();
    ativa = id;
    salvarSessoes();
    pintarLista();
    carregando = true;
    ger = GER_VAZIA; clearTimeout(timerGer);
    carregarGrafo(null);
    try {
      const r = await api(`/api/video/${id}`);
      if (ativa !== id) return;
      versoes.set(id, r.versao);
      carregando = false;
      carregarGrafo(r.grafo);
      carregarGeracao(id);
    } catch (e) { avisar(e.message, 'erro'); } finally { if (ativa === id) carregando = false; }
  }
  // "Remover" arquiva no servidor (o arquivo fica guardado): some da lista, sem apagar nada
  function remover(id) {
    api(`/api/video/${id}/arquivar`, { metodo: 'POST' }).catch(() => avisar('Não consegui arquivar no servidor.', 'erro'));
    sessoes = sessoes.filter((s) => s.id !== id);
    if (ativa === id) { ativa = null; sujo = false; }
    if (!ativa && sessoes[0]) abrir(sessoes[0].id);
    else if (!ativa) { salvarSessoes(); carregarGrafo(null); }
    salvarSessoes();
    pintarLista();
  }
  async function iniciar() {
    try {
      let lst = await api('/api/video');
      const locais = ler('videoSessoes', []);
      if (!lst.length && locais.length) { // uma vez só: o que estava só neste navegador sobe para o servidor
        for (const s of [...locais].reverse()) {
          try { await api('/api/video', { metodo: 'POST', corpo: { id: s.id, numero: s.numero, titulo: s.titulo, criada: s.criada, grafo: ler(`videoGrafo:${s.id}`, null) ?? undefined } }); } catch { /* segue com as outras */ }
        }
        lst = await api('/api/video');
        if (lst.length) avisar('Suas sessões de vídeo agora ficam guardadas no servidor.');
      }
      sessoes = lst;
    } catch (e) { avisar(e.message, 'erro'); }
    if (ativa && !sessoes.some((s) => s.id === ativa)) ativa = null;
    pintarLista();
    if (ativa) await abrir(ativa); else pintarVazio();
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
  function carregarGrafo(g) {
    for (const c of cards.values()) c.el.remove();
    for (const n of notas.values()) n.remove();
    cards = new Map();
    notas.clear();
    ligacoes.replaceChildren();
    grafo = g ?? { cam: null, nos: [], links: [] };
    if (!grafo.cam) grafo.cam = { x: 40, y: 80, z: 1 };
    if (!Array.isArray(grafo.nos)) grafo.nos = [];
    if (!Array.isArray(grafo.links)) grafo.links = [];
    if (!Array.isArray(grafo.tracos)) grafo.tracos = [];
    if (!Array.isArray(grafo.notas)) grafo.notas = [];
    selecao = new Set();
    for (const n of grafo.nos) { const t = TIPOS[n.tipo]; if (t) { n.w = Math.max(n.w, t.w); n.h = Math.max(n.h, t.h); } } // cards salvos antes de crescerem
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
    palco.classList.toggle('desenhando', DESENHO.has(f));
    palco.dataset.ferr = f;
  }

  // usa a ferramenta escolhida no ponto clicado; devolve true se tratou o gesto
  function usarFerramenta(e) {
    e.preventDefault();
    const p = paraMundo(e.clientX, e.clientY);
    if (ferr === 'nota') {
      const n = { id: crypto.randomUUID(), x: Math.round(p.x - 80), y: Math.round(p.y - 60), w: 170, h: 150, cor: COR_NOTA, texto: '' };
      grafo.notas.push(n);
      const area = pintarNota(n);
      escolherFerr('selecao');
      pintarVazio();
      salvarGrafo();
      setTimeout(() => area.focus(), 0);
      return;
    }
    palco.setPointerCapture(e.pointerId);
    if (ferr === 'tesoura') { // clique ou arraste por cima das ligações: cada uma que o ponteiro toca é cortada
      const cortarEm = (m) => { for (const a of document.elementsFromPoint(m.clientX, m.clientY)) { const l = fioDe.get(a); if (l) cortar(l); } };
      cortarEm(e);
      const soltar = () => palco.removeEventListener('pointermove', cortarEm);
      palco.addEventListener('pointermove', cortarEm);
      palco.addEventListener('pointerup', soltar, { once: true });
      palco.addEventListener('pointercancel', soltar, { once: true });
      return;
    }
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
        ? [el('h2', {}, atual.titulo), el('p', {}, 'Use o + na barra de baixo para criar um nó, ou arraste um vídeo ou imagem de Conteúdos para cá.')]
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
    if (tipo === 'modelo') no.dados.extrair = EXTRAIR.map(([k]) => k);
    grafo.nos.push(no);
    pintarNo(no);
    focar(no.id);
    pintarLigacoes();
    pintarVazio();
    salvarGrafo();
    return no;
  }

  // seleção: os nós selecionados ficam com a borda de foco e na frente
  function selecionar(ids) {
    selecao = new Set(ids);
    for (const [i, c] of cards) c.el.classList.toggle('focado', selecao.has(i));
    for (const i of selecao) { const c = cards.get(i); if (c) c.el.style.zIndex = String(++topoZ); }
  }
  const focar = (id) => selecionar([id]);

  const miniatura = (c) => (tipoArquivo(c) === 'video'
    ? el('video', { src: `${urlArquivo(c)}#t=0.1`, muted: true, loop: true, preload: 'metadata', playsInline: true, title: 'Passe o mouse para ver a prévia' })
    : el('img', { src: urlArquivo(c), alt: nomeBase(c), draggable: false, loading: 'lazy' }));

  // nome do arquivo com o botãozinho de tela cheia ao lado (o vídeo ganha som e controles enquanto está em tela cheia)
  function nomeComTelaCheia(c, midia) {
    const video = midia.tagName === 'VIDEO';
    const miniaturaDeNovo = () => { if (video) { midia.controls = false; midia.muted = true; midia.pause(); } };
    if (video) midia.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) miniaturaDeNovo(); });
    const cheia = () => {
      if (video) { midia.controls = true; midia.muted = false; }
      // sem tela cheia (navegador recusou): abre o arquivo numa aba
      (midia.requestFullscreen?.() ?? Promise.reject()).catch(() => { miniaturaDeNovo(); window.open(urlArquivo(c), '_blank', 'noopener'); });
    };
    return el('div', { class: 'video-ref-nome' }, el('small', { title: c }, nomeBase(c)),
      el('button', { type: 'button', class: 'video-tela-cheia', title: 'Tela cheia', 'aria-label': `Ver ${nomeBase(c)} em tela cheia`, onpointerdown: (e) => e.stopPropagation(), onclick: cheia }, icone('ajustar')));
  }
  function previa(c) { const m = miniatura(c); return [m, nomeComTelaCheia(c, m)]; }

  function corpoDoNo(no) {
    if (no.tipo === 'referencia' || no.tipo === 'principal') return el('div', { class: 'video-ref' }, previa(no.dados.caminho));
    if (no.tipo === 'modelo') {
      const c = no.dados.caminho;
      const marcados = new Set(no.dados.extrair ?? []);
      const opcoes = el('fieldset', { class: 'video-extrair' }, el('legend', {}, 'O que extrair do vídeo'),
        EXTRAIR.map(([k, nome]) => {
          const caixa = el('input', { type: 'checkbox', checked: marcados.has(k), onchange: () => {
            if (caixa.checked) marcados.add(k); else marcados.delete(k);
            no.dados.extrair = EXTRAIR.map(([x]) => x).filter((x) => marcados.has(x));
            salvarGrafo();
          } });
          return el('label', { onpointerdown: (e) => e.stopPropagation() }, caixa, nome);
        }));
      const midia = c ? el('div', { class: 'video-ref' }, previa(c))
        : el('div', { class: 'video-audio vazio' }, icone('modelo'), el('small', {}, 'Arraste de Conteúdos o vídeo que serve de modelo para este card.'));
      return el('div', { class: 'video-modelo' }, midia, opcoes);
    }
    if (no.tipo === 'musica' || no.tipo === 'efeito') {
      const c = no.dados.caminho;
      if (!c) return el('div', { class: 'video-audio vazio' }, icone(TIPOS[no.tipo].icone), el('small', {}, 'Arraste um áudio de Conteúdos para este card.'));
      const player = el('audio', { src: urlArquivo(c), controls: true, preload: 'metadata' });
      player.addEventListener('pointerdown', (e) => e.stopPropagation());
      return el('div', { class: 'video-audio' }, player, el('small', { title: c }, nomeBase(c)));
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
      const itens = no.dados.itens ?? [];
      const n = itens.length + grafo.links.filter((l) => l.b === no.id).length;
      return el('div', { class: 'video-lista-no' }, el('small', {}, `${n} item${n === 1 ? '' : 's'}. Ligue ou solte vídeos e imagens aqui; botão direito num item tira da lista.`),
        el('div', { class: 'video-lista-itens' }, itens.map((i, k) => el('div', { class: 'video-lista-item', title: nomeBase(i.caminho), dados: { item: k } }, miniatura(i.caminho)))));
    }
    if (no.tipo === 'magnific') {
      return el('div', { class: 'video-info' }, el('small', {}, TIPOS.magnific.faz),
        el('button', { type: 'button', class: 'bt primario pequeno', disabled: true }, icone('play'), 'Gerar (desligado)'),
        el('small', {}, 'Desligado: exige plano pago da Magnific e chave da API.'));
    }
    const gerando = ger.estado === 'gerando';
    const ultimo = ger.videos[0];
    if (no.tipo === 'remotion') {
      if (vendoSkills.has(no.id)) return corpoSkills(no);
      const usadas = no.dados.habilidades ?? skills?.filter((k) => k.padrao).map((k) => k.nome);
      return el('div', { class: 'video-info' }, el('small', {}, 'Entrada: Conteúdo principal, Referências, Música, Efeito sonoro, Prompt ou Claude. Saída: Vídeo Final.'),
        el('button', { type: 'button', class: 'bt primario', disabled: gerando, onclick: () => gerar(no) }, icone('play'), gerando ? 'Gerando…' : 'Gerar'),
        el('small', { class: `video-ger-status ${ger.estado}`, role: 'status' }, statusGeracao()),
        ultimo ? el('a', { class: 'bt pequeno', href: urlArquivo(ultimo.caminho, true), download: '' }, icone('baixar'), 'Baixar vídeo') : null,
        usadas ? el('small', { class: 'video-skills-usadas', title: 'Três pontinhos > Habilidades para trocar' }, `Habilidades: ${usadas.length ? usadas.join(', ') : 'nenhuma'}`) : null);
    }
    if (no.tipo === 'claude') return corpoClaude(no, gerando);
    // Vídeo: o mais novo da sessão, com troca de versão e download; antes de gerar, o quadro vazio de sempre
    if (!ultimo) {
      return el('div', { class: 'video-ref video-saida' },
        el('div', { class: 'video-saida-quadro' }, icone('filme'), el('small', {}, gerando ? 'Gerando o vídeo…' : 'O vídeo pronto aparece aqui.')),
        el('small', {}, gerando ? 'O Claude está trabalhando' : 'Aguardando geração'));
    }
    const player = el('video', { src: urlArquivo(ultimo.caminho), controls: true, playsInline: true, preload: 'metadata' });
    const baixar = el('a', { class: 'bt pequeno', href: urlArquivo(ultimo.caminho, true), download: '' }, icone('baixar'), 'Baixar');
    const versao = el('select', { class: 'video-versao', 'aria-label': 'Versão do vídeo', onchange: () => { player.src = urlArquivo(versao.value); baixar.href = urlArquivo(versao.value, true); } },
      ger.videos.map((v) => el('option', { value: v.caminho }, nomeBase(v.caminho))));
    versao.addEventListener('pointerdown', (e) => e.stopPropagation());
    return el('div', { class: 'video-ref video-saida' }, player, el('div', { class: 'video-saida-acoes' }, versao, baixar));
  }

  // lista das skills do cérebro: as marcadas vão para o Claude ao gerar (sem escolha salva, valem as padrão)
  function corpoSkills(no) {
    if (!skills) return el('div', { class: 'video-info' }, el('small', {}, 'Carregando habilidades…'));
    const marcadas = new Set(no.dados.habilidades ?? skills.filter((k) => k.padrao).map((k) => k.nome));
    const itens = skills.map((k) => {
      const caixa = el('input', { type: 'checkbox', checked: marcadas.has(k.nome), onchange: () => {
        if (caixa.checked) marcadas.add(k.nome); else marcadas.delete(k.nome);
        no.dados.habilidades = skills.map((x) => x.nome).filter((x) => marcadas.has(x));
        salvarGrafo();
      } });
      return el('label', { title: k.descricao }, caixa, el('span', {}, el('b', {}, k.nome), el('small', {}, k.descricao)));
    });
    const lista = el('div', { class: 'video-skills', onpointerdown: (e) => e.stopPropagation(), onwheel: (e) => e.stopPropagation() },
      itens.length ? itens : el('small', {}, 'Nenhuma skill em .claude/skills do cérebro.'));
    return el('div', { class: 'video-info video-skills-painel' }, el('small', {}, 'Habilidades usadas ao gerar este vídeo:'), lista,
      el('button', { type: 'button', class: 'bt pequeno', onclick: () => { vendoSkills.delete(no.id); repintarCorpo(no); } }, 'Pronto'));
  }
  let lendoSkills = null;
  function carregarSkills() {
    lendoSkills ??= api('/api/video/habilidades').then((r) => { skills = r; }, (e) => { lendoSkills = null; avisar(e.message, 'erro'); })
      .then(() => { for (const { no: n } of cards.values()) if (n.tipo === 'remotion') repintarCorpo(n); });
    return lendoSkills;
  }
  function abrirSkills(no) { vendoSkills.add(no.id); repintarCorpo(no); carregarSkills(); }
  const repintarCorpo = (no) => cards.get(no.id)?.el.querySelector('.card-corpo').replaceChildren(corpoDoNo(no));

  function statusGeracao() {
    const min = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    if (ger.estado === 'gerando') return `Gerando há ${min(Date.now() - ger.inicio)}. Pode levar vários minutos.`;
    if (ger.estado === 'pronto') return `Pronto em ${min(ger.fim - ger.inicio)}.`;
    if (ger.estado === 'sem-video') return 'Terminou sem vídeo novo: veja a resposta no nó Claude.';
    return ger.videos.length ? `${ger.videos.length} versão(ões) nesta sessão.` : 'Nenhum vídeo gerado ainda.';
  }

  function corpoClaude(no, gerando) {
    // conversa e status só aparecem com o Claude ligado no Gerar vídeo
    const ligado = !!ligadoEm(grafo, no.id, 'remotion');
    const log = el('div', { class: 'video-chat', role: 'log', 'aria-label': 'Conversa com o Claude' },
      ligado && ger.chat.length ? ger.chat.map((m) => el('div', { class: `video-msg ${m.papel}` }, m.texto)) : el('small', { class: 'video-chat-vazio' }, ligado ? 'Peça ajustes aqui. A sessão continua aberta entre um pedido e outro.' : 'Ligue a saída do Claude (direita) na entrada do Gerar vídeo para conversar aqui.'),
      ligado && gerando ? el('div', { class: 'video-msg claude pensando' }, 'Trabalhando no vídeo…') : null);
    const area = el('textarea', { class: 'video-prompt video-chat-entrada', rows: 3, placeholder: 'Ex.: deixa a legenda maior e corta os 2 primeiros segundos', 'aria-label': 'Pedido para o Claude' });
    area.value = rascunhos.get(no.id) ?? '';
    const enviar = () => {
      const t = area.value.trim();
      if (!t || ger.estado === 'gerando') return;
      const alvo = ligadoEm(grafo, no.id, 'remotion');
      if (!alvo) { avisar('Ligue o Claude no Gerar vídeo para mandar o pedido.'); return; }
      if (gerar(alvo, t)) rascunhos.delete(no.id);
    };
    area.addEventListener('input', () => rascunhos.set(no.id, area.value));
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } });
    area.addEventListener('pointerdown', (e) => e.stopPropagation());
    setTimeout(() => { log.scrollTop = log.scrollHeight; }, 0);
    return el('div', { class: 'video-claude' }, log,
      el('div', { class: 'video-chat-form' }, area, el('button', { type: 'button', class: 'bt primario pequeno', disabled: gerando, onclick: enviar }, icone('enviar'), 'Enviar')));
  }

  // ---------- geração (Claude + Remotion no servidor) ----------
  // só gera com um Vídeo Final ligado na saída; devolve false quando nem chega a pedir
  function gerar(g, pedido = '') {
    const id = ativa;
    if (!id) return false;
    if (!ligadoEm(grafo, g.id, 'saida')) { avisar('Ligue um Vídeo Final na saída do Gerar vídeo (bolinha da direita) antes de gerar.'); return false; }
    (async () => {
      await enviarGrafo();
      await criadas.get(id);
      try {
        const r = await api(`/api/video/${id}/gerar`, { metodo: 'POST', corpo: { ...entradasDe(grafo, g.id), habilidades: g.dados.habilidades, pedido } });
        if (ativa === id) mudarGeracao(r);
      } catch (e) { avisar(e.message, 'erro'); }
    })();
    return true;
  }
  async function carregarGeracao(id) {
    clearTimeout(timerGer);
    try {
      const r = await api(`/api/video/${id}/geracao`);
      if (ativa === id) mudarGeracao(r);
    } catch (e) { if (ativa === id && e.status !== 404) timerGer = setTimeout(() => carregarGeracao(id), 6000); }
  }
  function mudarGeracao(r) {
    const antes = ger;
    ger = r;
    if (antes.estado === 'gerando' && r.estado === 'pronto') avisar('Vídeo pronto.');
    if (antes.estado === 'gerando' && r.estado === 'sem-video') avisar('O Claude terminou sem vídeo novo: veja a resposta no nó Claude.');
    // o Gerar repinta sempre (relógio); Vídeo e Claude só quando mudam, para não cortar o player nem o texto sendo digitado
    const repintar = {
      remotion: true,
      saida: antes.videos[0]?.caminho !== r.videos[0]?.caminho || antes.estado !== r.estado,
      claude: antes.chat.length !== r.chat.length || antes.estado !== r.estado,
    };
    for (const { el: c, no } of cards.values()) if (repintar[no.tipo]) c.querySelector('.card-corpo').replaceChildren(corpoDoNo(no));
    clearTimeout(timerGer);
    if (r.estado === 'gerando') { const id = ativa; timerGer = setTimeout(() => carregarGeracao(id), 3000); }
  }
  function pintarNo(no) {
    const t = TIPOS[no.tipo];
    if (!t) return;
    // sem X: remover, duplicar e copiar ficam no botão direito
    const topo = el('div', { class: 'card-topo', title: 'Botão direito: duplicar, copiar ou remover' }, icone(t.icone), el('div', { class: 'card-titulos' }, el('b', { class: 'card-titulo' }, t.nome), el('small', { class: 'card-sub' }, subDe(no))),
      no.tipo === 'remotion' ? el('button', { type: 'button', class: 'card-mais', title: 'Mais opções', 'aria-label': 'Mais opções do Gerar vídeo', 'aria-haspopup': 'menu',
        onpointerdown: (e) => e.stopPropagation(), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); abrirMenu({ clientX: r.left, clientY: r.bottom + 4 }, [['brilho', 'Habilidades', () => abrirSkills(no)]]); } }, icone('pontos')) : null);
    const c = el('div', { class: `card video-no${t.opcional ? ' opc' : ''}`, dados: { no: no.id } }, topo, el('div', { class: 'card-corpo' }, corpoDoNo(no)));
    Object.assign(c.style, { left: `${no.x}px`, top: `${no.y}px`, width: `${no.w}px`, height: `${no.h}px` });
    if (t.entradas.length) c.append(el('span', { class: 'video-porta e', title: `Entrada: ${t.entradas.join(', ')}`, dados: { porta: 'e', no: no.id } }));
    if (t.saida) c.append(el('span', { class: 'video-porta s', style: `background:${CORES[t.saida]}`, title: `Saída: ${t.saida}. Arraste até a entrada de outro nó`, dados: { porta: 's', no: no.id },
      onpointerdown: (e) => ligarDe(e, no) }));
    c.addEventListener('pointerdown', (e) => {
      if (e.shiftKey) selecionar(selecao.has(no.id) ? [...selecao].filter((i) => i !== no.id) : [...selecao, no.id]);
      else if (!selecao.has(no.id)) focar(no.id);
    });
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

  // depois de ligar ou cortar: Lista recontam os itens e o Claude mostra ou esconde a conversa
  function atualizarListas() {
    for (const { el: c, no } of cards.values()) if (no.tipo === 'lista' || no.tipo === 'claude') c.querySelector('.card-corpo').replaceChildren(corpoDoNo(no));
  }
  function cortar(l) {
    grafo.links = grafo.links.filter((o) => o !== l);
    atualizarListas(); pintarLigacoes(); salvarGrafo();
  }

  // a mídia ligada (ou solta) na Lista sai do canvas e passa a morar dentro dela
  function colocarNaLista(lst, caminho, tipo = 'referencia') {
    lst.dados.itens = [...(lst.dados.itens ?? []), { tipo, caminho }];
    atualizarListas();
    salvarGrafo();
  }
  function tirarDaLista(lst, k) {
    const [item] = lst.dados.itens.splice(k, 1);
    if (!item) return;
    adicionar(item.tipo === 'principal' ? 'principal' : 'referencia', { caminho: item.caminho, x: lst.x - TIPOS.referencia.w - 60, y: lst.y });
    atualizarListas();
  }

  // ---------- copiar, colar, duplicar e remover (menu do botão direito e atalhos) ----------
  const selecionados = () => grafo.nos.filter((n) => selecao.has(n.id));
  function copiar() {
    const nos = selecionados();
    if (!nos.length) return;
    guardar('videoCopiados', { nos, links: grafo.links.filter((l) => selecao.has(l.a) && selecao.has(l.b)) });
    avisar(nos.length === 1 ? 'Nó copiado.' : `${nos.length} nós copiados.`);
  }
  function colar(onde) { // onde: ponto do mundo para o canto de cima, à esquerda; sem ele, um pouco ao lado do original
    const c = ler('videoCopiados', null);
    if (!c?.nos?.length || !ativa) return;
    const x0 = Math.min(...c.nos.map((n) => n.x)); const y0 = Math.min(...c.nos.map((n) => n.y));
    inserir(clonar(c.nos.filter((n) => TIPOS[n.tipo]), c.links, onde ? onde.x - x0 : 30, onde ? onde.y - y0 : 30, () => crypto.randomUUID()));
  }
  const duplicar = () => inserir(clonar(selecionados(), grafo.links.filter((l) => selecao.has(l.a) && selecao.has(l.b)), 30, 30, () => crypto.randomUUID()));
  function inserir({ nos, links }) {
    if (!nos.length) return;
    grafo.nos.push(...nos); grafo.links.push(...links);
    nos.forEach(pintarNo);
    selecionar(nos.map((n) => n.id));
    atualizarListas(); pintarLigacoes(); pintarVazio(); salvarGrafo();
  }
  function removerSelecionados() { for (const id of [...selecao]) removerNo(id); selecao = new Set(); }

  function fecharMenu() { menuCtx.hidden = true; }
  function abrirMenu(e, itens) {
    const r = palco.getBoundingClientRect();
    menuCtx.replaceChildren(...itens.map(([ic, nome, fazer, atalho]) => el('button', { type: 'button', role: 'menuitem', class: 'video-menu-item', onclick: () => { fecharMenu(); fazer(); } },
      icone(ic), el('span', {}, nome), atalho ? el('kbd', {}, atalho) : null)));
    menuCtx.hidden = false;
    menuCtx.style.left = `${Math.min(e.clientX - r.left, r.width - menuCtx.offsetWidth - 8)}px`;
    menuCtx.style.top = `${Math.min(e.clientY - r.top, r.height - menuCtx.offsetHeight - 8)}px`;
    menuCtx.querySelector('button')?.focus();
  }
  palco.addEventListener('contextmenu', (e) => {
    if (!ativa || e.target.closest('textarea, input, .video-ferramentas, .palco-acoes, .video-menu-ctx')) return; // nos campos de texto fica o menu do navegador
    e.preventDefault();
    const item = e.target.closest('.video-lista-item');
    const card = e.target.closest('.video-no');
    const no = card && grafo.nos.find((n) => n.id === card.dataset.no);
    const temCopia = !!ler('videoCopiados', null)?.nos?.length;
    const onde = paraMundo(e.clientX, e.clientY);
    if (item && no) { abrirMenu(e, [['x', 'Tirar da lista', () => tirarDaLista(no, Number(item.dataset.item))]]); return; }
    if (no) {
      if (!selecao.has(no.id)) selecionar([no.id]);
      const n = selecao.size > 1 ? ` (${selecao.size})` : '';
      abrirMenu(e, [['duplicar', `Duplicar${n}`, duplicar, 'Ctrl+D'], ['copiar', `Copiar${n}`, copiar, 'Ctrl+C'], ...(temCopia ? [['colar', 'Colar', () => colar(onde), 'Ctrl+V']] : []),
        ['lixeira', `Remover${n}`, removerSelecionados, 'Del']]);
      return;
    }
    if (temCopia) abrirMenu(e, [['colar', 'Colar aqui', () => colar(onde), 'Ctrl+V']]);
  });
  document.addEventListener('pointerdown', (e) => { if (!menuCtx.hidden && !e.target.closest('.video-menu-ctx')) fecharMenu(); });
  let ultimoPonto = null; // para o Ctrl+V colar onde o mouse está
  palco.addEventListener('pointermove', (e) => { ultimoPonto = { x: e.clientX, y: e.clientY }; });
  document.addEventListener('keydown', (e) => {
    if (!palco.offsetParent || !ativa || e.target.closest?.('textarea, input, select, [contenteditable="true"]')) return; // só com a guia à mostra e fora de campos
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { fecharMenu(); selecionar([]); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selecao.size) { e.preventDefault(); removerSelecionados(); return; }
    if (ctrl && k === 'c' && selecao.size) { e.preventDefault(); copiar(); return; }
    if (ctrl && k === 'v') { e.preventDefault(); colar(ultimoPonto ? paraMundo(ultimoPonto.x, ultimoPonto.y) : null); return; }
    if (ctrl && k === 'd' && selecao.size) { e.preventDefault(); duplicar(); return; }
    if (ctrl && k === 'a') { e.preventDefault(); selecionar(grafo.nos.map((n) => n.id)); }
  });

  function arrastarNo(e, no) {
    if (e.button !== 0 || e.target.closest('button, a, input, textarea')) return;
    // arrasta o nó e, se ele está numa seleção, todos os selecionados juntos
    const grupo = (selecao.has(no.id) ? grafo.nos.filter((n) => selecao.has(n.id)) : [no]).map((n) => ({ n, x: n.x, y: n.y, c: cards.get(n.id)?.el }));
    const ini = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    e.stopPropagation();
    const topo = e.currentTarget;
    topo.setPointerCapture(e.pointerId);
    const mover = (m) => {
      for (const g of grupo) {
        g.n.x = Math.round(g.x + (m.clientX - ini.x) / grafo.cam.z);
        g.n.y = Math.round(g.y + (m.clientY - ini.y) / grafo.cam.z);
        if (g.c) { g.c.style.left = `${g.n.x}px`; g.c.style.top = `${g.n.y}px`; }
      }
      pintarLigacoes();
    };
    const soltar = () => { topo.removeEventListener('pointermove', mover); salvarGrafo(); };
    topo.addEventListener('pointermove', mover);
    topo.addEventListener('pointerup', soltar, { once: true });
    topo.addEventListener('pointercancel', soltar, { once: true });
  }

  // ---------- ligações ----------
  const fioDe = new WeakMap(); // área de clique da ligação -> ligação (para a tesoura)
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
      alvo.addEventListener('dblclick', () => cortar(l));
      fioDe.set(alvo, l);
      const dica = document.createElementNS(SVG, 'title');
      dica.textContent = 'Duplo clique ou a tesoura desfazem a ligação';
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
      if (alvo.tipo === 'lista' && no.dados.caminho && no.tipo !== 'modelo') { colocarNaLista(alvo, no.dados.caminho, no.tipo); removerNo(no.id); return; }
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
    if (e.target.closest('.video-menu-ctx')) return;
    if (e.button === 0 && ativa && DESENHO.has(ferr) && !e.target.closest('.palco-acoes, .video-nos, .video-ferramentas, button, .video-vazio .bt, .video-nota')) { usarFerramenta(e); return; }
    if (!ativa || e.target.closest('.video-no, .video-nota, .video-ferramentas, .palco-acoes, .video-nos, button, .video-vazio .bt')) return;
    if (e.button === 0 && ferr === 'selecao') { selecionarArea(e); return; }
    if (e.button !== 0 && e.button !== 1) return; // mão: botão esquerdo; em qualquer ferramenta: botão do meio
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
  // seleção por área: arrastar no vazio desenha o retângulo; clique sem arrastar limpa a seleção. Shift soma à seleção atual
  function selecionarArea(e) {
    e.preventDefault();
    const ini = paraMundo(e.clientX, e.clientY);
    const antes = e.shiftKey ? [...selecao] : [];
    let area = null;
    palco.setPointerCapture(e.pointerId);
    const mover = (m) => {
      const q = paraMundo(m.clientX, m.clientY);
      area = { x: Math.min(ini.x, q.x), y: Math.min(ini.y, q.y), w: Math.abs(q.x - ini.x), h: Math.abs(q.y - ini.y) };
      Object.assign(areaSel.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px` });
      areaSel.hidden = false;
      selecionar([...antes, ...nosNaArea(grafo.nos, area)]);
    };
    const soltar = () => {
      palco.removeEventListener('pointermove', mover);
      areaSel.hidden = true;
      if (!area) selecionar(antes);
    };
    palco.addEventListener('pointermove', mover);
    palco.addEventListener('pointerup', soltar, { once: true });
    palco.addEventListener('pointercancel', soltar, { once: true });
  }
  palco.addEventListener('wheel', (e) => {
    if (!ativa) return;
    if (e.target.closest('textarea, .video-chat')) return;
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
    const audios = caminhos.filter(ehAudio);
    if (caminhos.length > midias.length + audios.length) avisar('Só vídeo, imagem ou áudio entra no canvas; os outros arquivos foram ignorados.');
    const base = paraMundo(ponto.x, ponto.y);
    // soltou em cima de um card: Lista recebe as mídias; Música ou Efeito sonoro recebe o áudio
    const cardEl = document.elementFromPoint(ponto.x, ponto.y)?.closest('.video-no');
    const alvo = cardEl && grafo.nos.find((n) => n.id === cardEl.dataset.no);
    if (alvo?.tipo === 'lista' && midias.length) { midias.forEach((c) => colocarNaLista(alvo, c)); midias.length = 0; }
    const videoSolto = midias.findIndex((c) => tipoArquivo(c) === 'video');
    if (alvo?.tipo === 'modelo' && videoSolto >= 0) {
      [alvo.dados.caminho] = midias.splice(videoSolto, 1);
      repintarCorpo(alvo);
      salvarGrafo();
    } else if (alvo?.tipo === 'modelo' && midias.length) avisar('O Modelo base recebe um vídeo.');
    if ((alvo?.tipo === 'musica' || alvo?.tipo === 'efeito') && audios.length) {
      alvo.dados.caminho = audios.shift();
      cards.get(alvo.id).el.querySelector('.card-corpo').replaceChildren(corpoDoNo(alvo));
      salvarGrafo();
    }
    audios.forEach((c, i) => adicionar('musica', { caminho: c, x: Math.round(base.x - TIPOS.musica.w / 2 + i * 30), y: Math.round(base.y - 40 + i * 30) }));
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
  carregarGrafo(null);
  iniciar();
  carregarSkills();
  return {
    mostrar: () => { if (ativa) aplicarCam(); },
    esconder: () => { enviarGrafo(); },
    limpar: () => { enviarGrafo(); clearTimeout(timerEnvio); clearTimeout(timerGer); },
  };
}

shell.registrar('video', montar);

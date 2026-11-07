// Função Criação de vídeo (fase 1): espaço novo, ao lado dos outros.
// Barra da direita = sessões (projetos de vídeo) com o botão "Novo vídeo". Os tipos de nó ficam numa barra sobre o canvas.
// Ainda não gera nada: nós, ligações e o gerador entram nas fases seguintes (docs/AREA-VIDEO.md).
// Sessões ficam no navegador por enquanto; na fase 2 passam para o servidor (conteudo/video/<sessao>/).
import { el, icone, botaoIcone, botaoConfirmar, ler, guardar } from './comum.js';
import * as shell from './shell.js';

const NOS = [
  { nome: 'Referência', tipo: 'vídeo ou imagem', faz: 'Arquivo de Conteúdos: vídeo ou imagem (também áudio)' },
  { nome: 'Lista', tipo: 'lista', faz: 'Agrupa várias referências' },
  { nome: 'Prompt', tipo: 'texto', faz: 'Texto livre: estilo, motion, efeitos, música, legenda' },
  { nome: 'Gerador Remotion', tipo: 'vídeo', faz: 'Monta e renderiza o vídeo na VPS' },
  { nome: 'Gerador Magnific', tipo: 'opcional', faz: 'Clipe ou imagem por IA; exige plano pago e chave da API' },
  { nome: 'Vídeo', tipo: 'saída', faz: 'Preview, versões e download' },
];

const quando = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function montar(corpo) {
  let sessoes = ler('videoSessoes', []);
  let ativa = ler('videoAtiva', null);
  if (ativa && !sessoes.some((s) => s.id === ativa)) ativa = null;

  corpo.classList.add('video-espaco');
  corpo.classList.toggle('sem-coluna', ler('videoColunaRecolhida', false) === true);

  const salvar = () => { guardar('videoSessoes', sessoes); guardar('videoAtiva', ativa); };

  function novoVideo() {
    const numero = sessoes.reduce((m, s) => Math.max(m, s.numero), 0) + 1;
    const s = { id: crypto.randomUUID(), numero, titulo: `Vídeo ${numero}`, criada: Date.now() };
    sessoes = [s, ...sessoes];
    ativa = s.id;
    salvar();
    pintar();
  }
  function abrir(id) { ativa = id; salvar(); pintar(); }
  function remover(id) {
    sessoes = sessoes.filter((s) => s.id !== id);
    if (ativa === id) ativa = sessoes[0]?.id ?? null;
    salvar();
    pintar();
  }

  // barra de tipos de nó sobre o canvas (ainda sem ação)
  const barraNos = el('div', { class: 'video-nos', role: 'group', 'aria-label': 'Tipos de nó (em breve)' },
    NOS.map((n) => el('span', { class: `video-no-chip c-${n.tipo === 'opcional' ? 'opc' : 'normal'}`, title: `${n.faz} (em breve)` }, n.nome, el('small', {}, n.tipo))));

  const vazio = el('div', { class: 'video-vazio' });
  const botaoRecolher = botaoIcone('lateralDireita', 'Recolher ou mostrar a barra de sessões', () => {
    const r = corpo.classList.toggle('sem-coluna');
    guardar('videoColunaRecolhida', r);
  });
  const palco = el('div', { class: 'palco video-palco' }, barraNos, vazio, el('div', { class: 'palco-acoes' }, botaoRecolher));

  const lista = el('ul', { class: 'video-lista' });
  const coluna = el('aside', { class: 'coluna video-sessoes', 'aria-label': 'Sessões de vídeo' },
    el('div', { class: 'coluna-topo' }, el('h2', {}, 'Sessões'),
      el('button', { type: 'button', class: 'bt primario pequeno', onclick: novoVideo }, icone('mais'), 'Novo vídeo')),
    lista);

  function pintar() {
    const atual = sessoes.find((s) => s.id === ativa);
    vazio.replaceChildren(
      el('span', { class: 'video-vazio-icone' }, icone('filme')),
      ...(atual
        ? [el('h2', {}, atual.titulo), el('p', {}, 'Canvas vazio. Aqui vão entrar as referências (vídeo ou imagem), o prompt e o gerador.'), el('p', { class: 'dica' }, 'Fase 1: só a tela. Nada é gerado ainda.')]
        : [el('h2', {}, 'Criação de vídeo'), el('p', {}, 'Crie uma sessão para começar: cada vídeo é uma sessão com o próprio canvas.'),
          el('button', { type: 'button', class: 'bt primario', onclick: novoVideo }, icone('mais'), 'Novo vídeo')]));
    lista.replaceChildren(...(sessoes.length
      ? sessoes.map((s) => el('li', { class: `video-sessao${s.id === ativa ? ' ativa' : ''}` },
        el('button', { type: 'button', class: 'video-sessao-abrir', 'aria-pressed': String(s.id === ativa), onclick: () => abrir(s.id) },
          icone('filme'), el('span', {}, el('b', {}, s.titulo), el('small', {}, `criada ${quando(s.criada)}`))),
        botaoConfirmar('Remover', 'Remover mesmo?', () => remover(s.id), 'bt pequeno')))
      : [el('li', { class: 'vazio' }, 'Nenhuma sessão ainda. Use "Novo vídeo".')]));
  }

  corpo.append(palco, coluna);
  pintar();
  return {};
}

shell.registrar('video', montar);

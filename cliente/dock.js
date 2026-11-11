// Trilho vertical à esquerda: Grafo, as Funções, o botão Cérebro (arquivos) e, abaixo de um traço, as páginas abertas.
// O quadrado azul desliza até a guia escolhida, toca um clique curto e o conteúdo entra em cascata (ver .entra no CSS).
import { $, el, icone, ouvir, emitir } from './comum.js';
import { FUNCOES, abrirFuncao } from './lateral.js';
import * as shell from './shell.js';
import { perfil, nivel, secaoDe, iniciais } from './perfil.js';

let caixa = null;
let indicador = null;
let janelaAberta = false; // a janela de Conteúdos não é uma guia: o botão acende enquanto ela está aberta

// Clique de troca de aba: dois estalos curtos (apertar e soltar), feitos na hora com Web Audio, sem arquivo de som.
let audio = null;
function clique() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audio.currentTime;
    for (const [atraso, volume, freq] of [[0, 0.22, 2200], [0.042, 0.16, 1700]]) {
      const n = Math.floor(audio.sampleRate * 0.012);
      const buf = audio.createBuffer(1, n, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3; // ruído que some rápido
      const fonte = audio.createBufferSource(); fonte.buffer = buf;
      const filtro = audio.createBiquadFilter(); filtro.type = 'bandpass'; filtro.frequency.value = freq; filtro.Q.value = 0.9;
      const ganho = audio.createGain(); ganho.gain.value = volume;
      fonte.connect(filtro).connect(ganho).connect(audio.destination);
      fonte.start(t0 + atraso);
    }
  } catch { /* sem áudio: segue em silêncio */ }
}

const botao = (nome, ic, ligado, aoClicar, extra = {}) => el('button', {
  type: 'button', class: `dock-botao${ligado ? ' ativo' : ''}${extra.alterna ? ' alterna' : ''}`, 'aria-label': nome, title: extra.dica ?? null,
  'aria-current': ligado && !extra.alterna ? 'page' : null, onclick: () => { clique(); aoClicar(); },
}, icone(ic), el('span', {}, nome));

function pintar() {
  if (!caixa) return;
  const ativa = shell.ativa();
  const ids = new Set(FUNCOES.map((f) => f.id));
  const itens = [el('div', { class: 'dock-marca', 'aria-hidden': 'true' }, icone('cerebro'))];
  if (nivel('grafo')) itens.push(botao('Grafo', 'grafo', ativa?.id === 'grafo', () => shell.ir('grafo')));
  for (const f of FUNCOES.filter((x) => nivel(secaoDe(x.id)))) {
    const conteudos = f.id === 'conteudos';
    itens.push(botao(f.nome, f.icone, conteudos ? janelaAberta : ativa?.tipo === f.id, () => abrirFuncao(f.id), { alterna: conteudos }));
  }
  if (nivel('arquivos')) itens.push(botao('Cérebro', 'cerebro', !document.body.classList.contains('sem-lateral'), () => emitir('lateral-alternar'), { alterna: true, dica: 'Arquivos do cérebro' }));
  const paginas = shell.guias().filter((g) => g.id !== 'grafo' && g.tipo !== 'perfil' && !ids.has(g.tipo));
  if (paginas.length) {
    itens.push(el('hr', { class: 'dock-traco' }));
    for (const g of paginas) {
      const b = botao(g.titulo, shell.iconeDe(g.tipo), ativa?.id === g.id, () => shell.ir(g.id), { dica: g.caminho || g.titulo });
      itens.push(el('div', { class: 'dock-item' }, b,
        el('button', { type: 'button', class: 'dock-fechar', 'aria-label': `Fechar ${g.titulo}`, title: 'Fechar', onclick: () => shell.fechar(g.id) }, icone('x'))));
    }
  }
  const eu = perfil();
  const noPerfil = ativa?.tipo === 'perfil';
  itens.push(el('button', {
    type: 'button', class: `dock-botao dock-avatar${noPerfil ? ' ativo' : ''}`, 'aria-label': eu?.admin ? 'Perfil e acessos' : 'Perfil', 'aria-current': noPerfil ? 'page' : null,
    onclick: () => { clique(); shell.abrir({ id: 'perfil', tipo: 'perfil', titulo: 'Perfil' }); },
  }, el('b', { 'aria-hidden': 'true' }, iniciais(eu?.nome))));
  caixa.replaceChildren(indicador, ...itens);
  const alvo = caixa.querySelector('.dock-botao[aria-current="page"]');
  indicador.style.opacity = alvo ? '1' : '0';
  if (alvo) indicador.style.transform = `translateY(${alvo.offsetTop + (alvo.closest('.dock-item')?.offsetTop ?? 0)}px)`;
}

export function iniciar() {
  if (caixa) return;
  caixa = el('nav', { class: 'dock', id: 'dock', 'aria-label': 'Funções' });
  indicador = el('span', { class: 'dock-indicador', 'aria-hidden': 'true' });
  $('#painel').append(caixa);
  ouvir('guia-ativa', pintar);
  ouvir('guias-mudou', pintar);
  ouvir('lateral-mudou', pintar);
  ouvir('conteudos-janela', (d) => { janelaAberta = !!d?.aberta; pintar(); });
  addEventListener('resize', pintar);
  pintar();
}

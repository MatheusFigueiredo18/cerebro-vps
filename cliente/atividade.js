// Atividade do WhatsApp: cartão de vidro no canto direito com as conversas que chegaram pelo WhatsApp.
import { $, el, api, icone, logo, ler, guardar } from './comum.js';
import { abrirFuncao } from './lateral.js';

const CONSULTA_MS = 5000;
const MAX = 6;
let raiz = null;
let aberta = true;
let itens = [];

const rotulo = (c) => (c.processando ? 'Respondendo pelo WhatsApp…' : c.trabalhando ? (c.ultimaAcao || 'Trabalhando…') : (c.ultimaAcao || 'Sem atividade agora'));

function pintar() {
  if (!raiz) return;
  const trabalhando = itens.filter((c) => c.trabalhando || c.processando).length;
  raiz.classList.toggle('fechada', !aberta);
  document.body.classList.toggle('atividade-fechada', !aberta);
  const topo = el('button', {
    type: 'button', class: 'atividade-topo', 'aria-expanded': String(aberta),
    title: aberta ? 'Recolher atividade do WhatsApp' : 'Mostrar atividade do WhatsApp',
    onclick: () => { aberta = !aberta; guardar('atividadeAberta', aberta); pintar(); },
  }, logo('whatsapp', 'WhatsApp', 'grande'), el('b', {}, 'Atividade do WhatsApp'),
  trabalhando ? el('span', { class: 'atividade-conta', title: `${trabalhando} trabalhando` }, String(trabalhando)) : null,
  icone(aberta ? 'baixo' : 'cima'));
  const lista = itens.length
    ? el('ul', { class: 'atividade-lista' }, itens.slice(0, MAX).map((c) => el('li', {}, el('button', { type: 'button', class: 'atividade-item', onclick: () => abrirFuncao('conversas') },
      el('span', { class: `ponto-status ${c.trabalhando || c.processando ? 'trabalhando' : c.ativo ? 'ativo' : 'inativo'}` }),
      el('span', { class: 'atividade-texto' }, el('b', {}, c.titulo), el('small', {}, rotulo(c)))))))
    : el('p', { class: 'vazio' }, 'Nada por aqui ainda. As conversas iniciadas pelo WhatsApp aparecem neste cartão.');
  raiz.replaceChildren(topo, el('div', { class: 'atividade-corpo' }, lista));
}

async function consultar() {
  if (document.hidden || !raiz) return;
  try {
    const todas = await api('/api/estado');
    const novos = todas.filter((c) => c.origem === 'whatsapp').reverse();
    if (JSON.stringify(novos.map((c) => [c.id, c.titulo, c.trabalhando, c.processando, c.ativo, c.ultimaAcao])) !== JSON.stringify(itens.map((c) => [c.id, c.titulo, c.trabalhando, c.processando, c.ativo, c.ultimaAcao]))) { itens = novos; pintar(); }
  } catch { /* sem rede por um instante: tenta de novo na próxima */ }
}

export function iniciar() {
  if (raiz) return;
  aberta = ler('atividadeAberta', !window.matchMedia('(max-width: 720px)').matches);
  raiz = el('aside', { class: 'atividade', 'aria-label': 'Atividade do WhatsApp' });
  $('#painel').append(raiz);
  pintar();
  consultar();
  setInterval(consultar, CONSULTA_MS);
}

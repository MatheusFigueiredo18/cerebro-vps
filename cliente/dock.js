// Dock das Funções: botões de vidro no meio, embaixo da tela. Respeita a ordem, os fixos e os ocultos da lateral.
import { $, el, icone, ler, ouvir } from './comum.js';
import { FUNCOES, abrirFuncao } from './lateral.js';
import { aplicarPrefs } from './personalizar.js';

let caixa = null;
let ativa = '';

function pintar() {
  if (!caixa) return;
  const prefs = ler('funcoesPrefs', { ordem: [], ocultos: [], fixos: [] });
  caixa.replaceChildren(...aplicarPrefs(FUNCOES, prefs).map((f) => el('button', {
    type: 'button', class: `dock-botao${ativa === f.id ? ' ativo' : ''}`, title: f.nome, 'aria-label': f.nome,
    'aria-current': ativa === f.id ? 'page' : null, onclick: () => abrirFuncao(f.id),
  }, icone(f.icone), el('span', {}, f.nome))));
}

export function iniciar() {
  if (caixa) return;
  caixa = el('nav', { class: 'dock', id: 'dock', 'aria-label': 'Funções' });
  $('#painel').append(caixa);
  ouvir('guia-ativa', (g) => { ativa = FUNCOES.some((f) => f.id === g?.tipo) ? g.tipo : ''; pintar(); });
  ouvir('funcoes-mudou', pintar);
  pintar();
}

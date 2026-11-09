// Trilho vertical à esquerda: Grafo, as Funções (respeita ordem, fixos e ocultos), o Cérebro (abre e fecha a lateral de arquivos) e, abaixo de um traço, as páginas abertas.
// Ao clicar, o botão "suspende" (sobe com brilho) e o conteúdo entra (ver .entra no CSS).
import { $, el, icone, ler, ouvir, emitir } from './comum.js';
import { FUNCOES, abrirFuncao } from './lateral.js';
import { aplicarPrefs } from './personalizar.js';
import * as shell from './shell.js';

let caixa = null;
let janelaAberta = false; // a janela de Conteúdos não é uma guia: o botão acende enquanto ela está aberta

const botao = (nome, ic, ligado, aoClicar, extra = {}) => el('button', {
  type: 'button', class: `dock-botao${ligado ? ' ativo' : ''}`, title: extra.dica ?? nome, 'aria-label': nome,
  'aria-current': ligado ? 'page' : null, onclick: aoClicar,
}, icone(ic), el('span', {}, nome));

function pintar() {
  if (!caixa) return;
  const ativa = shell.ativa();
  const prefs = ler('funcoesPrefs', { ordem: [], ocultos: [], fixos: [] });
  const ids = new Set(FUNCOES.map((f) => f.id));
  const itens = [botao('Grafo', 'grafo', ativa?.id === 'grafo', () => shell.ir('grafo'))];
  for (const f of aplicarPrefs(FUNCOES, prefs)) {
    const ligado = f.id === 'conteudos' ? janelaAberta : ativa?.tipo === f.id;
    itens.push(botao(f.nome, f.icone, ligado, () => abrirFuncao(f.id)));
  }
  const lateralAberta = !document.body.classList.contains('sem-lateral');
  itens.push(botao('Cérebro', 'cerebro', lateralAberta, () => emitir('lateral-alternar'), { dica: lateralAberta ? 'Esconder os arquivos do cérebro' : 'Mostrar os arquivos do cérebro' }));
  const paginas = shell.guias().filter((g) => g.id !== 'grafo' && !ids.has(g.tipo));
  if (paginas.length) {
    itens.push(el('hr', { class: 'dock-traco' }));
    for (const g of paginas) {
      const b = botao(g.titulo, shell.iconeDe(g.tipo), ativa?.id === g.id, () => shell.ir(g.id), { dica: g.caminho || g.titulo });
      itens.push(el('div', { class: 'dock-item' }, b,
        el('button', { type: 'button', class: 'dock-fechar', 'aria-label': `Fechar ${g.titulo}`, title: 'Fechar', onclick: () => shell.fechar(g.id) }, icone('x'))));
    }
  }
  caixa.replaceChildren(...itens);
}

export function iniciar() {
  if (caixa) return;
  caixa = el('nav', { class: 'dock', id: 'dock', 'aria-label': 'Funções' });
  $('#painel').append(caixa);
  ouvir('guia-ativa', pintar);
  ouvir('guias-mudou', pintar);
  ouvir('funcoes-mudou', pintar);
  ouvir('lateral-mudou', pintar);
  ouvir('conteudos-janela', (d) => { janelaAberta = !!d?.aberta; pintar(); });
  pintar();
}

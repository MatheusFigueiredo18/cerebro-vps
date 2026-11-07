// Moldura: guias estilo Chrome no topo, barra de caminho (voltar, avançar, favorito) e uma área por guia.
// O estado das guias é puro (guias.js); aqui só desenho, teclado e o ciclo de vida de cada corpo.
import * as G from './guias.js';
import { $, el, icone, ler, guardar, emitir, ouvir } from './comum.js';

const ICONE = { grafo: 'grafo', pagina: 'doc', banco: 'banco', arquivo: 'doc', conversas: 'conversa', whatsapp: 'whatsapp', n8n: 'n8n', conteudos: 'conteudos', video: 'filme' };
const FAVORITAVEIS = new Set(['pagina', 'banco', 'arquivo']);
const tipos = new Map(); // tipo -> montar(corpo, guia) => { limpar?, podeFechar?, mostrar?, esconder? }
const corpos = new Map(); // id -> { el, vida }
let estado = G.restaurar(null);

export const registrar = (tipo, montar) => tipos.set(tipo, montar);
export const ativa = () => estado.guias.find((g) => g.id === estado.ativa);
export const favoritos = () => ler('favoritos', []);

function montarCorpo(g) {
  const corpo = el('section', { class: 'guia-corpo', role: 'tabpanel', id: `painel-${g.id}`, 'aria-label': g.titulo });
  $('#area').append(corpo);
  const c = { el: corpo, vida: {} };
  corpos.set(g.id, c);
  const montar = tipos.get(g.tipo);
  if (!montar) { corpo.append(el('p', { class: 'vazio' }, 'Este tipo de guia não existe mais.')); return c; }
  try { c.vida = montar(corpo, g) ?? {}; } catch (e) { corpo.append(el('p', { class: 'vazio' }, `Não consegui abrir: ${e.message}`)); }
  return c;
}

const textoCaminho = (g) => {
  if (g.caminho) return g.caminho.replace(/\.md$/i, '').split('/').join(' / ');
  return g.tipo === 'grafo' ? 'Grafo' : `Funções / ${g.titulo}`;
};

function pintar() {
  const lista = $('#guias');
  const foco = document.activeElement?.closest?.('.guia')?.dataset.id;
  lista.replaceChildren();
  for (const g of estado.guias) {
    const atual = g.id === estado.ativa;
    const aba = el('div', {
      class: `guia${atual ? ' ativa' : ''}`, role: 'tab', tabindex: atual ? '0' : '-1', 'aria-selected': String(atual),
      'aria-controls': `painel-${g.id}`, title: g.caminho || g.titulo, dados: { id: g.id },
    }, el('span', { class: 'guia-icone' }, icone(ICONE[g.tipo] ?? 'doc')), el('span', { class: 'guia-titulo' }, g.titulo));
    if (g.id !== G.GRAFO.id) aba.append(el('button', { type: 'button', class: 'guia-fechar', tabindex: '-1', 'aria-label': `Fechar ${g.titulo}`, title: 'Fechar guia', dados: { fechar: g.id } }, icone('x')));
    lista.append(aba);
  }
  if (foco) lista.querySelector(`.guia[data-id="${CSS.escape(estado.ativa)}"]`)?.focus();
  lista.querySelector('.guia.ativa')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const g = ativa();
  $('#caminho-texto').textContent = textoCaminho(g);
  $('#voltar').disabled = !G.podeVoltar(estado);
  $('#avancar').disabled = !G.podeAvancar(estado);
  pintarEstrela();
}

function pintarEstrela() {
  const g = ativa();
  const b = $('#estrela');
  b.hidden = !FAVORITAVEIS.has(g.tipo);
  const ligada = favoritos().some((f) => f.id === g.id);
  b.classList.toggle('ligada', ligada);
  b.setAttribute('aria-pressed', String(ligada));
  b.title = ligada ? 'Tirar dos favoritos' : 'Favoritar';
  b.setAttribute('aria-label', b.title);
}

function mostrar() {
  const g = ativa();
  if (!corpos.has(g.id)) montarCorpo(g);
  for (const [id, c] of corpos) {
    const visivel = id === g.id;
    if (c.el.hidden === !visivel) continue;
    c.el.hidden = !visivel;
    try { (visivel ? c.vida.mostrar : c.vida.esconder)?.(); } catch { /* a guia segue */ }
  }
  document.body.dataset.guia = g.tipo;
}

function aplicar(novo) {
  estado = novo;
  guardar('guias', G.serializar(estado));
  mostrar();
  pintar();
  emitir('guia-ativa', ativa());
}

export const abrir = (guia) => aplicar(G.abrir(estado, guia));
export const atualizar = (id, campos) => { estado = G.atualizar(estado, id, campos); guardar('guias', G.serializar(estado)); pintar(); };

export function fechar(id) {
  const c = corpos.get(id);
  if (c?.vida.podeFechar && !c.vida.podeFechar()) return; // a guia pode recusar (texto em conflito ainda não resolvido)
  try { c?.vida.limpar?.(); } catch { /* a guia já está saindo */ }
  c?.el.remove();
  corpos.delete(id);
  aplicar(G.fechar(estado, id));
}

export function iniciar() {
  for (const [id, n] of [['voltar', 'voltar'], ['avancar', 'avancar'], ['guia-nova', 'mais'], ['estrela', 'estrela'], ['lateral-alternar', 'lateral']]) $(`#${id}`).append(icone(n));
  $('#voltar').addEventListener('click', () => aplicar(G.andar(estado, -1)));
  $('#avancar').addEventListener('click', () => aplicar(G.andar(estado, 1)));
  $('#guia-nova').addEventListener('click', () => emitir('nova-pagina'));
  $('#estrela').addEventListener('click', () => {
    const g = ativa();
    const lista = favoritos();
    guardar('favoritos', lista.some((f) => f.id === g.id) ? lista.filter((f) => f.id !== g.id) : [...lista, { id: g.id, tipo: g.tipo, titulo: g.titulo, caminho: g.caminho }]);
    pintarEstrela();
    emitir('favoritos-mudou');
  });
  ouvir('favoritos-mudou', pintarEstrela);

  const lista = $('#guias');
  lista.addEventListener('click', (e) => {
    const x = e.target.closest('[data-fechar]');
    if (x) { e.stopPropagation(); fechar(x.dataset.fechar); return; }
    const aba = e.target.closest('.guia');
    if (aba) aplicar(G.ativar(estado, aba.dataset.id));
  });
  lista.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // sem rolagem automática do botão do meio
  lista.addEventListener('auxclick', (e) => {
    const aba = e.button === 1 && e.target.closest('.guia');
    if (aba) { e.preventDefault(); fechar(aba.dataset.id); }
  });
  lista.addEventListener('keydown', (e) => {
    const aba = e.target.closest('.guia');
    if (!aba) return;
    const id = aba.dataset.id;
    const ir = (alvo) => { e.preventDefault(); aplicar(G.ativar(estado, alvo)); lista.querySelector(`.guia[data-id="${CSS.escape(alvo)}"]`)?.focus(); };
    if (e.key === 'ArrowRight') ir(G.vizinha(estado, id, 1));
    else if (e.key === 'ArrowLeft') ir(G.vizinha(estado, id, -1));
    else if (e.key === 'Home') ir(estado.guias[0].id);
    else if (e.key === 'End') ir(estado.guias.at(-1).id);
    else if (e.key === 'Delete' && id !== G.GRAFO.id) { e.preventDefault(); fechar(id); $('#guias .guia.ativa')?.focus(); }
  });

  aplicar(G.restaurar(ler('guias', null)));
}

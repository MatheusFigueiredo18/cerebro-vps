// Moldura: barra de caminho (voltar, avançar, favorito) e uma área por guia. A navegação entre guias é o trilho vertical (dock.js).
// O estado das guias é puro (guias.js); aqui só desenho, teclado e o ciclo de vida de cada corpo.
import * as G from './guias.js';
import { $, el, icone, ler, guardar, emitir, ouvir } from './comum.js';

const ICONE = { grafo: 'grafo', pagina: 'doc', banco: 'banco', arquivo: 'doc', conversas: 'conversa', whatsapp: 'whatsapp', n8n: 'n8n', conteudos: 'conteudos', video: 'filme', lousa: 'lousa' };
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
    if (visivel) { c.el.classList.remove('entra'); void c.el.offsetWidth; c.el.classList.add('entra'); } // o conteúdo sobe e aparece
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
export const atualizar = (id, campos) => { estado = G.atualizar(estado, id, campos); guardar('guias', G.serializar(estado)); pintar(); emitir('guias-mudou'); };
export const guias = () => estado.guias;
export const ir = (id) => aplicar(G.ativar(estado, id));
export const iconeDe = (tipo) => ICONE[tipo] ?? 'doc';

export function fechar(id) {
  const c = corpos.get(id);
  if (c?.vida.podeFechar && !c.vida.podeFechar()) return; // a guia pode recusar (texto em conflito ainda não resolvido)
  try { c?.vida.limpar?.(); } catch { /* a guia já está saindo */ }
  c?.el.remove();
  corpos.delete(id);
  aplicar(G.fechar(estado, id));
}

export function iniciar() {
  for (const [id, n] of [['voltar', 'voltar'], ['avancar', 'avancar'], ['estrela', 'estrela'], ['lateral-alternar', 'lateral']]) $(`#${id}`).append(icone(n));
  $('#voltar').addEventListener('click', () => aplicar(G.andar(estado, -1)));
  $('#avancar').addEventListener('click', () => aplicar(G.andar(estado, 1)));
  $('#estrela').addEventListener('click', () => {
    const g = ativa();
    const lista = favoritos();
    guardar('favoritos', lista.some((f) => f.id === g.id) ? lista.filter((f) => f.id !== g.id) : [...lista, { id: g.id, tipo: g.tipo, titulo: g.titulo, caminho: g.caminho }]);
    pintarEstrela();
    emitir('favoritos-mudou');
  });
  ouvir('favoritos-mudou', pintarEstrela);

  aplicar(G.restaurar(ler('guias', null)));
}

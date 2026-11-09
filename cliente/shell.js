// Moldura: uma área por guia. A navegação entre guias é o trilho vertical (dock.js).
// O estado das guias é puro (guias.js); aqui só desenho, teclado e o ciclo de vida de cada corpo.
import * as G from './guias.js';
import { $, el, ler, guardar, emitir } from './comum.js';

const ICONE = { grafo: 'grafo', pagina: 'doc', banco: 'banco', arquivo: 'doc', conversas: 'conversa', whatsapp: 'whatsapp', n8n: 'n8n', conteudos: 'conteudos', video: 'filme', lousa: 'lousa' };
const tipos = new Map(); // tipo -> montar(corpo, guia) => { limpar?, podeFechar?, mostrar?, esconder? }
const corpos = new Map(); // id -> { el, vida }
let estado = G.restaurar(null);

export const registrar = (tipo, montar) => tipos.set(tipo, montar);
export const ativa = () => estado.guias.find((g) => g.id === estado.ativa);

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
  emitir('guia-ativa', ativa());
}

export const abrir = (guia) => aplicar(G.abrir(estado, guia));
export const atualizar = (id, campos) => { estado = G.atualizar(estado, id, campos); guardar('guias', G.serializar(estado)); emitir('guias-mudou'); };
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
  aplicar(G.restaurar(ler('guias', null)));
}

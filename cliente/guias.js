// Estado das guias, sem DOM: lista, guia ativa e histórico de navegação (voltar e avançar).
// Cada função devolve um estado novo; quem desenha é shell.js.

export const GRAFO = Object.freeze({ id: 'grafo', tipo: 'grafo', titulo: 'Grafo' });

const valida = (g) => g && typeof g.id === 'string' && typeof g.tipo === 'string' && typeof g.titulo === 'string' && g.id !== GRAFO.id;
const existe = (e, id) => e.guias.some((g) => g.id === id);

export function restaurar(salvo) {
  const lista = Array.isArray(salvo?.lista) ? salvo.lista.filter(valida) : [];
  const guias = [GRAFO, ...lista];
  const ativa = guias.some((g) => g.id === salvo?.ativa) ? salvo.ativa : GRAFO.id;
  return { guias, ativa, historico: [ativa], pos: 0 };
}

export function ativar(e, id) {
  if (!existe(e, id) || id === e.ativa) return e;
  const historico = [...e.historico.slice(0, e.pos + 1), id];
  return { ...e, ativa: id, historico, pos: historico.length - 1 };
}

export function abrir(e, guia) {
  const com = existe(e, guia.id) ? e : { ...e, guias: [...e.guias, { ...guia }] };
  return ativar(com, guia.id);
}

export function fechar(e, id) {
  if (id === GRAFO.id || !existe(e, id)) return e;
  const guias = e.guias.filter((g) => g.id !== id);
  // tira a guia do histórico e junta repetições que ficaram coladas
  const pilha = e.historico.slice(0, e.pos + 1).filter((h) => h !== id).filter((h, i, a) => h !== a[i - 1]);
  const historico = pilha.length ? pilha : [GRAFO.id];
  const ativa = e.ativa === id ? historico.at(-1) : e.ativa;
  if (historico.at(-1) !== ativa) historico.push(ativa);
  return { guias, ativa, historico, pos: historico.length - 1 };
}

export function andar(e, passo) {
  const pos = e.pos + passo;
  if (pos < 0 || pos >= e.historico.length) return e;
  return { ...e, pos, ativa: e.historico[pos] };
}

export const podeVoltar = (e) => e.pos > 0;
export const podeAvancar = (e) => e.pos < e.historico.length - 1;

export function vizinha(e, id, delta) {
  const i = e.guias.findIndex((g) => g.id === id);
  const n = e.guias.length;
  return e.guias[(((i + delta) % n) + n) % n].id;
}

export function atualizar(e, id, campos) {
  return { ...e, guias: e.guias.map((g) => (g.id === id && id !== GRAFO.id ? { ...g, ...campos, id } : g)) };
}

export const serializar = (e) => ({ lista: e.guias.filter((g) => g.id !== GRAFO.id), ativa: e.ativa });

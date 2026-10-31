// Core OS · personalização de listas da lateral: fixos primeiro, depois a ordem escolhida, ocultos fora.
// prefs = { ordem: string[], ocultos: string[], fixos: string[] }; ids que não existem mais são ignorados.

export function aplicarPrefs(itens, prefs) {
  const { ordem = [], ocultos = [], fixos = [] } = prefs ?? {};
  const porId = new Map(itens.map((i) => [i.id, i]));
  const colocados = new Set();
  const saida = [];
  for (const id of [...fixos, ...ordem]) {
    if (porId.has(id) && !colocados.has(id) && !ocultos.includes(id)) { colocados.add(id); saida.push(porId.get(id)); }
  }
  for (const i of itens) if (!colocados.has(i.id) && !ocultos.includes(i.id)) saida.push(i);
  return saida;
}

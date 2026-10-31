// Core OS · visões do banco (quadro, calendário, ordenação). Funções puras, sem DOM.
// Linha = { caminho, titulo, props } como devolve GET /api/banco.

const vazio = (v) => v === null || v === undefined || v === '';
const DATA = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/;

export function agruparLinhas(linhas, propId, opcoes = []) {
  const colunas = new Map(opcoes.map((o) => [o, []]));
  const sem = [];
  for (const l of linhas) {
    const v = l.props?.[propId];
    if (vazio(v)) { sem.push(l); continue; }
    const k = String(v);
    if (!colunas.has(k)) colunas.set(k, []); // valor fora das opções ganha coluna própria, nenhuma linha some
    colunas.get(k).push(l);
  }
  const grupos = [...colunas].map(([coluna, ls]) => ({ coluna, linhas: ls }));
  return sem.length ? [...grupos, { coluna: 'Sem valor', linhas: sem }] : grupos;
}

export function linhasPorDia(linhas, propId, ano, mes) {
  const dias = {};
  for (const l of linhas) {
    const m = DATA.exec(String(l.props?.[propId] ?? ''));
    if (!m) continue;
    const [a, mm, d] = [m[1], m[2], m[3]].map(Number);
    const real = new Date(Date.UTC(a, mm - 1, d));
    if (real.getUTCFullYear() !== a || real.getUTCMonth() !== mm - 1 || real.getUTCDate() !== d) continue;
    if (a !== ano || mm !== mes) continue;
    (dias[`${m[1]}-${m[2]}-${m[3]}`] ||= []).push(l);
  }
  return dias;
}

export function ordenarLinhas(linhas, propId, sentido = 'asc') {
  const valor = (l) => (propId === 'titulo' ? l.titulo : l.props?.[propId]);
  const dir = sentido === 'desc' ? -1 : 1;
  return [...linhas].sort((a, b) => {
    const x = valor(a);
    const y = valor(b);
    if (vazio(x) && vazio(y)) return 0;
    if (vazio(x)) return 1; // vazio fica no fim nos dois sentidos
    if (vazio(y)) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt', { numeric: true });
    return c * dir;
  });
}

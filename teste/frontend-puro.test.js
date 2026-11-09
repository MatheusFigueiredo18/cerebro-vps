import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separarFrontmatter, mdParaBlocos, blocosParaMd } from '../cliente/blocos.js';
import { agruparLinhas, linhasPorDia, ordenarLinhas } from '../cliente/visoes.js';

const CANONICO = [
  '# Título',
  '',
  'Um parágrafo.',
  '',
  '## Sub',
  '',
  '### Subsub',
  '',
  '- item a',
  '- item b',
  '',
  '1. um',
  '2. dois',
  '',
  '- [ ] fazer',
  '- [x] feito',
  '',
  '> citação',
  '> segunda linha',
  '',
  '> [!note] Atenção',
  '> detalhe',
  '',
  '```js',
  'const a = 1;',
  '```',
  '',
  '---',
  '',
  'Fim',
  '',
].join('\n');

test('blocos: ida e volta de md canônico é idêntica', () => {
  assert.equal(blocosParaMd(mdParaBlocos(CANONICO)), CANONICO);
});

test('blocos: reconhece cada tipo', () => {
  const tipos = mdParaBlocos(CANONICO).map((b) => b.tipo);
  assert.deepEqual(tipos, ['h1', 'paragrafo', 'h2', 'h3', 'lista', 'lista', 'numerada', 'numerada', 'tarefa', 'tarefa', 'citacao', 'destaque', 'codigo', 'divisor', 'paragrafo']);
  const blocos = mdParaBlocos(CANONICO);
  assert.equal(blocos[9].feito, true);
  assert.equal(blocos[8].feito, false);
  assert.equal(blocos[11].lang, 'note');
  assert.equal(blocos[11].texto, 'Atenção\ndetalhe');
  assert.equal(blocos[12].lang, 'js');
});

test('blocos: texto desconhecido vira paragrafo literal e volta igual', () => {
  const md = '#sem espaço\n  - aninhado\n* asterisco\n~~~\nsolto\n\n\n\nfim\n';
  const blocos = mdParaBlocos(md);
  assert.ok(blocos.every((b) => b.tipo === 'paragrafo'));
  assert.equal(blocosParaMd(blocos), md);
});

test('blocos: blocos criados no editor saem com as linhas em branco canônicas', () => {
  const md = blocosParaMd([
    { tipo: 'h1', texto: 'A' },
    { tipo: 'paragrafo', texto: 'b' },
    { tipo: 'lista', texto: 'c' },
    { tipo: 'lista', texto: 'd' },
    { tipo: 'numerada', texto: 'e' },
    { tipo: 'numerada', texto: 'f' },
    { tipo: 'citacao', texto: 'g' },
    { tipo: 'citacao', texto: 'h' },
  ]);
  assert.equal(md, '# A\n\nb\n\n- c\n- d\n\n1. e\n2. f\n\n> g\n\n> h\n');
});

test('blocos: numeração original é preservada', () => {
  const md = '1. a\n1. b\n1. c\n';
  assert.equal(blocosParaMd(mdParaBlocos(md)), md);
});

test('blocos: md vazio dá lista vazia e volta vazio', () => {
  assert.deepEqual(mdParaBlocos(''), []);
  assert.equal(blocosParaMd([]), '');
});

test('separarFrontmatter devolve a cabeça literal', () => {
  const md = '---\nstatus: Feito\ntags:\n  - a\n---\n# corpo\n';
  assert.deepEqual(separarFrontmatter(md), { cabeca: '---\nstatus: Feito\ntags:\n  - a\n---\n', corpo: '# corpo\n' });
  assert.deepEqual(separarFrontmatter('# sem\n'), { cabeca: '', corpo: '# sem\n' });
});

const L = (titulo, props) => ({ caminho: `B/${titulo}.md`, titulo, props });

test('agruparLinhas cria coluna "Sem valor" só quando precisa', () => {
  const linhas = [L('a', { status: 'Feito' }), L('b', {}), L('c', { status: '' }), L('d', { status: 'A fazer' })];
  const grupos = agruparLinhas(linhas, 'status', ['A fazer', 'Fazendo', 'Feito']);
  assert.deepEqual(grupos.map((g) => g.coluna), ['A fazer', 'Fazendo', 'Feito', 'Sem valor']);
  assert.deepEqual(grupos[3].linhas.map((l) => l.titulo), ['b', 'c']);
  const completo = agruparLinhas([L('a', { status: 'Feito' })], 'status', ['A fazer', 'Feito']);
  assert.deepEqual(completo.map((g) => g.coluna), ['A fazer', 'Feito']);
});

test('agruparLinhas não perde linha com valor fora das opções', () => {
  const grupos = agruparLinhas([L('a', { status: 'Arquivado' })], 'status', ['A fazer']);
  assert.deepEqual(grupos.map((g) => g.coluna), ['A fazer', 'Arquivado']);
  assert.equal(grupos[1].linhas.length, 1);
});

test('linhasPorDia ignora linha sem data, data inválida e outro mês', () => {
  const linhas = [
    L('a', { data: '2026-10-30' }),
    L('b', { data: '2026-10-30T09:00' }),
    L('c', {}),
    L('d', { data: '2026-13-45' }),
    L('e', { data: 'amanhã' }),
    L('f', { data: '2026-11-01' }),
    L('g', { data: null }),
  ];
  const dias = linhasPorDia(linhas, 'data', 2026, 10);
  assert.deepEqual(Object.keys(dias), ['2026-10-30']);
  assert.deepEqual(dias['2026-10-30'].map((l) => l.titulo), ['a', 'b']);
});

test('ordenarLinhas é estável, põe vazios no fim e respeita o sentido', () => {
  const linhas = [L('a', { n: 2 }), L('b', { n: 1 }), L('c', {}), L('d', { n: 2 }), L('e', { n: 10 })];
  assert.deepEqual(ordenarLinhas(linhas, 'n', 'asc').map((l) => l.titulo), ['b', 'a', 'd', 'e', 'c']);
  assert.deepEqual(ordenarLinhas(linhas, 'n', 'desc').map((l) => l.titulo), ['e', 'a', 'd', 'b', 'c']);
  assert.deepEqual(ordenarLinhas(linhas, 'titulo', 'desc').map((l) => l.titulo), ['e', 'd', 'c', 'b', 'a']);
  assert.deepEqual(linhas.map((l) => l.titulo), ['a', 'b', 'c', 'd', 'e']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lerFrontmatter, escreverFrontmatter, criarBanco, lerBanco, criarLinha, salvarProp, salvarEsquema } from '../servidor/bancos.js';

const novoVault = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'core-os-')));
const lerArq = (v, rel) => fs.readFileSync(path.join(v, rel), 'utf8');

test('frontmatter faz ida e volta com valor contendo ":" e aspas', () => {
  const props = { titulo: 'a: "b"', n: 3, ok: true, vazio: null, data: '2026-10-30', texto: 'true' };
  const md = escreverFrontmatter(props, 'corpo\n');
  assert.deepEqual(lerFrontmatter(md), { props, corpo: 'corpo\n' });
});

test('escreverFrontmatter preserva o corpo byte a byte', () => {
  const corpo = '\n\n# x  \r\n\ttab ---\n';
  assert.equal(lerFrontmatter(escreverFrontmatter({ a: 'b' }, corpo)).corpo, corpo);
});

test('lerFrontmatter de texto sem cabeçalho devolve tudo como corpo', () => {
  assert.deepEqual(lerFrontmatter('# oi\n'), { props: {}, corpo: '# oi\n' });
});

test('criarBanco grava o esquema padrão', () => {
  const v = novoVault();
  const { caminho } = criarBanco(v, '', 'Tarefas');
  assert.equal(caminho, 'Tarefas');
  const esquema = JSON.parse(lerArq(v, 'Tarefas/.banco.json'));
  assert.equal(esquema.nome, 'Tarefas');
  assert.deepEqual(esquema.propriedades.map((p) => [p.id, p.tipo]), [['status', 'select'], ['data', 'data']]);
  assert.deepEqual(esquema.propriedades[0].opcoes, ['A fazer', 'Fazendo', 'Feito']);
  assert.deepEqual(esquema.visoes.map((x) => x.tipo), ['tabela', 'quadro', 'calendario']);
  assert.equal(esquema.visoes[1].agruparPor, 'status');
  assert.equal(esquema.visoes[2].dataProp, 'data');
});

test('lerBanco lista só .md e ignora .banco.json, outros arquivos e subpastas', () => {
  const v = novoVault();
  criarBanco(v, '', 'B');
  fs.writeFileSync(path.join(v, 'B', 'um.md'), '---\nstatus: Feito\n---\n# um\n');
  fs.writeFileSync(path.join(v, 'B', 'nota.txt'), 'x');
  fs.mkdirSync(path.join(v, 'B', 'sub'));
  const { esquema, linhas } = lerBanco(v, 'B');
  assert.equal(esquema.nome, 'B');
  assert.deepEqual(linhas, [{ caminho: 'B/um.md', titulo: 'um', props: { status: 'Feito' } }]);
});

test('lerBanco de pasta vazia devolve linhas []', () => {
  const v = novoVault();
  criarBanco(v, '', 'B');
  assert.deepEqual(lerBanco(v, 'B').linhas, []);
});

test('lerBanco com json inválido lança mensagem legível', () => {
  const v = novoVault();
  criarBanco(v, '', 'B');
  fs.writeFileSync(path.join(v, 'B', '.banco.json'), '{ quebrado');
  assert.throws(() => lerBanco(v, 'B'), /\.banco\.json inválido/);
});

test('lerBanco de pasta que não é banco lança mensagem legível', () => {
  const v = novoVault();
  fs.mkdirSync(path.join(v, 'P'));
  assert.throws(() => lerBanco(v, 'P'), /não é um banco/);
});

test('criarLinha usa a primeira opção de cada select como valor inicial', () => {
  const v = novoVault();
  criarBanco(v, '', 'B');
  const linha = criarLinha(v, 'B', 'Tarefa 1');
  assert.equal(linha.caminho, 'B/Tarefa 1.md');
  assert.equal(linha.props.status, 'A fazer');
  assert.match(lerArq(v, linha.caminho), /# Tarefa 1\n$/);
});

test('salvarProp mantém as outras chaves (inclusive listas) e o corpo', () => {
  const v = novoVault();
  criarBanco(v, '', 'B');
  const original = '---\nstatus: A fazer\ntags:\n  - a\n  - b\nprioridade: 2\n---\n# corpo\ntexto\n';
  fs.writeFileSync(path.join(v, 'B', 'x.md'), original);
  const linha = salvarProp(v, 'B/x.md', 'status', 'Feito');
  assert.equal(linha.props.status, 'Feito');
  assert.equal(lerArq(v, 'B/x.md'), original.replace('status: A fazer', 'status: Feito'));
});

test('salvarProp troca uma chave que tinha lista e não deixa itens órfãos', () => {
  const v = novoVault();
  criarBanco(v, '', 'B');
  fs.writeFileSync(path.join(v, 'B', 'x.md'), '---\ntags:\n  - a\n  - b\nstatus: Feito\n---\ncorpo\n');
  salvarProp(v, 'B/x.md', 'tags', 'novo');
  assert.equal(lerArq(v, 'B/x.md'), '---\ntags: novo\nstatus: Feito\n---\ncorpo\n');
});

test('salvarProp cria o cabeçalho quando a página não tem e guarda valor com ":" e quebra de linha', () => {
  const v = novoVault();
  criarBanco(v, '', 'B');
  fs.writeFileSync(path.join(v, 'B', 'y.md'), '# y\n');
  const linha = salvarProp(v, 'B/y.md', 'obs', 'a: "b"\nc');
  assert.equal(linha.props.obs, 'a: "b"\nc');
  assert.match(lerArq(v, 'B/y.md'), /\n# y\n$/);
});

test('salvarProp rejeita nome de propriedade inválido e valor que não é escalar', () => {
  const v = novoVault();
  criarBanco(v, '', 'B');
  fs.writeFileSync(path.join(v, 'B', 'z.md'), '# z\n');
  assert.throws(() => salvarProp(v, 'B/z.md', 'a: b', 'x'), /propriedade inválida/);
  assert.throws(() => salvarProp(v, 'B/z.md', 'ok', { a: 1 }), /valor inválido/);
});

test('salvarEsquema recusa tipo desconhecido e aceita um válido', () => {
  const v = novoVault();
  criarBanco(v, '', 'B');
  const base = lerBanco(v, 'B').esquema;
  const ruim = { ...base, propriedades: [{ id: 'x', nome: 'X', tipo: 'foto' }] };
  assert.throws(() => salvarEsquema(v, 'B', ruim), /tipo de propriedade inválido/);
  const bom = { ...base, propriedades: [...base.propriedades, { id: 'valor', nome: 'Valor', tipo: 'numero' }] };
  salvarEsquema(v, 'B', bom);
  assert.equal(lerBanco(v, 'B').esquema.propriedades.at(-1).id, 'valor');
});

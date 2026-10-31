import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  chaveProjeto, descreverAcao, statusClaude, historicoClaude, subagentes,
  lerCodex, acharArquivoCodex, registrosCodexRecentes, vincularCodex,
} from '../servidor/registros.js';
import { tmp, escrever } from './ajuda.js';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const linhas = (...objs) => objs.map((o) => (typeof o === 'string' ? o : JSON.stringify(o))).join('\n');

test('chaveProjeto troca tudo que não é letra ASCII ou dígito por hífen', () => {
  assert.equal(chaveProjeto('/home/ana/cérebro_1.x'), '-home-ana-c-rebro-1-x');
});

test('descreverAcao: nota de status, prioridades dos campos, espaços e corte', () => {
  assert.equal(descreverAcao('Write', { file_path: `/v/sessoes/${ID}.md` }), 'Atualizando a nota de status');
  assert.equal(descreverAcao('Task', { description: 'pesquisar', file_path: 'x' }), 'Task: pesquisar');
  assert.equal(descreverAcao('Edit', { file_path: '/a/b/nota.md' }), 'Edit: nota.md');
  assert.equal(descreverAcao('Bash', { command: 'ls   -la\n  /tmp' }), 'Bash: ls -la /tmp');
  assert.equal(descreverAcao('Grep', { pattern: 'foo' }), 'Grep: foo');
  assert.equal(descreverAcao('Outra', {}), 'Outra');
  assert.equal(descreverAcao('Bash', { command: 'x'.repeat(200) }).length, 90);
});

function registroClaude(dir) {
  return escrever(dir, `${ID}.jsonl`, linhas(
    { type: 'user', message: { content: 'oi, faça algo' }, timestamp: '2026-10-31T10:00:00.000Z' },
    { type: 'user', isMeta: true, message: { content: 'meta' } },
    { type: 'user', message: { content: [{ type: 'text', text: '<hook>injeção</hook>' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Vou fazer.' }, { type: 'tool_use', name: 'Write', input: { file_path: '/v/a.md' } }] }, timestamp: '2026-10-31T10:00:01.000Z' },
    'lixo que não é json',
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/v/b.md' } }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Pronto.' }], stop_reason: 'end_turn' } },
  ));
}

test('statusClaude: última ação, fim da vez, arquivos escritos e cache por tamanho', () => {
  const d = tmp();
  const arq = registroClaude(d);
  const st = statusClaude(arq);
  assert.equal(st.ultimaAcao, 'Edit: b.md');
  assert.equal(st.terminou, true);
  assert.deepEqual(st.escritos, ['/v/a.md', '/v/b.md']);
  assert.equal(typeof st.mtime, 'number');
  fs.appendFileSync(arq, `\n${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } })}`);
  assert.equal(statusClaude(arq).terminou, false);
  assert.equal(statusClaude(path.join(d, 'nada.jsonl')), null);
});

test('historicoClaude: papéis, filtros e quando', () => {
  const d = tmp();
  const h = historicoClaude(registroClaude(d));
  assert.deepEqual(h, [
    { papel: 'voce', texto: 'oi, faça algo', quando: Date.parse('2026-10-31T10:00:00.000Z') },
    { papel: 'claude', texto: 'Vou fazer.', quando: Date.parse('2026-10-31T10:00:01.000Z') },
    { papel: 'acao', texto: 'Write: a.md', quando: Date.parse('2026-10-31T10:00:01.000Z') },
    { papel: 'acao', texto: 'Edit: b.md', quando: null },
    { papel: 'claude', texto: 'Pronto.', quando: null },
  ]);
  assert.deepEqual(historicoClaude(path.join(d, 'nada.jsonl')), []);
});

test('historicoClaude limita aos 300 mais recentes', () => {
  const d = tmp();
  const arq = escrever(d, 'h.jsonl', Array.from({ length: 350 }, (_, i) => JSON.stringify({ type: 'user', message: { content: `m${i}` } })).join('\n'));
  const h = historicoClaude(arq);
  assert.equal(h.length, 300);
  assert.equal(h.at(-1).texto, 'm349');
});

test('subagentes: status, descrição padrão, ordem e metadados ruins', () => {
  const projeto = tmp();
  const pasta = path.join(projeto, ID, 'subagents');
  const agora = Date.now();
  escrever(pasta, 'a1.meta.json', JSON.stringify({ description: 'Pesquisa', agentType: 'Explore' }));
  const r1 = escrever(pasta, 'a1.jsonl', linhas({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } }));
  fs.utimesSync(r1, (agora - 100_000) / 1000, (agora - 100_000) / 1000);
  escrever(pasta, 'a2.meta.json', '{ruim');
  escrever(pasta, 'a2.jsonl', linhas({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } }));
  escrever(pasta, 'a3.meta.json', '{}');
  const r3 = escrever(pasta, 'a3.jsonl', linhas({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'x' } }] } }));
  fs.utimesSync(r3, (agora - 60_000) / 1000, (agora - 60_000) / 1000);
  const subs = subagentes(projeto, ID, agora);
  assert.deepEqual(subs.map((s) => [s.id, s.status]), [['a1', 'concluido'], ['a3', 'parado'], ['a2', 'trabalhando']]);
  assert.equal(subs[0].descricao, 'Pesquisa');
  assert.equal(subs[0].tipo, 'Explore');
  assert.equal(subs[2].tipo, '');
  assert.ok(subs[2].descricao);
  assert.equal(subs[2].ultimaAcao, 'Bash: ls');
  assert.deepEqual(subagentes(projeto, 'outro', agora), []);
});

test('Codex: leitura do registro, procura do arquivo e vinculação', () => {
  const base = tmp();
  const hoje = new Date();
  const dia = (d) => path.join(String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  const vault = '/v/cerebro';
  const arq = escrever(base, path.join(dia(hoje), 'rollout-2026-abc-111.jsonl'), linhas(
    { type: 'session_meta', payload: { id: '111', cwd: vault, timestamp: new Date(10_000).toISOString() } },
    { type: 'event_msg', timestamp: '2026-10-31T10:00:00.000Z', payload: { type: 'user_message', message: 'oi' } },
    { type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{"command":["bash","-lc","ls"]}' } },
    { type: 'response_item', payload: { type: 'function_call_output', output: 'x' } },
    { type: 'event_msg', payload: { type: 'agent_message', message: 'feito' } },
    { type: 'event_msg', payload: { type: 'task_complete' } },
  ));
  const r = lerCodex(arq);
  assert.deepEqual(r.itens, [
    { papel: 'voce', texto: 'oi', quando: Date.parse('2026-10-31T10:00:00.000Z') },
    { papel: 'acao', texto: 'bash -lc ls', quando: null },
    { papel: 'claude', texto: 'feito', quando: null },
  ]);
  assert.equal(r.ultimaAcao, 'bash -lc ls');
  assert.equal(r.terminou, true);

  const cache = new Map();
  assert.equal(acharArquivoCodex(base, '111', cache), arq);
  const velho = escrever(base, path.join('2020', '01', '01', 'rollout-222.jsonl'), linhas({ type: 'session_meta', payload: { id: '222', cwd: vault } }));
  assert.equal(acharArquivoCodex(base, '222', cache), velho);
  assert.equal(acharArquivoCodex(base, '333', cache), null);

  escrever(base, path.join(dia(hoje), 'rollout-444.jsonl'), linhas({ type: 'session_meta', payload: { id: '444', cwd: '/outro', timestamp: new Date(10_000).toISOString() } }));
  const regs = registrosCodexRecentes(base);
  assert.deepEqual(regs.map((x) => x.id).sort(), ['111', '444']);

  const conversas = [
    { id: 'c1', motor: 'codex', iniciouTerminal: 9_000 },
    { id: 'c2', motor: 'codex', iniciouTerminal: 12_000 },
    { id: 'c3', motor: 'codex', iniciouTerminal: 20_000 },
    { id: 'c4', motor: 'claude', iniciouTerminal: 9_000 },
    { id: 'c5', motor: 'codex', iniciouTerminal: 9_500, arquivada: true },
  ];
  assert.equal(vincularCodex(conversas, regs, vault), true);
  assert.equal(conversas[1].sessaoMotor, '111');
  assert.equal(conversas[0].sessaoMotor, undefined);
  assert.equal(conversas[2].sessaoMotor, undefined);
  assert.equal(vincularCodex(conversas, regs, vault), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOTORES, motorDe, localizar, argsTerminal, argsSemTela, ambienteAgente, promptPainel, rodarSemTela,
} from '../servidor/motores.js';
import { tmp, escrever } from './ajuda.js';

const FALSO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'motor-falso.mjs');
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

test('tabela de motores e motor desconhecido vira claude', () => {
  assert.deepEqual(Object.keys(MOTORES), ['claude', 'codex', 'antigravity']);
  assert.equal(MOTORES.antigravity.nome, 'Antigravity');
  assert.ok(MOTORES.codex.login);
  assert.equal(motorDe('xyz'), 'claude');
  assert.equal(motorDe(undefined), 'claude');
  assert.equal(motorDe('codex'), 'codex');
});

test('localizar: caminho com barra precisa existir; nome procura no PATH', () => {
  const d = tmp();
  const bin = escrever(d, 'meu-motor', '#!/bin/sh\n');
  fs.chmodSync(bin, 0o755);
  if (process.platform === 'win32') escrever(d, 'meu-motor.cmd', '@echo off\n');
  assert.equal(localizar(bin.split(path.sep).join('/'), {}, d), bin.split(path.sep).join('/'));
  assert.equal(localizar(`${d}/nao-existe`, {}, d), null);
  assert.ok(localizar('meu-motor', { PATH: d }, tmp()));
  assert.equal(localizar('nao-existe-mesmo', { PATH: d }, tmp()), null);
  const casa = tmp();
  escrever(casa, '.local/bin/outro', '#!/bin/sh\n');
  fs.chmodSync(path.join(casa, '.local/bin/outro'), 0o755);
  if (process.platform === 'win32') escrever(casa, '.local/bin/outro.cmd', '');
  assert.ok(localizar('outro', { PATH: '' }, casa));
});

test('argumentos do terminal por motor', () => {
  const p = promptPainel(ID);
  assert.match(p, new RegExp(`sessoes/${ID}\\.md`));
  assert.deepEqual(argsTerminal({ id: ID, motor: 'claude' }, p, false), ['--session-id', ID, '--append-system-prompt', p]);
  assert.deepEqual(argsTerminal({ id: ID, motor: 'claude' }, p, true), ['--resume', ID, '--append-system-prompt', p]);
  const toml = `developer_instructions=${JSON.stringify(p)}`;
  assert.deepEqual(argsTerminal({ id: ID, motor: 'codex' }, p), ['-c', toml, '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request']);
  assert.deepEqual(argsTerminal({ id: ID, motor: 'codex', sessaoMotor: 's1' }, p), ['resume', '-c', toml, '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', 's1']);
  assert.deepEqual(argsTerminal({ id: ID, motor: 'antigravity' }, p), []);
  assert.deepEqual(argsTerminal({ id: ID, motor: 'antigravity', iniciouTerminal: 1 }, p), ['--continue']);
  assert.deepEqual(argsTerminal({ id: ID, motor: 'antigravity', sessaoMotor: 'cv', iniciouTerminal: 1 }, p), ['--conversation', 'cv']);
});

test('argumentos sem tela por motor', () => {
  const p = 'PROMPT';
  const claude = argsSemTela({ id: ID, motor: 'claude' }, 'oi', p, false, '/tmp/x');
  assert.deepEqual(claude.slice(0, 8), ['-p', 'oi', '--session-id', ID, '--append-system-prompt', p, '--output-format', 'text']);
  assert.deepEqual(claude.slice(8), ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill', 'Task', 'WebFetch', 'WebSearch']);
  assert.equal(argsSemTela({ id: ID, motor: 'claude' }, 'oi', p, true, '/tmp/x')[2], '--resume');
  const comum = ['-c', 'developer_instructions="PROMPT"', '-c', 'sandbox_mode="danger-full-access"', '-c', 'approval_policy="never"', '--skip-git-repo-check', '--json', '-o', '/tmp/x', '--'];
  assert.deepEqual(argsSemTela({ id: ID, motor: 'codex' }, 'oi', p, false, '/tmp/x'), ['exec', ...comum, 'oi']);
  assert.deepEqual(argsSemTela({ id: ID, motor: 'codex', sessaoMotor: 's1' }, 'oi', p, false, '/tmp/x'), ['exec', 'resume', ...comum, 's1', 'oi']);
  const agy = argsSemTela({ id: ID, motor: 'antigravity' }, 'oi', p, false, '');
  assert.deepEqual(agy, ['-p', '[PROMPT]\n\noi', '--output-format', 'json', '--dangerously-skip-permissions', '--print-timeout', '20m']);
  assert.deepEqual(argsSemTela({ id: ID, motor: 'antigravity', sessaoMotor: 'cv' }, 'oi', p, false, ''), ['-p', 'oi', '--output-format', 'json', '--dangerously-skip-permissions', '--print-timeout', '20m', '--conversation', 'cv']);
});

test('ambiente do agente: remove herança de agente e segredos, injeta sessão', () => {
  const env = ambienteAgente({
    PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'x', CLAUDE_PID: '2', CLAUDE_EFFORT: 'h', AI_AGENT: 'a',
    CORE_OS_PASSWORD: 's', CORE_OS_HOOK_TOKEN: 't', EVO_KEY: 'mantida', CLAUDE_BIN: 'fica',
  }, { sessao: ID, whatsPara: '5511', terminal: true });
  assert.deepEqual(env, { PATH: '/bin', EVO_KEY: 'mantida', CLAUDE_BIN: 'fica', CORE_OS_SESSAO: ID, WHATS_PARA: '5511', TERM: 'xterm-256color', COLORTERM: 'truecolor' });
  const semTela = ambienteAgente({ PATH: '/bin' }, { sessao: ID, whatsPara: '' });
  assert.equal(semTela.TERM, undefined);
  assert.equal(semTela.WHATS_PARA, '');
});

const opcoes = (motor, extra = {}) => ({
  motor, bin: FALSO, conversa: { id: ID, motor }, texto: 'olá', prompt: 'P', vault: tmp(), env: { PATH: process.env.PATH, CORE_OS_PASSWORD: 'x' },
  whatsPara: '5562', registroExiste: false, ...extra,
});

test('rodarSemTela: claude devolve saída aparada e o id da conversa', async () => {
  const r = await rodarSemTela(opcoes('claude'));
  assert.match(r.resposta, /^eco:olá /);
  const visto = JSON.parse(r.resposta.slice(r.resposta.indexOf('{')));
  assert.equal(visto.env.sessao, ID);
  assert.equal(visto.env.para, '5562');
  assert.equal(visto.env.senha, null);
  assert.equal(r.sessao, ID);
});

test('rodarSemTela: codex lê o arquivo de saída, renomeia para .lido e acha a sessão', async () => {
  const r = await rodarSemTela(opcoes('codex'));
  assert.equal(r.resposta, 'codex:olá');
  assert.equal(r.sessao, 'th-2');
  assert.ok(fs.existsSync(`${r.arquivoSaida}.lido`));
});

test('rodarSemTela: antigravity lê o JSON', async () => {
  const r = await rodarSemTela(opcoes('antigravity'));
  assert.equal(r.resposta, 'agy:[P]\n\nolá');
  assert.equal(r.sessao, 'cv-1');
});

test('rodarSemTela: motor que não abre e motor travado', async () => {
  const r = await rodarSemTela(opcoes('claude', { bin: path.join(tmp(), 'nao-existe') }));
  assert.match(r.resposta, /Não consegui abrir o Claude Code/);
  const lento = await rodarSemTela(opcoes('claude', { env: { PATH: process.env.PATH, FALSO_DORMIR: '1' }, limiteMs: 300 }));
  assert.equal(typeof lento.resposta, 'string');
});

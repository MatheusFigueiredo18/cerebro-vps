import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDoLogo, chaveDoMotor, usaCorDaMarca } from '../cliente/marcas.js';

test('chaveDoLogo tira a extensão e normaliza o nome do arquivo de logotipo', () => {
  assert.equal(chaveDoLogo('ffmpeg.svg'), 'ffmpeg');
  assert.equal(chaveDoLogo('GitHub.SVG'), 'github');
  assert.equal(chaveDoLogo('yt-dlp.svg'), 'yt-dlp');
  assert.equal(chaveDoLogo(undefined), '');
  assert.equal(chaveDoLogo(null), '');
});

test('chaveDoMotor reconhece o motor pelo nome mostrado ou pelo id', () => {
  assert.equal(chaveDoMotor('Claude Code'), 'claude');
  assert.equal(chaveDoMotor('claude'), 'claude');
  assert.equal(chaveDoMotor('Codex (OpenAI)'), 'codex');
  assert.equal(chaveDoMotor('Antigravity'), 'antigravity');
  assert.equal(chaveDoMotor('Grok'), 'grok');
  assert.equal(chaveDoMotor('Outro motor'), '');
  assert.equal(chaveDoMotor(undefined), '');
});

test('usaCorDaMarca só aceita cores com contraste nos dois temas', () => {
  assert.equal(usaCorDaMarca('#D97757'), true); // laranja da Claude
  assert.equal(usaCorDaMarca('#25D366'), true); // verde do WhatsApp
  assert.equal(usaCorDaMarca('3ECF8E'), true); // Supabase, sem #
  assert.equal(usaCorDaMarca('#000000'), false); // preto some no tema escuro
  assert.equal(usaCorDaMarca('#181717'), false); // GitHub
  assert.equal(usaCorDaMarca('#FFFFFF'), false); // branco some no tema claro
  assert.equal(usaCorDaMarca('lixo'), false);
});

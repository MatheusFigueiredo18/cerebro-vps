import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarVideos } from '../servidor/videos.js';
import { criarGeracao, montarPedido, listarSkills } from '../servidor/geracao.js';
import { escrever, ate, cfgTeste, subir, entrar, json } from './ajuda.js';

function montar() {
  const cfg = cfgTeste();
  escrever(cfg.vault, 'conteudo/bruto.mp4', 'x');
  escrever(cfg.vault, 'conteudo/ref.png', 'x');
  escrever(cfg.vault, 'notas/segredo.md', 'x');
  const videos = criarVideos(cfg.dados);
  const chamadas = [];
  let soltar;
  // Claude falso: grava o próximo v<N>.mp4 na pasta da sessão (ou não grava, se o pedido diz "só responde")
  const rodar = (o) => {
    chamadas.push(o);
    return new Promise((ok) => { soltar = () => {
      if (!o.texto.includes('só responde')) {
        const dir = path.join(cfg.vault, 'conteudo', 'video', o.conversa.id);
        escrever(dir, `v${fs.readdirSync(dir).length + 1}.mp4`, 'mp4');
      }
      ok({ resposta: 'Fiz o v1.mp4', sessao: o.conversa.id });
    }; });
  };
  const ger = criarGeracao({ cfg, videos, registroExiste: (id) => chamadas.some((c) => c.conversa.id === id), rodar });
  return { cfg, videos, ger, chamadas, terminar: () => soltar() };
}

test('geração: Gerar roda o Claude com mídias e prompt, um por vez, e o vídeo pronto aparece', async () => {
  const { cfg, videos, ger, chamadas, terminar } = montar();
  const s = videos.criar({});
  const r = ger.gerar(s.id, { principal: 'conteudo/bruto.mp4', referencias: ['conteudo/ref.png'], prompts: ['legenda amarela'] });
  assert.equal(r.estado, 'gerando');
  assert.equal(chamadas[0].motor, 'claude');
  assert.equal(chamadas[0].conversa.id, s.id); // sessão do Claude = sessão do vídeo
  assert.equal(chamadas[0].registroExiste, false);
  assert.ok(chamadas[0].texto.includes(`Conteúdo principal (todo o contexto do vídeo): ${path.join(cfg.vault, 'conteudo', 'bruto.mp4')}`));
  assert.match(chamadas[0].texto, /legenda amarela/);
  assert.match(chamadas[0].prompt, /Remotion/);
  assert.match(chamadas[0].prompt, /skills\/edicao-video\/SKILL\.md/);
  assert.throws(() => ger.gerar(videos.criar({}).id, { pedido: 'outro' }), (e) => e.code === 'CONFLITO');

  terminar();
  const pronto = await ate(() => { const e = ger.estado(s.id); return e.estado === 'pronto' && e; });
  assert.deepEqual(pronto.videos.map((v) => v.caminho), [`conteudo/video/${s.id}/v1.mp4`]);
  assert.deepEqual(pronto.chat.map((m) => m.papel), ['voce', 'claude']);
  assert.equal(ger.ocupado(), null);
});

test('geração: pedido do nó Claude continua a mesma sessão; resposta sem vídeo novo vira sem-video', async () => {
  const { videos, ger, chamadas, terminar } = montar();
  const s = videos.criar({});
  ger.gerar(s.id, { pedido: 'faz um vídeo de 10s' });
  terminar();
  await ate(() => ger.estado(s.id).estado === 'pronto');
  ger.gerar(s.id, { pedido: 'só responde: qual fonte usou?' });
  assert.equal(chamadas[1].registroExiste, true); // retoma (--resume), não abre outra
  assert.equal(chamadas[1].conversa.id, s.id);
  terminar();
  const e = await ate(() => { const x = ger.estado(s.id); return x.estado === 'sem-video' && x; });
  assert.equal(e.videos.length, 1);
  assert.equal(e.chat.length, 4);
});

test('geração: mídia fora do cérebro, que não é mídia ou pedido vazio são recusados', () => {
  const { videos, ger, chamadas } = montar();
  const s = videos.criar({});
  for (const ruim of ['../../etc/passwd', 'notas/segredo.md', 'conteudo/nao-existe.mp4']) {
    assert.throws(() => ger.gerar(s.id, { principal: ruim }), /inválido/);
  }
  assert.throws(() => ger.gerar(s.id, {}), /nada para gerar/);
  assert.throws(() => ger.gerar('aaaaaaaa-0000-0000-0000-000000000000', { pedido: 'x' }), /não encontrada/);
  assert.equal(chamadas.length, 0);
});

test('montarPedido: só o pedido quando não há nada ligado', () => {
  assert.equal(montarPedido({ pedido: 'deixa mais rápido', referencias: [], prompts: [] }, (r) => r), 'deixa mais rápido');
});

test('rotas de geração: exigem login, geram e devolvem o estado', async (t) => {
  const cfg = cfgTeste();
  escrever(cfg.vault, 'conteudo/bruto.mp4', 'x');
  const s = await subir(cfg, { rodarGerador: async (o) => ({ resposta: `ok ${o.conversa.id}` }) });
  t.after(() => s.fechar());
  const id = '11111111-2222-3333-4444-555555555555';
  assert.equal((await fetch(`${s.base}/api/video/${id}/geracao`)).status, 401);
  const cookie = await entrar(s.base);
  await fetch(`${s.base}/api/video`, json(cookie, { id }));
  const g = await fetch(`${s.base}/api/video/${id}/gerar`, json(cookie, { principal: 'conteudo/bruto.mp4' }));
  assert.equal(g.status, 200);
  const e = await ate(async () => { const x = await (await fetch(`${s.base}/api/video/${id}/geracao`, { headers: { cookie } })).json(); return x.estado !== 'gerando' && x; });
  assert.equal(e.chat.at(-1).texto, `ok ${id}`);
  assert.equal((await fetch(`${s.base}/api/video/${id}/gerar`, json(cookie, { principal: '../fora.mp4' }))).status, 400);
});

test('geração: música e efeito sonoro vão no pedido; áudio fora do cérebro, que não é áudio ou de tipo desconhecido é recusado', async () => {
  const { cfg, videos, ger, chamadas, terminar } = montar();
  escrever(cfg.vault, 'conteudo/trilha.mp3', 'x');
  escrever(cfg.vault, 'conteudo/whoosh.wav', 'x');
  const s = videos.criar({});
  for (const ruim of [{ tipo: 'musica', caminho: 'conteudo/bruto.mp4' }, { tipo: 'musica', caminho: '../../x.mp3' }, { tipo: 'voz', caminho: 'conteudo/trilha.mp3' }, null]) {
    assert.throws(() => ger.gerar(s.id, { audios: [ruim] }), /inválido/);
  }
  ger.gerar(s.id, { audios: [{ tipo: 'musica', caminho: 'conteudo/trilha.mp3' }, { tipo: 'efeito', caminho: 'conteudo/whoosh.wav' }] });
  assert.ok(chamadas[0].texto.includes(`Música (fundo): ${path.join(cfg.vault, 'conteudo', 'trilha.mp3')}`));
  assert.ok(chamadas[0].texto.includes(`Efeito sonoro: ${path.join(cfg.vault, 'conteudo', 'whoosh.wav')}`));
  assert.match(chamadas[0].prompt, /loudnorm/);
  terminar();
  await ate(() => ger.estado(s.id).estado === 'pronto');
});

test('geração: Modelo base vai no pedido com o que extrair; habilidades escolhidas trocam as skills do prompt', async () => {
  const { cfg, videos, ger, chamadas, terminar } = montar();
  escrever(cfg.vault, 'conteudo/modelo.mp4', 'x');
  escrever(cfg.vault, '.claude/skills/carrossel/SKILL.md', `---
name: carrossel
description: "Faz carrossel"
---
`);
  escrever(cfg.vault, '.claude/skills/edicao-video/SKILL.md', `---
name: edicao-video
description: "Edita"
---
`);
  const s = videos.criar({});
  for (const ruim of [{ modelos: [{ caminho: 'conteudo/modelo.mp4', extrair: ['nada'] }] }, { modelos: [{ caminho: '../x.mp4' }] },
    { principal: 'conteudo/bruto.mp4', habilidades: ['nao-existe'] }, { principal: 'conteudo/bruto.mp4', habilidades: ['../../etc'] }, { principal: 'conteudo/bruto.mp4', habilidades: 'carrossel' }]) {
    assert.throws(() => ger.gerar(s.id, ruim), /inválido/);
  }
  ger.gerar(s.id, { modelos: [{ caminho: 'conteudo/modelo.mp4', extrair: ['texto', 'animacao'] }], habilidades: ['carrossel'] });
  assert.ok(chamadas[0].texto.includes(`Modelo base (copie dele só o que está marcado, o conteúdo continua sendo o principal): ${path.join(cfg.vault, 'conteudo', 'modelo.mp4')}`));
  assert.match(chamadas[0].texto, /Extrair: estilo de texto .*; animações/);
  assert.match(chamadas[0].prompt, /skills\/carrossel\/SKILL\.md/);
  assert.doesNotMatch(chamadas[0].prompt, /edicao-video/);
  terminar();
  await ate(() => ger.estado(s.id).estado === 'pronto');
  assert.deepEqual(listarSkills(cfg.vault).map((k) => [k.nome, k.descricao, k.padrao]), [['carrossel', 'Faz carrossel', false], ['edicao-video', 'Edita', true]]);
});

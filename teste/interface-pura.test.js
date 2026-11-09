// Lógica pura da interface (fase 2): guias, formatos, Markdown de leitura, câmera e física do grafo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../cliente/guias.js';
import * as F from '../cliente/formatos.js';
import { lerMarkdown, inline, urlDeImagem } from '../cliente/markdown.js';
import { zoomEm, enquadrar, layoutFilhos } from '../cliente/camera.js';
import { posicaoInicial, passo, raioDe } from '../cliente/grafo-fisica.js';

// ---------- guias ----------
const pag = (n) => ({ id: `p:${n}.md`, tipo: 'pagina', titulo: n, caminho: `${n}.md` });

test('guias: começa só com o grafo e ignora lixo do armazenamento', () => {
  assert.deepEqual(G.restaurar(null).guias.map((g) => g.id), ['grafo']);
  const e = G.restaurar({ lista: [pag('a'), { id: 'grafo', tipo: 'pagina', titulo: 'x' }, { id: 3 }, null], ativa: 'p:a.md' });
  assert.deepEqual(e.guias.map((g) => g.id), ['grafo', 'p:a.md']);
  assert.equal(e.ativa, 'p:a.md');
  assert.equal(G.restaurar({ lista: [], ativa: 'sumiu' }).ativa, 'grafo');
});

test('guias: abrir não duplica, ativa e entra no histórico', () => {
  let e = G.restaurar(null);
  e = G.abrir(e, pag('a'));
  e = G.abrir(e, pag('b'));
  e = G.abrir(e, pag('a'));
  assert.deepEqual(e.guias.map((g) => g.id), ['grafo', 'p:a.md', 'p:b.md']);
  assert.equal(e.ativa, 'p:a.md');
  assert.deepEqual(e.historico, ['grafo', 'p:a.md', 'p:b.md', 'p:a.md']);
});

test('guias: voltar e avançar andam no histórico sem criar entradas', () => {
  let e = G.abrir(G.abrir(G.restaurar(null), pag('a')), pag('b'));
  e = G.andar(e, -1);
  assert.equal(e.ativa, 'p:a.md');
  assert.equal(G.podeVoltar(e), true);
  assert.equal(G.podeAvancar(e), true);
  e = G.andar(e, 1);
  assert.equal(e.ativa, 'p:b.md');
  assert.equal(G.podeAvancar(e), false);
  assert.equal(G.andar(e, 5), e);
  e = G.andar(G.andar(e, -1), -1);
  e = G.abrir(e, pag('c')); // abrir depois de voltar corta o "avançar"
  assert.deepEqual(e.historico, ['grafo', 'p:c.md']);
});

test('guias: fechar a ativa volta para a anterior; o grafo nunca fecha', () => {
  let e = G.abrir(G.abrir(G.restaurar(null), pag('a')), pag('b'));
  assert.equal(G.fechar(e, 'grafo'), e);
  e = G.fechar(e, 'p:b.md');
  assert.equal(e.ativa, 'p:a.md');
  assert.deepEqual(e.guias.map((g) => g.id), ['grafo', 'p:a.md']);
  assert.ok(!e.historico.includes('p:b.md'));
  e = G.fechar(e, 'p:a.md');
  assert.equal(e.ativa, 'grafo');
  assert.deepEqual(e.historico, ['grafo']);
});

test('guias: vizinha dá a volta e serializar deixa o grafo de fora', () => {
  const e = G.abrir(G.abrir(G.restaurar(null), pag('a')), pag('b'));
  assert.equal(G.vizinha(e, 'p:b.md', 1), 'grafo');
  assert.equal(G.vizinha(e, 'grafo', -1), 'p:b.md');
  assert.deepEqual(G.serializar(e), { lista: [pag('a'), pag('b')], ativa: 'p:b.md' });
});

test('guias: atualizar troca o título sem mexer no id', () => {
  let e = G.abrir(G.restaurar(null), pag('a'));
  e = G.atualizar(e, 'p:a.md', { titulo: 'Nova' });
  assert.equal(e.guias[1].titulo, 'Nova');
  assert.equal(e.guias[1].id, 'p:a.md');
});

// ---------- formatos ----------
test('tipoArquivo pela extensão', () => {
  assert.equal(F.tipoArquivo('a/B.PNG'), 'imagem');
  assert.equal(F.tipoArquivo('v.m4v'), 'video');
  assert.equal(F.tipoArquivo('n.md'), 'markdown');
  assert.equal(F.tipoArquivo('x.csv'), 'texto');
  assert.equal(F.tipoArquivo('x.pdf'), 'outro');
  assert.equal(F.tipoArquivo('sem-extensao'), 'outro');
});

test('tituloAmigavel e dataCurta seguem o prefixo de data', () => {
  assert.equal(F.tituloAmigavel('2026-10-31-meu_carrossel-novo.png', true), 'Meu carrossel novo');
  assert.equal(F.tituloAmigavel('reels-da-semana', false), 'Reels da semana');
  assert.equal(F.tituloAmigavel('v1.2-final', false), 'V1.2 final');
  assert.equal(F.dataCurta('2026-03-07-x', 0), '07/03');
  assert.equal(F.dataCurta('x', new Date(2026, 9, 5).getTime()), '5 out');
  assert.equal(F.dataCurta('x', 0), '');
});

test('tamanhoLegivel', () => {
  assert.equal(F.tamanhoLegivel(512), '512 B');
  assert.equal(F.tamanhoLegivel(1536), '1,5 KB');
  assert.equal(F.tamanhoLegivel(5 * 1024 * 1024), '5 MB');
  assert.equal(F.tamanhoLegivel(3.25 * 1024 ** 3), '3,3 GB');
});

test('rotuloCategoria conhecida e genérica', () => {
  assert.equal(F.rotuloCategoria('carrosseis'), 'Carrosséis');
  assert.equal(F.rotuloCategoria('whatsapp'), 'WhatsApp');
  assert.equal(F.rotuloCategoria('posts-antigos'), 'Posts antigos');
});

test('agruparPorSubpasta: própria pasta, entrega e o resto em ordem', () => {
  const arq = ['conteudo/c/x/z/b.png', 'conteudo/c/a.png', 'conteudo/c/entrega/e.png', 'conteudo/c/b/c.png'].map((caminho) => ({ caminho }));
  const g = F.agruparPorSubpasta(arq, 'conteudo/c');
  assert.deepEqual(g.map((x) => x.grupo), ['', 'entrega', 'b', 'x / z']);
  assert.equal(g[0].arquivos[0].caminho, 'conteudo/c/a.png');
});

test('telefone: formatação brasileira e validação de 10 a 13 dígitos', () => {
  assert.equal(F.formatarTelefone('5562999998888'), '+55 (62) 99999-8888');
  assert.equal(F.formatarTelefone('556233334444'), '+55 (62) 3333-4444');
  assert.equal(F.formatarTelefone('123'), '123');
  assert.equal(F.numeroValido('(62) 99999-8888'), '62999998888');
  assert.equal(F.numeroValido('123456789'), null);
  assert.equal(F.numeroValido('12345678901234'), null);
});

test('lerNota: resumo da primeira citação e checklist com - ou *', () => {
  const n = F.lerNota('# T\n> Resumo aqui\n> outra\n- [ ] um\n* [x] dois\n- [X] três\n- nada\n');
  assert.equal(n.resumo, 'Resumo aqui');
  assert.deepEqual(n.checklist, [{ texto: 'um', feito: false }, { texto: 'dois', feito: true }, { texto: 'três', feito: true }]);
  assert.deepEqual(F.lerNota(''), { resumo: '', checklist: [] });
});

test('ordenarNos: nome, nome invertido e recentes, pastas antes', () => {
  const nos = [
    { nome: 'b.md', tipo: 'arquivo', mtime: 3 },
    { nome: 'z', tipo: 'pasta', mtime: 1, filhos: [{ nome: 'x', tipo: 'arquivo', mtime: 1 }, { nome: 'y', tipo: 'arquivo', mtime: 9 }] },
    { nome: 'a.md', tipo: 'arquivo', mtime: 5 },
  ];
  assert.deepEqual(F.ordenarNos(nos, 'nome').map((n) => n.nome), ['z', 'a.md', 'b.md']);
  assert.deepEqual(F.ordenarNos(nos, 'nome-desc').map((n) => n.nome), ['z', 'b.md', 'a.md']);
  const r = F.ordenarNos(nos, 'recentes');
  assert.deepEqual(r.map((n) => n.nome), ['z', 'a.md', 'b.md']);
  assert.deepEqual(r[0].filhos.map((n) => n.nome), ['y', 'x']);
  assert.equal(nos[0].nome, 'b.md'); // não muda a entrada
});

test('midiasIrmas: só mídias da mesma pasta, ordem natural', () => {
  const arvore = [{ nome: 'p', caminho: 'p', tipo: 'pasta', filhos: [
    { nome: 'img10.png', caminho: 'p/img10.png', tipo: 'arquivo' },
    { nome: 'sub', caminho: 'p/sub', tipo: 'pasta', filhos: [{ nome: 'x.png', caminho: 'p/sub/x.png', tipo: 'arquivo' }] },
    { nome: 'img2.png', caminho: 'p/img2.png', tipo: 'arquivo' },
    { nome: 'n.md', caminho: 'p/n.md', tipo: 'arquivo' },
    { nome: 'v.mp4', caminho: 'p/v.mp4', tipo: 'arquivo' },
  ] }];
  assert.deepEqual(F.midiasIrmas(arvore, 'p/img10.png'), ['p/img2.png', 'p/img10.png', 'p/v.mp4']);
  assert.deepEqual(F.midiasIrmas([{ nome: 'a.png', caminho: 'a.png', tipo: 'arquivo' }], 'a.png'), ['a.png']);
});

test('guiaDeArquivo: página, banco, outro e pasta comum', () => {
  assert.deepEqual(F.guiaDeArquivo({ caminho: 'a/n.md', nome: 'n.md', tipo: 'arquivo' }), { id: 'p:a/n.md', tipo: 'pagina', titulo: 'n', caminho: 'a/n.md' });
  assert.deepEqual(F.guiaDeArquivo({ caminho: 'b', nome: 'b', tipo: 'pasta', banco: true }), { id: 'b:b', tipo: 'banco', titulo: 'b', caminho: 'b' });
  assert.deepEqual(F.guiaDeArquivo({ caminho: 'c.txt', nome: 'c.txt', tipo: 'arquivo' }), { id: 'a:c.txt', tipo: 'arquivo', titulo: 'c.txt', caminho: 'c.txt' });
  assert.deepEqual(F.guiaDeArquivo({ caminho: '.claude/s.md', nome: 's.md', tipo: 'arquivo' }).tipo, 'arquivo');
  assert.equal(F.guiaDeArquivo({ caminho: 'd', nome: 'd', tipo: 'pasta' }), null);
});

// ---------- Markdown de leitura ----------
test('lerMarkdown: cabeçalho à parte, títulos até h6, listas agrupadas', () => {
  const { cabeca, blocos } = lerMarkdown('---\na: 1\n---\n# T\n#### Quatro\n- a\n* b\n1. um\n2. dois\n- [ ] t\n- [x] f\n\nlinha 1\nlinha 2\n');
  assert.equal(cabeca, 'a: 1');
  assert.deepEqual(blocos.map((b) => b.tipo), ['h1', 'h4', 'lista', 'numerada', 'tarefas', 'p']);
  assert.deepEqual(blocos[2].itens, ['a', 'b']);
  assert.deepEqual(blocos[4].itens, [{ texto: 't', feito: false }, { texto: 'f', feito: true }]);
  assert.deepEqual(blocos[5].linhas, ['linha 1', 'linha 2']);
});

test('lerMarkdown: tabela GFM, código, citação e divisor', () => {
  const { blocos } = lerMarkdown('| a | b |\n|---|:-:|\n| 1 | 2 |\n\n```js\nx < 1\n```\n> q\n\n---\n| só | uma |\n');
  assert.deepEqual(blocos[0], { tipo: 'tabela', cabeca: ['a', 'b'], linhas: [['1', '2']] });
  assert.deepEqual(blocos[1], { tipo: 'codigo', texto: 'x < 1', lang: 'js' });
  assert.equal(blocos[2].tipo, 'citacao');
  assert.equal(blocos[3].tipo, 'hr');
  assert.equal(blocos[4].tipo, 'p'); // linha de tabela sem separador é texto
});

test('inline: negrito, itálico, código, link, imagem, wikilink e incorporação', () => {
  assert.deepEqual(inline('a **b** _c_ `d<`'), [
    { t: 'texto', v: 'a ' }, { t: 'negrito', filhos: [{ t: 'texto', v: 'b' }] }, { t: 'texto', v: ' ' },
    { t: 'italico', filhos: [{ t: 'texto', v: 'c' }] }, { t: 'texto', v: ' ' }, { t: 'codigo', v: 'd<' },
  ]);
  assert.deepEqual(inline('[[nota|rótulo]] [[outra]]'), [{ t: 'wiki', v: 'rótulo' }, { t: 'texto', v: ' ' }, { t: 'wiki', v: 'outra' }]);
  assert.deepEqual(inline('![[foto.png]]'), [{ t: 'img', src: 'foto.png', alt: 'foto.png', embed: true }]);
  assert.deepEqual(inline('![x](a.png) [s](https://e.com)'), [{ t: 'img', src: 'a.png', alt: 'x' }, { t: 'texto', v: ' ' }, { t: 'link', href: 'https://e.com', filhos: [{ t: 'texto', v: 's' }] }]);
  assert.deepEqual(inline('2 * 3 * 4'), [{ t: 'texto', v: '2 * 3 * 4' }]);
});

test('urlDeImagem: relativas passam pela rota de arquivo; externas ficam', () => {
  assert.equal(urlDeImagem('img/a b.png', 'notas'), '/api/arquivo?caminho=notas%2Fimg%2Fa%20b.png');
  assert.equal(urlDeImagem('../x.png', 'notas/sub'), '/api/arquivo?caminho=notas%2Fx.png');
  assert.equal(urlDeImagem('https://e.com/a.png', 'n'), 'https://e.com/a.png');
  assert.equal(urlDeImagem('data:image/png;base64,AA', 'n'), 'data:image/png;base64,AA');
  assert.equal(urlDeImagem('/raiz.png', 'n'), '/raiz.png');
  assert.equal(urlDeImagem('javascript:alert(1)', 'n'), '');
});

test('urlDeImagem com incorporação acha pelo nome na lista de arquivos', () => {
  assert.equal(urlDeImagem('foto.png', 'n', ['a/foto.png']), '/api/arquivo?caminho=a%2Ffoto.png');
});

// ---------- câmera ----------
test('zoomEm mantém o ponto sob o ponteiro e respeita os limites', () => {
  const cam = { x: 100, y: 50, z: 1 };
  const z = zoomEm(cam, 300, 200, 2, 0.2, 2);
  const mundoAntes = { x: (300 - cam.x) / cam.z, y: (200 - cam.y) / cam.z };
  assert.equal(z.z, 2);
  assert.equal((300 - z.x) / z.z, mundoAntes.x);
  assert.equal((200 - z.y) / z.z, mundoAntes.y);
  assert.equal(zoomEm(z, 0, 0, 10, 0.2, 2).z, 2);
  assert.equal(zoomEm(cam, 0, 0, 0.001, 0.2, 2).z, 0.2);
});

test('enquadrar centraliza e não passa do zoom máximo', () => {
  const c = enquadrar([{ x: 0, y: 0, w: 100, h: 100 }], { x: 0, y: 0, w: 1000, h: 800 }, 40, 1);
  assert.equal(c.z, 1);
  assert.equal(c.x + 50 * c.z, 500);
  assert.equal(c.y + 50 * c.z, 400);
  const g = enquadrar([{ x: 0, y: 0, w: 4000, h: 100 }, { x: 0, y: 0, w: 10, h: 10 }], { x: 200, y: 0, w: 1000, h: 800 }, 50, 1);
  assert.ok(g.z < 1);
  assert.equal(Math.round(g.x + 2000 * g.z), 700);
  assert.deepEqual(enquadrar([], { x: 0, y: 0, w: 10, h: 10 }, 0, 1), { x: 0, y: 0, z: 1 });
});

test('layoutFilhos: subagentes em fileira centralizada embaixo, mídias em 3 colunas à direita', () => {
  const t = { x: 0, y: 0, w: 860, h: 540 };
  const { subagentes, midias } = layoutFilhos(t, 2, 4);
  assert.equal(subagentes.length, 2);
  assert.ok(subagentes.every((p) => p.y > t.h));
  const centro = (subagentes[0].x + subagentes[1].x + 290) / 2;
  assert.equal(centro, 430);
  assert.equal(midias.length, 4);
  assert.ok(midias.every((p) => p.x > t.w));
  assert.equal(midias[3].y > midias[0].y, true);
  assert.equal(midias[0].x, midias[3].x);
});

// ---------- grafo ----------
test('física do grafo: ligados se aproximam, tudo segue finito', () => {
  const nos = [0, 1, 2].map((i) => ({ ...posicaoInicial(i), vx: 0, vy: 0 }));
  nos[2].x += 400;
  const ligacoes = [{ a: 0, b: 1, tipo: 'link' }];
  const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  for (let i = 0; i < 400; i += 1) passo(nos, ligacoes, 1);
  assert.ok(nos.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  assert.ok(d(nos[0], nos[1]) < d(nos[0], nos[2]));
});

test('física do grafo: nós no mesmo ponto se separam; nó fixo não anda', () => {
  const nos = [{ x: 0, y: 0, vx: 0, vy: 0 }, { x: 0, y: 0, vx: 0, vy: 0, fixo: true }];
  for (let i = 0; i < 50; i += 1) passo(nos, [], 1);
  assert.ok(Math.hypot(nos[0].x - nos[1].x, nos[0].y - nos[1].y) > 1);
  assert.deepEqual([nos[1].x, nos[1].y], [0, 0]);
});

test('raioDe cresce com as ligações e pasta é maior', () => {
  assert.ok(raioDe('nota', 5) > raioDe('nota', 0));
  assert.ok(raioDe('pasta', 2) > raioDe('nota', 2));
});

// ---------- Criação de vídeo: entradas do Gerar vídeo ----------
import { entradasDe, ligadoEm, clonar, nosNaArea, ehAudio } from '../cliente/video-grafo.js';

test('video-grafo: sobe por Prompt e Claude até as mídias e pré-escreve o prompt sobre a mídia', () => {
  const no = (id, tipo, dados = {}) => ({ id, tipo, dados });
  const grafo = {
    nos: [no('p', 'principal', { caminho: 'conteudo/a.mp4' }), no('r', 'referencia', { caminho: 'conteudo/b.png' }),
      no('t', 'prompt', { texto: ' legenda grande ' }), no('c', 'claude'), no('g', 'remotion'), no('v', 'saida'), no('solto', 'prompt', { texto: 'fora' })],
    links: [{ a: 'p', b: 't' }, { a: 't', b: 'c' }, { a: 'c', b: 'g' }, { a: 'r', b: 'g' }, { a: 'g', b: 'v' }],
  };
  assert.deepEqual(entradasDe(grafo, 'g'), { principal: 'conteudo/a.mp4', referencias: ['conteudo/b.png'], modelos: [], audios: [], prompts: ['Sobre a.mp4: legenda grande'] });
  assert.equal(ligadoEm(grafo, 'g', 'saida')?.id, 'v');
  assert.equal(ligadoEm(grafo, 'c', 'remotion')?.id, 'g');
  assert.equal(ligadoEm(grafo, 'solto', 'remotion'), null);
  // ciclo não trava
  grafo.links.push({ a: 'c', b: 'c' });
  assert.equal(entradasDe(grafo, 'g').principal, 'conteudo/a.mp4');
});

test('video-grafo: itens dentro da Lista viram referências; Música e Efeito sonoro viram áudios', () => {
  const no = (id, tipo, dados = {}) => ({ id, tipo, dados });
  const grafo = {
    nos: [no('l', 'lista', { itens: [{ tipo: 'referencia', caminho: 'c/1.png' }, { tipo: 'referencia', caminho: 'c/2.mp4' }] }),
      no('m', 'musica', { caminho: 'c/trilha.mp3' }), no('e', 'efeito', { caminho: 'c/pop.wav' }), no('vazio', 'efeito'), no('g', 'remotion')],
    links: [{ a: 'l', b: 'g' }, { a: 'm', b: 'g' }, { a: 'e', b: 'g' }, { a: 'vazio', b: 'g' }],
  };
  const r = entradasDe(grafo, 'g');
  assert.deepEqual(r.referencias, ['c/1.png', 'c/2.mp4']);
  assert.deepEqual(r.audios, [{ tipo: 'musica', caminho: 'c/trilha.mp3' }, { tipo: 'efeito', caminho: 'c/pop.wav' }]);
  assert.ok(ehAudio('a/B.MP3') && !ehAudio('a/b.mp4'));
});

test('video-grafo: Modelo base vai com o que extrair, mesmo passando por Lista; sem vídeo não entra', () => {
  const no = (id, tipo, dados = {}) => ({ id, tipo, dados });
  const grafo = {
    nos: [no('m', 'modelo', { caminho: 'c/modelo.mp4', extrair: ['texto', 'fundo'] }), no('m2', 'modelo', { extrair: ['texto'] }), no('l', 'lista'), no('g', 'remotion')],
    links: [{ a: 'm', b: 'l' }, { a: 'l', b: 'g' }, { a: 'm2', b: 'g' }],
  };
  const r = entradasDe(grafo, 'g');
  assert.deepEqual(r.modelos, [{ caminho: 'c/modelo.mp4', extrair: ['texto', 'fundo'] }]);
  assert.deepEqual(r.referencias, []);
});

test('video-grafo: clonar troca ids, desloca e só leva as ligações internas; nosNaArea pega quem cruza o retângulo', () => {
  let i = 0;
  const nos = [{ id: 'a', x: 0, y: 0, w: 100, h: 100, dados: { texto: 'x' } }, { id: 'b', x: 200, y: 0, w: 100, h: 100, dados: {} }];
  const c = clonar(nos, [{ a: 'a', b: 'b' }, { a: 'a', b: 'fora' }], 30, 40, () => `n${++i}`);
  assert.deepEqual(c.nos.map((n) => [n.id, n.x, n.y]), [['n1', 30, 40], ['n2', 230, 40]]);
  assert.deepEqual(c.links, [{ a: 'n1', b: 'n2' }]);
  c.nos[0].dados.texto = 'mudou';
  assert.equal(nos[0].dados.texto, 'x'); // cópia funda
  assert.deepEqual(nosNaArea(nos, { x: 90, y: 50, w: 20, h: 10 }), ['a']);
  assert.deepEqual(nosNaArea(nos, { x: -10, y: -10, w: 400, h: 20 }), ['a', 'b']);
});

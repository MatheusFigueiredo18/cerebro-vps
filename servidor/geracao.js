// Core OS · Criação de vídeo, geração: o nó "Gerar vídeo" abre um Claude sem tela que escreve a composição Remotion e renderiza.
// Uma sessão do Claude por sessão de vídeo (mesmo id): os pedidos do nó Claude continuam a mesma conversa, nada se encerra.
// O vídeo final vai para conteudo/video/<id>/v<N>.mp4; o projeto Remotion fica fora do cérebro (<dados>/remotion).
import fs from 'node:fs';
import path from 'node:path';
import { lerJson, gravarJson } from './dados.js';
import { localizar, rodarSemTela } from './motores.js';
import { resolverNoVault, tipoMidia, relDe, natural } from './arquivos.js';

export const LIMITE_GERAR_MS = 45 * 60_000; // render na VPS (2 vCPU) pode levar vários minutos
const MAX_MIDIAS = 30;
const EXT_SAIDA = /\.(mp4|mov|webm)$/i;
const EXT_AUDIO = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const TIPOS_AUDIO = { musica: 'Música (fundo)', efeito: 'Efeito sonoro' };
// o que o nó Modelo base pode pedir para copiar do vídeo de modelo (a chave vai do painel; o texto vai para o Claude)
export const EXTRAIR = {
  texto: 'estilo de texto (fonte, cor, tamanho e posição das legendas e títulos)',
  edicao: 'estilo de edição (ritmo, duração dos planos, tipo de corte e transição)',
  fundo: 'fundo do vídeo (cor, textura, cenário ou moldura)',
  edicoes: 'as edições de cada momento (zoom, B-roll, efeitos, destaques)',
  animacao: 'animações (entrada e saída de textos e elementos, easing, velocidade)',
};
export const SKILLS_PADRAO = ['edicao-video', 'remotion-best-practices'];
const NOME_SKILL = /^[a-z0-9][a-z0-9-]{0,63}$/;
const texto = (v, max) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const invalido = (porque) => new Error(`pedido de vídeo inválido: ${porque}`);

// skills instaladas no cérebro (.claude/skills/<nome>/SKILL.md), com a descrição do frontmatter
export function listarSkills(vault) {
  const pasta = path.join(vault, '.claude', 'skills');
  let nomes = [];
  try { nomes = fs.readdirSync(pasta).filter((n) => NOME_SKILL.test(n) && fs.existsSync(path.join(pasta, n, 'SKILL.md'))); } catch { return []; }
  return nomes.sort(natural.compare).map((nome) => {
    const md = fs.readFileSync(path.join(pasta, nome, 'SKILL.md'), 'utf8').slice(0, 4000);
    const d = md.match(/^description:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '') ?? '';
    return { nome, descricao: d.slice(0, 300), padrao: SKILLS_PADRAO.includes(nome) };
  });
}

export function promptGerador(id, cfg, skills = SKILLS_PADRAO) {
  const saida = path.join(cfg.vault, 'conteudo', 'video', id);
  const projeto = path.join(cfg.dados, 'remotion');
  return [
    'Você é o gerador da Criação de vídeo do painel do cérebro, rodando sem tela no servidor.',
    skills.length ? `Antes de tudo leia e siga as skills escolhidas para este vídeo: ${skills.map((n) => `.claude/skills/${n}/SKILL.md`).join(', ')}.` : '',
    skills.includes('edicao-video') ? 'A edicao-video decide cortes, legendas, animações, transições e som de cada momento.' : '',
    'Clicar em Gerar já é a aprovação: não pergunte nada.',
    `Faça o vídeo com o Remotion${skills.includes('remotion-best-practices') ? ' (use a skill remotion-best-practices para a API)' : ''}.`,
    `Use o projeto Remotion em ${projeto} (se não existir, crie com npm: remotion, @remotion/cli, react e react-dom). Nunca crie projeto nem node_modules dentro do cérebro.`,
    `Uma composição para esta sessão, com id video-${id.slice(0, 8)}. Leve as mídias para a pasta public do projeto.`,
    'Formato padrão 1080x1920 (9:16, Instagram), a não ser que o pedido diga outro.',
    'Som: o áudio do Conteúdo principal vai no vídeo final, nunca mudo. Gravação de celular costuma vir baixa: normalize a fala antes de usar (ex.: ffmpeg -af loudnorm=I=-14:TP=-1.5:LRA=11).',
    'Música fica por baixo da fala (bem mais baixa que a voz, com entrada e saída suaves); efeitos sonoros curtos nos cortes e destaques. Use só os arquivos de áudio indicados no pedido.',
    'Antes de responder, confira com ffmpeg -af volumedetect que o mp4 final tem áudio audível (mean_volume acima de -30 dB); se não tiver, corrija e renderize de novo.',
    `Grave o vídeo final em ${saida}/v<N>.mp4, com N o próximo número livre. Nunca sobrescreva uma versão anterior.`,
    'Pedidos seguintes nesta conversa são ajustes do mesmo vídeo: altere a composição e renderize uma versão nova.',
    'Responda curto: o que fez e o nome do arquivo gerado.',
  ].filter(Boolean).join(' ');
}

export function montarPedido(b, absDe) {
  const linhas = [];
  if (b.principal) linhas.push(`Conteúdo principal (todo o contexto do vídeo): ${absDe(b.principal)}`);
  const refs = b.referencias ?? [];
  if (refs.length) linhas.push('Referências:', ...refs.map((r) => `- ${absDe(r)}`));
  for (const m of b.modelos ?? []) {
    linhas.push(`Modelo base (copie dele só o que está marcado, o conteúdo continua sendo o principal): ${absDe(m.caminho)}`);
    linhas.push(m.extrair.length ? `- Extrair: ${m.extrair.map((k) => EXTRAIR[k]).join('; ')}` : '- Extrair: o estilo geral');
  }
  for (const a of b.audios ?? []) linhas.push(`${TIPOS_AUDIO[a.tipo]}: ${absDe(a.caminho)}`);
  const prompts = b.prompts ?? [];
  if (prompts.length) linhas.push('Prompt:', ...prompts);
  if (b.pedido) linhas.push(linhas.length ? `Pedido: ${b.pedido}` : b.pedido);
  return linhas.join('\n');
}

export function criarGeracao({ cfg, videos, registroExiste, agora = Date.now, log = () => {}, rodar = rodarSemTela }) {
  const dir = path.join(cfg.dados, 'video-geracao');
  fs.mkdirSync(dir, { recursive: true });
  const lerChat = (id) => lerJson(dir, `${id}.json`, { chat: [] }).chat ?? [];
  const gravarChat = (id, chat) => gravarJson(dir, `${id}.json`, { chat: chat.slice(-200) }, { compacto: true });
  const estados = new Map(); // id -> { estado: 'gerando' | 'pronto' | 'sem-video', inicio, fim }
  let ocupado = null; // um vídeo por vez: a VPS tem 2 vCPU

  const existeSkill = (n) => fs.existsSync(path.join(cfg.vault, '.claude', 'skills', n, 'SKILL.md'));
  const pastaSaida = (id) => path.join(cfg.vault, 'conteudo', 'video', id);
  function prontos(id) {
    let nomes = [];
    try { nomes = fs.readdirSync(pastaSaida(id)).filter((n) => EXT_SAIDA.test(n)); } catch { return []; }
    return nomes
      .map((n) => { const abs = path.join(pastaSaida(id), n); return { caminho: relDe(cfg.vault, abs), mtime: fs.statSync(abs).mtimeMs }; })
      .sort((a, b) => b.mtime - a.mtime || natural.compare(b.caminho, a.caminho)); // empate de data (arquivo copiado): v10 antes de v9
  }

  function estado(id) {
    videos.ler(id); // valida o id e se a sessão existe
    return { estado: 'parado', ...estados.get(id), chat: lerChat(id), videos: prontos(id) };
  }

  // valida na fronteira: só mídia (ou áudio, quando pedido) que está dentro do cérebro
  function midia(rel, audio = false) {
    const abs = typeof rel === 'string' ? resolverNoVault(cfg.vault, rel) : null;
    if (!abs || !(audio ? EXT_AUDIO.test(abs) : tipoMidia(abs)) || !fs.existsSync(abs)) throw invalido(`${audio ? 'áudio' : 'mídia'} ${String(rel).slice(0, 80)}`);
    return relDe(cfg.vault, abs);
  }

  function gerar(id, b = {}) {
    videos.ler(id);
    if (ocupado) throw Object.assign(new Error(ocupado === id ? 'este vídeo já está sendo gerado' : 'outro vídeo está sendo gerado; espere terminar'), { code: 'CONFLITO' });
    const refs = Array.isArray(b.referencias) ? b.referencias : [];
    const audios = Array.isArray(b.audios) ? b.audios : [];
    const modelos = Array.isArray(b.modelos) ? b.modelos : [];
    if (refs.length > MAX_MIDIAS || audios.length > MAX_MIDIAS || modelos.length > MAX_MIDIAS) throw invalido('mídias demais');
    let skills = SKILLS_PADRAO; // o instalador sempre põe essas duas no cérebro
    if (b.habilidades !== undefined) {
      if (!Array.isArray(b.habilidades) || b.habilidades.length > 50 || !b.habilidades.every((n) => typeof n === 'string' && NOME_SKILL.test(n) && existeSkill(n))) throw invalido('habilidade');
      skills = [...new Set(b.habilidades)];
    }
    const limpo = {
      principal: b.principal ? midia(b.principal) : null,
      referencias: refs.map((r) => midia(r)),
      audios: audios.map((a) => {
        if (!a || !Object.hasOwn(TIPOS_AUDIO, a.tipo)) throw invalido('tipo de áudio');
        return { tipo: a.tipo, caminho: midia(a.caminho, true) };
      }),
      modelos: modelos.map((m) => {
        if (!m || (m.extrair !== undefined && !Array.isArray(m.extrair))) throw invalido('modelo base');
        const extrair = [...new Set(m.extrair ?? [])];
        if (!extrair.every((k) => Object.hasOwn(EXTRAIR, k))) throw invalido('o que extrair do modelo');
        return { caminho: midia(m.caminho), extrair };
      }),
      prompts: (Array.isArray(b.prompts) ? b.prompts : []).map((p) => texto(p, 8000)).filter(Boolean).slice(0, 20),
      pedido: texto(b.pedido, 8000),
    };
    if (!limpo.principal && !limpo.referencias.length && !limpo.modelos.length && !limpo.audios.length && !limpo.prompts.length && !limpo.pedido) throw invalido('nada para gerar; ligue um conteúdo, um prompt ou escreva para o Claude');

    const pedido = montarPedido(limpo, (rel) => path.join(cfg.vault, rel));
    fs.mkdirSync(pastaSaida(id), { recursive: true });
    const chat = lerChat(id);
    chat.push({ papel: 'voce', texto: limpo.pedido || 'Gerar vídeo', quando: agora() });
    gravarChat(id, chat);
    const inicio = agora();
    const antes = new Set(prontos(id).map((v) => `${v.caminho}:${v.mtime}`));
    ocupado = id;
    estados.set(id, { estado: 'gerando', inicio });

    rodar({
      motor: 'claude',
      bin: localizar(cfg.bins.claude, cfg.env, cfg.casa) ?? cfg.bins.claude,
      conversa: { id, motor: 'claude' },
      texto: pedido,
      prompt: promptGerador(id, cfg, skills),
      vault: cfg.vault,
      env: cfg.env,
      whatsPara: '',
      registroExiste: registroExiste(id),
      limiteMs: LIMITE_GERAR_MS,
    }).then((r) => {
      const novo = prontos(id).some((v) => !antes.has(`${v.caminho}:${v.mtime}`));
      const c = lerChat(id);
      c.push({ papel: 'claude', texto: texto(r.resposta, 8000) || 'Terminei sem resposta.', quando: agora() });
      gravarChat(id, c);
      estados.set(id, { estado: novo ? 'pronto' : 'sem-video', inicio, fim: agora() });
    }).catch((e) => {
      log('geração de vídeo', id, e);
      estados.set(id, { estado: 'sem-video', inicio, fim: agora() });
    }).finally(() => { ocupado = null; });

    return estado(id);
  }

  return { estado, gerar, ocupado: () => ocupado, skills: () => listarSkills(cfg.vault) };
}

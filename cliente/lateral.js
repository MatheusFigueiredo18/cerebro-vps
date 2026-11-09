// Lateral "Cérebro": a árvore de arquivos com as ações; tema e sair no rodapé. Abre pelo botão Cérebro do dock.
import { $, el, api, icone, botaoIcone, ler, guardar, ouvir, emitir, avisar } from './comum.js';
import { ordenarNos, guiaDeArquivo, ehMidia, midiasIrmas, pastaDe, nomeBase } from './formatos.js';
import * as shell from './shell.js';

const ORDENS = [['nome', 'Nome (A a Z)'], ['nome-desc', 'Nome (Z a A)'], ['recentes', 'Mais recentes']];
export const FUNCOES = [
  { id: 'conversas', nome: 'Conversas', icone: 'conversa', faz: 'Agentes de IA trabalhando no cérebro' },
  { id: 'conteudos', nome: 'Conteúdos', icone: 'conteudos', faz: 'Galeria do que foi gerado e enviado' },
  { id: 'whatsapp', nome: 'WhatsApp', icone: 'whatsapp', faz: 'Conexão, motor e quem pode dar ordens' },
  { id: 'n8n', nome: 'n8n', icone: 'n8n', faz: 'Automações do servidor' },
  { id: 'lousa', nome: 'Quadro', icone: 'lousa', faz: 'Desenho livre, post-its e formas num quadro infinito' },
  { id: 'video', nome: 'Criação de vídeo', icone: 'filme', faz: 'Nós ligados que viram vídeo' },
];

let dados = []; // árvore como veio do servidor
let assinatura = '';
let ordem = ler('lateralOrdem', 'nome');
let abertas = new Set(ler('pastasAbertas', ['conteudo']));
let selecionada = ''; // pasta onde nascem as páginas, pastas e bancos novos
const partes = {};

export const arvore = () => dados;

function todosOsCaminhos(nos = dados, saida = []) {
  for (const n of nos) { if (n.tipo === 'arquivo') saida.push(n.caminho); if (n.filhos) todosOsCaminhos(n.filhos, saida); }
  return saida;
}
export const caminhosDeArquivos = () => todosOsCaminhos();

function acharNo(caminho, nos = dados) {
  for (const n of nos) {
    if (n.caminho === caminho) return n;
    if (n.filhos && caminho.startsWith(`${n.caminho}/`)) { const a = acharNo(caminho, n.filhos); if (a) return a; }
  }
  return null;
}

export function abrirFuncao(id) {
  const f = FUNCOES.find((x) => x.id === id);
  if (!f) return;
  if (id === 'conteudos') {
    // Conteúdos é uma janela flutuante sobre a área de trabalho das conversas (para arrastar arquivos para lá)
    if (!['conversas', 'video', 'lousa'].includes(shell.ativa()?.tipo)) shell.abrir({ id: 'f:conversas', tipo: 'conversas', titulo: 'Conversas' }); // a galeria também flutua sobre a Criação de vídeo e as Lousas
    emitir('conteudos-alternar');
    return;
  }
  shell.abrir({ id: `f:${f.id}`, tipo: f.id, titulo: f.nome });
}

// Abre qualquer caminho do cérebro: mídia no visor (com as irmãs da pasta), página no editor, banco na tabela, o resto em guia de leitura.
export function abrirCaminho(caminho) {
  const no = acharNo(caminho) ?? { caminho, nome: nomeBase(caminho), tipo: 'arquivo' };
  if (no.tipo === 'arquivo' && ehMidia(no.nome)) {
    const lista = midiasIrmas(dados, caminho);
    emitir('visor', { lista: lista.includes(caminho) ? lista : [caminho], inicio: caminho });
    return;
  }
  const g = guiaDeArquivo(no);
  if (g) shell.abrir(g);
}

// ---------- árvore ----------
export async function carregarArvore(forcar = false) {
  try {
    const nova = await api('/api/arvore');
    const a = JSON.stringify(nova);
    if (!forcar && a === assinatura) return;
    assinatura = a;
    dados = nova;
    pintarArvore();
  } catch { /* tenta de novo na próxima volta */ }
}

function pintarArvore() {
  const caixa = partes.arvore;
  const rolagem = caixa.scrollTop;
  caixa.replaceChildren();
  const atual = shell.ativa()?.caminho;
  const desenhar = (nos, nivel, alvo) => {
    for (const n of ordenarNos(nos, ordem)) {
      const pasta = n.tipo === 'pasta';
      const aberta = pasta && abertas.has(n.caminho);
      const tipoIcone = pasta ? (n.banco ? 'banco' : 'pasta') : ehMidia(n.nome) ? (/\.(mp4|mov|webm|m4v)$/i.test(n.nome) ? 'video' : 'imagem') : 'doc';
      const linha = el('button', {
        type: 'button', class: `no${n.caminho === atual ? ' ativo' : ''}${pasta && n.caminho === selecionada ? ' selecionada' : ''}`,
        style: `--nivel:${nivel}`, title: n.caminho, dados: { caminho: n.caminho }, 'aria-expanded': pasta ? String(aberta) : null,
      }, el('span', { class: `no-seta${aberta ? ' aberta' : ''}` }, pasta ? icone('seta') : ''), icone(tipoIcone), el('span', { class: 'no-nome' }, n.nome));
      alvo.append(linha);
      if (aberta && n.filhos?.length) desenhar(n.filhos, nivel + 1, alvo);
    }
  };
  if (!dados.length) caixa.append(el('p', { class: 'vazio' }, 'O cérebro está vazio. Crie a primeira página com o botão acima.'));
  desenhar(dados, 0, caixa);
  caixa.scrollTop = rolagem;
}

function cliqueNaArvore(e) {
  const b = e.target.closest('.no');
  if (!b) return;
  const no = acharNo(b.dataset.caminho);
  if (!no) return;
  if (no.tipo === 'pasta') {
    selecionada = no.caminho;
    const naSeta = e.target.closest('.no-seta');
    if (no.banco && !naSeta) { shell.abrir(guiaDeArquivo(no)); pintarArvore(); return; }
    if (abertas.has(no.caminho)) abertas.delete(no.caminho); else abertas.add(no.caminho);
    guardar('pastasAbertas', [...abertas]);
    pintarArvore();
    return;
  }
  selecionada = pastaDe(no.caminho);
  abrirCaminho(no.caminho);
}

// ---------- criação ----------
function pedirNome(rotulo) {
  return new Promise((resolve) => {
    const caixa = partes.novo;
    const campo = el('input', { class: 'campo', type: 'text', spellcheck: 'false', 'aria-label': rotulo });
    caixa.replaceChildren(el('label', { class: 'rotulo' }, `${rotulo} em ${selecionada || 'raiz do cérebro'}`), campo,
      el('small', { class: 'dica' }, 'Enter cria, Esc cancela'));
    caixa.hidden = false;
    campo.focus();
    let feito = false;
    const fim = (v) => { if (feito) return; feito = true; caixa.hidden = true; caixa.replaceChildren(); resolve(v); };
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') fim(campo.value.trim()); if (e.key === 'Escape') fim(null); });
    campo.addEventListener('blur', () => fim(null));
  });
}

async function criar(rotulo, rota, campo) {
  const nome = await pedirNome(rotulo);
  if (nome === null) return null;
  try {
    const r = await api(rota, { metodo: 'POST', corpo: { pasta: selecionada, [campo]: nome } });
    const p = selecionada.split('/').filter(Boolean);
    p.forEach((_, i) => abertas.add(p.slice(0, i + 1).join('/'))); // abre o caminho até o item novo
    guardar('pastasAbertas', [...abertas]);
    await carregarArvore(true);
    return r;
  } catch (e) { avisar(e.message, 'erro'); return null; }
}

export async function novaPagina() {
  const r = await criar('Nova página', '/api/paginas', 'titulo');
  if (r) shell.abrir(guiaDeArquivo({ caminho: r.caminho, nome: nomeBase(r.caminho), tipo: 'arquivo' }));
}
async function novaPasta() {
  const r = await criar('Nova pasta', '/api/pastas', 'nome');
  if (r) { selecionada = r.caminho; pintarArvore(); }
}
async function novoBanco() {
  const r = await criar('Novo banco de dados', '/api/bancos', 'nome');
  if (r) shell.abrir({ id: `b:${r.caminho}`, tipo: 'banco', titulo: nomeBase(r.caminho), caminho: r.caminho });
}

function menuOrdenar(botao) {
  const antigo = partes.acoes.querySelector('.menu');
  if (antigo) { antigo.remove(); return; }
  const fechar = () => { m.remove(); document.removeEventListener('pointerdown', fora, true); };
  const fora = (e) => { if (!m.contains(e.target) && e.target !== botao) fechar(); };
  const m = el('div', { class: 'menu', role: 'menu' }, ORDENS.map(([id, nome]) => el('button', {
    type: 'button', role: 'menuitemradio', 'aria-checked': String(id === ordem),
    onclick: () => { ordem = id; guardar('lateralOrdem', ordem); fechar(); pintarArvore(); botao.focus(); },
  }, nome)));
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fechar(); botao.focus(); } });
  partes.acoes.append(m);
  document.addEventListener('pointerdown', fora, true);
  m.querySelector('[aria-checked="true"]').focus();
}

export function iniciar({ alternarTema, pintarBotaoTema, sair }) {
  const lado = $('#lateral');
  partes.titulo = el('h2', { class: 'lateral-titulo' }, 'Cérebro');

  partes.acoes = el('div', { class: 'lateral-acoes' },
    botaoIcone('novaPagina', 'Nova página', novaPagina),
    botaoIcone('novaPasta', 'Nova pasta', novaPasta),
    botaoIcone('novoBanco', 'Novo banco de dados', novoBanco),
    botaoIcone('ordenar', 'Ordenar', (e) => menuOrdenar(e.currentTarget)),
    botaoIcone('recolher', 'Recolher tudo', () => { abertas.clear(); guardar('pastasAbertas', []); pintarArvore(); }),
    botaoIcone('recarregar', 'Recarregar a árvore', () => carregarArvore(true)));
  partes.novo = el('div', { class: 'lateral-novo', hidden: true });
  partes.arvore = el('div', { class: 'arvore' });
  partes.arvore.addEventListener('click', cliqueNaArvore);
  const botaoTema = el('button', { type: 'button', class: 'bt-rodape', onclick: () => alternarTema() });
  pintarBotaoTema(botaoTema);
  document.addEventListener('tema-mudou', () => pintarBotaoTema(botaoTema));
  const rodape = el('div', { class: 'lateral-rodape' }, botaoTema, el('button', { type: 'button', class: 'bt-rodape', onclick: sair }, icone('sair'), 'Sair'));
  lado.append(partes.titulo, el('section', { class: 'lateral-secao' }, partes.acoes, partes.novo, partes.arvore), rodape);

  ouvir('nova-pagina', novaPagina);
  ouvir('guia-ativa', (g) => {
    for (const b of partes.arvore.querySelectorAll('.no')) b.classList.toggle('ativo', b.dataset.caminho === g?.caminho);
  });
  ouvir('arvore-mudou', () => carregarArvore(true));
  carregarArvore(true);
  setInterval(() => { if (!document.hidden) carregarArvore(); }, 6000);
}


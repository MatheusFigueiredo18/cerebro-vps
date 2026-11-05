// Função Conteúdos: galeria da pasta conteudo/ com capas, pasta aberta agrupada por subpasta e envio de arquivos.
import { $, el, api, icone, emitir, ouvir } from './comum.js';
import { tituloAmigavel, dataCurta, tamanhoLegivel, rotuloCategoria, agruparPorSubpasta, tipoArquivo, nomeBase } from './formatos.js';
import { urlArquivo } from './markdown.js';
import { TIPO_ARRASTO } from './anexos.js';
import { enviarArquivos, ENVIADOS } from './envio.js';
import * as shell from './shell.js';

// Torna um elemento arrastável: leva o caminho do arquivo para a área de trabalho das conversas.
function arrastavel(no, caminho, dica) {
  no.draggable = true;
  no.title = dica ? `${no.title ? `${no.title} · ` : ''}${dica}` : no.title;
  no.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(TIPO_ARRASTO, JSON.stringify([caminho]));
    e.dataTransfer.setData('text/plain', caminho);
    setTimeout(() => document.body.classList.add('arrastando-arquivo'), 0); // depois que o navegador tira a miniatura do arrasto
  });
  no.addEventListener('dragend', () => document.body.classList.remove('arrastando-arquivo'));
  return no;
}

function capa(item) {
  if (item.capa?.tipo === 'imagem') return el('img', { src: urlArquivo(item.capa.caminho), alt: '', loading: 'lazy' });
  if (item.capa?.tipo === 'video') {
    return el('span', { class: 'capa-video' }, el('img', { src: `/api/capa?caminho=${encodeURIComponent(item.capa.caminho)}`, alt: '', loading: 'lazy', onerror: (e) => e.currentTarget.remove() }), el('span', { class: 'selo-play' }, icone('play')));
  }
  return el('span', { class: 'capa-icone' }, icone(item.pasta ? 'pasta' : 'doc'));
}

function miniatura(caminho) {
  const t = tipoArquivo(caminho);
  if (t === 'imagem') return el('img', { src: urlArquivo(caminho), alt: '', loading: 'lazy' });
  if (t === 'video') return el('span', { class: 'capa-video' }, el('img', { src: `/api/capa?caminho=${encodeURIComponent(caminho)}`, alt: '', loading: 'lazy', onerror: (e) => e.currentTarget.remove() }), el('span', { class: 'selo-play' }, icone('play')));
  const ext = (/\.([^.]+)$/.exec(caminho)?.[1] ?? '').toUpperCase();
  return el('span', { class: 'capa-icone' }, icone('doc'), el('small', {}, ext || 'arquivo'));
}

function montar(corpo) {
  let pasta = null; // pasta aberta (lembrada enquanto a página está carregada)
  let arrastando = 0;
  const titulo = el('h2', {});
  const sub = el('p', { class: 'dica' });
  const trilha = el('nav', { class: 'trilha', 'aria-label': 'Trilha' });
  const voltar = el('button', { type: 'button', class: 'bt pequeno', hidden: true, onclick: () => { pasta = null; carregar(); } }, icone('voltar'), 'Voltar');
  const seletorArquivos = el('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => { enviar([...e.target.files]); e.target.value = ''; } });
  const lista = el('div', { class: 'conteudos-corpo' });
  const camada = el('div', { class: 'camada-envio', hidden: true });
  corpo.classList.add('conteudos');
  corpo.append(el('div', { class: 'conteudos-topo' },
    el('div', {}, trilha, titulo, sub),
    el('div', { class: 'conteudos-acoes' }, voltar, el('button', { type: 'button', class: 'bt primario pequeno', onclick: () => seletorArquivos.click() }, icone('enviar'), 'Enviar arquivos'), seletorArquivos)),
  lista, camada);

  const destino = () => pasta ?? ENVIADOS;

  async function carregar() {
    lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
    voltar.hidden = !pasta;
    try { if (pasta) await pintarPasta(); else await pintarRaiz(); } catch (e) { lista.replaceChildren(el('p', { class: 'vazio' }, e.message)); }
  }

  async function pintarRaiz() {
    const cats = await api('/api/conteudos');
    titulo.textContent = 'Conteúdos';
    sub.textContent = 'Tudo o que foi gerado nas conversas ou enviado por você.';
    trilha.replaceChildren();
    const comItens = cats.filter((c) => c.itens.length);
    if (!comItens.length) {
      lista.replaceChildren(el('div', { class: 'vazio grande' }, el('p', {}, 'Nada foi gerado ainda.'), el('p', { class: 'dica' }, 'Peça um carrossel ou um vídeo numa conversa, ou arraste arquivos para cá.')));
      return;
    }
    lista.replaceChildren(...comItens.map((c) => el('section', { class: 'categoria' },
      el('h3', {}, rotuloCategoria(c.nome), el('small', {}, String(c.itens.length))),
      el('div', { class: 'cartoes' }, c.itens.map((i) => {
        const botao = el('button', {
          type: 'button', class: 'cartao-conteudo',
          onclick: () => { if (i.pasta) { pasta = i.caminho; carregar(); } else emitir('visor', { lista: [i.caminho], inicio: i.caminho }); },
        }, el('span', { class: 'cartao-capa' }, capa(i)), el('b', {}, tituloAmigavel(i.nome, !i.pasta)),
        el('small', {}, [i.pasta ? `${i.arquivos} arquivo${i.arquivos === 1 ? '' : 's'}` : (/\.([^.]+)$/.exec(i.nome)?.[1] ?? '').toUpperCase(), dataCurta(i.nome, i.mtime)].filter(Boolean).join(' · ')));
        // o botão não é arrastável no Firefox: o arrasto fica num envoltório
        return i.pasta ? botao : arrastavel(el('div', { class: 'cartao-arrastavel' }, botao), i.caminho, 'arraste para a área de trabalho');
      })))));
  }

  async function pintarPasta() {
    const arquivos = await api(`/api/pasta?caminho=${encodeURIComponent(pasta)}`);
    const [, categoria, ...resto] = pasta.split('/');
    titulo.textContent = tituloAmigavel(resto.at(-1) ?? categoria, false);
    sub.textContent = `${arquivos.length} arquivo${arquivos.length === 1 ? '' : 's'} · arraste arquivos para cá para enviar a esta pasta`;
    trilha.replaceChildren(el('button', { type: 'button', class: 'link', onclick: () => { pasta = null; carregar(); } }, 'Conteúdos'), ' › ', rotuloCategoria(categoria));
    const grupos = agruparPorSubpasta(arquivos, pasta);
    const todos = grupos.flatMap((g) => g.arquivos.map((a) => a.caminho));
    if (!arquivos.length) { lista.replaceChildren(el('p', { class: 'vazio' }, 'Pasta vazia.')); return; }
    lista.replaceChildren(...grupos.map((g) => el('section', { class: 'categoria' },
      g.grupo ? el('h3', {}, g.grupo) : null,
      el('div', { class: 'miniaturas' }, g.arquivos.map((a) => arrastavel(el('div', { class: 'miniatura' },
        el('button', { type: 'button', class: 'miniatura-abrir', 'aria-label': `Abrir ${a.nome}`, onclick: () => emitir('visor', { lista: todos, inicio: a.caminho }) }, miniatura(a.caminho)),
        el('div', { class: 'miniatura-info' }, el('span', { title: a.nome }, a.nome), el('small', {}, tamanhoLegivel(a.tamanho)),
          el('a', { class: 'bt-icone pequeno', href: urlArquivo(a.caminho, true), download: a.nome, title: 'Baixar', 'aria-label': `Baixar ${a.nome}`, draggable: false }, icone('baixar')))), a.caminho, 'arraste para a área de trabalho'))))));
  }

  // ---------- envio: um arquivo por vez, com aviso de progresso ----------
  async function enviar(arquivos) {
    if (!arquivos.length) return;
    await enviarArquivos(arquivos, destino());
    carregar();
  }

  // a camada não pisca: conta entradas e saídas nos elementos internos
  corpo.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    arrastando += 1;
    camada.textContent = `Solte para enviar a ${pasta ? tituloAmigavel(nomeBase(pasta), false) : 'Enviados'}`;
    camada.hidden = false;
  });
  corpo.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  corpo.addEventListener('dragleave', () => { arrastando = Math.max(0, arrastando - 1); if (!arrastando) camada.hidden = true; });
  corpo.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    arrastando = 0;
    camada.hidden = true;
    enviar([...e.dataTransfer.files]);
  });

  carregar();
  return { mostrar: carregar };
}

// Guias antigas de Conteúdos (salvas no navegador) continuam abrindo.
shell.registrar('conteudos', montar);

// ---------- janela: a galeria flutua no centro (menos da metade da altura) sem esconder a área de trabalho ----------
let janela = null;
let vida = null;
const tecla = (e) => { if (e.key === 'Escape' && $('#visor').hidden) { e.preventDefault(); fecharJanela(); } };

export function fecharJanela() {
  if (!janela) return;
  try { vida?.limpar?.(); } catch { /* a janela já está saindo */ }
  janela.remove();
  janela = null;
  vida = null;
  document.removeEventListener('keydown', tecla);
  emitir('conteudos-janela', { aberta: false });
}

export function abrirJanela() {
  if (janela) return;
  const corpo = el('div', { class: 'conteudos-janela-corpo' });
  janela = el('section', { class: 'conteudos-janela', role: 'dialog', 'aria-label': 'Conteúdos' },
    el('header', { class: 'conteudos-janela-topo' },
      icone('conteudos'), el('b', {}, 'Conteúdos'),
      el('small', {}, 'Arraste um arquivo para a área de trabalho ou para o prompt'),
      el('button', { type: 'button', class: 'bt-icone', title: 'Fechar', 'aria-label': 'Fechar Conteúdos', onclick: fecharJanela }, icone('x'))),
    corpo);
  $('#painel').append(janela);
  vida = montar(corpo);
  document.addEventListener('keydown', tecla);
  emitir('conteudos-janela', { aberta: true });
}

ouvir('conteudos-alternar', () => (janela ? fecharJanela() : abrirJanela()));

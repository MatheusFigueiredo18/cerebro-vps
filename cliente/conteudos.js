// Função Conteúdos: explorador da pasta conteudo/ (pastas dentro de pastas), com capas, envio, nova pasta e mover por arrasto.
import { $, el, api, icone, emitir, ouvir, avisar } from './comum.js';
import { dataCurta, tamanhoLegivel, nomeBase } from './formatos.js';
import { urlArquivo } from './markdown.js';
import { TIPO_ARRASTO } from './anexos.js';
import { enviarArquivos } from './envio.js';
import * as shell from './shell.js';

const RAIZ = 'conteudo';

// Torna um elemento arrastável: leva o caminho do arquivo para a área de trabalho das conversas (ou para uma pasta daqui).
function arrastavel(no, caminho, dica) {
  no.draggable = true;
  no.title = dica ? `${no.title ? `${no.title} · ` : ''}${dica}` : no.title;
  no.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copyMove';
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
  if (item.pasta) return el('span', { class: 'capa-icone' }, icone('pasta'));
  const ext = (/\.([^.]+)$/.exec(item.nome)?.[1] ?? '').toUpperCase();
  return el('span', { class: 'capa-icone' }, icone('doc'), el('small', {}, ext || 'arquivo'));
}

function montar(corpo) {
  let pasta = RAIZ; // pasta aberta (lembrada enquanto a página está carregada)
  let arrastando = 0;
  const titulo = el('h2', {});
  const sub = el('p', { class: 'dica' });
  const trilha = el('nav', { class: 'trilha', 'aria-label': 'Trilha' });
  const voltar = el('button', { type: 'button', class: 'bt pequeno', hidden: true, onclick: () => ir(pasta.split('/').slice(0, -1).join('/')) }, icone('voltar'), 'Voltar');
  const seletorArquivos = el('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => { enviar([...e.target.files]); e.target.value = ''; } });
  const lista = el('div', { class: 'conteudos-corpo' });
  const camada = el('div', { class: 'camada-envio', hidden: true });
  corpo.classList.add('conteudos');
  corpo.append(el('div', { class: 'conteudos-topo' },
    el('div', {}, trilha, titulo, sub),
    el('div', { class: 'conteudos-acoes' }, voltar,
      el('button', { type: 'button', class: 'bt pequeno', onclick: novaPasta }, icone('pasta'), 'Nova pasta'),
      el('button', { type: 'button', class: 'bt primario pequeno', onclick: () => seletorArquivos.click() }, icone('enviar'), 'Enviar arquivos'), seletorArquivos)),
  lista, camada);

  const ir = (destino) => { pasta = destino || RAIZ; carregar(); };

  // Solte aqui um item arrastado de dentro de Conteúdos para movê-lo para esta pasta.
  function alvoDeSoltar(no, destino) {
    no.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes(TIPO_ARRASTO)) return;
      e.preventDefault();
      no.classList.add('alvo-soltar');
    });
    no.addEventListener('dragleave', () => no.classList.remove('alvo-soltar'));
    no.addEventListener('drop', async (e) => {
      no.classList.remove('alvo-soltar');
      if (!e.dataTransfer?.types.includes(TIPO_ARRASTO)) return;
      e.preventDefault();
      e.stopPropagation();
      let origens = [];
      try { origens = JSON.parse(e.dataTransfer.getData(TIPO_ARRASTO)); } catch { /* arrasto sem caminho */ }
      document.body.classList.remove('arrastando-arquivo');
      try {
        for (const de of origens) if (de.startsWith(`${RAIZ}/`) && de !== destino) await api('/api/conteudos/mover', { metodo: 'POST', corpo: { de, para: destino } });
      } catch (erro) { sub.textContent = erro.message; return; }
      emitir('arvore-mudou');
      carregar();
    });
    return no;
  }

  function novaPasta() {
    if (lista.querySelector('.nova-pasta')) { lista.querySelector('.nova-pasta input').focus(); return; }
    const campo = el('input', { type: 'text', placeholder: 'Nome da pasta', 'aria-label': 'Nome da nova pasta', maxlength: 80 });
    const criar = async () => {
      const nome = campo.value.trim();
      if (!nome) { linha.remove(); return; }
      try { await api('/api/pastas', { metodo: 'POST', corpo: { pasta, nome } }); } catch (erro) { sub.textContent = erro.message; return; }
      emitir('arvore-mudou');
      carregar();
    };
    const linha = el('div', { class: 'nova-pasta' }, icone('pasta'), campo,
      el('button', { type: 'button', class: 'bt primario pequeno', onclick: criar }, 'Criar'),
      el('button', { type: 'button', class: 'bt pequeno', onclick: () => linha.remove() }, 'Cancelar'));
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') criar(); else if (e.key === 'Escape') { e.stopPropagation(); linha.remove(); } });
    lista.prepend(linha);
    campo.focus();
  }

  async function acao(rota, corpo) {
    try { await api(rota, { metodo: 'POST', corpo }); } catch (erro) { sub.textContent = erro.message; avisar(erro.message, 'erro'); return false; }
    emitir('arvore-mudou');
    carregar();
    return true;
  }

  // Troca o nome do cartão por um campo: Enter confirma, Esc cancela.
  function renomear(item, titulo) {
    const campo = el('input', { type: 'text', value: item.nome, 'aria-label': `Novo nome de ${item.nome}`, maxlength: 120, class: 'renomear' });
    let feito = false;
    const fechar = () => { if (campo.isConnected) campo.replaceWith(titulo); };
    const confirmar = () => {
      if (feito) return;
      feito = true;
      const nome = campo.value.trim();
      if (!nome || nome === item.nome) fechar(); else acao('/api/conteudos/renomear', { de: item.caminho, nome });
    };
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar(); else if (e.key === 'Escape') { e.stopPropagation(); feito = true; fechar(); } });
    campo.addEventListener('blur', confirmar);
    titulo.replaceWith(campo);
    campo.focus();
    campo.select();
  }

  // Lixeira sempre visível no canto do cartão; abre uma confirmação em cima do próprio cartão.
  // O item vai para a lixeira do cérebro (.trash), não some de vez.
  function lixeiraBt(item, envoltorio) {
    const fechar = () => envoltorio.querySelector('.confirma-apagar')?.remove();
    const bt = el('button', { type: 'button', class: 'cartao-lixo', title: item.pasta ? 'Apagar a pasta (pede confirmação)' : 'Apagar (vai para a lixeira do cérebro)', 'aria-label': `Apagar ${item.nome}` }, icone('lixeira'));
    bt.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!item.pasta) { acao('/api/conteudos/apagar', { de: item.caminho }); return; } // arquivo: apaga direto (vai para a .trash); pasta continua pedindo confirmação
      if (envoltorio.querySelector('.confirma-apagar')) { fechar(); return; }
      const o = item.pasta ? `a pasta e ${item.arquivos} arquivo${item.arquivos === 1 ? '' : 's'} dentro` : 'o arquivo';
      const sim = el('button', { type: 'button', class: 'bt perigo pequeno', onclick: async () => { sim.disabled = true; if (!await acao('/api/conteudos/apagar', { de: item.caminho })) { sim.disabled = false; fechar(); } } }, 'Apagar');
      const caixa = el('div', { class: 'confirma-apagar', role: 'alertdialog', 'aria-label': `Confirmar apagar ${item.nome}` },
        el('p', {}, `Apagar ${o}?`), el('small', {}, 'Vai para a lixeira do cérebro (.trash).'),
        el('div', { class: 'confirma-botoes' }, sim, el('button', { type: 'button', class: 'bt pequeno', onclick: fechar }, 'Cancelar')));
      caixa.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); bt.focus(); } });
      envoltorio.append(caixa);
      sim.focus();
    });
    return bt;
  }

  async function carregar() {
    lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
    voltar.hidden = pasta === RAIZ;
    try { await pintar(); } catch (e) {
      if (pasta !== RAIZ) { pasta = RAIZ; carregar(); return; } // a pasta aberta foi apagada ou movida por fora
      lista.replaceChildren(el('p', { class: 'vazio' }, e.message));
    }
  }

  async function pintar() {
    const { itens } = await api(`/api/conteudos/nivel?caminho=${encodeURIComponent(pasta)}`);
    const partes = pasta.split('/');
    titulo.textContent = partes.length === 1 ? 'Conteúdos' : partes.at(-1);
    const pastas = itens.filter((i) => i.pasta);
    const arquivos = itens.filter((i) => !i.pasta);
    sub.textContent = `${pastas.length} pasta${pastas.length === 1 ? '' : 's'} · ${arquivos.length} arquivo${arquivos.length === 1 ? '' : 's'} · arraste um item para uma pasta para movê-lo`;
    trilha.replaceChildren(...partes.flatMap((p, i) => {
      const destino = partes.slice(0, i + 1).join('/');
      const rotulo = i === 0 ? 'Conteúdos' : p;
      const no = i === partes.length - 1 ? el('span', {}, rotulo) : alvoDeSoltar(el('button', { type: 'button', class: 'link', onclick: () => ir(destino) }, rotulo), destino);
      return i === 0 ? [no] : [' › ', no];
    }));
    if (!itens.length) {
      lista.replaceChildren(el('div', { class: 'vazio grande' }, el('p', {}, 'Pasta vazia.'), el('p', { class: 'dica' }, 'Crie uma pasta ou arraste arquivos para cá.')));
      return;
    }
    const todos = arquivos.map((a) => a.caminho);
    const cartao = (i) => {
      const botao = el('button', {
        type: 'button', class: 'cartao-conteudo', title: i.nome,
        onclick: () => { if (i.pasta) ir(i.caminho); else emitir('visor', { lista: todos, inicio: i.caminho }); },
      }, el('span', { class: 'cartao-capa' }, capa(i)), el('b', {}, i.nome),
      el('small', {}, [i.pasta ? `${i.arquivos} arquivo${i.arquivos === 1 ? '' : 's'}` : tamanhoLegivel(i.tamanho ?? 0), dataCurta(i.nome, i.mtime)].filter(Boolean).join(' · ')));
      const acoes = el('div', { class: 'cartao-acoes' },
        el('button', { type: 'button', class: 'link', onclick: () => renomear(i, botao.querySelector('b')) }, 'Renomear'));
      // o botão não é arrastável no Firefox: o arrasto fica num envoltório
      const envoltorio = arrastavel(el('div', { class: 'cartao-arrastavel' }, botao, acoes), i.caminho, i.pasta ? 'arraste para outra pasta' : 'arraste para uma pasta ou para a área de trabalho');
      envoltorio.append(lixeiraBt(i, envoltorio));
      return i.pasta ? alvoDeSoltar(envoltorio, i.caminho) : envoltorio;
    };
    lista.replaceChildren(el('div', { class: 'cartoes' }, itens.map(cartao)));
  }

  // ---------- envio: um arquivo por vez, com aviso de progresso ----------
  async function enviar(arquivos) {
    if (!arquivos.length) return;
    await enviarArquivos(arquivos, pasta);
    carregar();
  }

  // a camada não pisca: conta entradas e saídas nos elementos internos
  corpo.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files') || e.dataTransfer.types.includes(TIPO_ARRASTO)) return;
    e.preventDefault();
    arrastando += 1;
    camada.textContent = `Solte para enviar a ${pasta === RAIZ ? 'Conteúdos' : nomeBase(pasta)}`;
    camada.hidden = false;
  });
  corpo.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files') && !e.dataTransfer.types.includes(TIPO_ARRASTO)) e.preventDefault(); });
  corpo.addEventListener('dragleave', () => { arrastando = Math.max(0, arrastando - 1); if (!arrastando) camada.hidden = true; });
  corpo.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files.length || e.dataTransfer.types.includes(TIPO_ARRASTO)) return; // arrasto interno não é envio
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
  const saindo = janela;
  saindo.classList.add('saindo'); // desce com animação e só então sai da página; o dock volta junto
  setTimeout(() => saindo.remove(), 220);
  janela = null;
  vida = null;
  document.removeEventListener('keydown', tecla);
  document.body.classList.remove('conteudos-aberto');
  emitir('conteudos-janela', { aberta: false });
}

export function abrirJanela() {
  if (janela) return;
  const corpo = el('div', { class: 'conteudos-janela-corpo' });
  janela = el('section', { class: 'conteudos-janela', role: 'dialog', 'aria-label': 'Conteúdos' },
    el('header', { class: 'conteudos-janela-topo' },
      icone('conteudos'), el('b', {}, 'Conteúdos'),
      el('small', {}, 'Arraste um arquivo para uma pasta, para a área de trabalho ou para o prompt'),
      el('button', { type: 'button', class: 'bt-icone', title: 'Fechar', 'aria-label': 'Fechar Conteúdos', onclick: fecharJanela }, icone('x'))),
    corpo);
  $('#painel').append(janela);
  vida = montar(corpo);
  document.addEventListener('keydown', tecla);
  document.body.classList.add('conteudos-aberto');
  emitir('conteudos-janela', { aberta: true });
}

ouvir('conteudos-alternar', () => (janela ? fecharJanela() : abrirJanela()));
// a janela só acompanha Conversas, Criação de vídeo e Lousas; em qualquer outra guia ela fecha
const COM_JANELA = new Set(['conversas', 'video', 'lousa']);
ouvir('guia-ativa', (g) => { if (janela && !COM_JANELA.has(g?.tipo)) fecharJanela(); });

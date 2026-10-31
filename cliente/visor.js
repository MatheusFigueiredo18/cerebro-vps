// Visor de arquivos (sobreposição com anterior e próximo) e a guia de leitura de arquivos que não são páginas.
import { $, el, icone, botaoIcone, ouvir } from './comum.js';
import { tipoArquivo, nomeBase, pastaDe } from './formatos.js';
import { renderizar, urlArquivo } from './markdown.js';
import * as shell from './shell.js';
import { abrirCaminho, caminhosDeArquivos } from './lateral.js';

// Conteúdo de um arquivo por tipo; texto e Markdown vêm por fetch e entram como texto (o Markdown monta nós, sem HTML cru).
export function conteudoDe(caminho, { autoplay = false } = {}) {
  const tipo = tipoArquivo(caminho);
  const url = urlArquivo(caminho);
  if (tipo === 'imagem') return el('img', { class: 'arquivo-midia', src: url, alt: nomeBase(caminho) });
  if (tipo === 'video') return el('video', { class: 'arquivo-midia', src: url, controls: true, preload: 'metadata', autoplay, playsInline: true });
  const caixa = el('div', { class: 'arquivo-texto' }, el('p', { class: 'vazio' }, 'Carregando…'));
  (async () => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error();
      const texto = await r.text();
      caixa.replaceChildren(tipo === 'markdown'
        ? renderizar(texto, { pasta: pastaDe(caminho), arquivos: caminhosDeArquivos(), abrir: abrirCaminho })
        : el('pre', { class: 'pre' }, texto));
    } catch { caixa.replaceChildren(el('p', { class: 'vazio' }, 'Não consegui ler este arquivo.')); }
  })();
  return caixa;
}

const semPrevia = (caminho) => el('div', { class: 'sem-previa' }, icone('doc'), el('p', {}, 'Este tipo de arquivo não tem prévia.'),
  el('a', { class: 'bt', href: urlArquivo(caminho, true), download: nomeBase(caminho) }, icone('baixar'), 'Baixar'));

// ---------- visor ----------
let lista = [];
let pos = 0;
let foco = null;

function pintar() {
  const v = $('#visor');
  const caminho = lista[pos];
  const varios = lista.length > 1;
  const conteudo = tipoArquivo(caminho) === 'outro' ? semPrevia(caminho) : conteudoDe(caminho, { autoplay: true });
  v.replaceChildren(
    el('div', { class: 'visor-topo' },
      el('div', { class: 'visor-nome' }, el('b', {}, nomeBase(caminho)), el('small', {}, varios ? `${pos + 1} de ${lista.length}` : pastaDe(caminho) || 'raiz do cérebro')),
      el('a', { class: 'bt-icone', href: urlArquivo(caminho, true), download: nomeBase(caminho), title: 'Baixar', 'aria-label': 'Baixar' }, icone('baixar')),
      botaoIcone('x', 'Fechar o visor', fechar)),
    el('div', { class: 'visor-palco', onclick: (e) => { if (e.target.classList.contains('visor-palco')) fechar(); } }, conteudo),
    varios ? botaoIcone('voltar', 'Anterior', () => andar(-1), 'visor-seta esquerda') : null,
    varios ? botaoIcone('avancar', 'Próximo', () => andar(1), 'visor-seta direita') : null,
  );
}

function andar(d) { pos = (pos + d + lista.length) % lista.length; pintar(); }

export function abrirVisor(caminhos, inicio) {
  if (!caminhos.length) return;
  lista = caminhos;
  pos = Math.max(0, caminhos.indexOf(inicio));
  foco = document.activeElement;
  $('#visor').hidden = false;
  pintar();
  $('#visor .bt-icone[aria-label="Fechar o visor"]').focus();
}

export function fechar() {
  const v = $('#visor');
  if (v.hidden) return false;
  v.replaceChildren(); // limpar faz o vídeo parar
  v.hidden = true;
  foco?.focus?.();
  return true;
}
export const visorAberto = () => !$('#visor').hidden;

ouvir('visor', ({ lista: l, inicio }) => abrirVisor(l, inicio));
document.addEventListener('keydown', (e) => {
  if ($('#visor').hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
  const t = e.target;
  if (t.closest?.('input, textarea, [contenteditable], .xterm')) return;
  if (e.key === 'ArrowLeft' && lista.length > 1) { e.preventDefault(); andar(-1); }
  if (e.key === 'ArrowRight' && lista.length > 1) { e.preventDefault(); andar(1); }
});

// ---------- guia de leitura ----------
shell.registrar('arquivo', (corpo, guia) => {
  const c = guia.caminho;
  corpo.append(el('div', { class: 'leitura' },
    el('div', { class: 'leitura-topo' }, el('span', {}, c),
      el('a', { class: 'bt', href: urlArquivo(c, true), download: nomeBase(c) }, icone('baixar'), 'Baixar')),
    tipoArquivo(c) === 'outro' ? semPrevia(c) : conteudoDe(c)));
});

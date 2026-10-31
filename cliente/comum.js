// Utilidades do navegador usadas por todas as telas: elementos, ícones, preferências locais, API e avisos.

export const $ = (s, r = document) => r.querySelector(s);

// el('button', { class: 'x', title: 'Dica', onclick }, 'texto', outroNo): filhos de texto entram como texto, nunca como HTML
export function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'dados') Object.assign(e.dataset, v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) e.append(f);
  return e;
}

// Preferências no navegador: se o armazenamento falhar, a interface segue com os padrões.
export function ler(chave, padrao) {
  try { const v = localStorage.getItem(chave); return v === null ? padrao : JSON.parse(v) ?? padrao; } catch { return padrao; }
}
export function guardar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
}

export const eventos = new EventTarget();
export const emitir = (nome, detail) => eventos.dispatchEvent(new CustomEvent(nome, { detail }));
export const ouvir = (nome, fn) => { const f = (e) => fn(e.detail); eventos.addEventListener(nome, f); return () => eventos.removeEventListener(nome, f); };

// Chamada à API. 401 em qualquer momento volta para o login; erro vira exceção com a mensagem do servidor.
export async function api(rota, { metodo = 'GET', corpo, cru } = {}) {
  const opcoes = { method: metodo, headers: {} };
  if (cru !== undefined) { opcoes.body = cru; opcoes.headers['Content-Type'] = 'application/octet-stream'; }
  else if (corpo !== undefined) { opcoes.body = JSON.stringify(corpo); opcoes.headers['Content-Type'] = 'application/json'; }
  let r;
  try { r = await fetch(rota, opcoes); } catch { throw Object.assign(new Error('Sem conexão com o servidor.'), { status: 0 }); }
  const dados = await r.json().catch(() => null);
  if (r.status === 401 && !rota.startsWith('/api/login')) emitir('sessao-expirou');
  if (!r.ok) throw Object.assign(new Error(dados?.erro ?? `Algo deu errado (${r.status}).`), { status: r.status, dados });
  return dados;
}

// ---------- ícones (desenhos fixos, nenhum dado do cérebro passa por aqui) ----------
import { P } from './icones.js'; // gerado por scripts/gerar-icones.mjs

export function icone(nome, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `i ${cls}`.trim());
  svg.innerHTML = P[nome] ?? P.doc; // só desenhos fixos desta tabela
  return svg;
}

// Botão só de ícone sempre leva rótulo para leitor de tela e dica ao passar o mouse.
export const botaoIcone = (nome, rotulo, onclick, cls = '') => el('button', { type: 'button', class: `bt-icone ${cls}`.trim(), title: rotulo, 'aria-label': rotulo, onclick }, icone(nome));

// Selo com a inicial, no lugar de logotipos (que não fazem parte deste pacote).
export const selo = (nome, cls = '') => el('span', { class: `selo-letra ${cls}`.trim(), 'aria-hidden': 'true' }, String(nome ?? '?').trim().charAt(0).toUpperCase());

// Aviso flutuante curto.
let timerAviso;
export function avisar(msg, tipo = '') {
  const caixa = $('#aviso');
  caixa.textContent = msg;
  caixa.className = `aviso ${tipo}`.trim();
  caixa.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { caixa.hidden = true; }, 3800);
}

export const hora = (ms) => (ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

// Botão de duas etapas no lugar de confirm(): o primeiro clique pede confirmação no próprio botão.
export function botaoConfirmar(texto, textoConfirmar, acao, cls = 'bt') {
  let armado = false;
  let timer;
  const b = el('button', { type: 'button', class: cls }, texto);
  b.addEventListener('click', () => {
    if (!armado) {
      armado = true;
      b.textContent = textoConfirmar;
      b.classList.add('perigo');
      timer = setTimeout(() => { armado = false; b.textContent = texto; b.classList.remove('perigo'); }, 4000);
      return;
    }
    clearTimeout(timer);
    acao();
  });
  return b;
}

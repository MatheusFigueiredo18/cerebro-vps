// Entrada da interface: login, tema e montagem do painel.
import { $, api, ler, guardar, ouvir, icone } from './comum.js';
import * as shell from './shell.js';
import * as lateral from './lateral.js';
import './grafo.js';
import './editor.js';
import './banco.js';
import './visor.js';
import './conversas.js';
import './conteudos.js';
import './whatsapp.js';
import './n8n.js';

// ---------- tema: começa pelo sistema; a escolha manual fica no navegador ----------
const temaAtual = () => document.documentElement.dataset.tema
  ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro');

export function pintarBotaoTema(b) {
  const proximo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  b.replaceChildren(icone(proximo === 'claro' ? 'sol' : 'lua'), document.createTextNode(proximo === 'claro' ? 'Tema claro' : 'Tema escuro'));
  b.title = `Mudar para o tema ${proximo}`;
}
export function alternarTema() {
  const novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  document.documentElement.dataset.tema = novo;
  guardar('tema', novo);
  document.dispatchEvent(new CustomEvent('tema-mudou'));
}
export async function sair() {
  try { await api('/api/logout', { metodo: 'POST' }); } catch { /* recarrega de qualquer jeito */ }
  location.reload();
}

// ---------- login ----------
function mostrarLogin() {
  $('#painel').hidden = true;
  $('#login').hidden = false;
  $('#login-senha').focus();
}

let montado = false;
function entrarNoPainel() {
  $('#login').hidden = true;
  $('#painel').hidden = false;
  if (montado) return;
  montado = true;
  document.body.classList.toggle('sem-lateral', ler('lateralFechada', false));
  $('#lateral-alternar').addEventListener('click', () => {
    const fechada = document.body.classList.toggle('sem-lateral');
    guardar('lateralFechada', fechada);
    window.dispatchEvent(new Event('resize'));
  });
  lateral.iniciar({ alternarTema, pintarBotaoTema, sair });
  shell.iniciar();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const campo = $('#login-senha');
  const erro = $('#login-erro');
  erro.hidden = true;
  try {
    await api('/api/login', { metodo: 'POST', corpo: { senha: campo.value } });
    campo.value = '';
    entrarNoPainel();
  } catch (x) {
    erro.textContent = x.message;
    erro.hidden = false;
    campo.select();
  }
});

// sem recarregar: o que estava aberto (inclusive texto ainda não salvo) continua lá depois do novo login
ouvir('sessao-expirou', () => { if ($('#login').hidden) mostrarLogin(); });

try {
  const { logado } = await api('/api/eu');
  if (logado) entrarNoPainel(); else mostrarLogin();
} catch { mostrarLogin(); }

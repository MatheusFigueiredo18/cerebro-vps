// Entrada da interface: login, tema e montagem do painel.
import { $, api, ler, guardar, ouvir, emitir, icone } from './comum.js';
import * as shell from './shell.js';
import * as lateral from './lateral.js';
import * as dock from './dock.js';
import './grafo.js';
import './editor.js';
import './banco.js';
import './visor.js';
import './conversas.js';
import './conteudos.js';
import './whatsapp.js';
import './n8n.js';
import './video.js';
import './previa.js';
import './lousa.js';
import './acessos.js';
import { perfil, definirPerfil, nivel, secaoDe } from './perfil.js';

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
  ($('#login-usuario').value ? $('#login-senha') : $('#login-usuario')).focus();
}

let montado = false;
function entrarNoPainel(eu) {
  $('#login').hidden = true;
  $('#painel').hidden = false;
  if (montado) return;
  montado = true;
  definirPerfil(eu);
  // No celular a lateral começa fechada e fica por cima do conteúdo (ver o CSS); no computador, aberta.
  const estreita = () => window.matchMedia('(max-width: 720px)').matches;
  document.body.classList.toggle('sem-lateral', ler('lateralFechada', estreita()));
  ouvir('lateral-alternar', () => {
    const fechada = document.body.classList.toggle('sem-lateral');
    guardar('lateralFechada', fechada);
    window.dispatchEvent(new Event('resize'));
    emitir('lateral-mudou');
  });
  // Escolheu uma guia no celular: a lateral se recolhe para não cobrir a página (sem gravar essa escolha).
  ouvir('guia-ativa', () => {
    if (estreita() && !document.body.classList.contains('sem-lateral')) {
      document.body.classList.add('sem-lateral');
      window.dispatchEvent(new Event('resize'));
      emitir('lateral-mudou');
    }
  });
  // sem a seção Arquivos a lateral nem monta (ela lê a árvore do cérebro a cada 6 s)
  if (nivel('arquivos')) lateral.iniciar({ alternarTema, pintarBotaoTema, sair });
  else document.body.classList.add('sem-lateral');
  shell.iniciar();
  dock.iniciar();
  // a guia salva no navegador pode ser de uma seção que esta pessoa não tem: abre a primeira que ela tem
  if (!nivel(secaoDe(shell.ativa()?.tipo))) {
    if (nivel('grafo')) shell.ir('grafo');
    else {
      const f = lateral.FUNCOES.find((x) => x.id !== 'conteudos' && nivel(secaoDe(x.id)));
      shell.abrir(f ? { id: `f:${f.id}`, tipo: f.id, titulo: f.nome } : { id: 'perfil', tipo: 'perfil', titulo: 'Perfil' });
    }
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const campo = $('#login-senha');
  const erro = $('#login-erro');
  erro.hidden = true;
  try {
    await api('/api/login', { metodo: 'POST', corpo: { usuario: $('#login-usuario').value, senha: campo.value } });
    campo.value = '';
    const eu = await api('/api/eu');
    if (montado && eu.usuario !== perfil()?.usuario) { location.reload(); return; } // outra pessoa entrou: monta tudo de novo com as permissões dela
    entrarNoPainel(eu);
  } catch (x) {
    erro.textContent = x.message;
    erro.hidden = false;
    campo.select();
  }
});

// sem recarregar: o que estava aberto (inclusive texto ainda não salvo) continua lá depois do novo login
ouvir('sessao-expirou', () => { if ($('#login').hidden) mostrarLogin(); });

try {
  const eu = await api('/api/eu');
  if (eu.logado) entrarNoPainel(eu); else mostrarLogin();
} catch { mostrarLogin(); }

// Função n8n: abre o endereço configurado (N8N_PUBLIC_URL) e oferece pedir a conexão do n8n ao agente.
import { el, api, icone } from './comum.js';
import * as shell from './shell.js';
import { pedirNaConversa } from './conversas.js';

const PEDIDO = 'Conecte o n8n deste servidor ao Claude Code como servidor MCP, usando a URL interna e uma chave de API do n8n. Se a instalação pedir chave, senha ou login, me peça aqui na conversa e grave só no arquivo de ambiente do servidor (/opt/core-os/.env), nunca no cérebro. No fim, teste se funcionou e me diga numa frase o que ganhei com isso.';

function montar(corpo) {
  const raiz = el('div', { class: 'config' });
  corpo.append(raiz);
  async function carregar() {
    let url = '';
    try { url = (await api('/api/config')).n8n?.url ?? ''; } catch (e) { raiz.replaceChildren(el('p', { class: 'vazio' }, e.message)); return; }
    raiz.replaceChildren(
      el('header', { class: 'config-topo' }, el('h1', {}, 'n8n'), el('p', { class: 'dica' }, 'O n8n roda as automações do servidor, inclusive a ponte do WhatsApp. Ele se conecta ao agente por MCP, e aí o agente consegue criar e rodar fluxos para você.')),
      el('section', { class: 'config-secao' },
        url
          ? el('div', { class: 'linha-botoes' }, el('a', { class: 'bt primario', href: url, target: '_blank', rel: 'noopener noreferrer' }, icone('n8n'), 'Abrir o n8n'), el('code', {}, url))
          : el('p', { class: 'alerta' }, 'O endereço do n8n não está configurado. Defina N8N_PUBLIC_URL no .env do servidor e reinicie o painel.'),
        el('p', { class: 'dica' }, 'O n8n abre numa aba nova do navegador.'),
        el('button', { type: 'button', class: 'bt', onclick: () => pedirNaConversa(PEDIDO) }, icone('conversa'), 'Pedir a conexão do n8n numa conversa')));
  }
  carregar();
  return { mostrar: carregar };
}

shell.registrar('n8n', montar);

// Função WhatsApp: motor de IA, estado da conexão com QR, quem pode dar ordens, extras e MCP, endereço do painel.
import { el, api, icone, logo, avisar, botaoConfirmar } from './comum.js';
import { formatarTelefone, numeroValido } from './formatos.js';
import * as shell from './shell.js';
import { pedirNaConversa } from './conversas.js';

const CONSULTA_MS = 3000;
const ESTADOS = { open: ['conectado', 'pronto'], connecting: ['conectando', 'trabalhando'], close: ['desconectado', 'pausado'], indisponivel: ['indisponível', 'pausado'] };
const PEDIDO_DOMINIO = 'Quero acessar este painel por um domínio próprio com HTTPS. Me pergunte qual subdomínio usar, me diga qual registro DNS criar apontando para este servidor, espere eu confirmar e então configure o Caddy com certificado automático e teste o endereço.';

function montar(corpo) {
  let cfg = null;
  let motores = null;
  let extras = null;
  let qr = null; // código na tela
  let alertaQr = '';
  let visivel = true;
  const raiz = el('div', { class: 'config' }, el('p', { class: 'vazio' }, 'Carregando…'));
  corpo.append(raiz);

  async function carregar() {
    try {
      [cfg, motores, extras] = await Promise.all([api('/api/config'), api('/api/config/motores'), api('/api/extras')]);
      pintar();
    } catch (e) {
      console.error('WhatsApp: não consegui montar a tela', e);
      if (!raiz.querySelector('.config-topo')) raiz.replaceChildren(el('p', { class: 'vazio' }, `Não consegui montar esta tela: ${e.message}`));
    }
  }

  const secao = (titulo, ...filhos) => el('section', { class: 'config-secao' }, el('h2', {}, titulo), ...filhos);

  function pintar() {
    const campoNumero = raiz.querySelector('#numero-novo');
    const digitado = campoNumero?.value ?? '';
    raiz.replaceChildren(
      el('header', { class: 'config-topo' }, el('h1', {}, 'WhatsApp e ajustes'), el('p', { class: 'dica' }, 'Mensagens do WhatsApp chegam ao n8n, que repassa ao painel; o motor escolhido responde pelo mesmo número.')),
      secaoMotor(), secaoWhats(), secaoAcesso(digitado), secaoExtras('Aplicações extras', extras.aplicacoes), secaoExtras('Conexões (MCP)', extras.mcps), secaoEndereco());
  }

  // ---------- motor ----------
  function escolha(rotulo, campo) {
    return el('div', { class: 'escolha' }, el('p', { class: 'rotulo' }, rotulo), el('div', { class: 'escolha-opcoes', role: 'radiogroup', 'aria-label': rotulo },
      Object.entries(motores.motores).map(([id, m]) => el('button', {
        type: 'button', role: 'radio', 'aria-checked': String(motores[campo] === id), class: `opcao${motores[campo] === id ? ' ligada' : ''}`,
        onclick: async () => {
          try { Object.assign(motores, await api('/api/config/motores', { metodo: 'POST', corpo: { [campo]: id } })); pintar(); } catch (e) { avisar(e.message, 'erro'); }
        },
      }, logo(id, m.nome, 'motor'), m.nome, m.instalado ? null : el('small', {}, 'não instalado')))));
  }
  const secaoMotor = () => secao('Motor de IA',
    escolha('Conversas novas do painel', 'padrao'),
    escolha('Respostas no WhatsApp', 'whatsapp'),
    el('p', { class: 'dica' }, 'A escolha vale para as conversas que começarem depois: as que já existem continuam no motor delas. No WhatsApp, trocar o motor faz a próxima mensagem abrir uma conversa nova.'),
    el('ul', { class: 'dicas-login' }, Object.values(motores.motores).map((m) => el('li', {}, el('b', {}, `${m.nome}: `), m.login))));

  // ---------- conexão ----------
  async function conectar(novo = false) {
    alertaQr = '';
    try {
      const r = await api('/api/config/whatsapp/conectar', { metodo: 'POST', corpo: { novo } });
      if (r.estado === 'open') { qr = null; await carregar(); return; }
      qr = r.qr;
      if (!qr) alertaQr = 'A Evolution não mandou o código. Tente de novo em instantes.';
      cfg.whatsapp.estado = r.estado;
      pintar();
    } catch (e) { qr = null; alertaQr = e.message; pintar(); }
  }

  function secaoWhats() {
    const w = cfg.whatsapp;
    const [rotulo, cor] = ESTADOS[w.estado] ?? ESTADOS.indisponivel;
    const filhos = [
      el('div', { class: 'whats-estado' }, logo('whatsapp', 'WhatsApp', 'grande'), el('span', { class: `selo ${cor}` }, rotulo),
        w.estado === 'open' && w.numero ? el('b', {}, formatarTelefone(w.numero)) : null, w.nomePerfil && w.estado === 'open' ? el('span', { class: 'dica' }, w.nomePerfil) : null),
      el('p', { class: 'dica' }, `Fluxo: WhatsApp → n8n → painel → ${motores.motores[motores.whatsapp]?.nome ?? 'motor'} → resposta no WhatsApp.`),
    ];
    if (w.erro) filhos.push(el('p', { class: 'alerta' }, w.erro));
    if (!w.configurado) filhos.push(el('p', { class: 'alerta' }, 'A Evolution API não está configurada neste servidor (EVO_URL e EVO_KEY no .env).'));
    if (alertaQr) filhos.push(el('p', { class: 'alerta', role: 'alert' }, alertaQr));
    if (qr) {
      filhos.push(el('div', { class: 'qr' }, el('img', { class: 'qr-img', src: qr, alt: 'Código QR para conectar o WhatsApp' }),
        el('ol', { class: 'qr-passos' }, el('li', {}, 'Abra o WhatsApp no celular.'), el('li', {}, 'Toque em Aparelhos conectados e depois em Conectar um aparelho.'), el('li', {}, 'Aponte a câmera para este código. Ele se renova sozinho.'))),
      el('button', { type: 'button', class: 'bt', onclick: () => conectar(true) }, icone('recarregar'), 'Gerar outro código'));
    } else if (w.estado === 'open') {
      filhos.push(botaoConfirmar('Desconectar', 'Desconectar mesmo?', async () => {
        try { await api('/api/config/whatsapp/desconectar', { metodo: 'POST' }); } catch (e) { avisar(e.message, 'erro'); }
        carregar();
      }));
    } else {
      filhos.push(el('div', { class: 'linha-botoes' },
        el('button', { type: 'button', class: 'bt primario', disabled: !w.configurado, onclick: () => conectar(false) }, icone('whatsapp'), 'Conectar'),
        w.estado === 'connecting' ? el('button', { type: 'button', class: 'bt', disabled: !w.configurado, onclick: () => conectar(true) }, 'Zerar e gerar outro código') : null));
    }
    return secao('WhatsApp', ...filhos);
  }

  // ---------- quem pode dar ordens ----------
  async function gravarAcesso(numeros, chatVoce) {
    try { cfg.whatsapp.acesso = await api('/api/config/whatsapp/acesso', { metodo: 'POST', corpo: { numeros, chatVoce } }); } catch (e) { avisar(e.message, 'erro'); }
    pintar();
  }

  function secaoAcesso(digitado) {
    const a = cfg.whatsapp.acesso;
    const campo = el('input', { id: 'numero-novo', class: 'campo', type: 'tel', inputmode: 'tel', placeholder: '(62) 99999-0000', 'aria-label': 'Número para autorizar', autocomplete: 'off' });
    campo.value = digitado;
    const autorizar = () => {
      const n = numeroValido(campo.value);
      if (!n) { campo.classList.add('invalido'); campo.setAttribute('aria-invalid', 'true'); campo.focus(); return; }
      campo.value = '';
      gravarAcesso([...a.numeros, n], a.chatVoce);
    };
    campo.addEventListener('input', () => { campo.classList.remove('invalido'); campo.removeAttribute('aria-invalid'); });
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); autorizar(); } });
    const voce = el('input', { type: 'checkbox', id: 'chat-voce', checked: a.chatVoce !== false });
    voce.addEventListener('change', () => gravarAcesso(a.numeros, voce.checked));
    return secao('Quem pode dar ordens',
      el('label', { class: 'marcavel', for: 'chat-voce' }, voce, 'Aceitar ordens no chat "Você" do número conectado'),
      a.numeros.length
        ? el('ul', { class: 'numeros' }, a.numeros.map((n) => el('li', {}, el('span', {}, formatarTelefone(n)),
          el('button', { type: 'button', class: 'bt pequeno', 'aria-label': `Tirar ${formatarTelefone(n)}`, onclick: () => gravarAcesso(a.numeros.filter((x) => x !== n), a.chatVoce) }, 'Tirar'))))
        : el('p', { class: 'dica' }, 'Nenhum número autorizado ainda.'),
      el('div', { class: 'linha-botoes' }, campo, el('button', { type: 'button', class: 'bt', onclick: autorizar }, 'Autorizar')),
      el('p', { class: 'dica' }, 'Caso comum: conecte aqui o número da empresa e autorize o seu número pessoal. Assim você manda ordens do seu celular e o cérebro responde pelo número da empresa.'));
  }

  // ---------- extras ----------
  const pedir = (pedido) => { pedirNaConversa(pedido); };
  const secaoExtras = (titulo, itens) => secao(titulo,
    el('ul', { class: 'extras' }, itens.map((x) => el('li', {}, logo(x.logo ?? x.id, x.nome, 'grande'), el('span', { class: 'extra-texto' }, el('b', {}, x.nome), el('small', {}, x.faz)),
      x.instalado ? el('span', { class: 'selo pronto' }, 'instalado') : el('button', { type: 'button', class: 'bt pequeno', onclick: () => pedir(x.pedido) }, 'Pedir na conversa')))),
    el('p', { class: 'dica' }, 'O pedido já vem escrito na conversa: é só conferir e apertar Enter. Chaves e logins são pedidos ali mesmo e guardados no servidor, fora do cérebro.'));

  const secaoEndereco = () => secao('Endereço',
    el('p', {}, 'Este painel está em ', el('code', {}, cfg.servidor.painel), '.'),
    el('p', { class: 'dica' }, 'Dá para usar um domínio próprio com HTTPS (por exemplo cerebro.suaempresa.com.br). O agente conduz a configuração do subdomínio e do certificado.'),
    el('button', { type: 'button', class: 'bt', onclick: () => pedir(PEDIDO_DOMINIO) }, 'Configurar um domínio próprio'));

  // ---------- consulta periódica ----------
  async function rodada() {
    if (!visivel || document.hidden || !cfg) return;
    if (qr) {
      try {
        const r = await api('/api/config/whatsapp/qr');
        if (r.estado === 'connecting') { if (r.qr && r.qr !== qr) { qr = r.qr; const img = raiz.querySelector('.qr-img'); if (img) img.src = qr; } return; }
        qr = null;
        if (r.estado === 'close') alertaQr = 'O código expirou. Peça um código novo para conectar.';
        await carregar();
      } catch (e) { alertaQr = e.message; qr = null; pintar(); }
      return;
    }
    const ativo = document.activeElement;
    const digitando = raiz.contains(ativo) && ativo.matches('input, select, textarea');
    if (digitando || raiz.querySelector('#numero-novo')?.value) return; // não apaga o que a pessoa digita
    carregar();
  }
  const relogio = setInterval(rodada, CONSULTA_MS);
  carregar();
  return {
    mostrar: () => { visivel = true; carregar(); },
    esconder: () => { visivel = false; },
    limpar: () => clearInterval(relogio),
  };
}

shell.registrar('whatsapp', montar);

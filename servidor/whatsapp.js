// WhatsApp: normalização de número, quem pode dar ordens e a fila que roda o motor sem tela.
import { lerJson, gravarJson, existeJson } from './dados.js';
import { motorDe, localizar, rodarSemTela, promptPainel, PROMPT_WHATS, lerPreferencias } from './motores.js';

const SEIS_HORAS_MS = 6 * 3600_000;
const CACHE_NUMERO_MS = 10 * 60_000;
const MAX_RESPOSTA = 3500;
// a resposta no chat "Você" começa com U+2063 e o n8n a descarta; sem isso ela voltaria como ordem
const MARCA_INVISIVEL = '⁣';
const COMANDO_NOVA = /^\s*\/(nova|novo|clear|limpar)(?=\s|$)/i;

// Chave de comparação: sem sufixo de dispositivo, só dígitos, com país, sem o nono dígito.
export function chaveNumero(valor) {
  let d = String(valor ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') d = d.slice(0, 4) + d.slice(5);
  return d;
}

export function normalizarAcesso(numeros, chatVoce) {
  const lista = [];
  for (const n of Array.isArray(numeros) ? numeros : []) {
    let d = String(n ?? '').replace(/\D/g, '');
    if (d.length < 10 || d.length > 13) continue;
    if (d.length <= 11) d = `55${d}`;
    if (!lista.includes(d)) lista.push(d);
  }
  return { numeros: lista.slice(0, 20), chatVoce: chatVoce !== false };
}

export function lerAcesso(cfg) {
  if (!existeJson(cfg.dados, 'whatsapp-acesso.json')) return normalizarAcesso(cfg.whatsDono ? [cfg.whatsDono] : [], true);
  const a = lerJson(cfg.dados, 'whatsapp-acesso.json', {});
  return normalizarAcesso(a?.numeros, a?.chatVoce);
}

export function gravarAcesso(cfg, pedido) {
  const acesso = normalizarAcesso(pedido?.numeros, pedido?.chatVoce);
  gravarJson(cfg.dados, 'whatsapp-acesso.json', acesso);
  return acesso;
}

// Destino da resposta, ou null se a mensagem não é ordem.
export function autorizar({ deMim, chat, eu } = {}, acesso) {
  if (chat === undefined || chat === null || chat === '') return acesso.chatVoce ? { destino: '' } : null; // fluxo antigo, só o chat "Você"
  const chave = chaveNumero(chat);
  if (!chave) return null;
  const destino = { destino: String(chat).split('@')[0] };
  if (deMim === true || deMim === 'true') return acesso.chatVoce && chave === chaveNumero(eu) ? destino : null;
  return acesso.numeros.some((n) => chaveNumero(n) === chave) ? destino : null;
}

export function criarWhatsApp({ cfg, evo, conversas, agora = Date.now, log = () => {} }) {
  let cacheNumero = null;
  const fila = [];
  let rodando = false;

  async function meuNumero() {
    if (cacheNumero && cacheNumero.ate > agora()) return cacheNumero.valor;
    const d = await evo.dados();
    cacheNumero = { valor: d?.numero ?? '', ate: agora() + CACHE_NUMERO_MS };
    return cacheNumero.valor;
  }

  async function responder(destino, texto) {
    const meu = evo.configurado ? await meuNumero().catch(() => '') : '';
    const numero = destino || meu;
    if (!evo.configurado || !numero) { log('WhatsApp sem envio, resposta seria:', texto); return; }
    const final = meu && chaveNumero(numero) === chaveNumero(meu) ? MARCA_INVISIVEL + texto : texto;
    try { await evo.enviarTexto(numero, final); } catch (e) { log('falha ao enviar no WhatsApp:', e.message); }
  }

  function gravarMapa(chave, valor) {
    const mapa = lerJson(cfg.dados, 'whatsapp.json', {});
    const limpo = mapa && typeof mapa === 'object' && !Array.isArray(mapa) ? mapa : {};
    delete limpo.conversa; // formato antigo
    delete limpo.ultima;
    limpo[chave] = valor;
    gravarJson(cfg.dados, 'whatsapp.json', limpo);
  }

  function escolherConversa(chave, destino, nova) {
    const atual = lerJson(cfg.dados, 'whatsapp.json', {})?.[chave];
    const c = atual && conversas.porId(atual.conversa);
    const motor = lerPreferencias(cfg.dados).whatsapp;
    const reaproveita = c && !c.arquivada && !nova && agora() - (Number(atual.ultima) || 0) <= SEIS_HORAS_MS
      && !conversas.temTerminal(c.id) && motorDe(c.motor) === motor;
    if (reaproveita) return c;
    const criada = conversas.criar({ origem: 'whatsapp', motor, whatsDe: destino });
    gravarMapa(chave, { conversa: criada.id, ultima: agora() });
    return criada;
  }

  async function processar({ texto, tipo, destino }) {
    if (tipo !== 'texto') { await responder(destino, 'Por enquanto eu só leio mensagens de texto. Pode escrever o que precisa?'); return; }
    let pedido = String(texto ?? '');
    const comando = COMANDO_NOVA.exec(pedido);
    if (comando) pedido = pedido.slice(comando[0].length);
    pedido = pedido.trim();
    const chave = destino ? chaveNumero(destino) : 'dono';
    const c = escolherConversa(chave, destino, Boolean(comando));
    if (!pedido) { await responder(destino, 'Pronto, abri uma conversa nova. Pode mandar o pedido.'); return; }

    const motor = motorDe(c.motor);
    c.processando = true;
    c.ultimaAtividade = agora();
    conversas.salvar();
    let resposta = '';
    try {
      const r = await rodarSemTela({
        motor,
        bin: localizar(cfg.bins[motor], cfg.env, cfg.casa) ?? cfg.bins[motor],
        conversa: c,
        texto: pedido,
        prompt: `${promptPainel(c.id)} ${PROMPT_WHATS}`,
        vault: cfg.vault,
        env: cfg.env,
        whatsPara: destino,
        registroExiste: conversas.registroClaudeExiste(c.id),
      });
      resposta = r.resposta;
      if (r.sessao && motor !== 'claude' && !c.sessaoMotor) c.sessaoMotor = r.sessao;
      if (motor === 'antigravity') {
        // sem registro legível em disco, o painel guarda o histórico
        c.historico = [...(c.historico ?? []), { papel: 'voce', texto: pedido, quando: c.ultimaAtividade }, { papel: 'claude', texto: resposta, quando: agora() }].slice(-300);
      }
    } finally {
      c.processando = false;
      c.ultimaAtividade = agora();
      conversas.salvar();
    }
    gravarMapa(chave, { conversa: c.id, ultima: agora() });
    await responder(destino, resposta.slice(0, MAX_RESPOSTA) || 'Feito.');
  }

  async function bombear() {
    if (rodando) return;
    rodando = true;
    while (fila.length) {
      const item = fila.shift();
      try { await processar(item); } catch (e) { log('erro ao processar mensagem do WhatsApp:', e); }
    }
    rodando = false;
  }

  return {
    meuNumero,
    zerarCache: () => { cacheNumero = null; },
    receber(corpo = {}) {
      const ok = autorizar(corpo, lerAcesso(cfg));
      if (!ok) return { status: 202, corpo: { ok: true, ignorado: true } };
      const tipo = corpo.tipo ?? 'texto';
      if (tipo === 'texto' && !String(corpo.texto ?? '').trim()) return { status: 400, corpo: { erro: 'Mensagem vazia.' } };
      fila.push({ texto: corpo.texto, tipo, destino: ok.destino });
      const posicao = fila.length + (rodando ? 1 : 0);
      bombear();
      return { status: 202, corpo: { ok: true, posicao } };
    },
  };
}

// Conversas: registro em conversas.json, um terminal por conversa, WebSocket, estado e mídias geradas.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { lerJson, gravarJson } from './dados.js';
import { tipoMidia, relDe } from './arquivos.js';
import { MOTORES, motorDe, guardaHistorico, localizar, comandoDe, argsTerminal, ambienteAgente, promptPainel, lerPreferencias } from './motores.js';
import {
  pastaProjetoClaude, statusClaude, historicoClaude, subagentes, pastaSessoesCodex, lerCodex, acharArquivoCodex,
  registrosCodexRecentes, vincularCodex,
} from './registros.js';

const MAX_BUFFER = 300_000;
const ID_CONVERSA = /^[0-9a-f-]{36}$/i;
const JANELA_TRABALHANDO_MS = 8000;
const JANELA_MIDIA_MS = 3 * 60_000;
const PEDIDO_VALIDADE_MS = 90_000;
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
// telas de confiança na pasta, login e escolha de opção também mostram o caractere de prompt
const TELA_INICIAL = /trust (the files in )?this folder|do you trust|confia|select login|log ?in|sign in|choose the|escolha|enter to confirm/i;
const AVISO_ENCERROU = '\r\n\x1b[2m[A conversa encerrou. Clique no terminal para retomar.]\x1b[0m\r\n';

export const idValido = (id) => ID_CONVERSA.test(String(id ?? ''));
export const limitar = (v, padrao, max) => (Number(v) > 0 ? Math.min(Math.floor(Number(v)), max) : padrao);

const formatoWhats = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function criarConversas({ cfg, spawnTerminal, agora = Date.now, log = () => {}, enviadosPeloDono = new Set(), whatsParaTerminal = () => '' }) {
  const { vault, dados } = cfg;
  const salvos = lerJson(dados, 'conversas.json', []);
  const lista = (Array.isArray(salvos) ? salvos : []).filter((c) => c && idValido(c.id));
  for (const c of lista) c.processando = false;
  const terminais = new Map();
  const cacheCodex = new Map();
  const projetoClaude = pastaProjetoClaude(cfg.casa, vault);

  const salvar = () => gravarJson(dados, 'conversas.json', lista);
  const porId = (id) => lista.find((c) => c.id === id);
  const registroClaude = (id) => path.join(projetoClaude, `${id}.jsonl`);
  const arquivoCodex = (c) => (c.sessaoMotor ? acharArquivoCodex(pastaSessoesCodex(cfg.codexHome), c.sessaoMotor, cacheCodex) : null);

  function statusRegistro(c) {
    const motor = motorDe(c.motor);
    if (motor === 'claude') return statusClaude(registroClaude(c.id));
    if (motor === 'codex') { const a = arquivoCodex(c); return a ? lerCodex(a) : null; }
    return null; // o Antigravity não deixa registro legível
  }

  function lerNota(id) {
    try { return fs.readFileSync(path.join(vault, 'sessoes', `${id}.md`), 'utf8'); } catch { return ''; }
  }

  function titulo(c, nota) {
    const linha = nota.split(/\r?\n/).find((l) => l.startsWith('# '));
    if (linha) return linha.slice(2).trim();
    return c.origem === 'whatsapp' ? `WhatsApp ${formatoWhats.format(c.criada)}` : `Conversa ${c.numero}`;
  }

  function resumo(c) {
    const motor = motorDe(c.motor);
    const nota = lerNota(c.id);
    const reg = statusRegistro(c);
    const recente = reg && agora() - reg.mtime < JANELA_TRABALHANDO_MS && !reg.terminou;
    return {
      id: c.id,
      motor,
      motorNome: MOTORES[motor].nome,
      titulo: titulo(c, nota),
      nota,
      numero: c.numero,
      criada: c.criada,
      origem: c.origem === 'whatsapp' ? 'whatsapp' : 'painel',
      processando: Boolean(c.processando),
      ativo: terminais.has(c.id),
      trabalhando: Boolean(c.processando || recente),
      ultimaAcao: reg?.ultimaAcao ?? null,
      midias: c.midias ?? [],
      subagentes: motor === 'claude' ? subagentes(projetoClaude, c.id, agora()) : [],
    };
  }

  function historico(id) {
    const c = porId(id);
    const motor = motorDe(c?.motor);
    if (motor === 'codex') { const a = c && arquivoCodex(c); return a ? lerCodex(a).itens : []; }
    if (guardaHistorico(motor)) return c?.historico ?? [];
    return historicoClaude(registroClaude(id));
  }

  function criar({ motor, cols, rows, pedido, origem, whatsDe } = {}) {
    const prefs = lerPreferencias(dados);
    const padrao = origem === 'whatsapp' ? prefs.whatsapp : prefs.padrao;
    const t = agora();
    const c = {
      id: crypto.randomUUID(),
      criada: t,
      ultimaAtividade: t,
      midias: [],
      numero: lista.length + 1,
      motor: Object.hasOwn(MOTORES, motor ?? '') ? motor : padrao,
    };
    if (origem === 'whatsapp') Object.assign(c, { origem: 'whatsapp', whatsDe: String(whatsDe ?? '') });
    lista.push(c);
    salvar();
    if (origem !== 'whatsapp') iniciarTerminal(c, cols, rows, pedido);
    return c;
  }

  function encerrar(id) {
    const c = porId(id);
    if (!c) return false;
    terminais.get(id)?.proc.kill();
    terminais.delete(id);
    c.arquivada = true;
    salvar();
    return true;
  }

  function verificarPedido(term) {
    const p = term.pedido;
    if (!p || p.agendado) return;
    if (agora() > p.ate) { term.pedido = null; return; }
    let fim = term.buffer.slice(-6000);
    const limpeza = Math.max(fim.lastIndexOf('\x1b[2J'), fim.lastIndexOf('\x1bc'));
    if (limpeza >= 0) fim = fim.slice(limpeza);
    const tela = fim.replace(ANSI, '');
    if (!/[❯›]/.test(tela) || TELA_INICIAL.test(tela)) return;
    p.agendado = true;
    setTimeout(() => {
      // sem Enter: quem confirma o pedido é a pessoa
      if (terminais.get(term.id) === term) term.proc.write(p.texto);
      term.pedido = null;
    }, 600);
  }

  function abrirProcesso(c, cols, rows) {
    const motor = motorDe(c.motor);
    const opcoes = { name: 'xterm-256color', cols, rows, cwd: vault, env: ambienteAgente(cfg.env, { sessao: c.id, whatsPara: whatsParaTerminal(), terminal: true }) };
    const bin = localizar(cfg.bins[motor], cfg.env, cfg.casa);
    if (bin) {
      const args = argsTerminal(c, promptPainel(c.id), fs.existsSync(registroClaude(c.id)));
      try { return spawnTerminal(...comandoDe(bin, args), opcoes); } catch (e) { log('falha ao abrir motor', motor, e.message); }
    }
    // o card mostra a causa em vez de ficar vazio
    const aviso = `O motor ${MOTORES[motor].nome} não está instalado neste servidor.\r\n${MOTORES[motor].login}\r\n`;
    return spawnTerminal(process.execPath, ['-e', `process.stdout.write(${JSON.stringify(aviso)}); setTimeout(() => {}, 3600000)`], opcoes);
  }

  function iniciarTerminal(c, cols, rows, pedido) {
    const proc = abrirProcesso(c, limitar(cols, 120, 400), limitar(rows, 32, 200));
    if (!c.sessaoMotor && !c.iniciouTerminal) { c.iniciouTerminal = agora(); salvar(); }
    const texto = String(pedido ?? '').replace(/[\r\n]+/g, ' ').slice(0, 2000);
    const term = { id: c.id, proc, buffer: '', clientes: new Set(), pedido: texto.trim() ? { texto, ate: agora() + PEDIDO_VALIDADE_MS } : null };
    terminais.set(c.id, term);
    proc.onData((d) => {
      term.buffer = (term.buffer + d).slice(-MAX_BUFFER);
      c.ultimaAtividade = agora();
      for (const ws of term.clientes) ws.send(d);
      verificarPedido(term);
    });
    proc.onExit(() => {
      if (terminais.get(c.id) === term) terminais.delete(c.id);
      for (const ws of term.clientes) ws.send(AVISO_ENCERROU);
    });
    return term;
  }

  function conectar(ws, c, cols, rows) {
    const term = terminais.get(c.id) ?? iniciarTerminal(c, cols, rows);
    term.clientes.add(ws);
    if (term.buffer) ws.send(term.buffer);
    ws.on('message', (bruto) => {
      let m;
      try { m = JSON.parse(bruto.toString()); } catch { return; }
      if (terminais.get(c.id) !== term) return; // processo já morreu
      if (m?.t === 'i' && typeof m.d === 'string') term.proc.write(m.d);
      else if (m?.t === 'r' && Number(m.cols) > 0 && Number(m.rows) > 0) {
        try { term.proc.resize(limitar(m.cols, 120, 400), limitar(m.rows, 32, 200)); } catch { /* terminal fechando */ }
      }
    });
    ws.on('close', () => term.clientes.delete(ws));
  }

  // ---------- mídias geradas ----------
  let vistos = null;
  function midiasDeConteudo() {
    const achados = new Map();
    const andar = (dir) => {
      let itens = [];
      try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const d of itens) {
        if (d.name.startsWith('.')) continue;
        const abs = path.join(dir, d.name);
        if (d.isDirectory()) andar(abs);
        else if (tipoMidia(d.name) && !enviadosPeloDono.has(abs)) {
          try { achados.set(abs, fs.statSync(abs).mtimeMs); } catch { /* sumiu */ }
        }
      }
    };
    andar(path.join(vault, 'conteudo'));
    return achados;
  }

  function dona() {
    let melhor = null;
    let atividade = agora() - JANELA_MIDIA_MS;
    for (const c of lista) {
      if (c.arquivada) continue;
      const a = Math.max(c.ultimaAtividade ?? 0, statusRegistro(c)?.mtime ?? 0);
      if (a >= atividade) { melhor = c; atividade = a; }
    }
    return melhor;
  }

  function varrerMidias() {
    const atual = midiasDeConteudo();
    const anterior = vistos;
    vistos = atual;
    if (!anterior) return; // primeira rodada só memoriza o que já existia
    let mudou = false;
    for (const [abs, mtime] of atual) {
      if (anterior.get(abs) === mtime) continue;
      const c = dona();
      const rel = relDe(vault, abs);
      if (c && !(c.midias ??= []).includes(rel)) { c.midias.push(rel); mudou = true; }
    }
    if (mudou) salvar();
  }

  function vincularCodexAgora() {
    if (!lista.some((c) => c.motor === 'codex' && !c.arquivada && !c.sessaoMotor && c.iniciouTerminal)) return;
    if (vincularCodex(lista, registrosCodexRecentes(pastaSessoesCodex(cfg.codexHome)), vault)) salvar();
  }

  const relogios = [];
  return {
    lista,
    terminais,
    porId,
    salvar,
    criar,
    encerrar,
    estado: () => lista.filter((c) => !c.arquivada).map(resumo),
    historico,
    conectar,
    temTerminal: (id) => terminais.has(id),
    registroClaudeExiste: (id) => fs.existsSync(registroClaude(id)),
    varrerMidias,
    vincularCodexAgora,
    iniciarRelogios() {
      varrerMidias();
      relogios.push(setInterval(() => { try { varrerMidias(); } catch (e) { log('mídias', e); } }, 3000));
      relogios.push(setInterval(() => { try { vincularCodexAgora(); } catch (e) { log('codex', e); } }, 4000));
      for (const r of relogios) r.unref();
    },
    fechar() {
      for (const r of relogios) clearInterval(r);
      for (const t of terminais.values()) t.proc.kill();
      terminais.clear();
    },
  };
}

// Motores de IA: onde estão, com que flags abrem (terminal e sem tela) e com que ambiente.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { lerJson, gravarJson } from './dados.js';

export const MOTORES = {
  claude: {
    nome: 'Claude Code',
    login: 'Nada a fazer antes: ao abrir a primeira conversa, o próprio Claude Code pede o login (conta ou chave de API).',
  },
  codex: {
    nome: 'Codex',
    login: 'Entre com o código de dispositivo no terminal do servidor (codex login) ou coloque a chave de API no .env do servidor.',
  },
  antigravity: {
    nome: 'Antigravity',
    login: 'Abra o link com código que aparece no terminal ou coloque a chave de API no .env do servidor.',
  },
  grok: {
    nome: 'Grok',
    login: 'Precisa de plano SuperGrok. Rode grok login --device-code no terminal do servidor e entre com o código, ou coloque XAI_API_KEY no .env do servidor.',
  },
};

export const motorDe = (id) => (Object.hasOwn(MOTORES, id ?? '') ? id : 'claude');
// Motores sem registro de conversa legível em disco: o painel guarda o histórico (WhatsApp) em vez de lê-lo do motor.
export const guardaHistorico = (motor) => motor === 'antigravity' || motor === 'grok';

const FERRAMENTAS_WHATS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill', 'Task', 'WebFetch', 'WebSearch'];
export const LIMITE_SEM_TELA_MS = 20 * 60_000;

function executavel(arquivo) {
  try {
    if (!fs.statSync(arquivo).isFile()) return false;
    fs.accessSync(arquivo, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

// O serviço pode não ter ~/.local/bin no PATH, por isso as pastas extras.
export function localizar(valor, env, casa) {
  if (valor.includes('/') || valor.includes(path.sep)) return fs.existsSync(valor) ? valor : null;
  const pastas = [...String(env.PATH ?? '').split(path.delimiter).filter(Boolean), path.join(casa, '.local', 'bin'), '/usr/local/bin', '/usr/bin'];
  const extensoes = process.platform === 'win32' ? ['', ...String(env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase())] : [''];
  for (const pasta of pastas) {
    for (const ext of extensoes) {
      const candidato = path.join(pasta, valor + ext);
      if (executavel(candidato)) return candidato;
    }
  }
  return null;
}

// Um .js/.mjs roda com o próprio Node: é assim que os testes usam um motor falso.
export const comandoDe = (bin, args) => (/\.m?js$/i.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args]);

export function promptPainel(id) {
  return [
    'Você está rodando dentro do painel do cérebro, num terminal no servidor.',
    `O arquivo de acompanhamento desta conversa é sessoes/${id}.md, a partir da raiz do cérebro.`,
    'Siga a regra da constituição sobre a nota de status: crie a nota na primeira ação, com título, resumo de uma ou duas frases e checklist, e marque cada etapa ao terminar.',
  ].join(' ');
}

export const PROMPT_WHATS = [
  'Esta conversa acontece pelo WhatsApp: a sua resposta final volta como mensagem.',
  'Seja breve, num formato que caiba num aplicativo de mensagens: sem tabelas nem cabeçalhos, e negrito com asteriscos no máximo uma vez.',
  'Para ler conversas, achar contatos ou mandar mensagens e arquivos a terceiros ou ao dono, use a skill whatsapp do cérebro e siga as regras dela.',
].join(' ');

const toml = (prompt) => `developer_instructions=${JSON.stringify(prompt)}`;

export function argsTerminal(conversa, prompt, registroExiste) {
  const motor = motorDe(conversa.motor);
  if (motor === 'codex') {
    const opcoes = ['-c', toml(prompt), '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'];
    return conversa.sessaoMotor ? ['resume', ...opcoes, conversa.sessaoMotor] : opcoes;
  }
  if (motor === 'antigravity') {
    if (conversa.sessaoMotor) return ['--conversation', conversa.sessaoMotor];
    return conversa.iniciouTerminal ? ['--continue'] : [];
  }
  if (motor === 'grok') {
    // -s só cria a sessão com o id da conversa; depois dela existir, retoma com --resume
    const volta = conversa.sessaoMotor || conversa.iniciouTerminal;
    return [...(volta ? ['--resume', conversa.sessaoMotor || conversa.id] : ['-s', conversa.id]), '--rules', prompt];
  }
  return [registroExiste ? '--resume' : '--session-id', conversa.id, '--append-system-prompt', prompt];
}

export function argsSemTela(conversa, texto, prompt, registroExiste, arquivoSaida) {
  const motor = motorDe(conversa.motor);
  if (motor === 'codex') {
    const inicio = conversa.sessaoMotor ? ['exec', 'resume'] : ['exec'];
    const opcoes = ['-c', toml(prompt), '-c', 'sandbox_mode="danger-full-access"', '-c', 'approval_policy="never"', '--skip-git-repo-check', '--json', '-o', arquivoSaida, '--'];
    return [...inicio, ...opcoes, ...(conversa.sessaoMotor ? [conversa.sessaoMotor] : []), texto];
  }
  if (motor === 'antigravity') {
    const pedido = conversa.sessaoMotor ? texto : `[${prompt}]\n\n${texto}`;
    const args = ['-p', pedido, '--output-format', 'json', '--dangerously-skip-permissions', '--print-timeout', '20m'];
    return conversa.sessaoMotor ? [...args, '--conversation', conversa.sessaoMotor] : args;
  }
  if (motor === 'grok') {
    // sessão nomeada com o id da conversa: -s cria na primeira vez, --resume retoma; saída em texto puro (padrão da CLI)
    const base = ['-p', texto, '--rules', prompt, '--always-approve'];
    return conversa.sessaoMotor ? [...base, '--resume', conversa.sessaoMotor] : [...base, '-s', conversa.id];
  }
  return ['-p', texto, registroExiste ? '--resume' : '--session-id', conversa.id, '--append-system-prompt', prompt,
    '--output-format', 'text', '--permission-mode', 'acceptEdits', '--allowedTools', ...FERRAMENTAS_WHATS];
}

// Variáveis herdadas de um agente pai fazem o filho agir como subordinado e não gravar histórico.
const HERANCA_AGENTE = /^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID|CLAUDE_EFFORT|AI_AGENT)/;
const SEGREDOS = new Set(['CORE_OS_PASSWORD', 'CORE_OS_HOOK_TOKEN']);

export function ambienteAgente(base, { sessao, whatsPara = '', terminal = false }) {
  const env = {};
  for (const [k, v] of Object.entries(base)) if (!HERANCA_AGENTE.test(k) && !SEGREDOS.has(k)) env[k] = v;
  env.CORE_OS_SESSAO = sessao;
  env.WHATS_PARA = whatsPara;
  if (terminal) Object.assign(env, { TERM: 'xterm-256color', COLORTERM: 'truecolor' });
  return env;
}

function sessaoCodex(saida) {
  let achado = null;
  for (const linha of saida.split('\n')) {
    let o;
    try { o = JSON.parse(linha); } catch { continue; }
    const v = o?.thread_id ?? o?.session_id ?? o?.payload?.id;
    if (typeof v === 'string' && v) achado = v;
  }
  return achado;
}

// Roda o motor sem terminal (WhatsApp). Nunca rejeita: falhas viram texto de resposta.
export function rodarSemTela({ motor, bin, conversa, texto, prompt, vault, env, whatsPara, registroExiste, limiteMs = LIMITE_SEM_TELA_MS }) {
  const arquivoSaida = path.join(os.tmpdir(), `core-os-codex-${conversa.id}-${Date.now()}.txt`);
  const [cmd, args] = comandoDe(bin, argsSemTela(conversa, texto, prompt, registroExiste, arquivoSaida));
  return new Promise((ok) => {
    let saida = '';
    let erro = '';
    let p;
    try {
      p = spawn(cmd, args, { cwd: vault, env: ambienteAgente(env, { sessao: conversa.id, whatsPara }), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      ok({ resposta: `Não consegui abrir o ${MOTORES[motor].nome}: ${e.message}`, sessao: null, arquivoSaida });
      return;
    }
    const relogio = setTimeout(() => p.kill('SIGTERM'), limiteMs);
    p.stdout.on('data', (d) => { saida += d; });
    p.stderr.on('data', (d) => { erro += d; });
    p.on('error', (e) => {
      clearTimeout(relogio);
      ok({ resposta: `Não consegui abrir o ${MOTORES[motor].nome}: ${e.message}`, sessao: null, arquivoSaida });
    });
    p.on('close', () => {
      clearTimeout(relogio);
      if (motor === 'codex') {
        let resposta = '';
        try { resposta = fs.readFileSync(arquivoSaida, 'utf8').trim(); fs.renameSync(arquivoSaida, `${arquivoSaida}.lido`); } catch { /* sem arquivo */ }
        if (!resposta) resposta = erro.trim().split('\n').slice(-5).join('\n');
        ok({ resposta, sessao: sessaoCodex(saida), arquivoSaida });
      } else if (motor === 'antigravity') {
        let j = null;
        try { j = JSON.parse(saida); } catch { /* saída crua */ }
        const resposta = j ? String(j.response ?? j.result ?? j.text ?? '').trim() : saida.trim();
        const sessao = j ? (j.conversation_id ?? j.conversationId ?? j.session_id ?? j.sessionId ?? null) : null;
        ok({ resposta, sessao, arquivoSaida });
      } else if (motor === 'grok') {
        // só a saída padrão é a resposta; o que vai para o erro (avisos, login pedido) só aparece se não houve resposta
        ok({ resposta: saida.trim() || erro.trim().split('\n').slice(-5).join('\n'), sessao: conversa.id, arquivoSaida });
      } else ok({ resposta: `${saida}${erro}`.trim(), sessao: conversa.id, arquivoSaida });
    });
  });
}

// Motor das conversas novas do painel e do WhatsApp (motores.json); campo ausente ou desconhecido vira claude.
export function lerPreferencias(dados) {
  const m = lerJson(dados, 'motores.json', {});
  const valido = (id) => (typeof id === 'string' && Object.hasOwn(MOTORES, id) ? id : 'claude');
  return { padrao: valido(m?.padrao), whatsapp: valido(m?.whatsapp) };
}

export function gravarPreferencias(dados, pedido) {
  const atual = lerPreferencias(dados);
  for (const campo of ['padrao', 'whatsapp']) if (Object.hasOwn(MOTORES, pedido?.[campo] ?? '')) atual[campo] = pedido[campo];
  gravarJson(dados, 'motores.json', atual);
  return atual;
}

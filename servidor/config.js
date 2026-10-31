// Configuração do painel: arquivo de ambiente (fora do cérebro) mais variáveis do processo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_PAINEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function lerArquivoEnv(arquivo, env = process.env) {
  let texto;
  try { texto = fs.readFileSync(arquivo, 'utf8'); } catch { return env; }
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!m) continue;
    let valor = m[2];
    if (valor.length >= 2 && (valor[0] === '"' || valor[0] === "'") && valor.at(-1) === valor[0]) valor = valor.slice(1, -1);
    if (env[m[1]] === undefined) env[m[1]] = valor;
  }
  return env;
}

export function configuracao(env = process.env) {
  const vaultBruto = env.CORE_OS_VAULT || path.join(RAIZ_PAINEL, '..', 'cerebro');
  let vault;
  try { vault = fs.realpathSync(vaultBruto); } catch { throw new Error(`pasta do cérebro não existe: ${vaultBruto}`); }
  if (!fs.statSync(vault).isDirectory()) throw new Error(`o cérebro precisa ser uma pasta: ${vault}`);
  const dados = path.resolve(env.CORE_OS_DATA || path.join(RAIZ_PAINEL, 'data'));
  fs.mkdirSync(dados, { recursive: true });
  const casa = env.HOME || os.homedir();
  return {
    porta: env.CORE_OS_PORT ? Number(env.CORE_OS_PORT) : 3000,
    host: env.CORE_OS_HOST || '127.0.0.1',
    vault,
    dados,
    casa,
    senha: env.CORE_OS_PASSWORD || '',
    tokenPonte: env.CORE_OS_HOOK_TOKEN || '',
    bins: { claude: env.CLAUDE_BIN || 'claude', codex: env.CODEX_BIN || 'codex', antigravity: env.AGY_BIN || 'agy' },
    codexHome: env.CODEX_HOME || path.join(casa, '.codex'),
    evo: { url: (env.EVO_URL || '').replace(/\/+$/, ''), key: env.EVO_KEY || '', instancia: env.EVO_INSTANCE || 'cerebro' },
    whatsWebhook: env.WHATS_WEBHOOK || 'http://n8n:5678/webhook/core-os-whatsapp',
    whatsDono: env.WHATS_DONO || '',
    n8nUrl: env.N8N_PUBLIC_URL || '',
    env,
  };
}

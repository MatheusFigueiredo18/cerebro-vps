// Pseudo-terminal: node-pty quando instalado; senão um substituto por pipes com a mesma interface.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

export function carregarPty() {
  try { return createRequire(import.meta.url)('node-pty').spawn; } catch { return null; }
}

// shortcut: sem pseudo-terminal de verdade o agente não vê um TTY (sem cores nem redimensionar); instalar node-pty resolve
export function spawnPorPipes(cmd, args, { cwd, env }) {
  const p = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const aoDados = [];
  const aoSair = [];
  let saiu = false;
  const emitir = (d) => { for (const f of aoDados) f(d.toString()); };
  const terminar = (exitCode) => {
    if (saiu) return;
    saiu = true;
    for (const f of aoSair) f({ exitCode });
  };
  p.stdout.on('data', emitir);
  p.stderr.on('data', emitir);
  p.on('error', () => terminar(-1));
  p.on('close', (codigo) => terminar(codigo));
  p.stdin.on('error', () => {});
  return {
    pid: p.pid,
    onData: (f) => aoDados.push(f),
    onExit: (f) => aoSair.push(f),
    write: (d) => { if (!saiu) p.stdin.write(d); },
    resize: () => {},
    kill: () => { if (!saiu) p.kill(); },
  };
}

#!/usr/bin/env node
// Motor de IA falso para os testes: imita a interface de linha de comando de claude, codex e agy.
import fs from 'node:fs';

const args = process.argv.slice(2);
const valorDe = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const envVisto = {
  sessao: process.env.CORE_OS_SESSAO,
  para: process.env.WHATS_PARA,
  senha: process.env.CORE_OS_PASSWORD ?? null,
  token: process.env.CORE_OS_HOOK_TOKEN ?? null,
  claudecode: process.env.CLAUDECODE ?? null,
  term: process.env.TERM ?? null,
};

if (process.env.FALSO_DORMIR) setTimeout(() => {}, 600_000);
else if (args[0] === 'exec') {
  // codex exec [resume] ... -o <arquivo> -- [sessão] <texto>
  fs.writeFileSync(valorDe('-o'), `codex:${args.at(-1)}`);
  console.log(JSON.stringify({ type: 'thread.started', thread_id: 'th-1' }));
  console.log(JSON.stringify({ type: 'x', payload: { id: 'th-2' } }));
} else if (valorDe('--output-format') === 'json') {
  console.log(JSON.stringify({ response: `agy:${valorDe('-p')}`, conversation_id: 'cv-1', args }));
} else if (args.includes('-p')) {
  process.stdout.write(`  eco:${valorDe('-p')} ${JSON.stringify({ args, env: envVisto })}  \n`);
} else {
  process.stdout.write(`ARGS ${JSON.stringify(args)}\r\nENV ${JSON.stringify(envVisto)}\r\n❯ `);
  process.stdin.on('data', (d) => {
    const t = d.toString();
    process.stdout.write(`ECO[${t}]`);
    if (t.includes('sair')) process.exit(0);
  });
}

// Instalador rodado de verdade num prefixo temporário, com comandos de sistema falsos no PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmp, escrever } from './ajuda.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASH = process.env.BASH_BIN || 'bash';
const WIN = process.platform === 'win32';
const posix = (p) => p.replace(/\\/g, '/');
const INSTALAR = posix(path.join(REPO, 'instalador', 'instalar.sh'));
const SEGREDOS = ['CORE_OS_HOOK_TOKEN', 'EVO_KEY', 'POSTGRES_PASSWORD', 'N8N_ENCRYPTION_KEY'];

const CABECA = '#!/usr/bin/env bash\nprintf \'%s\\n\' "$(basename "$0") $*" >> "$FALSO_LOG"\n';
const FALSOS = {
  id: 'case "$1" in -u) echo "${FALSO_UID:-0}" ;; -un|-gn) echo "${FALSO_USUARIO:-teste}" ;; *) echo "uid=0(teste)" ;; esac',
  'apt-get': '', systemctl: '', ufw: '', chown: '', npm: '', python3: '',
  dpkg: 'echo amd64',
  sshd: '[ "$1" = -T ] && echo "port 2222"; exit 0',
  qrencode: 'echo "[QR falso] $*"',
  docker: 'case "$*" in "compose version") echo "Docker Compose version v2" ;; "volume inspect"*) echo "$FALSO_VOLUME" ;; esac; exit 0',
  curl: `url="\${@: -1}"
case "$url" in
  *api.ipify.org*) echo 203.0.113.7 ;;
  *fetchInstances*) if [ -f "$FALSO_ESTADO/instancia" ]; then echo '[{"name":"cerebro"}]'; else echo '[]'; fi ;;
  */instance/create) touch "$FALSO_ESTADO/instancia"; echo '{}' ;;
  *connectionState*) if [ -n "\${FALSO_CONECTADO:-}" ]; then echo '{"instance":{"state":"open"}}'; else echo '{"instance":{"state":"close"}}'; fi ;;
  */instance/connect/*) echo '{"code":"2@codigo-falso","base64":"AAAA"}' ;;
  *) echo '{}' ;;
esac`,
};

function cenario({ os = 'ID=ubuntu\nVERSION_CODENAME=noble\n' } = {}) {
  const base = tmp('inst-');
  const raiz = path.join(base, 'raiz');
  const casa = path.join(base, 'casa');
  const falsos = path.join(base, 'falsos');
  const estado = path.join(base, 'estado');
  for (const d of [raiz, casa, falsos, estado]) fs.mkdirSync(d, { recursive: true });
  escrever(raiz, 'etc/os-release', os);
  for (const [nome, corpo] of Object.entries(FALSOS)) fs.writeFileSync(path.join(falsos, nome), CABECA + corpo + '\n', { mode: 0o755 });
  fs.writeFileSync(escrever(casa, '.local/bin/claude', '#!/usr/bin/env bash\necho 2.0.0\n'), '#!/usr/bin/env bash\necho 2.0.0\n', { mode: 0o755 });
  const log = path.join(base, 'comandos.log');
  const env = { ...process.env };
  Object.assign(env, {
    SUDO_USER: 'teste', // padrão: usuário comum chamando o instalador com sudo
    PATH: falsos + path.delimiter + process.env.PATH,
    CEREBRO_VPS_RAIZ: posix(raiz),
    CEREBRO_VPS_CASA: posix(casa),
    FALSO_LOG: posix(log),
    FALSO_ESTADO: posix(estado),
    FALSO_VOLUME: posix(path.join(base, 'volume-n8n')),
  });
  // argumentos passam pelo ambiente: no Windows o bash do Git reinterpreta aspas da linha de comando
  const rodar = (args, extra = {}) => {
    const vars = Object.fromEntries(args.map((a, i) => [`ARG_${i}`, a]));
    const chamada = `exec bash "$0" ${args.map((_, i) => `"$ARG_${i}"`).join(' ')}`;
    const r = spawnSync(BASH, ['-c', chamada, INSTALAR], { env: { ...env, ...vars, ...extra }, encoding: 'utf8', timeout: 240000 });
    return { ...r, saida: `${r.stdout}${r.stderr}` };
  };
  const lerEnv = () => Object.fromEntries(fs.readFileSync(path.join(raiz, 'opt/core-os/.env'), 'utf8').trim().split('\n')
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^'(.*)'$/, '$1')]));
  const comandos = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '');
  return { base, raiz, casa, env, rodar, lerEnv, comandos, vault: path.join(casa, 'cerebro') };
}

// Retrato de tudo o que o instalador escreve, para provar que a segunda execução não muda nada.
function retrato(...raizes) {
  const mapa = {};
  const andar = (topo, dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = posix(path.relative(topo, abs));
      if (rel.endsWith('core-os-instalacao.log')) continue;
      if (e.isSymbolicLink()) mapa[rel] = `link:${fs.readlinkSync(abs)}`;
      else if (e.isDirectory()) { mapa[rel] = 'pasta'; andar(topo, abs); }
      else mapa[rel] = crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
    }
  };
  for (const r of raizes) andar(path.dirname(r), r);
  return mapa;
}

test('instalação completa: passos em ordem, arquivos, segredos, idempotência e troca de senha', () => {
  const c = cenario();
  const r = c.rodar(['--nome', 'Maria Teste', '--whatsapp', '+55 (62) 99999-8888']);
  assert.equal(r.status, 0, r.saida);

  // passos anunciados em ordem
  const posicoes = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => r.stdout.indexOf(`[${n}/8]`));
  assert.ok(posicoes.every((p, i) => p >= 0 && (i === 0 || p > posicoes[i - 1])), r.stdout);
  const cmds = c.comandos();
  const ordem = ['apt-get install', 'systemctl enable --now docker', 'docker compose -p core-os', 'docker compose -p core-os .* n8n import:workflow',
    'python3 .*publicar-fluxo', 'docker compose -p core-os .* restart n8n', 'npm ci', 'systemctl restart core-os-painel', 'docker run -d --name core-os-caddy', 'ufw --force enable'];
  const ind = ordem.map((t) => cmds.search(new RegExp(`^${t}`, 'm')));
  assert.ok(ind.every((p, i) => p >= 0 && (i === 0 || p > ind[i - 1])), `ordem dos comandos:\n${cmds}`);

  // .env com tudo o que o painel e a pilha leem
  const env = c.lerEnv();
  for (const k of SEGREDOS) assert.match(env[k], /^[0-9a-f]{48,64}$/, k);
  assert.equal(new Set(SEGREDOS.map((k) => env[k])).size, 4);
  assert.match(env.CORE_OS_PASSWORD, /^[A-Za-z0-9]{16}$/);
  assert.match(env.N8N_IMAGE, /^[\w./-]+:\d+\.\d+\.\d+$/);
  assert.match(env.EVOLUTION_IMAGE, /^[\w./-]+:v?\d+\.\d+\.\d+$/);
  assert.equal(env.CORE_OS_PORT, '3000');
  assert.equal(env.CORE_OS_HOST, '0.0.0.0');
  assert.equal(env.CORE_OS_VAULT, posix(c.vault));
  assert.equal(env.CORE_OS_DATA, `${posix(c.raiz)}/opt/core-os/dados`);
  assert.equal(env.EVO_URL, 'http://127.0.0.1:8080');
  assert.equal(env.EVO_INSTANCE, 'cerebro');
  assert.equal(env.WHATS_DONO, '5562999998888');
  assert.equal(env.N8N_HOST, '203.0.113.7');
  assert.equal(env.N8N_PUBLIC_URL, 'http://203.0.113.7:5678/');
  assert.equal(env.N8N_SECURE_COOKIE, 'false');
  assert.ok(env.CLAUDE_BIN.endsWith('claude'), env.CLAUDE_BIN);

  // segredos nunca na saída, nos comandos nem no log; a senha só no resumo
  const log = fs.readFileSync(path.join(c.raiz, 'var/log/core-os-instalacao.log'), 'utf8');
  for (const k of SEGREDOS) {
    assert.ok(!r.saida.includes(env[k]), `${k} apareceu na saída`);
    assert.ok(!cmds.includes(env[k]), `${k} apareceu nos argumentos de um comando`);
    assert.ok(!log.includes(env[k]), `${k} apareceu no log`);
  }
  const resumo = r.stdout.indexOf('Resumo');
  assert.ok(resumo > 0);
  assert.equal(r.stdout.indexOf(env.CORE_OS_PASSWORD), r.stdout.lastIndexOf(env.CORE_OS_PASSWORD));
  assert.ok(r.stdout.indexOf(env.CORE_OS_PASSWORD) > resumo);
  assert.ok(!r.stderr.includes(env.CORE_OS_PASSWORD));

  // arquivos do sistema
  const opt = path.join(c.raiz, 'opt/core-os');
  const unidade = fs.readFileSync(path.join(c.raiz, 'etc/systemd/system/core-os-painel.service'), 'utf8');
  assert.match(unidade, /^User=teste$/m);
  assert.match(unidade, new RegExp(`^Environment=CORE_OS_ENV=${posix(opt)}/\\.env$`, 'm'));
  assert.match(unidade, new RegExp(`^Environment=HOME=${posix(c.casa)}$`, 'm'));
  assert.match(unidade, /^Restart=always$/m);
  assert.match(unidade, /^RestartSec=2$/m);
  assert.match(unidade, /^After=.*docker\.service/m);
  assert.match(unidade, /servidor\/index\.js$/m);
  assert.ok(fs.existsSync(path.join(opt, 'painel/servidor/index.js')));
  assert.ok(!fs.existsSync(path.join(opt, 'painel/node_modules/express')), 'o painel instalado não leva node_modules do repositório');
  assert.ok(!fs.existsSync(path.join(opt, 'painel.novo')));
  assert.ok(fs.existsSync(path.join(opt, 'dados')));
  assert.ok(fs.existsSync(path.join(opt, 'stack/docker-compose.yml')));
  assert.ok(fs.existsSync(path.join(opt, 'stack/fluxos/whatsapp.json')));
  assert.ok(fs.existsSync(path.join(opt, 'stack/.env')));
  const caddy = fs.readFileSync(path.join(opt, 'caddy/Caddyfile'), 'utf8');
  assert.match(caddy, /^:80 \{\s*reverse_proxy 127\.0\.0\.1:3000/m);
  assert.match(caddy, /^:5678 \{\s*reverse_proxy 127\.0\.0\.1:5679/m);
  assert.match(cmds, new RegExp(`chown root:teste ${posix(opt)}/\\.env`));
  assert.match(cmds, new RegExp(`chown -R teste:teste ${posix(c.vault)}`));
  if (!WIN) {
    assert.equal(fs.statSync(path.join(opt, '.env')).mode & 0o777, 0o640);
    assert.equal(fs.statSync(path.join(c.raiz, 'etc/systemd/system/core-os-painel.service')).mode & 0o777, 0o644);
    assert.ok(fs.lstatSync(path.join(opt, 'stack/.env')).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(c.vault, '.agents/skills')).isSymbolicLink());
    assert.ok(fs.statSync(path.join(c.vault, '.claude/skills/whatsapp/motor/whatsapp.sh')).mode & 0o100);
  }

  // firewall: SSH detectado, 80, 443, 5678 sem domínio, 3000 só para o Docker
  for (const regra of ['ufw allow 2222/tcp', 'ufw allow 80/tcp', 'ufw allow 443/tcp', 'ufw allow 5678/tcp',
    'ufw allow from 172.16.0.0/12 to any port 3000 proto tcp', 'ufw default deny incoming', 'ufw default allow outgoing']) {
    assert.ok(cmds.includes(regra), regra);
  }
  assert.ok(!/ufw (delete|reset)/.test(cmds));

  // WhatsApp: instância criada, webhook e preferências, QR no fim
  assert.match(cmds, /curl .*\/instance\/create/);
  assert.match(cmds, /curl .*\/webhook\/set\/cerebro/);
  assert.match(cmds, /curl .*\/settings\/set\/cerebro/);
  assert.match(r.stdout, /\[QR falso\].*2@codigo-falso/);

  // cérebro copiado com o nome trocado
  const constituicao = fs.readFileSync(path.join(c.vault, 'CLAUDE.md'), 'utf8');
  assert.match(constituicao, /^# Cérebro de Maria Teste/);
  assert.ok(!constituicao.includes('{{NOME}}'));
  assert.ok(fs.existsSync(path.join(c.vault, '.agents/skills/whatsapp/SKILL.md')));
  assert.ok(fs.existsSync(path.join(c.vault, 'conteudo/reels/01-tres-erros-de-iniciante/depois-editado.mp4')));

  // segunda execução: nada muda, nada some (nem o que o dono criou)
  escrever(c.vault, 'minha-nota.md', 'escrita pelo dono');
  fs.appendFileSync(path.join(c.vault, 'CLAUDE.md'), '\nregra minha\n');
  escrever(opt, 'dados/conversas.json', '[{"id":"x"}]');
  const antes = retrato(c.raiz, c.casa);
  const r2 = c.rodar(['--nome', 'Outro Nome', '--whatsapp', '5562999998888']);
  assert.equal(r2.status, 0, r2.saida);
  assert.deepEqual(retrato(c.raiz, c.casa), antes);
  assert.match(r2.stdout, /já existe um cérebro/);
  assert.match(c.comandos(), /instância cerebro já existe|fetchInstances/);
  assert.equal(c.comandos().match(/\/instance\/create/g).length, 1, 'a instância não é recriada');

  // terceira: só a senha muda
  const r3 = c.rodar(['--nome', 'Maria Teste', '--senha', 'NovaSenha#2026']);
  assert.equal(r3.status, 0, r3.saida);
  const depois = c.lerEnv();
  assert.equal(depois.CORE_OS_PASSWORD, 'NovaSenha#2026');
  for (const k of [...SEGREDOS, 'N8N_IMAGE', 'EVOLUTION_IMAGE']) assert.equal(depois[k], env[k], k);
});

test('com domínio e sem exemplos: HTTPS, n8n no subdomínio, cérebro sem entregas e nome com caracteres especiais', () => {
  const c = cenario({ os: 'ID=debian\nVERSION_CODENAME=bookworm\n' });
  const r = c.rodar(['--nome', 'Ana & Zé | Silva', '--dominio', 'Cerebro.Exemplo.com.br', '--sem-exemplos']);
  assert.equal(r.status, 0, r.saida);
  const env = c.lerEnv();
  assert.equal(env.N8N_HOST, 'n8n.cerebro.exemplo.com.br');
  assert.equal(env.N8N_PROTOCOL, 'https');
  assert.equal(env.N8N_PUBLIC_URL, 'https://n8n.cerebro.exemplo.com.br/');
  assert.equal(env.N8N_SECURE_COOKIE, 'true');
  const caddy = fs.readFileSync(path.join(c.raiz, 'opt/core-os/caddy/Caddyfile'), 'utf8');
  assert.match(caddy, /^cerebro\.exemplo\.com\.br \{\s*reverse_proxy 127\.0\.0\.1:3000/m);
  assert.match(caddy, /^n8n\.cerebro\.exemplo\.com\.br \{\s*reverse_proxy 127\.0\.0\.1:5679/m);
  assert.ok(!c.comandos().includes('ufw allow 5678/tcp'));
  assert.match(r.stdout, /https:\/\/cerebro\.exemplo\.com\.br/);

  assert.match(fs.readFileSync(path.join(c.vault, 'CLAUDE.md'), 'utf8'), /^# Cérebro de Ana & Zé \| Silva/);
  assert.match(fs.readFileSync(path.join(c.vault, 'AGENTS.md'), 'utf8'), /Ana & Zé \| Silva/);
  for (const cat of ['carrosseis', 'thumbnails', 'reels', 'whatsapp']) {
    assert.deepEqual(fs.readdirSync(path.join(c.vault, 'conteudo', cat)), [], cat);
  }
  assert.ok(fs.existsSync(path.join(c.vault, 'conteudo/CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(c.vault, 'tasks/todo.md')));
});

test('--simular mostra os 8 passos sem root e sem mudar nada', () => {
  const c = cenario();
  const antes = retrato(c.raiz, c.casa);
  const r = c.rodar(['--nome', 'Teste', '--dominio', 'a.exemplo.com', '--senha', 'Boa-Senha_123!', '--simular'], { FALSO_UID: '1000' });
  assert.equal(r.status, 0, r.saida);
  for (let n = 1; n <= 8; n++) assert.ok(r.stdout.includes(`[${n}/8]`), `passo ${n}`);
  assert.match(r.stdout, /Simulação concluída/);
  assert.ok(!r.stdout.includes('Boa-Senha_123!'));
  assert.deepEqual(retrato(c.raiz, c.casa), antes);
  assert.equal(c.comandos().match(/^(apt-get|systemctl|ufw|chown|npm|python3) /m), null, 'nenhum comando que muda o sistema roda');
});

test('entrada inválida para antes de mexer em qualquer coisa', () => {
  const c = cenario();
  const casos = [
    [[], /--nome/],
    [['--nome', 'X', '--senha', 'curta1'], /8 caracteres/],
    ...[' com espaço', "aspa'simples", 'aspa"dupla', 'cifrao$aqui', 'crase`aqui', 'barra\\aqui'].map((s) => [['--nome', 'X', '--senha', `senha${s}`], /não pode ter/]),
    [['--nome', 'X', '--whatsapp', '62 9999-8888'], /país, DDD/],
    [['--nome', 'X', '--dominio', 'https://exemplo.com/'], /domínio inválido/],
    [['--nome', 'X', '--opcao-que-nao-existe'], /opção desconhecida/],
    [['--nome'], /precisa de um valor/],
  ];
  for (const [args, erro] of casos) {
    const r = c.rodar(args);
    assert.notEqual(r.status, 0, args.join(' '));
    assert.match(r.stderr, erro, args.join(' '));
  }
  const semRoot = c.rodar(['--nome', 'X'], { FALSO_UID: '1000' });
  assert.notEqual(semRoot.status, 0);
  assert.match(semRoot.stderr, /root/);
  assert.deepEqual(fs.readdirSync(c.raiz), ['etc']);
  assert.equal(c.comandos().match(/^(apt-get|docker|ufw) /m), null);

  const outro = cenario({ os: 'ID=fedora\n' });
  const r = outro.rodar(['--nome', 'X']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Ubuntu ou Debian/);
});

test('dono root: aborta sem mexer em nada; com --aceitar-root instala e avisa', () => {
  const c = cenario();
  const comoRoot = { SUDO_USER: '', FALSO_USUARIO: 'root' };
  const recusa = c.rodar(['--nome', 'X'], comoRoot);
  assert.notEqual(recusa.status, 0);
  assert.match(recusa.stderr, /usuário comum com sudo/);
  assert.match(recusa.stderr, /--aceitar-root/);
  assert.deepEqual(fs.readdirSync(c.raiz), ['etc']);
  assert.equal(c.comandos().match(/^(apt-get|docker|ufw|chown) /m), null);

  const aceito = c.rodar(['--nome', 'X', '--aceitar-root'], comoRoot);
  assert.equal(aceito.status, 0, aceito.saida);
  assert.match(aceito.stdout, /Aviso: instalando como root/);
  assert.match(aceito.stdout, /Lembrete: instalado como root/);
  assert.match(fs.readFileSync(path.join(c.raiz, 'etc/systemd/system/core-os-painel.service'), 'utf8'), /^User=root$/m);
});

test('whatsapp-qr.sh: conectado sai com sucesso; sem .env falha com aviso', () => {
  const c = cenario();
  escrever(c.raiz, 'opt/core-os/.env', 'EVO_URL=http://127.0.0.1:8080\nEVO_KEY=abc123\nEVO_INSTANCE=cerebro\n');
  const qr = posix(path.join(REPO, 'instalador', 'whatsapp-qr.sh'));
  const env = { ...c.env, CORE_OS_ENV: `${posix(c.raiz)}/opt/core-os/.env` };
  const ligado = spawnSync(BASH, [qr], { env: { ...env, FALSO_CONECTADO: '1' }, encoding: 'utf8' });
  assert.equal(ligado.status, 0, ligado.stderr);
  assert.match(ligado.stdout, /já está conectado/);
  const desligado = spawnSync(BASH, [qr], { env, encoding: 'utf8' });
  assert.equal(desligado.status, 0, desligado.stderr);
  assert.match(desligado.stdout, /\[QR falso\] -t ANSIUTF8 2@codigo-falso/);
  assert.match(desligado.stdout, /Aparelhos conectados/);
  assert.ok(!c.comandos().includes('abc123'), 'a chave não vai na linha de comando');
  const semEnv = spawnSync(BASH, [qr], { env: { ...env, CORE_OS_ENV: '/nao/existe/.env' }, encoding: 'utf8' });
  assert.equal(semEnv.status, 1);
  assert.match(semEnv.stderr, /Não consigo ler/);
});

test('bash -n em todos os scripts do repositório', () => {
  const scripts = ['montar-pacote.sh'];
  const andar = (dir) => {
    for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory() && !e.isSymbolicLink()) andar(rel);
      else if (e.name.endsWith('.sh')) scripts.push(rel);
    }
  };
  andar('instalador');
  andar('cerebro-exemplo/.claude');
  assert.ok(scripts.length >= 6, scripts.join(', '));
  for (const s of scripts) {
    const r = spawnSync(BASH, ['-n', posix(path.join(REPO, s))], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${s}: ${r.stderr}`);
  }
});

test('montar-pacote.sh gera o tar.gz com skill, instalador, painel e cérebro, sem node_modules', () => {
  const dist = tmp('dist-');
  const r = spawnSync(BASH, [posix(path.join(REPO, 'montar-pacote.sh'))], { env: { ...process.env, DIST: posix(dist) }, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  const lista = spawnSync(BASH, ['-c', 'cd "$1" && tar -tzf cerebro-vps.tar.gz', '_', posix(dist)], { encoding: 'utf8' }).stdout.split('\n');
  for (const f of ['cerebro-vps/skill/SKILL.md', 'cerebro-vps/instalador/instalar.sh', 'cerebro-vps/instalador/whatsapp-qr.sh',
    'cerebro-vps/instalador/stack/docker-compose.yml', 'cerebro-vps/instalador/stack/fluxos/whatsapp.json',
    'cerebro-vps/painel/servidor/index.js', 'cerebro-vps/painel/package.json', 'cerebro-vps/cerebro/CLAUDE.md',
    'cerebro-vps/cerebro/.claude/settings.json']) {
    assert.ok(lista.includes(f), f);
  }
  assert.ok(!lista.some((f) => /node_modules|\/data\/|\.DS_Store|Thumbs\.db/.test(f)));
  assert.deepEqual(fs.readdirSync(dist), ['cerebro-vps.tar.gz']);
});

#!/usr/bin/env bash
# Instalador do painel cerebro-vps (Ubuntu e Debian).
# Seguro para rodar de novo: mantém segredos, cérebro e dados; atualiza código, pilha e fluxo.
set -Eeuo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefixo para testes: todos os caminhos do sistema ficam abaixo dele.
RAIZ="${CEREBRO_VPS_RAIZ:-}"
OPT="$RAIZ/opt/core-os"
ENV_ARQ="$OPT/.env"
LOG="$RAIZ/var/log/core-os-instalacao.log"
UNIDADE="$RAIZ/etc/systemd/system/core-os-painel.service"
OS_RELEASE="$RAIZ/etc/os-release"

# Versões fixas: atualizar só depois de testar, porque o fluxo e a ativação dependem delas.
N8N_FIXA="docker.n8n.io/n8nio/n8n:2.46.3"
EVOLUTION_FIXA="evoapicloud/evolution-api:v2.3.7"
CADDY_IMG="caddy:2.11.7"
FLUXO_ID="coreOsWhatsapp01"
WEBHOOK_INTERNO="http://n8n:5678/webhook/core-os-whatsapp"

NOME="" DOMINIO="" SENHA="" WHATS="" SEM_EXEMPLOS=0 SIMULAR=0 ACEITAR_ROOT=0 PASSO=0

uso() {
  cat <<'FIM'
Uso: sudo bash instalar.sh --nome "Seu Nome" [opções]

  --nome "<nome>"       nome do dono do cérebro (obrigatório)
  --dominio <host>      ex.: cerebro.exemplo.com (liga HTTPS e n8n.<host>)
  --senha "<senha>"     senha do painel (8+ caracteres, sem espaço, aspas, $, crase ou \)
  --whatsapp <número>   número que pode dar ordens, com país e DDD (ex.: 5562999998888)
  --sem-exemplos        instala o cérebro sem os exemplos de conteúdo
  --aceitar-root        deixa o painel rodar como root (o WhatsApp com o Claude não vai responder)
  --simular             só mostra o que faria, sem mudar nada (não precisa de root)
FIM
}

msg() { printf '%s\n' "$*"; }
erro() {
  printf '\nERRO%s: %s\n' "$([ "$PASSO" -gt 0 ] && printf ' no passo %s' "$PASSO")" "$1" >&2
  [ -n "${2:-}" ] && printf 'Para ver o que aconteceu: %s\n' "$2" >&2
  [ "$PASSO" -gt 0 ] && printf 'Depois de corrigir, rode o instalador de novo: ele continua de onde parou.\n' >&2
  exit 1
}
trap 'erro "comando inesperado falhou (linha $LINENO)" "tail -n 50 $LOG"' ERR
passo() { PASSO=$1; printf '\n[%s/8] %s\n' "$1" "$2"; }
simulando() { [ "$SIMULAR" = 1 ]; }
fazer() { if simulando; then printf '  (simulação) %s\n' "$*"; else "$@"; fi; }
# Saída dos comandos vai para o log; a tela só mostra o resumo de cada passo.
quieto() { if simulando; then printf '  (simulação) %s\n' "$*"; else "$@" >>"$LOG" 2>&1; fi; }
VERLOG="tail -n 50 $LOG"

gravar() { # gravar <destino> <modo>, conteúdo pela entrada padrão
  if simulando; then printf '  (simulação) gravar %s\n' "$1"; cat >/dev/null; return 0; fi
  mkdir -p "$(dirname "$1")"
  local tmp; tmp=$(mktemp "$1.XXXXXX")
  cat >"$tmp"; chmod "$2" "$tmp"; mv -f "$tmp" "$1"
}

esperar() { # esperar <url> <segundos>
  if simulando; then printf '  (simulação) esperar %s\n' "$1"; return 0; fi
  local fim=$((SECONDS + $2))
  until curl -fsS --max-time 3 -o /dev/null "$1" 2>/dev/null; do
    [ "$SECONDS" -ge "$fim" ] && return 1
    sleep 2
  done
}

# ---------- .env ----------
env_ler() {
  [ -f "$ENV_ARQ" ] || return 0
  sed -n "s/^$1=//p" "$ENV_ARQ" | tail -n 1 | sed "s/^'\(.*\)'\$/\1/"
}
env_def() { # substitui a linha da chave ou acrescenta no fim
  local linha="$1=$2"
  # aspas simples deixam o valor literal tanto para o painel quanto para o Compose
  [[ $2 =~ ^[A-Za-z0-9_./:@+,-]*$ ]] || linha="$1='$2'"
  if simulando; then printf '  (simulação) .env: %s\n' "$1"; return 0; fi
  local tmp; tmp=$(mktemp "$ENV_ARQ.XXXXXX")
  K="$1" L="$linha" awk 'BEGIN{k=ENVIRON["K"]"="; l=ENVIRON["L"]}
    index($0,k)==1 { if (!f) print l; f=1; next } { print } END { if (!f) print l }' "$ENV_ARQ" >"$tmp"
  # reescrever no lugar preserva dono e permissão do arquivo
  cat "$tmp" >"$ENV_ARQ"; rm -f "$tmp"
}
garantir() { [ -n "$(env_ler "$1")" ] || env_def "$1" "$2"; }
hex() { od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'; }
senha_nova() {
  local s=""
  while [ "${#s}" -lt 16 ]; do s+=$(head -c 64 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9'); done
  printf '%s' "${s:0:16}"
}

# ---------- Evolution ----------
evo() { # evo <método> <rota> [corpo JSON]; a chave vai por arquivo para não aparecer em lista de processos
  local args=(-sS --fail-with-body --max-time 20 -X "$1" -H @"$CABECALHO" -H 'content-type: application/json')
  [ -n "${3:-}" ] && args+=(--data "$3")
  curl "${args[@]}" "$EVO_URL$2"
}
tem_instancia() {
  node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{let j=null;try{j=JSON.parse(t)}catch{}
    const l=Array.isArray(j)?j:j?[j]:[];process.exit(l.some(x=>(x?.name??x?.instance?.instanceName)===process.argv[1])?0:1)})' "$1"
}

# ---------- entrada ----------
while [ $# -gt 0 ]; do
  case $1 in
    --nome|--dominio|--senha|--whatsapp)
      [ $# -ge 2 ] || erro "a opção $1 precisa de um valor"
      case $1 in --nome) NOME=$2 ;; --dominio) DOMINIO=$2 ;; --senha) SENHA=$2 ;; --whatsapp) WHATS=$2 ;; esac
      shift 2 ;;
    --sem-exemplos) SEM_EXEMPLOS=1; shift ;;
    --aceitar-root) ACEITAR_ROOT=1; shift ;;
    --simular) SIMULAR=1; shift ;;
    -h|--ajuda|--help) uso; exit 0 ;;
    *) erro "opção desconhecida: $1 (veja --ajuda)" ;;
  esac
done

NOME="$(printf '%s' "$NOME" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
[ -n "$NOME" ] || erro 'falta --nome "Seu Nome"'
case $NOME in *$'\n'*) erro "o nome não pode ter quebra de linha" ;; esac
if [ -n "$SENHA" ]; then
  [ "${#SENHA}" -ge 8 ] || erro "a senha precisa ter pelo menos 8 caracteres"
  case $SENHA in *[[:space:]]*|*\'*|*\"*|*\$*|*\`*|*\\*) erro "a senha não pode ter espaço, aspas, \$, crase nem barra invertida" ;; esac
fi
if [ -n "$WHATS" ]; then
  WHATS="${WHATS//[!0-9]/}"
  [ "${#WHATS}" -ge 12 ] || erro "o número do WhatsApp precisa ter país, DDD e número (ex.: 5562999998888)"
fi
if [ -n "$DOMINIO" ]; then
  DOMINIO="$(printf '%s' "$DOMINIO" | tr 'A-Z' 'a-z')"
  [[ $DOMINIO =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] \
    || erro "domínio inválido: use só o nome, como cerebro.exemplo.com (sem http:// nem barra)"
fi
simulando || [ "$(id -u)" = 0 ] || erro "rode como root: sudo bash $0 ..."
[ -r "$OS_RELEASE" ] || erro "não achei $OS_RELEASE; este instalador é para Ubuntu ou Debian"
OS_ID=$(. "$OS_RELEASE"; printf '%s %s' "${ID:-}" "${ID_LIKE:-}")
case " $OS_ID " in
  *" ubuntu "*) OS_BASE=ubuntu ;;
  *" debian "*) OS_BASE=debian ;;
  *) erro "sistema não suportado ($OS_ID); use Ubuntu ou Debian" ;;
esac
OS_CODINOME=$(. "$OS_RELEASE"; printf '%s' "${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}")

DONO="${SUDO_USER:-$(id -un)}"
# como root o Claude Code recusa o modo sem confirmações, que é o que responde no WhatsApp
if [ "$DONO" = root ] && [ "$ACEITAR_ROOT" != 1 ]; then
  erro "o painel ficaria com o usuário root, e o Claude Code não responde pelo WhatsApp quando roda como root.
Crie um usuário comum com sudo (adduser cerebro && usermod -aG sudo cerebro), entre nele (su - cerebro),
instale e faça login no Claude Code ali, e rode: sudo bash instalador/instalar.sh --nome ...
Para instalar como root mesmo assim, sabendo que o WhatsApp com o Claude não vai responder, acrescente --aceitar-root."
fi
CASA="${CEREBRO_VPS_CASA:-$(getent passwd "$DONO" 2>/dev/null | cut -d: -f6 || true)}"
[ -n "$CASA" ] || erro "não achei a pasta pessoal do usuário $DONO"
GRUPO="$(id -gn "$DONO")"
VAULT="$CASA/cerebro"

if [ -f "$AQUI/../painel/servidor/index.js" ]; then PAINEL_ORIGEM="$AQUI/../painel"; else PAINEL_ORIGEM="$AQUI/.."; fi
if [ -f "$AQUI/../cerebro/CLAUDE.md" ]; then CEREBRO_ORIGEM="$AQUI/../cerebro"; else CEREBRO_ORIGEM="$AQUI/../cerebro-exemplo"; fi
[ -f "$PAINEL_ORIGEM/servidor/index.js" ] || erro "código do painel não encontrado ao lado do instalador"
[ -f "$CEREBRO_ORIGEM/CLAUDE.md" ] || erro "cérebro de exemplo não encontrado ao lado do instalador"

msg "Instalando o painel do cérebro para $NOME (usuário $DONO)."
simulando && msg "Modo simulação: nada será alterado."
if [ "$DONO" = root ]; then
  msg "Aviso: instalando como root (--aceitar-root). O painel funciona, mas o WhatsApp com o Claude Code não vai responder."
fi
simulando || mkdir -p "$(dirname "$LOG")"
simulando || printf '\n===== instalação %s =====\n' "$(date '+%F %T')" >>"$LOG"
TMPD=$(mktemp -d); trap 'rm -rf "$TMPD"' EXIT

# ---------- 1 ----------
passo 1 "Pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
quieto apt-get update -q || erro "apt-get update falhou" "$VERLOG"
quieto apt-get install -y -q --no-install-recommends curl ca-certificates jq git openssl ufw ffmpeg qrencode python3 build-essential \
  || erro "não consegui instalar os pacotes do sistema" "$VERLOG"
msg "  pacotes prontos"

# ---------- 2 ----------
passo 2 "Docker"
if command -v docker >/dev/null 2>&1; then
  msg "  Docker já instalado"
else
  # repositório oficial assinado, em vez de script baixado e executado direto
  fazer install -d -m 0755 "$RAIZ/etc/apt/keyrings"
  quieto curl -fsSL "https://download.docker.com/linux/$OS_BASE/gpg" -o "$RAIZ/etc/apt/keyrings/docker.asc" \
    || erro "não consegui baixar a chave do Docker" "$VERLOG"
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' \
    "$(dpkg --print-architecture 2>/dev/null || echo amd64)" "$OS_BASE" "$OS_CODINOME" | gravar "$RAIZ/etc/apt/sources.list.d/docker.list" 644
  quieto apt-get update -q || erro "apt-get update falhou" "$VERLOG"
  quieto apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
    || erro "não consegui instalar o Docker" "$VERLOG"
  msg "  Docker instalado"
fi
quieto systemctl enable --now docker || erro "o serviço do Docker não subiu" "journalctl -u docker -n 50 --no-pager"
simulando || docker compose version >/dev/null 2>&1 || erro "o plugin Docker Compose não respondeu" "docker compose version"
msg "  Docker e Compose respondendo"

# ---------- 3 ----------
passo 3 "Node.js e Claude Code"
NODE_MAIOR=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)
if [ "${NODE_MAIOR:-0}" -ge 20 ] 2>/dev/null; then
  msg "  Node $(node -v) já serve"
else
  fazer install -d -m 0755 "$RAIZ/etc/apt/keyrings"
  quieto curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$RAIZ/etc/apt/keyrings/nodesource.asc" \
    || erro "não consegui baixar a chave do Node.js" "$VERLOG"
  printf 'deb [signed-by=/etc/apt/keyrings/nodesource.asc] https://deb.nodesource.com/node_22.x nodistro main\n' \
    | gravar "$RAIZ/etc/apt/sources.list.d/nodesource.list" 644
  quieto apt-get update -q || erro "apt-get update falhou" "$VERLOG"
  quieto apt-get install -y -q nodejs || erro "não consegui instalar o Node.js 22" "$VERLOG"
  msg "  Node.js 22 instalado"
fi
NODE_BIN=$(command -v node || echo /usr/bin/node)

achar_claude() {
  local c=""
  if [ "$DONO" = "$(id -un)" ]; then
    c=$(env -i HOME="$CASA" USER="$DONO" LOGNAME="$DONO" PATH=/usr/local/bin:/usr/bin:/bin bash -lc 'command -v claude' 2>/dev/null || true)
  else
    c=$(su - "$DONO" -s /bin/bash -c 'command -v claude' 2>/dev/null || true)
  fi
  for c in "$c" "$CASA/.local/bin/claude" "$CASA/.claude/local/claude"; do
    if [ -n "$c" ] && [ -x "$c" ]; then printf '%s\n' "$c"; return 0; fi
  done
  return 1
}
if CLAUDE_BIN=$(achar_claude); then
  msg "  Claude Code encontrado em $CLAUDE_BIN"
elif simulando; then
  CLAUDE_BIN="$CASA/.local/bin/claude"; msg "  (simulação) Claude Code não encontrado; seguindo mesmo assim"
else
  erro "não achei o Claude Code do usuário $DONO. Instale (https://docs.claude.com/pt/docs/claude-code), entre com 'claude' uma vez para fazer o login e rode o instalador de novo"
fi

# ---------- 4 ----------
passo 4 "Segredos e configuração"
fazer mkdir -p "$OPT"
if [ ! -f "$ENV_ARQ" ]; then
  if simulando; then msg "  (simulação) criar $ENV_ARQ com permissão 600"; else (umask 077; : >"$ENV_ARQ"); fi
fi
garantir CORE_OS_HOOK_TOKEN "$(hex 32)"
garantir EVO_KEY "$(hex 32)"
garantir POSTGRES_PASSWORD "$(hex 24)"
garantir N8N_ENCRYPTION_KEY "$(hex 32)"
garantir N8N_IMAGE "$N8N_FIXA"
garantir EVOLUTION_IMAGE "$EVOLUTION_FIXA"
SENHA_FINAL="${SENHA:-$(env_ler CORE_OS_PASSWORD)}"
[ -n "$SENHA_FINAL" ] || SENHA_FINAL=$(senha_nova)
env_def CORE_OS_PASSWORD "$SENHA_FINAL"
env_def CORE_OS_PORT 3000
env_def CORE_OS_HOST 0.0.0.0
env_def CORE_OS_VAULT "$VAULT"
env_def CORE_OS_DATA "$OPT/dados"
env_def CLAUDE_BIN "$CLAUDE_BIN"
env_def EVO_URL http://127.0.0.1:8080
env_def EVO_INSTANCE cerebro
[ -n "$WHATS" ] && env_def WHATS_DONO "$WHATS"

IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)
[[ $IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
[ -n "$IP" ] || IP=127.0.0.1
if [ -n "$DOMINIO" ]; then
  env_def N8N_HOST "n8n.$DOMINIO"; env_def N8N_PROTOCOL https
  env_def N8N_PUBLIC_URL "https://n8n.$DOMINIO/"; env_def N8N_SECURE_COOKIE true
  URL_PAINEL="https://$DOMINIO"; URL_N8N="https://n8n.$DOMINIO"
else
  env_def N8N_HOST "$IP"; env_def N8N_PROTOCOL http
  env_def N8N_PUBLIC_URL "http://$IP:5678/"; env_def N8N_SECURE_COOKIE false
  URL_PAINEL="http://$IP"; URL_N8N="http://$IP:5678"
fi
msg "  segredos em $ENV_ARQ (os existentes foram mantidos)"

# ---------- 5 ----------
passo 5 "Cérebro"
if [ -f "$VAULT/CLAUDE.md" ]; then
  msg "  já existe um cérebro em $VAULT: mantido como está"
elif simulando; then
  msg "  (simulação) copiar $CEREBRO_ORIGEM para $VAULT$([ "$SEM_EXEMPLOS" = 1 ] && printf ' sem os exemplos'), trocar {{NOME}} e passar a posse para $DONO"
else
  palco=$(mktemp -d "$CASA/.cerebro-novo.XXXXXX")
  cp -a "$CEREBRO_ORIGEM/." "$palco/"
  find "$palco" \( -name .DS_Store -o -name Thumbs.db -o -name desktop.ini -o -name '._*' \) -exec rm -f {} +
  # download em zip ou clone no Windows transformam o link em arquivo comum
  if [ ! -L "$palco/.agents/skills" ]; then rm -rf "$palco/.agents/skills"; mkdir -p "$palco/.agents"; ln -s ../.claude/skills "$palco/.agents/skills"; fi
  if [ "$SEM_EXEMPLOS" = 1 ]; then
    for categoria in "$palco"/conteudo/*/; do
      for item in "$categoria"*; do
        [ -e "$item" ] || continue
        if [ -d "$item" ]; then rm -rf "$item"
        elif [[ $item == *.md && ${item##*/} != CLAUDE.md ]]; then rm -f "$item"; fi
      done
    done
  fi
  nome_sed=$(printf '%s' "$NOME" | sed 's/[\\&|]/\\&/g')
  grep -rlF '{{NOME}}' "$palco" 2>/dev/null | while IFS= read -r arq; do sed -i "s|{{NOME}}|$nome_sed|g" "$arq"; done || true
  if [ -e "$VAULT" ]; then
    # pasta já existia sem constituição: só acrescenta, nunca sobrescreve
    cp -an "$palco/." "$VAULT/" 2>>"$LOG" || true
    rm -rf "$palco"
  else
    mv "$palco" "$VAULT"
  fi
  [ -f "$VAULT/CLAUDE.md" ] || erro "a cópia do cérebro falhou" "ls -la $VAULT"
  chown -R "$DONO:$GRUPO" "$VAULT"
  msg "  cérebro copiado para $VAULT$([ "$SEM_EXEMPLOS" = 1 ] && printf ' (sem exemplos)')"
fi
if [ -d "$VAULT/.claude/skills" ]; then
  # arquivos baixados em pacote compactado perdem a permissão de execução
  fazer find "$VAULT/.claude/skills" -path '*/motor/*' -type f -exec chmod +x {} +
fi

# ---------- 6 ----------
passo 6 "n8n e Evolution API"
fazer mkdir -p "$OPT/stack/fluxos"
fazer cp -f "$AQUI/stack/docker-compose.yml" "$AQUI/stack/publicar-fluxo.py" "$OPT/stack/"
fazer cp -f "$AQUI/stack/fluxos/"*.json "$OPT/stack/fluxos/"
fazer ln -sfn ../.env "$OPT/stack/.env"
DC=(docker compose -p core-os --project-directory "$OPT/stack" -f "$OPT/stack/docker-compose.yml")
LOGS_DC="docker compose -p core-os --project-directory $OPT/stack logs --tail 80"
quieto "${DC[@]}" pull || erro "não consegui baixar as imagens dos containers" "$VERLOG"
quieto "${DC[@]}" up -d --remove-orphans || erro "os containers não subiram" "$VERLOG"
esperar http://127.0.0.1:8080/ 120 || erro "a Evolution API não respondeu em 127.0.0.1:8080" "$LOGS_DC evolution"
esperar http://127.0.0.1:5679/healthz 120 || erro "o n8n não respondeu em 127.0.0.1:5679" "$LOGS_DC n8n"
msg "  containers no ar"

quieto "${DC[@]}" exec -T -u node n8n n8n import:workflow --input=/fluxos/whatsapp.json \
  || erro "não consegui importar o fluxo no n8n" "$VERLOG"
if simulando; then
  BANCO_N8N="<volume core-os_n8n>/database.sqlite"
else
  BANCO_N8N="$(docker volume inspect -f '{{ .Mountpoint }}' core-os_n8n)/database.sqlite"
fi
quieto python3 "$OPT/stack/publicar-fluxo.py" "$BANCO_N8N" "$FLUXO_ID" \
  || erro "não consegui registrar a versão publicada do fluxo" "$VERLOG"
# o script roda como root; os arquivos auxiliares do SQLite precisam continuar com o dono do n8n
for extra in "$BANCO_N8N-wal" "$BANCO_N8N-shm"; do
  [ -e "$extra" ] && fazer chown --reference="$BANCO_N8N" "$extra"
done
quieto "${DC[@]}" exec -T -u node n8n n8n publish:workflow --id="$FLUXO_ID" \
  || quieto "${DC[@]}" exec -T -u node n8n n8n update:workflow --id="$FLUXO_ID" --active=true \
  || erro "não consegui ativar o fluxo do n8n" "$VERLOG"
quieto "${DC[@]}" restart n8n || erro "o n8n não reiniciou" "$LOGS_DC n8n"
esperar http://127.0.0.1:5679/healthz 120 || erro "o n8n não voltou depois de reiniciar" "$LOGS_DC n8n"
msg "  fluxo do WhatsApp importado e ativo"

EVO_URL=http://127.0.0.1:8080
CABECALHO="$TMPD/cabecalho"
if simulando; then
  msg "  (simulação) criar a instância cerebro se faltar, apontar o webhook e aplicar as preferências"
else
  (umask 077; printf 'apikey: %s\n' "$(env_ler EVO_KEY)" >"$CABECALHO")
  if evo GET /instance/fetchInstances 2>>"$LOG" | tem_instancia cerebro; then
    msg "  instância cerebro já existe"
  else
    evo POST /instance/create '{"instanceName":"cerebro","integration":"WHATSAPP-BAILEYS","qrcode":false}' >>"$LOG" 2>&1 \
      || erro "não consegui criar a instância do WhatsApp" "$LOGS_DC evolution"
    msg "  instância cerebro criada"
  fi
  evo POST /webhook/set/cerebro "{\"webhook\":{\"enabled\":true,\"url\":\"$WEBHOOK_INTERNO\",\"byEvents\":false,\"base64\":false,\"events\":[\"MESSAGES_UPSERT\"]}}" >>"$LOG" 2>&1 \
    || erro "não consegui apontar o webhook do WhatsApp para o n8n" "$VERLOG"
  evo POST /settings/set/cerebro '{"rejectCall":false,"msgCall":"","groupsIgnore":true,"alwaysOnline":false,"readMessages":false,"readStatus":false,"syncFullHistory":false}' >>"$LOG" 2>&1 \
    || erro "não consegui aplicar as preferências do WhatsApp" "$VERLOG"
  msg "  webhook e preferências do WhatsApp aplicados"
fi

# ---------- 7 ----------
passo 7 "Painel"
NOVO="$OPT/painel.novo"
fazer rm -rf "$NOVO" "$OPT/painel.antigo"
fazer mkdir -p "$NOVO"
for item in servidor cliente package.json package-lock.json THIRD-PARTY.md; do
  [ -e "$PAINEL_ORIGEM/$item" ] && fazer cp -a "$PAINEL_ORIGEM/$item" "$NOVO/"
done
quieto npm ci --prefix "$NOVO" --omit=dev --no-audit --no-fund || erro "npm não conseguiu instalar as dependências do painel" "$VERLOG"
# só troca depois do npm dar certo: uma falha não deixa o painel antigo quebrado
[ -d "$OPT/painel" ] && fazer mv "$OPT/painel" "$OPT/painel.antigo"
fazer mv "$NOVO" "$OPT/painel"
fazer rm -rf "$OPT/painel.antigo"
fazer mkdir -p "$OPT/dados"
fazer chown "$DONO:$GRUPO" "$OPT/dados"
fazer chown "root:$GRUPO" "$ENV_ARQ"
fazer chmod 640 "$ENV_ARQ"
gravar "$UNIDADE" 644 <<FIM
[Unit]
Description=Painel do cérebro (cerebro-vps)
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=$DONO
Group=$GRUPO
WorkingDirectory=$OPT/painel
Environment=CORE_OS_ENV=$ENV_ARQ
Environment=HOME=$CASA
Environment=PATH=$(dirname "$CLAUDE_BIN"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$NODE_BIN $OPT/painel/servidor/index.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
FIM
quieto systemctl daemon-reload || erro "systemctl daemon-reload falhou" "$VERLOG"
quieto systemctl enable core-os-painel || erro "não consegui habilitar o serviço do painel" "$VERLOG"
quieto systemctl restart core-os-painel || erro "o serviço do painel não reiniciou" "journalctl -u core-os-painel -n 50 --no-pager"
esperar http://127.0.0.1:3000/api/eu 20 || erro "o painel não respondeu em 127.0.0.1:3000" "journalctl -u core-os-painel -n 50 --no-pager"
msg "  painel no ar (serviço core-os-painel)"

# ---------- 8 ----------
passo 8 "Acesso pela internet e firewall"
if [ -n "$DOMINIO" ]; then
  gravar "$OPT/caddy/Caddyfile" 644 <<FIM
$DOMINIO {
	reverse_proxy 127.0.0.1:3000
}

n8n.$DOMINIO {
	reverse_proxy 127.0.0.1:5679
}
FIM
else
  gravar "$OPT/caddy/Caddyfile" 644 <<'FIM'
:80 {
	reverse_proxy 127.0.0.1:3000
}

:5678 {
	reverse_proxy 127.0.0.1:5679
}
FIM
fi
quieto docker rm -f core-os-caddy || true
quieto docker run -d --name core-os-caddy --network host --restart unless-stopped \
  -v "$OPT/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" -v core-os-caddy-dados:/data -v core-os-caddy-config:/config "$CADDY_IMG" \
  || erro "o proxy (Caddy) não subiu" "docker logs --tail 80 core-os-caddy"
msg "  proxy no ar$([ -n "$DOMINIO" ] && printf ' (certificado HTTPS sai sozinho quando o DNS apontar para %s)' "$IP")"

SSH_PORTA=$(sshd -T 2>/dev/null | awk '$1=="port"{print $2; exit}' || true)
[[ $SSH_PORTA =~ ^[0-9]+$ ]] || SSH_PORTA=$(ss -tlnpH 2>/dev/null | awk '/sshd/ {sub(/.*:/,"",$4); print $4; exit}' || true)
[[ $SSH_PORTA =~ ^[0-9]+$ ]] || SSH_PORTA=22
quieto ufw allow "$SSH_PORTA/tcp" || erro "ufw falhou" "$VERLOG"
quieto ufw allow 80/tcp
quieto ufw allow 443/tcp
[ -z "$DOMINIO" ] && quieto ufw allow 5678/tcp
quieto ufw allow from 172.16.0.0/12 to any port 3000 proto tcp
quieto ufw default deny incoming
quieto ufw default allow outgoing
quieto ufw --force enable || erro "não consegui ligar o firewall" "ufw status verbose"
msg "  firewall ligado (SSH na porta $SSH_PORTA continua liberado)"

# ---------- fim ----------
if simulando; then
  msg ""; msg "Simulação concluída. Nada foi alterado."; exit 0
fi
cat <<FIM

==================== Resumo ====================
Atenção: a senha aparece logo abaixo. Se estiver gravando a tela, pause agora.

  Painel:   $URL_PAINEL
  Senha:    $SENHA_FINAL
  n8n:      $URL_N8N  (a primeira visita cria a conta de dono do n8n)
  Cérebro:  $VAULT
  Segredos: $ENV_ARQ (só root e o grupo $GRUPO leem)
================================================
FIM
[ "$DONO" = root ] && msg "Lembrete: instalado como root, então o WhatsApp com o Claude Code não vai responder."
msg ""
msg "WhatsApp:"
if ! CORE_OS_ENV="$ENV_ARQ" bash "$AQUI/whatsapp-qr.sh"; then
  msg "Não deu para mostrar o QR agora. Quando quiser conectar, rode: sudo bash $AQUI/whatsapp-qr.sh"
fi

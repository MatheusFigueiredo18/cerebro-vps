#!/usr/bin/env bash
# Mostra um QR novo para conectar o WhatsApp ao cérebro (o QR do instalador vence em cerca de 1 minuto).
set -euo pipefail

ENV_ARQ="${CORE_OS_ENV:-/opt/core-os/.env}"
[ -r "$ENV_ARQ" ] || { echo "Não consigo ler $ENV_ARQ. Rode com sudo." >&2; exit 1; }
ler() { sed -n "s/^$1=//p" "$ENV_ARQ" | tail -n 1 | sed "s/^'\(.*\)'\$/\1/"; }

URL="$(ler EVO_URL)"; URL="${URL:-http://127.0.0.1:8080}"
INST="$(ler EVO_INSTANCE)"; INST="${INST:-cerebro}"
KEY="$(ler EVO_KEY)"
[ -n "$KEY" ] || { echo "EVO_KEY não está em $ENV_ARQ. Rode o instalador de novo." >&2; exit 1; }

# a chave vai por arquivo para não aparecer na lista de processos
CAB="$(mktemp)"; trap 'rm -f "$CAB"' EXIT
printf 'apikey: %s\n' "$KEY" >"$CAB"
pedir() { curl -sS --max-time 20 -H @"$CAB" "$URL$1"; }
campo() {
  node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{let j={};try{j=JSON.parse(t)??{}}catch{}
    const v={estado:j.instance?.state??j.state,codigo:j.code}[process.argv[1]];process.stdout.write(v==null?"":String(v))})' "$1"
}

estado="$(pedir "/instance/connectionState/$INST" | campo estado || true)"
if [ "$estado" = open ]; then
  echo "O WhatsApp já está conectado. Nada a fazer."
  exit 0
fi

codigo="$(pedir "/instance/connect/$INST" | campo codigo || true)"
if [ -z "$codigo" ]; then
  echo "A Evolution API ainda não gerou o código de conexão. Tente de novo em alguns segundos." >&2
  exit 1
fi

qrencode -t ANSIUTF8 "$codigo"
cat <<'FIM'
No celular: abra o WhatsApp > Configurações (ou os três pontinhos) > Aparelhos conectados >
Conectar um aparelho, e aponte a câmera para o QR acima.
O QR vence em cerca de 1 minuto. Se vencer, rode este script de novo.
FIM

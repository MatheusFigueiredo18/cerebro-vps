#!/usr/bin/env bash
# Gera dist/cerebro-vps.tar.gz com o que a VPS precisa: skill, instalador, painel e cérebro de exemplo.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="${DIST:-$RAIZ/dist}"
mkdir -p "$DIST"
DIST="$(cd "$DIST" && pwd)"
palco="$DIST/cerebro-vps"

rm -rf "$palco"
mkdir -p "$palco/painel"
cp -a "$RAIZ/skill" "$RAIZ/instalador" "$palco/"
for item in servidor cliente package.json package-lock.json THIRD-PARTY.md; do
  cp -a "$RAIZ/$item" "$palco/painel/"
done
cp -a "$RAIZ/cerebro-exemplo" "$palco/cerebro"
find "$palco" \( -name .DS_Store -o -name Thumbs.db -o -name desktop.ini -o -name '._*' \) -exec rm -f {} +

# relativo de propósito: o tar do Git Bash confunde "C:" com host remoto
(cd "$DIST" && tar -czf cerebro-vps.tar.gz cerebro-vps)
rm -rf "$palco"
echo "Pacote pronto: $DIST/cerebro-vps.tar.gz"

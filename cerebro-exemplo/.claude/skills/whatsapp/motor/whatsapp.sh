#!/usr/bin/env bash
# Atalho da skill whatsapp; a lógica fica em whatsapp.mjs (precisa do Node, que o painel já usa).
exec node "$(dirname "$0")/whatsapp.mjs" "$@"

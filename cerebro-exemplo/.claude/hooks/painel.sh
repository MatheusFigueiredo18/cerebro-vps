#!/usr/bin/env bash
# Início de sessão: data de hoje, pendências abertas e o lembrete da captura contínua.
raiz="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

echo "Hoje é $(TZ=America/Sao_Paulo date '+%d/%m/%Y')."
echo "Pendências em aberto (tasks/todo.md):"
pendencias="$(grep -E '^[[:space:]]*- \[ \]' "$raiz/tasks/todo.md" 2>/dev/null | head -n 10)"
if [ -n "$pendencias" ]; then printf '%s\n' "$pendencias"; else echo "  nenhuma"; fi
echo "Lembrete: fato novo que a pessoa contar vai para o destino certo na hora, com aviso de uma linha."

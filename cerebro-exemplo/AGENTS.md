# Cérebro de {{NOME}}: regras para outros motores

> Para Codex, Antigravity, Grok e qualquer motor que não lê `CLAUDE.md` nem roda hooks.

1. **A constituição vale para você.** Leia `CLAUDE.md` antes de agir. Onde ele diz "Claude", entenda "você".
2. **Faça à mão o que os hooks fariam.** Ao começar, leia as primeiras pendências abertas de `tasks/todo.md`. A cada mensagem, aplique a captura contínua: fato novo vai para o destino certo na hora, com aviso de uma linha; pendência vira item do todo; correção vira lição.
3. **Nota de status.** A variável de ambiente `CORE_OS_SESSAO` traz o id da conversa. A nota é `sessoes/<valor>.md`. Crie no início, no formato da constituição (`# título`, `> resumo`, lista `- [ ]`), e marque cada etapa concluída.
4. **Skills.** Estão em `.claude/skills/` e no espelho `.agents/skills/`. Antes de uma tarefa coberta por skill, leia o `SKILL.md` dela e siga.
5. **Segredos.** Ficam só em `/opt/core-os/.env`. Nunca dentro do cérebro.
6. **Sem travessão** em nenhum texto.

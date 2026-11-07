# Área de criação de vídeo (design, 2026-11-07)

Status: desenho para aprovação. Nada codado ainda.

## Ideia
Decisão do Matheus (2026-11-07): a **Criação de vídeo é um espaço NOVO, ao lado dos atuais**. Nada substitui nem sai (Grafo, Conversas, Conteúdos, WhatsApp e o resto ficam como estão). Conversas continua sendo o terminal do Claude com cards.

O novo espaço é um canvas de nós ligados por linhas, no estilo dos Spaces da Magnific, onde referências e um prompt viram um vídeo.

## Decisão de motor
**Remotion é a base** (roda na própria VPS, sem serviço de fora). **Magnific é opcional**, só para clipe ou imagem gerados por IA. Se a Magnific estiver fora do ar, sem créditos ou sem login na VPS, o resto da área continua funcionando.

## Aprendizado dos Spaces da Magnific (estudado com o REA)
- Nós com bolinhas de entrada (esquerda) e saída (direita), por tipo: texto, imagem, vídeo, áudio.
- Uma linha só liga saída a entrada compatível.
- Nó **Lista** agrupa referências (vídeos) e entrega todas ao gerador.
- Nó **Gerador de vídeo**: prompt em texto livre + controles (quantidade, formato 9:16, duração, som) + botão de rodar. O resultado vira um nó de vídeo novo, ligado ao gerador.

## Nós da área de vídeo
| Nó | Entradas | Saída | O que faz |
|---|---|---|---|
| Referência | nenhuma | vídeo, imagem ou áudio | arquivo vindo de Conteúdos (arrastar); já existe como card de arquivo |
| Lista | N referências | lista | agrupa referências |
| Prompt | nenhuma | texto | texto livre (estilo, motion, efeitos, música, legenda) |
| Gerador Remotion | lista, referências, prompt | vídeo | Claude escreve a composição Remotion e renderiza |
| Gerador Magnific (opcional) | prompt, imagem | imagem ou vídeo | chama o MCP da Magnific |
| Vídeo | 1 vídeo | nenhuma | preview, versões, baixar, enviar ao prompt |

## Como roda um gerador
1. Botão "Rodar" chama `POST /api/video/jobs` com `{area, no, entradas, prompt, motor}`.
2. O servidor abre um Claude **sem tela** (`claude -p`, como usuário comum, mesma regra do WhatsApp) numa pasta de trabalho `conteudo/video/<area>/<job>/`, com a skill do Remotion e as referências ligadas.
3. O Claude escreve a composição, renderiza com `npx remotion render` e grava o `.mp4` na mesma pasta.
4. O servidor já varre essa pasta (`midiasDeConteudo`), então o vídeo novo aparece sozinho como card ligado ao gerador. Reaproveita o que existe.
5. A tela consulta o status do job (mesmo padrão de `CONSULTA_MS`): na fila, rodando, pronto ou erro, com o log curto.

## Onde guardar o grafo
Hoje o espaço das Conversas fica no `localStorage` do navegador. Na área de vídeo o grafo (nós, ligações, prompts) vai para o servidor, em `conteudo/video/<area>/area.json`. Assim o Claude pode ler e editar a mesma área, e ela não some ao trocar de aparelho.

## Fases
1. **Espaço novo:** uma função "Criação de vídeo" no dock das Funções, ao lado das outras. Abre vazia, reaproveitando câmera, zoom, cards e bolinhas. Sem gerar nada.
2. **Nós e ligações tipadas:** Referência, Lista, Prompt e Vídeo; ligar só tipos compatíveis; salvar no servidor.
3. **Gerador Remotion:** jobs, render na VPS, saída como card de vídeo.
4. **Gerador Magnific:** MCP autenticado na VPS, nó opcional.

## Riscos e pendências
- **Render na VPS:** 2 vCPU e 8 GB. Vídeo de 30 a 60 segundos pode levar vários minutos; um job por vez no começo.
- **Chromium:** o Remotion precisa de um navegador sem tela; ele baixa o seu na primeira vez. Conferir espaço em disco.
- **Licença do Remotion:** uso comercial por empresa pode exigir licença paga. Conferir antes de usar em vídeo de cliente da Spoke.
- **Custo e segurança:** cada job gasta uso do Claude, e o Claude sem tela roda sem confirmações (mesmo risco já aceito no WhatsApp).
- **Magnific:** exige login do MCP **na VPS** (o do PC não vale lá) e créditos.
- Fonte de áudio (música e efeitos sonoros) ainda sem definição: banco livre de direitos ou gerado.

## Decisões para o Matheus
1. Aprovar as fases e começar pela 1?
2. O gerador roda Claude sem tela (automático) ou abre um terminal de conversa com o pedido pronto (você acompanha e ajusta)?
3. Checar a licença do Remotion antes da fase 3, já que o uso seria em vídeo de cliente da Spoke?

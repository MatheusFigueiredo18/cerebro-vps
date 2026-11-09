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

## Fase 3 construída (2026-11-07)
Decisões do Matheus: o botão chama **"Gerar"**; Conteúdo principal e Referência ligam direto no **Gerar vídeo**; nó opcional **Claude** (caixa de conversa) ligado no Gerar, para acompanhar e corrigir; depois de gerar, **Baixar**, sem encerrar a sessão do Claude. Licença do Remotion: construir agora, checar antes de usar em vídeo de cliente.
- Servidor: `servidor/geracao.js`, rotas `POST /api/video/:id/gerar` e `GET /api/video/:id/geracao`. Claude sem tela (mesmo `rodarSemTela` do WhatsApp), **sessão do Claude = id da sessão de vídeo** (`--session-id` na primeira vez, `--resume` depois). Um vídeo por vez (409 se outro estiver gerando), limite de 45 min.
- Projeto Remotion compartilhado em `<dados>/remotion` (fora do cérebro); saída em `conteudo/video/<id>/v<N>.mp4`, nunca sobrescreve. A conversa fica em `<dados>/video-geracao/<id>.json`.
- `conteudo/video/` não entra na varredura de mídias das Conversas (o vídeo gerado não vira card de terminal).
- Tela: nó Claude com histórico e Enter para enviar; Gerar com status (gerando há m:ss, pronto, sem vídeo novo) e Baixar; quando fica pronto, cria o nó Vídeo ligado (player, versões, Baixar).
- Testes: `teste/geracao.test.js`. Falta: rodar de verdade na VPS (Remotion, Chromium e npm instalados pelo próprio Claude no primeiro job).

## Decisões para o Matheus
1. Aprovar as fases e começar pela 1?
2. O gerador roda Claude sem tela (automático) ou abre um terminal de conversa com o pedido pronto (você acompanha e ajusta)?
3. Checar a licença do Remotion antes da fase 3, já que o uso seria em vídeo de cliente da Spoke?

## Ajustes depois do primeiro teste real (2026-11-08)
Pedido do Matheus depois de gerar o primeiro vídeo na VPS:
- Fluxo: Conteúdo principal / Referência → Prompt (opcional, texto sobre aquela mídia) → Claude (opcional) → Gerar vídeo → **Vídeo Final** (novo nome do nó Vídeo).
- Em todo card a entrada fica à esquerda e a saída à direita; Prompt e Claude ganharam entrada. O Gerar junta tudo subindo por Prompt, Claude e Lista (`cliente/video-grafo.js`, testado); o texto de um Prompt ligado numa mídia vai como "Sobre <arquivo>: <texto>".
- Só gera com um Vídeo Final ligado na saída do Gerar (o nó não é mais criado sozinho).
- O nó Claude só mostra conversa e status quando está ligado no Gerar.
- Barra de baixo no centro: **+** (menu com os nós), **tesoura** (clique ou arraste por cima de uma ligação para cortar), lápis, nota adesiva e borracha.

## Segunda rodada de ajustes (2026-11-08)
- Referência do mesmo tamanho do Conteúdo principal; mídia preenche o card (`object-fit: cover`) em Principal, Referência e itens da Lista. O Vídeo Final segue sem cortar (é o resultado).
- Lista: a mídia ligada (ou solta) nela sai do canvas e fica dentro dela (`dados.itens`); botão direito num item tira da lista.
- Barra: Seleção (padrão; arrastar no vazio seleciona por área, Shift soma), Mão, +, tesoura, lápis, nota, borracha. Botão do meio arrasta o canvas em qualquer ferramenta.
- Cards sem X: botão direito abre Duplicar, Copiar, Colar e Remover (atalhos Ctrl+D, Ctrl+C, Ctrl+V, Del; Ctrl+A seleciona tudo). A cópia fica no navegador e cola em outra sessão.
- Som: o original do iPhone estava a -41,6 dB de média (quase mudo); o gerador agora normaliza a fala (loudnorm) e confere com volumedetect antes de entregar.
- Nós Música e Efeito sonoro (áudio de Conteúdos: mp3, wav, m4a, aac, ogg, flac) ligam no Gerar, no Claude ou num Prompt; o servidor valida o áudio dentro do cérebro e passa "Música (fundo)" e "Efeito sonoro" no pedido.

## Skill de edição que decide sozinha (2026-11-08)

- Os 20 repositórios de motion graphics estão em `motion-graphics-repos/` (fora do git, README com link e objetivo de cada um).
- O que foi aproveitado virou a skill `edicao-video` do cérebro (`cerebro-exemplo/.claude/skills/edicao-video/`), instalada também em `/home/cerebro/cerebro/.claude/skills/edicao-video` na VPS. O `promptGerador` manda o Claude sem tela ler essa skill antes de tudo; clicar em Gerar conta como aprovação.
- A skill classifica o material (reel falado, montagem no ritmo, motion graphics de texto) e traz a tabela de decisões por situação: gancho dos 3 s, punch-in, apoio visual na palavra, corte seco como padrão, legenda, área segura, easing e molas, efeito sonoro por ação visível, música 11 dB abaixo da voz, master -14 LUFS e revisão por folha de contato.
- Ferramentas: `scripts/transcrever.mjs` (whisper.cpp do projeto Remotion, tempo por palavra), scripts de corte de pausa e de erro do herk-edit-kit (MIT, ajustados para o ffmpeg 6.1 da VPS) e a biblioteca `sfx/` com 109 efeitos CC0.
- Medido na VPS com o IMG_4937 (54 s, 4K HEVC 60 fps): transcrição 52 s; base 1080x1920 30 fps 108 s; cada corte na base 82 s (no 4K passava de 10 min, por isso o passo A0).
- Não adotados: HyperFrames, GSAP, Lottie e Motion como motor (um motor só, Remotion), os sons de meme do `@remotion/sfx` (licença incerta) e geração de música por IA.

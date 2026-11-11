---
name: edicao-video
description: Edita vídeos verticais 1080x1920 para Reels, Shorts e TikTok e decide sozinho as técnicas de cada momento (cortes de pausa e de erro, legendas, punch-in, apoio visual, transições, efeitos sonoros e música). Use sempre que for gerar ou ajustar um vídeo, inclusive pelo nó Gerar vídeo do painel, e quando o dono disser "edita esse vídeo", "corta as repetições", "transforma em reels", "põe legenda nesse vídeo".
---

# Edição de vídeo

Esta habilidade escolhe a técnica certa para cada situação do vídeo. O dono não escolhe skill por skill: você decide, seguindo as tabelas abaixo, e só foge delas quando o pedido disser outra coisa. O pedido do dono sempre vence os padrões daqui.

Pasta desta habilidade (no cérebro): `.claude/skills/edicao-video/`. Dentro dela: `scripts/` (transcrição e cortes) e `sfx/` (biblioteca de efeitos sonoros CC0).

## 0. De onde veio o pedido

- **Nó Gerar vídeo do painel** (Claude sem tela): clicar em Gerar já é a aprovação. Não pergunte nada, não espere ok, trabalhe até o mp4 final e grave onde o prompt de sistema mandar (`conteudo/video/<id>/v<N>.mp4`). Plano e decisões vão em arquivos dentro do projeto Remotion, não na conversa.
- **Conversa normal**: pasta `conteudo/reels/<numero>-<slug>/` com `pedido.md`, o bruto (`antes-bruto.mp4`) e o resultado (`depois-editado.mp4`). Mostre o plano de animações e espere o ok antes de renderizar.
- **Modelo base no pedido** ("Modelo base ... Extrair: ..."): o vídeo de modelo não entra no resultado. Tire quadros dele (`ffmpeg -vf "fps=2,scale=270:-1,tile=6x4"`) e, se tiver fala, transcreva para medir o ritmo; copie só o que está em "Extrair" (estilo de texto, estilo de edição, fundo, edições de cada momento, animações) e anote em `plano.md` o que tirou dele. O conteúdo continua vindo do Conteúdo principal.
- **Ajuste de um vídeo já feito** ("tira a música", "legenda maior"): mude só o que foi pedido, mantenha o resto e renderize uma versão nova.

## 1. Ferramenta: sempre Remotion

- Projeto: `/opt/core-os/dados/remotion` (fora do cérebro). Para a API leia a habilidade `remotion-best-practices` e, conforme a necessidade, `remotion-captions` (legendas) e os arquivos de `remotion-markup` (`audio.md`, `transitions.md`, `ffmpeg.md`, `light-leaks.md`, `motion-blur.md`).
- Pacotes extras do Remotion vão na **mesma versão exata** do `remotion` instalado (hoje 4.0.541), sem `^`: `npm i @remotion/transitions@4.0.541 --save-exact`.
- HyperFrames, GSAP, Lottie e Motion só se o dono pedir pelo nome. Um motor só por vídeo.
- Tudo é função do `frame`: nada de `Math.random()` (use `random('semente')`), `Date` ou transição CSS. Senão o render pisca.
- A VPS tem 2 vCPU: rascunho em meia resolução (`--scale=0.5`) para revisar, render final uma vez só.

## 2. Classifique o material e escolha o caminho

| Material ligado no Gerar vídeo | Caminho |
|---|---|
| Conteúdo principal com **fala** para a câmera | **A. Reel falado** (seção 3) |
| Vídeos ou imagens **sem fala**, com ou sem música | **B. Montagem no ritmo** (seção 4) |
| Só texto ou prompt, sem mídia | **C. Motion graphics** (seção 5) |

Para saber se há fala: transcreva (passo A1). Menos de uma palavra a cada 2 s em média é "sem fala".

Referências ligadas viram apoio visual (B-roll) dentro do vídeo. Texto de um Prompt ligado numa mídia diz o que fazer com ela ("Sobre x.mp4: ..."): obedeça.

## 3. Caminho A: reel falado (o mais comum)

**A0. Base leve**: gravação de celular costuma vir em 4K, HEVC e 60 fps, o que deixa cada corte com 2 vCPU levando cerca de 10 minutos. Antes de tudo, converta uma vez só (o bruto fica intacto):
```
ffmpeg -i <bruto> -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30" -c:v libx264 -preset veryfast -crf 17 -c:a aac -b:a 192k <pasta>/base.mp4
```
Daqui em diante use só `base.mp4`. Exceção: punch-in acima de 1,3x pede uma base em 1440x2560.

**A1. Transcrever** com tempo por palavra (whisper.cpp local, sem custo, cerca de 1 s de máquina por segundo de fala):
```
node .claude/skills/edicao-video/scripts/transcrever.mjs <pasta>/base.mp4 <pasta>
```
Gera `captions.json` (para legendas) e `palavras.json` (para os cortes).

**A2. Cortar pausas** (determinístico):
```
node .claude/skills/edicao-video/scripts/cut-silences.mjs <pasta>/palavras.json --video <pasta>/base.mp4 --apply --output <pasta>/sem-pausas.mp4
```
Rode primeiro sem `--apply` e leia `removed` na saída: abaixo de 0,3 s não vale um novo encode, siga com `base.mp4` (e com `palavras.json` no lugar do `.silence-transcript.json`). Padrão `--gap 0.55`. Reel rápido: `--gap 0.35`. Fala calma, aula ou emoção: `--gap 0.8`. Nunca acelere a voz.

**A3. Cortar erros** (repetição, gaguejo, frase abandonada, regravação):
```
node .claude/skills/edicao-video/scripts/find-cut-candidates.mjs <pasta>/palavras.silence-transcript.json --out-dir <pasta>
```
Leia cada candidato no contexto e decida você. Corte gaguejo e frase recomeçada; quando a frase aparece duas vezes, fique com a **última** tomada limpa. **Não corte** repetição de ênfase ("nunca, nunca"), listas e retórica. Grave as aprovadas em `cortes.json` (`{ "cuts": [{ "start", "end", "reason" }] }`) e aplique:
```
node .claude/skills/edicao-video/scripts/apply-cuts.mjs <pasta>/palavras.silence-transcript.json --cuts <pasta>/cortes.json --video <pasta>/sem-pausas.mp4 --output <pasta>/limpo.mp4 --apply
```
Corte entre frases, nunca no meio de uma (cortar um "é..." colado na palavra seguinte engole a palavra). Nenhum corte necessário é um resultado válido. Depois do corte, **transcreva de novo o `limpo.mp4`** e use esses tempos daqui em diante: nunca misture tempo do bruto com vídeo cortado.

**A4. Normalizar a voz** antes de montar (gravação de celular vem baixa):
`ffmpeg -i limpo.mp4 -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 voz.mp4`

**A5. Planejar** (escreva `plano.md` no projeto): gancho dos 3 primeiros segundos, contexto, itens, fechamento e chamada final. Cada plano precisa de um motivo para existir. Depois monte a composição seguindo as decisões da seção 6.

**A6. Legendas**: `createTikTokStyleCaptions` do `@remotion/captions` com `combineTokensWithinMilliseconds` perto de 800 (1 a 3 palavras por bloco), no estilo da seção 7.

## 4. Caminho B: montagem no ritmo

- Ache o BPM e o primeiro tempo da música (ffmpeg ou `getAudioData` do `@remotion/media-utils`; confira olhando a forma de onda dos graves). `quadros_por_tempo = (60 / BPM) * fps`; arredonde o tempo acumulado, não o passo, para não escorregar.
- Corte em **frases musicais** (a cada 2, 4 ou 8 tempos), não em todo tempo. O maior momento visual cai no **drop**.
- Arco: abertura com planos longos, desenvolvimento encurtando, clímax com cortes de 1 a 2 tempos, final com um plano parado para respirar.
- Sem música ligada: ritmo pela ação das imagens, planos de 1,2 a 2,5 s, e nenhuma trilha inventada.

## 5. Caminho C: motion graphics a partir de texto

- Uma ideia por cena, tipografia grande (cerca de 130 px no display), no máximo 3 famílias de fonte, uma cor de destaque que significa algo (a resposta, o que mudou).
- Um objeto que atravessa as cenas e muda de papel é melhor que uma pilha de cartões. Toda transição é motivada por algo na tela.
- Reserve um único momento herói por vídeo e construa até ele.

## 6. Decisões por situação (use sem perguntar)

| Situação no vídeo | Técnica |
|---|---|
| Primeiro quadro | Imagem forte já no quadro 0 (rosto falando ou a evidência). Nunca preto, nunca logo de abertura. A fala começa em até 0,1 s |
| Primeiros 3 s | O motivo para assistir até o fim aparece na tela até o segundo 3, e funciona sem som |
| Primeiro corte | Entre 0,6 e 1,0 s, na primeira palavra forte |
| Frase de virada, ênfase ou chamada final | **Punch-in**: corte seco para um enquadramento mais fechado do rosto (escala 1,15 a 1,3, sem perder testa nem queixo) |
| Fala cita algo mostrável e há Referência ligada | **Apoio visual**: a referência entra no substantivo falado (até 0,15 s antes da palavra), em tela cheia ou dividida (apoio em cima, y 0 a 880, rosto embaixo). Cada referência uma vez só |
| Apoio é imagem parada | Movimento lento (zoom de 100% para 108% no plano); nada fica congelado |
| Lista falada ("primeiro, segundo...") | Cada item ganha seu plano ou cartão, entrando na palavra do item |
| Número, preço, resultado dito | Número grande animado contando até o valor dito. Nunca invente número |
| Troca de assunto | Corte seco é o padrão (90% dos cortes). Transição só com motivo: match cut (formas parecidas), whip com desfoque de movimento para energia, J-cut (áudio do próximo entra 4 a 12 quadros antes) |
| Momento de impacto | Rampa de velocidade só em apoio visual (nunca na fala), com o quadro mais lento no tempo da música |
| Fala calma ou emocionante | Menos cortes, segure o plano, legenda mais discreta |
| Tela de texto para ler | Legenda sai para uma área livre, não some |
| Ritmo geral | Plano médio de 1,1 a 1,4 s, nenhum acima de cerca de 3 s sem algo novo. O rosto fica na tela cerca de 45% do tempo e nunca some por mais de 3,5 s |
| Final | Termina logo depois da última palavra. Sem cartão de encerramento, salvo pedido |

## 7. Padrões visuais

- **Área segura 1080x1920**: texto entre x 90 e 930, y 200 e 1600 (direita e rodapé ficam para a interface do Instagram). Nada importante a menos de 60 px da borda.
- **Legenda**: fonte bold condensada ou Montserrat ExtraBold em caixa alta, 62 a 72 px, 1 a 3 palavras por bloco, troca seca sem pulo, aparecendo 2 quadros antes da palavra. Todas no **mesmo** estilo: caixa escura com borda fina clara (lê em fundo claro e escuro). Cor só no bloco inteiro e em 25 a 45% dos blocos: vermelho para erro ou perda, verde para ação ou ganho, uma cor de marca para o conceito. **Nunca sobre a boca ou o queixo**, principalmente no primeiro segundo. Estilo do dono em `memoria/estilo-de-conteudo.md` vence este padrão.
- **Easing**: entrada `Easing.bezier(0.16, 1, 0.3, 1)`, saída `Easing.bezier(0.6, 0, 0.9, 0.35)`, mudança de estado `Easing.bezier(0.65, 0, 0.35, 1)`. Linear só para movimento contínuo (giro, deriva).
- **Molas** (`spring`): padrão damping 14, stiffness 140, mass 0.8; estalo (selo, check) damping 10, stiffness 220; elástica só uma vez por vídeo.
- **Tempos**: palavras em sequência a cada 0,09 s, itens de lista a cada 0,2 s. Saída dura metade da entrada. Texto parado para leitura por pelo menos 1 s, mais 0,25 s por palavra acima de três. Texto não se mexe enquanto é lido.
- Um ponto de atenção por quadro. Anime `transform` (escala e posição), não `top`/`left`.
- Logo de marca só o arquivo verdadeiro (do dono ou do site oficial). Sem arquivo, escreva o nome em texto. Nunca desenhe um logo de memória.

## 8. Som

Prioridade: **voz > efeitos > música**. Nada de som sintetizado em código (oscilador, bipe): só arquivos gravados.

- **Voz**: já normalizada no A4. Nunca mude o áudio do Conteúdo principal, nunca faça fade na última palavra.
- **Música**: só o arquivo ligado no nó Música (ou pedido pelo nome). Fica cerca de 11 dB abaixo da voz (faixa 9 a 14 dB), baixa ainda mais durante a fala (ducking com `volume` por quadro no `<Audio>`), entra e sai com fade. Os primeiros 1 a 2 s podem ser mais baixos. Sem nó Música: sem música.
- **Efeitos sonoros**: ligados no nó Efeito sonoro têm prioridade. Faltando efeito para uma ação, use a biblioteca `sfx/` desta habilidade (copie o arquivo para `public/` do projeto). Comece pelo kit `sfx/kit/`; alternativas por categoria em `sfx/manifest.json`, todas CC0.

| Ação visível | Categoria em `sfx/` | Quando toca |
|---|---|---|
| Movimento ou deslize | `whoosh` | 2 quadros antes do movimento, duração parecida com ele |
| Algo aparece (selo, cartão) | `pop` | no quadro em que aparece |
| Clique, interface pequena | `click`, `tick` (bem baixo) | no quadro |
| Revelação principal | `impact` | o efeito mais alto, uma ou duas vezes no vídeo |
| Construindo tensão | `riser` | **termina** no impacto seguinte |
| Acerto, check | `ding` ou `pop` | no quadro |
| Erro, falha técnica | `glitch` | no quadro |
| Digitação | `typing` | baixo, cortado na duração |
| Transição de cena | `transition` ou `whoosh` curto | 2 quadros antes |

Efeito só onde há ação visível, não em todo corte. Varie os arquivos de uma mesma categoria (lista não pode soar como loop). Evite laser, plop descendo e efeito em todo corte. O efeito nunca cobre a primeira palavra.

- **Master**: cerca de -14 LUFS, pico real até -1.5 dBTP, medido no **mp4 final**: `ffmpeg -i final.mp4 -af ebur128=peak=true -f null - 2>&1 | tail -12`. Fora disso, ajuste e renderize de novo.

## 9. Revisão antes de entregar

Você não assiste o vídeo, mas olha quadros. Nunca diga que ficou bom sem ter olhado.

1. Rascunho em meia resolução. Extraia quadros nos momentos do plano (0,3 s depois de cada entrada) e monte uma folha de contato: `ffmpeg -i rascunho.mp4 -vf "fps=2,scale=270:-1,tile=6x4" folha-%02d.png`. Abra as imagens.
2. Confira: quadro 0 não é preto; legenda não cobre boca nem queixo (veja os primeiros 2,5 s quadro a quadro); texto dentro da área segura e legível pequeno; um foco por quadro; nada sobreposto sem querer nas transições; nenhum quadro vazio entre cenas.
3. Som: transcreva o final de novo e compare as palavras em cada corte (palavra engolida é defeito); meça LUFS e pico; `volumedetect` com `mean_volume` acima de -30 dB.
4. Corrija, renderize, olhe de novo. Pare quando uma passada inteira não achar nada.
5. Na resposta, diga o que conferiu e o que não deu para conferir (você não ouve: só mede).

## 10. Erros que custaram tempo (não repita)

- Codificar cada trecho separado e juntar depois desalinha boca e voz. Corte num passe só (os scripts já fazem trim e concat juntos).
- Página inteira encolhida para o celular é ilegível: recorte o trecho e destaque na palavra falada.
- Interface pequena flutuando num fundo vazio denuncia edição de IA: amplie até encher o painel.
- Cortar enchimento no meio da frase engole a palavra vizinha. Menos cortes, todos entre frases, soam melhor.
- Medir volume num arquivo mono dá 3 dB a menos: meça o estéreo entregue.

## Origem

Destilado dos repositórios em `motion-graphics-repos/` do projeto cerebro-vps (2026-11-08): herk-edit-kit (fluxo de reels, números de ritmo e legenda, scripts de corte, MIT), motion-graphics de Barty-Bart (passe de som e biblioteca CC0 em `sfx/`, MIT), motion-design-skills da iart-ai (corte no ritmo), claude-motion (easing, molas, revisão por folha de contato), habilidades oficiais do Remotion. As licenças estão em `scripts/LICENSE-herk-edit-kit.txt`, `sfx/LICENSE-motion-graphics.txt` e `sfx/LICENSES.md`.

---
name: edicao-video
description: Edita gravações brutas em vídeos verticais 1080x1920 prontos para Reels, Shorts e TikTok, tirando repetições e pausas e colocando legenda, animações e música. Use quando o dono disser "edita esse vídeo", "corta as repetições", "transforma em reels", "põe legenda nesse vídeo".
---

# Edição de vídeo

## Pasta

`conteudo/reels/<numero>-<slug>/` com `pedido.md`, a gravação original (`antes-bruto.mp4`) e o resultado (`depois-editado.mp4`) ao lado.

## Passo a passo

1. Crie a pasta, guarde o bruto e escreva o `pedido.md`.
2. Transcreva com marcação de tempo **por palavra** (por exemplo, Whisper com timestamps de palavra).
3. Quando a mesma frase aparece várias vezes, fique com a **última** versão: as primeiras costumam ser ensaio.
4. Corte pausas e tropeços, deixando uma folga mínima (cerca de 0,1 s) entre cortes para a fala não ficar engolida.
5. Escreva o roteiro de animações: o que aparece, em que segundo, por quanto tempo e o quanto cobre da tela. **Mostre ao dono e só execute depois do ok.**
6. Aplique legendas no estilo do dono (`memoria/estilo-de-conteudo.md`), efeitos sonoros curtos nas animações e música de fundo baixa.
7. Exporte em 1080x1920 com ffmpeg e salve como `depois-editado.mp4` na mesma pasta do bruto.

## Exemplo pronto

`conteudo/reels/01-tres-erros-de-iniciante/`.

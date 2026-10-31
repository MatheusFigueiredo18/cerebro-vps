---
name: thumbnail
description: Três capas de vídeo em JPG 1280x720, de conceitos distintos, para o dono comparar qual atrai mais. Acione em frases como "preciso de uma capa pro vídeo novo", "monta umas opções de miniatura pro YouTube", "quero testar três capas", "dá uma melhorada nessa thumbnail".
---

# Thumbnail

Cada vídeo ganha sua pasta, `conteudo/thumbnails/<slug-do-video>/`, onde ficam o `pedido.md` (frase do pedido, canal, etapas, resultado) e as três opções `a.jpg`, `b.jpg`, `c.jpg`.

## Como fazer

1. Abra a pasta e escreva o `pedido.md` antes de gerar qualquer imagem.
2. Leia o roteiro (ou a descrição) e resuma a promessa do vídeo em até quatro palavras.
3. Imagine três caminhos de promessa que não se pareçam: por exemplo, o resultado final, o erro que o público comete, uma pergunta que dá curiosidade. Mudar apenas a cor de fundo não cria uma opção nova.
4. Gere a cena usando o gerador de imagens que estiver configurado; a chave dele mora em `/opt/core-os/.env`. A base é a foto do rosto do dono guardada em `assets/` (sem ela, peça uma).
5. Finalize cada opção: texto aplicado por cima com fonte de verdade, ajuste de contraste, recorte em 1280x720, exportação em JPG.
6. Apresente as três e registre no `pedido.md` a escolhida.

## Evite

- Enquadramento que corta queixo, testa ou olhos.
- Setas, círculos ou emojis decorativos que não apontam para nada.
- Letras feitas pelo gerador de imagem, que costumam sair erradas.
- Passar de quatro palavras.

## Referência

Há um caso pronto em `conteudo/thumbnails/rotina-da-manha/`.

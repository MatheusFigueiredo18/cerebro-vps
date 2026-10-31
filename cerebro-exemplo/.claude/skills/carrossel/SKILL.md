---
name: carrossel
description: Cria carrosséis verticais 1080x1350 para Instagram e afins, do zero ou recriando um de referência em português. Use quando o dono disser "faz um carrossel sobre...", "recria esse carrossel", "transforma esse post em carrossel", "quero um carrossel de 8 páginas sobre...".
---

# Carrossel

## Dois modos

- **Criar:** o dono dá um tema (e às vezes o número de páginas). Você escreve o roteiro, mostra e depois produz.
- **Recriar:** o dono manda páginas de um carrossel de referência. Você refaz em português, com a identidade do dono.

## Pasta da entrega

`conteudo/carrosseis/AAAA-MM-DD-<tema>/`, com:

- `pedido.md`: a frase do pedido, o canal, as etapas feitas e o resultado;
- `original/`: as páginas de referência (só no modo recriar);
- `build/`: um HTML por página;
- `entrega/`: os PNGs ou JPGs finais e `legenda.md` com o texto do post.

## Passo a passo

1. Crie a pasta e o `pedido.md` antes de qualquer outra coisa.
2. **Recriar:** guarde as referências em `original/`. Tire a paleta real das imagens (amostre as cores, não chute), escolha a fonte instalada mais parecida e meça a diagramação em proporções (margens, tamanho do título, posição dos blocos em porcentagem da página).
3. Escreva o roteiro: uma ideia por página. Mostre ao dono antes de produzir se o carrossel tiver mais de 5 páginas.
4. Monte cada página como HTML em `build/`, 1080x1350. **O texto é sempre HTML e CSS.** Imagem gerada por IA só entra como ilustração, nunca com letras dentro (geradores erram letras).
5. Exporte cada página para PNG com um navegador sem interface (por exemplo Chromium em modo headless com a janela em 1080x1350).
6. Compare com a referência lado a lado. Ajuste e exporte de novo até ficar fiel.
7. Coloque os finais em `entrega/` com nomes `01.png`, `02.png`... e escreva a legenda em `entrega/legenda.md`.

## Critérios editoriais

- A primeira página vende o carrossel: promessa clara, poucas palavras.
- Cada página carrega uma ideia só.
- A última termina com uma chamada para ação curta ("Salva pra depois", "Manda pra quem precisa").
- Na recriação, toda menção ao perfil original vira o perfil do dono.

## Exemplo pronto

`conteudo/carrosseis/2026-10-20-habitos-que-rendem/` (14 páginas em `entrega/`).

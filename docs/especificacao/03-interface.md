# 03 · Interface

> O que a pessoa vê e faz. Aparência, textos, ícones e animações são livres (ver 08). Os comportamentos abaixo são o que precisa existir para o produto ser equivalente.

## 1. Princípios

- **Aplicação de página única**, carregada sem etapa de build, falando só com a API do 01 e o WebSocket do 02.
- **Tudo em português do Brasil**, linguagem simples, para quem nunca mexeu com servidor.
- **Tema claro e escuro.** Começa pela preferência do sistema; a escolha manual é lembrada no navegador.
- **Preferências locais** (posições, pastas abertas, tema, painéis fechados) ficam no armazenamento local do navegador. Se ele falhar ou estiver indisponível, a interface segue funcionando com os padrões.
- **Qualquer resposta 401** da API, em qualquer momento, volta para a tela de login.
- **Atualização por consulta periódica:** estado das conversas a cada 2 s; árvore de arquivos a cada 6 s (só redesenha se mudou); configurações a cada 3 s enquanto abertas.
- Abaixo de cerca de 900 px de largura, os painéis laterais ficam mais estreitos. Respeitar a preferência de movimento reduzido do sistema.

## 2. Mapa da tela

| Região | Posição | Conteúdo |
|---|---|---|
| Canvas | tela inteira, ao fundo | cards da conversa ativa ou da mesa |
| Árvore de arquivos | painel flutuante à esquerda, pode ser escondido | pastas e arquivos do cérebro |
| Conversas | coluna à direita | caixa "comece aqui" e lista de conversas |
| Dock | barra flutuante embaixo, no centro | ações principais |
| Sobreposições | por cima de tudo | grafo, seletor de motor, configurações, conteúdos, visor, aviso de envio, indicador de zoom |

## 3. Login

- Ao abrir, a interface pergunta `GET /api/eu`. Logado: entra direto. Senão: tela de login.
- Tela de login: marca do produto, frase curta de apresentação, um campo de senha (com foco automático) e um botão de entrar.
- Enviar faz `POST /api/login`. Sucesso: esconde o login e carrega o painel. Erro: mostra a mensagem `erro` vinda do servidor (senha errada ou limite de tentativas) e seleciona o texto do campo para nova tentativa.
- Sair (dock) faz `POST /api/logout` e recarrega a página.

## 4. Dock

Botões, nesta ordem lógica, com dica ao passar o mouse:

1. Mostrar ou esconder a árvore (estado lembrado).
2. Abrir ou fechar o grafo.
3. Nova conversa (abre o seletor de motor).
4. Abrir conteúdos.
5. (separador)
6. Centralizar o canvas em todos os cards.
7. Alternar tema (o ícone indica o tema para o qual vai mudar).
8. Configurações.
9. Sair.

Os botões de árvore, grafo, conteúdos e configurações ficam visualmente "ligados" quando o painel correspondente está aberto.

**Tecla Esc** fecha, nesta prioridade, o primeiro que estiver aberto: visor, seletor de motor, conteúdos, configurações, grafo.

## 5. Canvas

### 5.1 Espaços

- Existe um espaço por conversa e um espaço "mesa" (sem conversa selecionada).
- Cada espaço guarda, no navegador: posição de cada card, lista de arquivos abertos e câmera (deslocamento e zoom).
- A conversa ativa (ou a mesa) também é lembrada. Se a conversa lembrada não existe mais, volta para a mesa.

### 5.2 Câmera

- **Arrastar o fundo** desloca a vista.
- **Rolar** (roda ou trackpad) desloca a vista, exceto quando o ponteiro está sobre o corpo rolável de um card ou sobre o terminal (aí rola o conteúdo).
- **Ctrl ou Cmd mais rolagem** (inclui pinça no trackpad) dá zoom ancorado no ponteiro, de 20% a 200%.
- Um indicador mostra a porcentagem de zoom por menos de um segundo após cada mudança.
- O fundo tem uma grade de pontos que acompanha deslocamento e zoom.
- **Centralizar:** enquadra todos os cards, com margem, descontando a coluna de conversas e a árvore (se aberta), com uma transição suave. Zoom máximo do enquadramento: 100%.
- Na primeira visita a um espaço (sem câmera salva), centraliza sozinho.

### 5.3 Cards

- Cabeçalho com ícone do tipo, título, subtítulo discreto, elementos extras (selo de status, botões) e, quando aplicável, botão de fechar.
- **Arrastar pelo cabeçalho** move o card (o deslocamento respeita o zoom). Ao soltar, a posição é salva no espaço.
- O card tocado vai para a frente e ganha destaque de foco.
- Card de arquivo fechado sai da lista de abertos e perde a posição salva.

### 5.4 Mesa

- Sem arquivos abertos, mostra um cartão de boas-vindas explicando que cada conversa é um agente real rodando no servidor com acesso à árvore, e um botão de nova conversa.
- Arquivos podem ser abertos como cards na mesa também.

### 5.5 Card de arquivo

Abrir um arquivo da árvore (que não seja mídia) ou do grafo:

- Se já está aberto no espaço: foca e centraliza nele.
- Senão: entra na lista de abertos, aparece perto do centro da vista, com um pequeno deslocamento em cascata para não empilhar exatamente.
- Tamanhos aproximados: imagem 380 por 430; vídeo 340 por 600 (vertical); texto 560 por 620.
- Conteúdo por tipo (pela extensão):
  - imagem (png, jpg, jpeg, webp, gif, svg): a imagem;
  - vídeo (mp4, mov, webm, m4v): player com controles, carregando só os metadados;
  - texto (extensões `.md`, `.txt`, `.json`, `.sh`, `.js`, `.csv` e `.canvas`): Markdown renderizado (§5.6) quando for `.md`; os demais como texto pré-formatado;
  - outros: tratados como texto pré-formatado no card.
- O item correspondente é destacado na árvore.

### 5.6 Renderização de Markdown

- O bloco de metadados no topo (entre linhas `---`) é retirado e mostrado à parte, como texto cru, num bloco discreto.
- Wikilinks `[[alvo]]` e `[[alvo|rótulo]]` viram texto em negrito (o rótulo, se houver).
- Wikilinks de incorporação `![[arquivo]]` viram imagem.
- Imagens com caminho relativo são resolvidas a partir da pasta da nota, passando pela rota de arquivo; endereços absolutos, `http(s)` e `data:` ficam como estão.
- Tabelas e listas de tarefas no estilo GFM.
- Por segurança, elementos de script, iframe e object são removidos do HTML gerado. O resto do texto vindo de arquivos é sempre escapado antes de entrar na página.

### 5.7 Espaço de uma conversa

- **Card do terminal** (não fechável), na origem do espaço, cerca de 860 por 540. Título = título da conversa; subtítulo = nome do motor. Selo de status: "trabalhando" (destacado), "pronto" (processo vivo) ou "pausado" (sem processo).
- **Cards de subagentes**, numa fileira abaixo do terminal, centralizada, cada um com cerca de 290 de largura. Mostram a descrição, um selo de status (trabalhando, concluído, parado), a última ação e o tipo de agente. Não são fecháveis. São criados uma vez e só têm o conteúdo atualizado depois.
- **Cards de mídia gerada**, à direita do terminal, em grade de 3 colunas (cerca de 280 de largura; vídeos mais altos). Não fecháveis.
- **Ligações:** linhas curvas tracejadas do terminal até cada card filho (saindo de baixo para os subagentes, saindo da lateral para as mídias). Quando o filho está trabalhando, a linha fica contínua e na cor de destaque. As linhas acompanham o arraste dos cards.
- Arquivos abertos naquele espaço aparecem junto.

### 5.8 Terminal no navegador

- Emulador de terminal com ajuste automático ao tamanho do card, suporte a Unicode moderno (largura correta de emojis e símbolos) e histórico de rolagem de alguns milhares de linhas, fonte monoespaçada e fundo escuro.
- Ao montar o card, conecta o WebSocket (02, §3.5) com o tamanho atual e, ao abrir, envia o tamanho real. A tela é limpa antes de cada conexão (o servidor reenvia o buffer).
- Teclado vira mensagens `i`; mudanças de tamanho (inclusive redimensionar a janela ou o card) viram mensagens `r`.
- Clicar no card reconecta se a conexão caiu e dá foco ao terminal. É assim que a pessoa retoma uma conversa encerrada.
- O mesmo terminal é reaproveitado ao trocar de conversa e voltar (não cria outro emulador).

### 5.9 Conversa do WhatsApp

- No lugar do terminal aparece um **card de histórico** (não fechável) com subtítulo indicando WhatsApp.
- Mostra a conversa como balões: mensagens da pessoa à direita (texto puro, com quebras de linha), respostas do agente renderizadas como Markdown, ações do agente como linhas discretas. Cada balão tem autor e hora.
- Vazio: aviso de que os balões surgirão quando houver a primeira resposta.
- Atualiza junto com o estado (a cada 2 s), mas só redesenha quando muda o número de itens ou o tamanho do último texto. Rola para o fim ao redesenhar.
- Botão **continuar no terminal**: se o agente ainda está respondendo pelo WhatsApp, avisa que é preciso esperar e não faz nada. Senão, marca a conversa como "assumida" (lembrado no navegador) e troca o card de histórico pelo terminal. A partir daí, o servidor abre outra conversa para a próxima mensagem do WhatsApp (ver 04, §4).

## 6. Coluna de conversas

### 6.1 Comece aqui

- Caixa recolhível no topo da coluna (estado lembrado), alimentada por `GET /api/primeiros-testes`. Some se a lista vier vazia.
- Cada item mostra ícone, título e uma linha do que faz. Clicar abre uma conversa nova com o Claude Code e o pedido pré-escrito.

### 6.2 Lista

- Botão de nova conversa no topo (abre o seletor de motor).
- Vazia: mensagem convidando a clicar em nova conversa.
- Mais recente primeiro. Cada item, recolhido, mostra:
  - ponto de status (trabalhando, ativo, inativo);
  - selo de WhatsApp se veio de lá;
  - título;
  - logotipo do motor;
  - progresso "feitos/total" do checklist, quando há checklist.
- A conversa ativa aparece expandida, com:
  - o resumo (primeira linha de citação da nota) ou, sem nota, uma frase dizendo que o resumo aparece quando o agente criar a nota;
  - contagem de pendentes (ou indicação de que tudo foi feito) e o checklist, com pendentes primeiro e feitos depois, marcados;
  - quantidade de subagentes e quantos estão trabalhando;
  - a ação atual;
  - botões **Focar** (centraliza o terminal e dá foco a ele) e **Encerrar**.
- Clicar num item não ativo troca o canvas para aquela conversa.
- **Encerrar** pede confirmação (avisando que a conversa continua salva no histórico do motor), chama `DELETE`, fecha o WebSocket, descarta o terminal local e volta para a mesa.

### 6.3 Seletor de motor (nova conversa)

- Janela sobre o canvas com uma opção por motor: logotipo, nome, fabricante e estado.
  - Instalado: indica se é o último usado (o padrão) ou se está pronto. Clicar grava esse motor como padrão (`POST /api/config/motores`) e abre a conversa nele.
  - Não instalado: convida a instalar. Clicar abre uma conversa **com o Claude Code** já com um pedido pré-escrito para instalar aquele motor no servidor, conferir a versão e guiar o login.
- Clicar fora fecha.

### 6.4 Abrir uma conversa nova

Fecha o grafo e o seletor, chama `POST /api/conversas` (com um tamanho inicial de cerca de 104 por 30 e o pedido, se houver), atualiza o estado, troca o canvas para ela e foca o terminal.

## 7. Árvore de arquivos

- Painel com título, botão de recarregar e a árvore de `GET /api/arvore`.
- Pastas com seta de expandir; o estado aberto ou fechado de cada pasta é lembrado (por padrão `conteudo` começa aberta).
- Ícone por tipo (pasta, documento, imagem, vídeo).
- Clicar num arquivo:
  - imagem ou vídeo: abre no **visor** (§10), navegando entre as mídias da **mesma pasta** (sem subpastas), na ordem natural;
  - outro: abre como card no canvas (§5.5).
- O arquivo aberto fica destacado.
- A cada 6 s a árvore é relida; só é redesenhada se o conteúdo mudou (preservando o que está expandido).

## 8. Grafo

- Sobreposição de tela inteira, desenhada em canvas de bitmap com densidade de pixels correta.
- Dados de `GET /api/grafo`. Cores por tipo de nó (pasta, nota, mídia), com uma legenda.
- **Simulação de forças:** repulsão entre nós próximos, molas nas ligações (mais curtas para ligações de pasta, mais longas para links), leve atração ao centro, amortecimento e limite de velocidade. Energia que decai com o tempo.
- **Abrir:** posição inicial em espiral (ou a posição anterior, se o nó já existia numa abertura anterior), centenas de passos de simulação antes de mostrar (para não "explodir" na tela) e enquadramento automático na primeira vez, descontando os painéis.
- Raio do nó cresce com o número de ligações (pastas um pouco maiores).
- **Rótulos:** só pastas da raiz aparecem sempre; os demais aparecem com zoom alto ou ao passar o mouse.
- **Passar o mouse** sobre um nó: destaca ele e os vizinhos, apaga os demais, realça as ligações dele e mostra uma etiqueta com o caminho completo perto do ponteiro.
- **Arrastar um nó** reposiciona e reaquece a simulação. **Arrastar o fundo** desloca. **Rolar** dá zoom ancorado no ponteiro, de 20% a 400%.
- **Clicar** (sem arrastar) num nó que não é pasta fecha o grafo e abre o arquivo (§7).
- A simulação continua avançando mesmo com a aba em segundo plano, em ritmo menor.

## 9. Conteúdos

Folha grande sobre o canvas, com cabeçalho (título, subtítulo, trilha de navegação, voltar), botão de enviar arquivos e botão de fechar.

### 9.1 Raiz

- Dados de `GET /api/conteudos`.
- Uma seção por categoria com itens, com o rótulo da categoria e a contagem. Categorias conhecidas ganham rótulos bonitos (carrosséis, reels, thumbnails, WhatsApp, enviados, vídeos, imagens); as demais têm a primeira letra maiúscula e hífens trocados por espaço.
- Cada item é um cartão com a **capa** (imagem, ou quadro do vídeo via `/api/capa` com selo de play, ou ícone de pasta ou documento se não há capa), o título amigável e uma linha com a quantidade de arquivos (ou a extensão, para arquivo solto) e a data.
- **Título amigável:** tira a extensão (de arquivos), tira o prefixo de data `AAAA-MM-DD-` se houver, troca hífens e sublinhados por espaço e põe a primeira letra maiúscula. **Data:** dia e mês do prefixo, ou dia e mês abreviado do `mtime`.
- Nenhum item em nenhuma categoria: mensagem dizendo que nada foi gerado ainda e sugerindo pedir numa conversa ou enviar arquivos.
- Clicar numa pasta abre a pasta; clicar num arquivo solto abre no visor.

### 9.2 Pasta aberta

- Dados de `GET /api/pasta`. Trilha "Conteúdos › categoria", botão de voltar para a raiz, contagem de arquivos e dica de que dá para arrastar arquivos para enviar.
- Arquivos agrupados pela subpasta relativa (subpastas aninhadas mostradas como "a / b"). Ordem dos grupos: arquivos da própria pasta primeiro, depois a subpasta `entrega`, depois as demais em ordem alfabética.
- Cada arquivo vira uma miniatura quadrada (imagem, quadro de vídeo com selo de play, ou ícone com a extensão), com nome, tamanho legível (KB, MB, GB) e um botão de baixar que não abre o visor.
- Clicar abre o visor com **todos** os arquivos da pasta, na ordem dos grupos, começando no clicado.
- A folha lembra a última pasta aberta enquanto a página está carregada.

### 9.3 Envio de arquivos

- Pelo botão (seletor de arquivos, vários de uma vez) ou arrastando arquivos do computador sobre a folha (uma camada indica onde vão cair: na pasta aberta, ou em Enviados na raiz). A camada não pisca ao passar sobre elementos internos.
- Destino: a pasta aberta, ou `conteudo/enviados` na raiz.
- Envia **um por vez**, com `POST /api/enviar`, mostrando um aviso flutuante com "n de total", nome e barra de progresso.
- No fim, o aviso mostra quantos foram enviados com sucesso e o destino, e some após alguns segundos. A folha e a árvore são atualizadas.

## 10. Visor

- Sobreposição com fundo desfocado e escuro, cabeçalho com nome do arquivo, informação ("posição de total", ou o caminho da pasta quando é um só), botão de baixar e de fechar.
- Setas laterais de anterior e próximo, com volta circular; escondidas quando há um só arquivo. Teclas de seta funcionam, exceto quando o foco está num campo de texto ou no terminal. Esc fecha.
- Conteúdo: imagem ajustada à tela; vídeo com controles e reprodução automática; texto renderizado (§5.6); outros tipos com uma mensagem de "sem prévia" e botão de baixar.
- Fechar limpa o conteúdo (para o vídeo parar).

## 11. Configurações

Folha lateral com seções. Ao abrir, carrega em paralelo `GET /api/config`, `GET /api/config/motores` e `GET /api/extras`.

### 11.1 Motor de IA

- Duas escolhas, cada uma com um botão por motor (logo e nome, com indicação de não instalado): motor das conversas novas do painel e motor do WhatsApp. Clicar grava (`POST /api/config/motores`) e redesenha.
- Uma observação esclarece o alcance da escolha: conversas já existentes não mudam de motor, só as futuras são afetadas; do lado do WhatsApp, mudar o motor faz a próxima mensagem cair numa conversa nova.
- Uma linha por motor com a dica de login.

### 11.2 WhatsApp

- Selo de estado: conectado, conectando, desconectado ou indisponível.
- Número conectado formatado no padrão brasileiro com código do país, DDD e hífen, mais o nome de perfil quando conectado.
- Linha descrevendo o fluxo (WhatsApp, n8n e o motor do WhatsApp).
- Mensagem de erro da Evolution, se veio.
- **Conectar:** desabilitado se a Evolution não está configurada. Chama `conectar`; mostra o QR e instruções curtas de onde ler no celular, dizendo que o código se renova sozinho. Se não veio QR nem conectou, alerta com o erro.
- Com o QR na tela: botão para gerar outro (com `novo: true`). Em estado "conectando" sem QR na tela: botão de zerar e gerar outro.
- Conectado: botão de desconectar, com confirmação.
- **Com o código de pareamento exibido,** a interface chama `GET /api/config/whatsapp/qr` de 3 em 3 s. Três desfechos: estado ainda `connecting`, e a imagem é substituída apenas se o servidor mandou um código diferente; estado `open`, e a seção é redesenhada já conectada; estado `close`, e a seção é redesenhada com um alerta de expiração convidando a pedir um código novo.
- **Sem QR na tela,** a cada 3 s redesenha tudo, **exceto** quando a pessoa está digitando num campo da folha ou o campo de número novo tem texto (para não apagar o que ela digita).
- O ciclo para quando a folha fecha.

### 11.3 Quem pode dar ordens

- Caixa marcável para o chat "Você" do número conectado (grava ao mudar).
- Lista dos números autorizados, formatados, cada um com botão de tirar.
- Campo para um número novo (teclado de telefone no celular), com botão de autorizar e Enter. Aceita só se tiver de 10 a 13 dígitos depois de tirar o que não é dígito; senão destaca o campo como inválido (o destaque some ao digitar).
- Toda mudança envia a lista completa para `POST /api/config/whatsapp/acesso` e redesenha com o que o servidor devolveu.
- Dica explicando o caso típico: conectar o número da empresa e autorizar o número pessoal.

### 11.4 Aplicações extras e Conexões (MCP)

- Uma lista para cada, com logo, nome e benefício. Instalado: selo de instalado. Não instalado: botão de pedir na conversa, que fecha as configurações e abre uma conversa do Claude Code com o `pedido` pré-escrito.
- Dicas explicando que basta apertar Enter na conversa, e que chaves e logins são pedidos na conversa e guardados fora do cérebro.

### 11.5 n8n

- Explica que o n8n se conecta ao agente por MCP. Botão para abrir o n8n (só se `n8n.url` existe, em nova aba) e botão para pedir a conexão numa conversa.

### 11.6 Endereço

- Mostra o endereço atual do painel. Explica que dá para usar um domínio próprio com HTTPS e oferece um atalho para iniciar uma conversa em que o agente conduz essa configuração de subdomínio e certificado.

## 12. Estados vazios e falhas visíveis

| Situação | O que a pessoa vê |
|---|---|
| Sem conversas | mensagem na lista e cartão de boas-vindas na mesa |
| Nota de status ainda não existe | título padrão e frase explicando que o resumo aparece em breve |
| Motor não instalado | no seletor, convite a instalar; no terminal, aviso impresso pelo servidor |
| Conversa encerrada | linha no terminal dizendo que clicar retoma; selo "pausado" |
| Nada em conteúdos | mensagem de vazio |
| Arquivo carregando | texto discreto de carregamento no card ou no visor |
| Arquivo sem prévia | mensagem e botão de baixar no visor |
| Evolution indisponível | selo "indisponível", erro visível, botão de conectar desabilitado se não configurada |
| Sessão expirada | volta para o login |

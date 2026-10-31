# 04 · WhatsApp e n8n

## 1. Visão do fluxo

1. Alguém manda mensagem para o número de WhatsApp conectado na Evolution API.
2. A Evolution dispara um webhook (evento de mensagem nova) para o n8n.
3. O fluxo do n8n descarta o que não é conversa individual, monta um objeto simples e o envia ao painel, com um token, em `POST /api/ponte/whatsapp`.
4. O painel decide se quem mandou pode dar ordens. Se não pode, ignora em silêncio.
5. Se pode, a mensagem entra numa fila. O painel escolhe (ou cria) a conversa daquele número e roda o motor configurado para o WhatsApp **sem tela**, na pasta do cérebro.
6. A resposta final do motor volta pela Evolution API como mensagem de texto para quem mandou.
7. A conversa aparece no painel, com selo de WhatsApp, e pode ser assumida pelo terminal.

Intenção de projeto: **o n8n não decide quem é atendido.** Ele só repassa conversas individuais. A lista de quem pode dar ordens mora no painel, num arquivo que é relido a cada mensagem, para que trocar números nunca exija mexer no fluxo, no código ou no `.env`.

## 2. Evolution API

### 2.1 Instância

- Nome da instância: `EVO_INSTANCE` (padrão `cerebro`).
- URL e chave: `EVO_URL` e `EVO_KEY`. Toda chamada leva a chave no cabeçalho `apikey` e corpo JSON.
- Erro de resposta da Evolution vira mensagem: a mensagem de dentro da resposta, se houver, ou o código HTTP.
- Sem `EVO_URL` ou `EVO_KEY`, as rotas de WhatsApp das configurações informam que a Evolution não está configurada.

### 2.2 Chamadas usadas pelo painel

| Para quê | Chamada na Evolution |
|---|---|
| estado da conexão | `GET /instance/connectionState/<instância>`; o estado vem em `instance.state` ou `state` |
| dados da instância | `GET /instance/fetchInstances?instanceName=<instância>`; pode vir lista ou objeto; casar pelo `name` ou `instance.instanceName`; número em `ownerJid` (ou `instance.owner`), nome em `profileName` |
| criar instância | `POST /instance/create` com nome, integração `WHATSAPP-BAILEYS` e sem QR automático |
| apontar o webhook | `POST /webhook/set/<instância>`: habilitado, URL do n8n, sem separar por evento, sem mídia em base64, só o evento `MESSAGES_UPSERT` |
| pedir QR | `GET /instance/connect/<instância>`; a imagem vem em `base64`; o texto do código em `code` (usado no terminal pelo instalador) |
| desconectar | `DELETE /instance/logout/<instância>` |
| enviar texto | `POST /message/sendText/<instância>` com `number` e `text` |

### 2.3 Instância apagada

Antes de pedir QR, o painel verifica se a instância existe. Se não existe (alguém apagou pela Evolution), cria de novo e aponta o webhook para `WHATS_WEBHOOK` (padrão: o endereço interno do n8n na rede do Docker, caminho `/webhook/core-os-whatsapp`).

### 2.4 "Meu número"

O número conectado (dono da instância) é lido da Evolution e guardado em cache por 10 minutos. O cache é zerado ao conectar, quando o QR é lido com sucesso e ao desconectar.

## 3. Quem pode dar ordens

### 3.1 Configuração

Arquivo `whatsapp-acesso.json` (ver 07): `{ "numeros": [...], "chatVoce": true|false }`.

- Lido a cada mensagem (sem reiniciar nada).
- Padrões: `numeros` vazio, `chatVoce` verdadeiro.
- Se o arquivo **não existe** e `WHATS_DONO` está definido, esse número entra como único autorizado. Depois que o arquivo existe, `WHATS_DONO` é ignorado.
- Editado pelo painel (01, §9.2) ou à mão.

### 3.2 Normalização de número (chave de comparação)

Para comparar números vindos de lugares diferentes (identificadores do WhatsApp, lista digitada):

1. Pegar só a parte antes de `@` e antes de `:` (identificadores do WhatsApp podem ter sufixo de dispositivo).
2. Manter só dígitos.
3. Com 10 ou 11 dígitos (DDD mais número, sem país), prefixar `55`.
4. Se começa com `55`, tem 13 dígitos e o quinto dígito é `9`, remover esse `9` (o nono dígito do celular brasileiro, que o WhatsApp às vezes omite).

Dois números são o mesmo se as chaves forem iguais. Chave vazia nunca é autorizada.

### 3.3 Regra de autorização

Com os campos vindos do n8n (`deMim`, `chat`, `eu`):

- **Mensagem enviada pelo próprio número conectado** (`deMim` verdadeiro): só é ordem se `chatVoce` está ligado **e** o chat é o próprio número (chave de `chat` igual à chave de `eu`), ou seja, o chat "Você". Mensagens que o dono manda para outras pessoas nunca viram ordem.
- **Mensagem recebida** (`deMim` falso): é ordem se a chave do `chat` é igual à chave de algum número da lista.
- Autorizado: o destino da resposta é a parte do `chat` antes do `@`.

### 3.4 Formato antigo

Se o corpo não traz `chat` (fluxo antigo, que só tratava o chat "Você"), o painel aceita como ordem do dono se `chatVoce` estiver ligado, com destino vazio (que significa "o número conectado"). Senão, ignora.

## 4. Conversa de cada número

Arquivo `whatsapp.json` (ver 07): um objeto indexado pela chave do número (ou `dono` quando o destino é vazio), com `{ conversa: <id>, ultima: <ms> }`.

Ao receber uma ordem, o painel **reaproveita** a conversa corrente daquele número somente se todas as condições valem:

1. existe e não está arquivada;
2. a pessoa não pediu conversa nova (§5.2);
3. a última mensagem foi há no máximo **6 horas**;
4. a conversa **não** tem terminal vivo no painel (se o dono a assumiu pelo terminal, o WhatsApp abre outra para não disputarem o mesmo agente);
5. o motor dela é o motor atual configurado para o WhatsApp (trocar o motor do WhatsApp abre conversa nova).

Senão, cria uma conversa nova (`origem: whatsapp`, motor do WhatsApp, `whatsDe` = destino) e registra no `whatsapp.json`.

Depois de cada resposta, `ultima` é atualizada. Ao gravar, chaves de um formato antigo (um único `conversa` e `ultima` na raiz do objeto) são removidas.

## 5. Processamento

### 5.1 Fila

- Fila única, global, em memória. Uma mensagem por vez. Ao terminar uma (com sucesso ou erro), a próxima começa.
- Mensagens na fila se perdem se o painel reiniciar (aceito pelo Core).

### 5.2 Passos para cada mensagem

1. **Tipo diferente de texto** (por exemplo, áudio): responde uma frase curta dizendo que por enquanto só lê texto e pedindo para escrever. Fim.
2. **Comando de nova conversa:** se o texto começa (após espaços) com `/nova`, `/novo`, `/clear` ou `/limpar` (sem diferenciar maiúsculas, como palavra inteira), força conversa nova e o comando é retirado do texto.
3. Escolhe a conversa (§4).
4. **Texto vazio depois de tirar o comando:** responde uma frase curta confirmando que uma conversa nova foi aberta. Fim.
5. Marca a conversa como `processando`, atualiza `ultimaAtividade` e grava (a interface mostra "trabalhando").
6. Roda o motor sem tela (02, §4.4) com o texto, o prompt do painel mais o prompt do WhatsApp (§5.3), e o ambiente com `CORE_OS_SESSAO` e `WHATS_PARA` = destino.
7. Ao terminar, sempre (mesmo com erro): desmarca `processando`, atualiza `ultimaAtividade`, grava.
8. Atualiza `whatsapp.json`.
9. Responde com os primeiros **3.500 caracteres** da resposta; resposta vazia vira uma confirmação curta de feito.
10. Erros inesperados são registrados no log e não derrubam a fila.

### 5.3 Prompt do WhatsApp

Acrescentado ao prompt do painel, com três ideias (texto livre):

1. a conversa acontece pelo WhatsApp e a resposta final volta como mensagem;
2. a resposta deve ser breve e caber num aplicativo de mensagens: nada de tabelas ou cabeçalhos, e ênfase rara (a marcação de negrito por asteriscos, uma vez se tanto);
3. para ler conversas, achar contatos ou mandar mensagens e arquivos a terceiros ou ao dono, usar a skill `whatsapp` do cérebro e seguir as regras dela.

### 5.4 Enviar a resposta

- Destino: o número de quem mandou; se vazio, o número conectado.
- Sem `EVO_URL` ou sem destino: só registra no log o que seria respondido.
- **Proteção contra laço:** se o destino é o próprio número conectado (chat "Você"), a resposta começa com um caractere invisível, o separador invisível Unicode U+2063. O fluxo do n8n descarta mensagens que começam com ele; sem isso, a resposta do cérebro no chat "Você" voltaria como nova ordem.
- Falha de envio (resposta não OK ou erro de rede) é registrada no log, sem nova tentativa.

## 6. Token da ponte

- `CORE_OS_HOOK_TOKEN`: segredo aleatório gerado pelo instalador, guardado no `.env`, entregue ao container do n8n como variável de ambiente.
- O fluxo do n8n o envia no cabeçalho `x-core-os-token`. O painel compara em tempo constante.
- Token vazio no painel recusa toda chamada (a ponte nunca fica aberta por falta de configuração).
- O token é removido do ambiente dos agentes.

## 7. O fluxo do n8n, passo a passo

Identificador fixo do fluxo: `coreOsWhatsapp01`. Nome de exibição livre (algo como "WhatsApp para Claude Code"). Três nós em sequência.

### 7.1 Nó 1: Webhook

- Recebe `POST` no caminho `core-os-whatsapp` (o endereço completo é o do n8n mais `/webhook/core-os-whatsapp`).
- Responde imediatamente ao receber (a Evolution não espera o processamento).

### 7.2 Nó 2: Filtro e formatação (nó de código)

Para cada item recebido:

1. O corpo do evento pode vir dentro de `body` ou direto; usar o que existir. Os dados da mensagem estão em `data`, e a chave da mensagem em `data.key`.
2. Pegar `remoteJid` da chave. Descartar se vazio, ou se termina em `@g.us` (grupo), `@broadcast` (status e listas) ou `@newsletter` (canal).
3. **Identificar o chat:** o primeiro valor, entre `key.remoteJidAlt`, `key.senderPn` e `key.remoteJid`, que termine em `@s.whatsapp.net`. Isso resolve o caso em que o WhatsApp entrega um identificador opaco no lugar do número. Se nenhum termina assim, descartar.
4. **Texto:** `message.conversation` ou `message.extendedTextMessage.text` (nessa ordem), ou vazio.
5. Se o texto começa com o caractere invisível U+2063, descartar (é resposta do próprio cérebro).
6. **Tipo:** `texto` se há texto; `audio` se o `messageType` é de áudio; senão `outro`.
7. Itens do tipo `outro` cujo `messageType` indica reação, protocolo, chave de remetente, edição, enquete ou figurinha são descartados (não são mensagens de verdade). Outros tipos (imagem, documento) seguem, e o painel responde que só lê texto.
8. Emitir `{ texto, tipo, deMim: <key.fromMe>, chat, eu: <campo sender do corpo, o dono da instância> }`.

### 7.3 Nó 3: Requisição HTTP para o painel

- `POST` para a URL da variável de ambiente `CORE_OS_PONTE` do container (o painel visto de dentro do Docker, rota `/api/ponte/whatsapp`).
- Cabeçalho `x-core-os-token` com a variável de ambiente `CORE_OS_HOOK_TOKEN`.
- Corpo JSON com exatamente os cinco campos do nó anterior.

### 7.4 Configurações do fluxo

- Não guardar execuções bem-sucedidas nem manuais (as mensagens não ficam armazenadas no n8n).
- O container do n8n precisa permitir que nós leiam variáveis de ambiente (por padrão versões recentes bloqueiam).

### 7.5 Instalação e ativação

O instalador importa o fluxo a cada execução (reinstalar atualiza o fluxo), registra uma versão publicada dele e o ativa (ver 05, passo 6). Em algumas versões do n8n, importar pela linha de comando não cria o registro de versão publicada, e a ativação falha sem ele; por isso o instalador o cria diretamente no banco do n8n antes de ativar.

## 8. A skill `whatsapp` do cérebro

Complementa a ponte: permite que o agente, em qualquer conversa (painel ou WhatsApp), leia e envie mensagens. Ver 06, §4.1. Pontos de interface com o painel:

- Lê as credenciais do mesmo `/opt/core-os/.env`.
- "Mandar para o dono" usa `WHATS_PARA` (injetado pelo painel); sem ele, o número conectado.
- Mensagens para o próprio número conectado também levam o caractere invisível U+2063.

## 9. Casos de borda

| Caso | Comportamento |
|---|---|
| Mensagem de grupo, status ou canal | descartada no n8n |
| Número fora da lista | `202` com `ignorado`, sem resposta |
| Dono escreve para um contato qualquer | não é ordem (`deMim` e chat diferente do próprio número) |
| Resposta do cérebro no chat "Você" | descartada no n8n pelo caractere invisível |
| Áudio, imagem, documento | resposta pedindo texto |
| Reação, edição, enquete, figurinha | descartadas no n8n |
| Duas mensagens seguidas | processadas em ordem, uma de cada vez, na mesma conversa |
| Dono assumiu a conversa no terminal | próxima mensagem abre outra conversa |
| 6 horas sem falar | próxima mensagem abre outra conversa |
| Motor do WhatsApp trocado | próxima mensagem abre outra conversa |
| Motor não instalado | resposta dizendo que não conseguiu abrir o motor |
| Motor travado | encerrado após 20 minutos; responde o que houver |
| Resposta muito longa | cortada em 3.500 caracteres |
| Celular com ou sem o nono dígito | tratados como o mesmo número |

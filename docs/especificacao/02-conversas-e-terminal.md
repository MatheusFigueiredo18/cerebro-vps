# 02 · Conversas, terminal e motores

## 1. O que é uma conversa

Uma conversa é um registro persistido em `conversas.json` (formato em 07, §3.2) que liga:

- um **id** UUID gerado pelo painel;
- um **motor** (`claude`, `codex` ou `antigravity`);
- opcionalmente, um **id de sessão do motor** (`sessaoMotor`), para motores que geram o próprio id;
- a **nota de status** `sessoes/<id>.md` dentro do cérebro;
- as **mídias** geradas durante ela;
- a **origem** (`painel` ou `whatsapp`).

Para o Claude Code, o id da conversa **é** o id da sessão do Claude Code (o painel o impõe na criação). Para Codex e Antigravity, o id do motor é descoberto depois e guardado em `sessaoMotor`.

## 2. Ciclo de vida

### 2.1 Criar

`POST /api/conversas` (ver 01, §8):

1. Cria o registro: id novo, `criada` e `ultimaAtividade` = agora, `midias` vazia, `numero` = quantidade de conversas já registradas (incluindo arquivadas) mais um, `motor` = pedido ou padrão.
2. Grava `conversas.json`.
3. Inicia o terminal imediatamente (§3), com o tamanho pedido e o `pedido` opcional.
4. Devolve o registro.

Conversas do WhatsApp são criadas pelo mesmo mecanismo, sem terminal, com `origem: "whatsapp"`, o motor configurado para o WhatsApp e `whatsDe` (o número de quem falou). Ver 04.

### 2.2 Listar

`GET /api/estado` devolve só as não arquivadas, na ordem de criação, com o resumo descrito em 01, §8. A interface consulta a cada 2 segundos.

### 2.3 Encerrar

`DELETE /api/conversas/:id`:

- Mata o processo de terminal, se existir.
- Marca `arquivada: true` e grava. **Nada é apagado:** o registro do motor e a nota de status continuam no disco.
- Conversa arquivada some de `/api/estado` e não é mais escolhida para receber mídias nem mensagens do WhatsApp.

### 2.4 Retomar

- Se a pessoa abre (pelo WebSocket) uma conversa cujo processo já terminou, o painel inicia de novo o motor **retomando** a sessão (§4).
- Quando o processo termina por conta própria (o agente saiu), os clientes conectados recebem uma linha discreta avisando que a conversa encerrou e que clicar no terminal retoma.
- O WebSocket aceita qualquer conversa registrada, inclusive arquivada, se o id for conhecido.

### 2.5 Reinício do painel

Ao iniciar, o painel lê `conversas.json` e zera `processando` de todas (nada está rodando depois de um reinício). Processos de terminal não sobrevivem ao reinício; a próxima conexão os retoma.

## 3. Terminal

### 3.1 Início

- Um pseudo-terminal por conversa, com o binário do motor (§4), diretório de trabalho = raiz do cérebro, tipo de terminal `xterm-256color`.
- Tamanho inicial vindo da criação ou da conexão (padrão 120 por 32, limitado a 400 por 200).
- Para o Claude Code, decide entre "sessão nova" e "retomar" verificando se o arquivo de registro `<id>.jsonl` já existe (§5.1).
- Na primeira vez que o terminal de uma conversa sem `sessaoMotor` é iniciado, registra `iniciouTerminal` = agora e grava (serve para o Codex e o Antigravity, §4).
- Se o binário não puder ser iniciado, o painel inicia no lugar um shell que só imprime que aquele motor não está instalado neste servidor, mais a dica de login do motor, e fica parado por uma hora. Assim o card mostra a causa em vez de ficar vazio.

### 3.2 Ambiente do processo

Parte do ambiente do painel, com estas mudanças:

| Ação | Variáveis | Por quê |
|---|---|---|
| Remove | todas que começam com `CLAUDECODE`, `CLAUDE_CODE_`, `CLAUDE_PID`, `CLAUDE_EFFORT`, `AI_AGENT` | quando o painel é iniciado por um processo que já é um agente, essas variáveis herdadas levam o filho a se comportar como subordinado e a não registrar o histórico em disco |
| Remove | `CORE_OS_PASSWORD`, `CORE_OS_HOOK_TOKEN` | o agente não deve ver os segredos do painel |
| Define | `TERM=xterm-256color`, `COLORTERM=truecolor` | cores corretas |
| Define | `CORE_OS_SESSAO=<id>` | motores sem prompt de sistema descobrem a própria nota de status |
| Define | `WHATS_PARA` | para quem vai um "me manda no WhatsApp": no terminal, o primeiro número autorizado (ou vazio); no WhatsApp, quem mandou a mensagem |

### 3.3 Saída

- Toda saída do processo é acumulada num buffer circular dos últimos 300.000 caracteres e enviada a todos os clientes conectados naquela conversa.
- Cada saída atualiza `ultimaAtividade` da conversa (em memória; é gravada no próximo salvamento).
- Um cliente novo recebe primeiro o buffer inteiro (reconstrói a tela) e depois a saída ao vivo.

### 3.4 Pedido pré-escrito

Quando a conversa é criada com `pedido` (botões "pedir na conversa", primeiros testes, instalar motor):

1. O texto tem quebras de linha trocadas por espaço e é limitado a 2.000 caracteres.
2. A cada saída, o painel olha o fim da tela (cerca de 6.000 caracteres, sem sequências de controle ANSI). Quando aparece o caractere de prompt do agente (`❯` ou `›`) e a tela **não** é uma das telas iniciais de confiança na pasta, de login ou de escolha de opção, o painel espera cerca de 600 ms e escreve o texto **sem Enter**.
3. A confirmação fica com a pessoa: só depois de revisar o texto ela o envia. Intenção: nada é executado sem ela ver.
4. O pedido é descartado se não for usado em 90 segundos.

### 3.5 Protocolo do WebSocket

**Conexão:** `GET /ws?conversa=<id>&cols=<n>&rows=<n>` com upgrade para WebSocket (`wss` quando a página é HTTPS).

A conexão é recusada (socket fechado sem resposta) se:

- o caminho não é `/ws`;
- não há cookie de login válido;
- o id não corresponde a uma conversa registrada;
- há cabeçalho `Origin` e o host dele é diferente do cabeçalho `Host` (proteção contra uso a partir de outro site).

**Ao conectar:** usa o processo vivo da conversa ou inicia um (retomando), com `cols` e `rows` da URL (padrão 120 por 32). Envia o buffer acumulado, se houver.

**Cliente para servidor** (mensagens de texto com JSON):

| Mensagem | Efeito |
|---|---|
| `{ "t": "i", "d": "<texto>" }` | escreve `d` na entrada do terminal (teclas, colagens) |
| `{ "t": "r", "cols": n, "rows": n }` | redimensiona o terminal, se ambos forem positivos, limitando a 400 por 200 |

Mensagens que não são JSON válido, ou que chegam quando o processo já morreu, são ignoradas.

**Servidor para cliente:** a saída crua do terminal, como texto, sem envelope.

**Vários clientes** podem assistir e digitar na mesma conversa ao mesmo tempo (duas abas, celular e computador). Fechar um cliente não mata o processo.

**Recomendação do cliente:** ao abrir a conexão, mandar logo um `r` com o tamanho real da área visível, para o agente redesenhar na largura certa.

## 4. Motores

### 4.1 Tabela de motores

| id | Nome de exibição | Executável | Variável que troca o executável |
|---|---|---|---|
| `claude` | Claude Code | `claude` | `CLAUDE_BIN` |
| `codex` | Codex | `codex` | `CODEX_BIN` |
| `antigravity` | Antigravity | `agy` | `AGY_BIN` |

- Motor desconhecido ou ausente numa conversa é tratado como `claude`.
- **Localização do executável:** se o valor contém `/`, é um caminho e basta existir. Senão, procura um arquivo executável com esse nome nas pastas do `PATH` e também em `~/.local/bin`, `/usr/local/bin` e `/usr/bin` (o serviço pode não ter `~/.local/bin` no PATH). Não achou: `instalado: false`, e a tentativa de iniciar usa o nome cru (que falha e cai no shell de aviso, §3.1).
- Cada motor tem uma **dica de login** curta, exibida nas configurações: o Claude Code não exige passo prévio, porque o próprio programa pede a autenticação (por conta ou chave de API) ao ser aberto pela primeira vez; o Codex se autentica por login com código de dispositivo no terminal do servidor ou por chave de API no `.env`; o Antigravity por link com código no terminal ou por chave de API no `.env`.

### 4.2 Prompt de sistema do painel

Toda conversa recebe um prompt de sistema curto com três ideias (o texto é livre):

1. o agente está rodando dentro do painel;
2. o arquivo de acompanhamento dela fica em `sessoes/<id>.md`, caminho contado a partir da raiz do cérebro;
3. siga a seção da constituição sobre a nota de status: criar a nota na primeira ação, com título, resumo de uma ou duas frases e checklist, e marcar cada etapa ao terminar.

### 4.3 Como cada motor é iniciado no terminal

| Motor | Primeira vez | Retomada |
|---|---|---|
| `claude` | `--session-id <id> --append-system-prompt <prompt>` | `--resume <id> --append-system-prompt <prompt>` (quando o registro `<id>.jsonl` já existe) |
| `codex` | `-c developer_instructions=<prompt em string TOML> --sandbox workspace-write --ask-for-approval on-request` | `resume`, as mesmas opções e por fim o `sessaoMotor` |
| `antigravity` | sem argumentos | `--conversation <sessaoMotor>` se conhecido; senão `--continue` se o terminal já foi iniciado antes |

Observações:

- O prompt para o Codex é passado como valor TOML (texto entre aspas com escapes de JSON servem).
- O Antigravity não aceita prompt de sistema por flag: a regra chega pelo `AGENTS.md` do cérebro e pela variável `CORE_OS_SESSAO` (ver 06).

### 4.4 Como cada motor é rodado sem tela (WhatsApp)

O painel inicia o processo sem terminal, com entrada fechada, saída e erro capturados, diretório = cérebro, ambiente do §3.2 e o prompt do painel acrescido do prompt do WhatsApp (ver 04, §5). **Limite de 20 minutos:** passado o tempo, o processo recebe sinal de término.

| Motor | Argumentos | Resposta | Id da sessão |
|---|---|---|---|
| `claude` | `-p <texto>`, `--session-id <id>` ou `--resume <id>` (mesma regra do terminal), `--append-system-prompt <prompt>`, `--output-format text`, `--permission-mode acceptEdits`, `--allowedTools` com `Bash Read Write Edit Glob Grep Skill Task WebFetch WebSearch` | saída padrão mais erro, aparadas | o próprio id da conversa |
| `codex` | `exec` (ou `exec resume` quando há sessão), `-c developer_instructions=<prompt>`, `-c sandbox_mode="danger-full-access"`, `-c approval_policy="never"`, `--skip-git-repo-check`, `--json`, `-o <arquivo temporário>`, `--`, (sessão, se retomada) e o texto | conteúdo do arquivo temporário; o arquivo é renomeado com sufixo `.lido` depois; se vazio, as últimas 5 linhas do erro | lido das linhas JSON da saída: o último valor encontrado em `thread_id`, `session_id` ou `payload.id` |
| `antigravity` | `-p <pedido>`, `--output-format json`, `--dangerously-skip-permissions`, `--print-timeout 20m`, e `--conversation <sessão>` quando existe. Na primeira mensagem, o pedido é o texto precedido das instruções do painel entre colchetes | campo `response`, ou `result`, ou `text` do JSON; se não for JSON, a saída crua | `conversation_id`, `conversationId`, `session_id` ou `sessionId` |

- Se o processo nem inicia, a resposta é uma frase dizendo que não foi possível abrir aquele motor, com o motivo.
- O id de sessão descoberto é gravado em `sessaoMotor` se ainda não havia.
- Para o Antigravity, que não tem registro legível em disco, o painel guarda ele mesmo o histórico na conversa (`historico`): o texto da pessoa e a resposta, mantendo os 300 últimos itens.

### 4.5 Vinculação do Codex aberto no terminal

O Codex interativo gera o próprio id e não o informa. A cada 4 segundos o painel:

1. Pega as conversas `codex`, não arquivadas, sem `sessaoMotor` e com `iniciouTerminal`.
2. Lista os arquivos de registro do Codex dos 2 últimos dias (§5.3) e lê a primeira linha de cada (metadados com `id`, `cwd`, `timestamp`).
3. Ignora ids já usados por outra conversa e registros cujo diretório de trabalho não é a raiz do cérebro.
4. Data de criação = `timestamp` do registro, ou a data de modificação do arquivo.
5. Associa ao registro a conversa solta mais recente cujo `iniciouTerminal` seja no máximo 5 segundos posterior à criação do registro.
6. Se algo mudou, grava `conversas.json`.

## 5. Leitura dos registros dos motores

### 5.1 Claude Code

- **Pasta do projeto:** `~/.claude/projects/<chave>/`, onde `<chave>` é o caminho absoluto (real) do cérebro com **todo** caractere que não seja letra ASCII ou dígito trocado por `-`.
- **Registro da conversa:** `<pasta do projeto>/<id>.jsonl`, uma linha JSON por evento.
- **Leitura de status** (com cache: só relê se o tamanho do arquivo mudou):
  - percorre as linhas do tipo `assistant` cujo `message.content` é lista;
  - se a linha tem blocos `tool_use`: a **última ação** passa a ser a descrição do último bloco (§5.4), `terminou` passa a falso, e os caminhos de arquivo usados por `Write` e `Edit` são anotados;
  - se não tem `tool_use` e `message.stop_reason` é `end_turn`: `terminou` passa a verdadeiro;
  - linhas que não são JSON são ignoradas;
  - resultado: última ação, se terminou a vez, arquivos escritos e data de modificação do arquivo.
- **Histórico** (`GET /api/conversas/:id/historico`), lido a cada pedido:
  - linha `user` que não é `isMeta`: o texto é o próprio conteúdo se for string, ou a junção dos blocos `text`; vira item `voce`, **exceto** se começar com `<` (são injeções do sistema, como saídas de hooks e comandos);
  - linha `assistant`: cada bloco `text` não vazio vira item `claude`; cada `tool_use` vira item `acao` com a descrição;
  - `quando` vem do campo `timestamp` da linha;
  - arquivo inexistente: lista vazia;
  - limitado aos 300 itens mais recentes.

### 5.2 Subagentes (só Claude Code)

- Pasta: `<pasta do projeto>/<id>/subagents/`.
- Cada subagente tem `<nome>.meta.json` (campos usados: `description`, `agentType`) e o registro `<nome>.jsonl` no mesmo formato do §5.1.
- Para cada um, o painel devolve:

| Campo | Origem |
|---|---|
| `id` | nome do arquivo sem `.meta.json` |
| `descricao` | `description`, ou um rótulo genérico |
| `tipo` | `agentType`, ou vazio |
| `status` | `concluido` se o registro terminou a vez; `trabalhando` se foi modificado há menos de 30 s; senão `parado` |
| `ultimaAcao` | do registro |
| `inicio` | data de modificação do registro |

- Ordenados por `inicio`. Pasta inexistente: lista vazia. Metadados ilegíveis não derrubam a lista.

### 5.3 Codex

- Pasta de sessões: `$CODEX_HOME/sessions` ou `~/.codex/sessions`, organizada em `AAAA/MM/DD/`, com arquivos `.jsonl` cujo nome contém o id da sessão.
- **Achar o arquivo de uma sessão:** procurar nos 7 últimos dias pelo id no caminho; se não achar, busca recursiva na pasta toda. Guardar em cache enquanto o arquivo existir.
- **Leitura** (a cada pedido):
  - `event_msg` com `payload.type = user_message`: item `voce` com `payload.message`; zera `terminou`;
  - `event_msg` com `payload.type = agent_message`: item `claude`;
  - `event_msg` com `payload.type = task_complete`: `terminou` verdadeiro;
  - `response_item` cujo `payload.type` termina em `call` (exceto `function_call_output`): vira última ação e item `acao`; zera `terminou`. Os argumentos podem vir como texto JSON ou objeto; o comando pode ser lista (juntar com espaço) ou texto;
  - `quando` vem de `timestamp`.

### 5.4 Descrição de uma ação

Texto curto para status e histórico, a partir do nome da ferramenta e da entrada:

1. Se a ação mexe na nota de status (`sessoes/<uuid>.md`), uma frase fixa dizendo que está atualizando a nota de status (para não poluir a lista).
2. Senão, se há `description`: "Ferramenta: descrição".
3. Senão, se há `file_path`: "Ferramenta: nome do arquivo".
4. Senão, se há `command`: "Ferramenta: comando".
5. Senão, se há `pattern`: "Ferramenta: padrão".
6. Senão, só o nome da ferramenta.

Espaços repetidos viram um só e o trecho é cortado em 90 caracteres. Para o Codex: comando (ou o nome da chamada, ou um rótulo genérico de ação), com a mesma regra da nota de status.

### 5.5 "Trabalhando"

Uma conversa está trabalhando se o WhatsApp a está processando agora, ou se o registro dela foi modificado há menos de 8 segundos e a vez não terminou. Antigravity no terminal nunca aparece como trabalhando por registro (não há registro legível).

## 6. Nota de status

- Caminho: `sessoes/<id>.md` dentro do cérebro. Quem escreve é o agente; o painel só lê.
- Formato esperado (definido na constituição, ver 06): um título de nível 1, uma linha de citação com o resumo e uma lista de tarefas com caixas marcáveis.
- O painel usa:
  - **título:** a primeira linha que começa com `# `; sem nota, um rótulo padrão: para o WhatsApp, a palavra WhatsApp com dia, mês, hora e minuto da criação no fuso de São Paulo; para o painel, "Conversa" seguido do `numero`;
  - **resumo:** a primeira linha que começa com `> ` (feito na interface);
  - **checklist:** linhas de lista (`-` ou `*`) com `[ ]`, `[x]` ou `[X]` (feito na interface).
- A nota inteira é enviada no campo `nota` de `/api/estado`, e a interface faz o resto.

## 7. Mídias geradas viram cards da conversa

A cada 3 segundos o painel:

1. Lista os arquivos de mídia (extensões de imagem e vídeo de 01, §6.1) dentro de `conteudo/`, recursivamente, com o `mtime` de cada um, excluindo os que vieram por envio do dono (01, §6.4).
2. Na primeira rodada, só memoriza o estado (o que já existia não é associado a ninguém).
3. Nas seguintes, para cada arquivo novo ou com `mtime` diferente, escolhe a **conversa dona**: entre as não arquivadas, a de atividade mais recente, considerando o maior entre `ultimaAtividade` e o `mtime` do registro do motor, desde que essa atividade tenha sido nos últimos 3 minutos.
4. Se há dona e o caminho ainda não está em `midias`, acrescenta e grava.

Limites conhecidos (aceitos pelo Core): com duas conversas ativas ao mesmo tempo, a mídia vai para a mais recente; a marca de "enviado pelo dono" é perdida quando o painel reinicia.

## 8. Concorrência

- Gravações de `conversas.json` são escritas inteiras, de forma síncrona, a partir do estado em memória (o painel é a única fonte da verdade enquanto roda).
- Uma conversa pode ter, ao mesmo tempo, um terminal vivo e clientes múltiplos; o WhatsApp evita usar uma conversa com terminal vivo (ver 04, §4).
- A fila do WhatsApp é global e serial: duas mensagens nunca rodam o motor em paralelo.

# 07 · Configuração e dados

## 1. Arquivo de ambiente

- Caminho: `CORE_OS_ENV`, padrão `/opt/core-os/.env`.
- Lido na inicialização do painel, antes de qualquer outra configuração. Arquivo ausente não é erro (segue com o ambiente do processo).
- Formato: uma variável por linha, `CHAVE=valor`. Chave só com letras maiúsculas, dígitos e sublinhado; espaços em volta são ignorados; um par de aspas simples ou duplas no começo e no fim do valor é removido. Linhas que não seguem o formato são ignoradas.
- **O ambiente do processo vence:** uma variável já definida no ambiente não é sobrescrita pelo arquivo.
- Permissões instaladas: dono root, grupo do usuário dono, modo 640.
- O mesmo arquivo alimenta a pilha de containers (ver 05, §6) e os scripts das skills.

## 2. Variáveis

### 2.1 Painel

| Variável | Padrão | Uso |
|---|---|---|
| `CORE_OS_ENV` | `/opt/core-os/.env` | onde ler o arquivo de ambiente |
| `CORE_OS_PORT` | `3000` | porta HTTP e WebSocket |
| `CORE_OS_HOST` | `127.0.0.1` | interface de escuta (o instalador usa `0.0.0.0`) |
| `CORE_OS_VAULT` | pasta do cérebro de exemplo ao lado do painel | raiz do cérebro; resolvida para caminho real na inicialização (precisa existir) |
| `CORE_OS_DATA` | subpasta `data` do painel | pasta dos arquivos de dados (§3); criada se não existir |
| `CORE_OS_PASSWORD` | vazia (gera uma por execução) | senha do painel |
| `CORE_OS_HOOK_TOKEN` | vazia (ponte recusa tudo) | token da ponte do WhatsApp |
| `CLAUDE_BIN` | `claude` | executável do Claude Code |
| `CODEX_BIN` | `codex` | executável do Codex |
| `AGY_BIN` | `agy` | executável do Antigravity |
| `CODEX_HOME` | `~/.codex` | base dos registros do Codex (subpasta `sessions`) |
| `EVO_URL` | (nenhum) | base da Evolution API; sem ela, WhatsApp desligado |
| `EVO_KEY` | (nenhum) | chave da Evolution API |
| `EVO_INSTANCE` | `cerebro` | nome da instância |
| `WHATS_WEBHOOK` | endereço interno do n8n, caminho `/webhook/core-os-whatsapp` | para onde a instância recriada aponta o webhook |
| `WHATS_DONO` | (nenhum) | número autorizado inicial, só enquanto não existe `whatsapp-acesso.json` |
| `N8N_PUBLIC_URL` | (nenhum) | endereço do n8n mostrado nas configurações |

### 2.2 Só da pilha e do instalador

| Variável | Uso |
|---|---|
| `POSTGRES_PASSWORD` | senha do Postgres da Evolution |
| `N8N_ENCRYPTION_KEY` | chave de criptografia do n8n (não pode mudar depois de criada) |
| `N8N_IMAGE`, `EVOLUTION_IMAGE` | imagens fixas dos containers |
| `N8N_HOST`, `N8N_PROTOCOL`, `N8N_SECURE_COOKIE` | endereço e cookies do n8n |

### 2.3 Injetadas nos agentes

| Variável | Valor |
|---|---|
| `CORE_OS_SESSAO` | id da conversa (para achar a nota de status) |
| `WHATS_PARA` | número para o qual vai um "manda para mim" |
| `TERM`, `COLORTERM` | `xterm-256color`, `truecolor` (só no terminal) |

E removidas: ver 02, §3.2.

### 2.4 Chaves dos motores alternativos

O `.env` pode receber chaves de API dos motores (por exemplo, para Codex e Antigravity), que chegam aos agentes pelo ambiente herdado. O painel não as lê.

## 3. Arquivos de dados

Todos em `CORE_OS_DATA` (instalado: `/opt/core-os/dados`), JSON indentado, reescritos inteiros a cada mudança. Leitura tolerante: arquivo ausente ou inválido vira o valor padrão, sem erro.

### 3.1 `logins.json`

Lista de tokens de sessão válidos (textos hexadecimais de 64 caracteres). Padrão: lista vazia. Após login, guarda os 50 mais recentes; após logout, a lista sem o token removido.

### 3.2 `conversas.json`

Lista de conversas, na ordem de criação (inclui arquivadas).

| Campo | Tipo | Presença | Significado |
|---|---|---|---|
| `id` | string UUID | sempre | id da conversa; para o Claude Code, também o id da sessão |
| `criada` | número (ms) | sempre | |
| `ultimaAtividade` | número (ms) | sempre | última saída do terminal ou processamento do WhatsApp |
| `midias` | lista de caminhos relativos | sempre | mídias geradas associadas |
| `numero` | número | sempre | sequencial (quantidade anterior mais um) |
| `motor` | `claude`, `codex` ou `antigravity` | sempre | |
| `origem` | `whatsapp` | só nas do WhatsApp | ausente significa painel |
| `whatsDe` | string (dígitos) | só nas do WhatsApp | número de quem iniciou |
| `processando` | boolean | depois do primeiro processamento | o WhatsApp está rodando o agente |
| `arquivada` | boolean | depois de encerrar | |
| `iniciouTerminal` | número (ms) | depois do primeiro terminal sem sessão do motor | usado para vincular Codex e retomar Antigravity |
| `sessaoMotor` | string | quando descoberto | id da sessão no Codex ou Antigravity |
| `historico` | lista de itens `{ papel, texto, quando }` | só Antigravity pelo WhatsApp | histórico mantido pelo painel, até 300 itens |

### 3.3 `motores.json`

`{ "padrao": "<id>", "whatsapp": "<id>" }`. Padrão: ambos `claude`. Campos ausentes recebem o padrão.

### 3.4 `whatsapp-acesso.json`

`{ "numeros": ["55DDNNNNNNNNN", ...], "chatVoce": true }`. Padrão: `numeros` vazio, `chatVoce` verdadeiro. Números normalizados como em 01, §9.2. Pode ser editado à mão; é relido a cada mensagem.

### 3.5 `whatsapp.json`

Objeto indexado pela chave normalizada do número (ver 04, §3.2), ou `dono` para o destino vazio:

`{ "<chave>": { "conversa": "<id>", "ultima": <ms> } }`

Chaves de raiz `conversa` e `ultima` (formato antigo) são removidas na próxima gravação.

### 3.6 `capas/`

Pasta de cache de miniaturas de vídeo em JPEG, nome derivado do caminho real e do `mtime` do vídeo. Pode ser apagada a qualquer momento (é regenerada).

## 4. Arquivos fora da pasta de dados que o painel lê

| Caminho | Para quê |
|---|---|
| `<cérebro>/sessoes/<id>.md` | nota de status |
| `<cérebro>/conteudo/**` | galeria e detecção de mídias |
| `<cérebro>/.mcp.json` | nomes de MCPs do projeto |
| `~/.claude.json` | nomes de MCPs globais e do projeto do cérebro |
| `~/.claude/projects/<chave>/<id>.jsonl` e `<id>/subagents/*` | registro e subagentes do Claude Code |
| `$CODEX_HOME/sessions/AAAA/MM/DD/*.jsonl` | registros do Codex |
| arquivo temporário do sistema para a resposta do Codex sem tela | nome com o id da conversa e a hora; renomeado com `.lido` depois de lido |

## 5. Armazenamento local do navegador

Não é interface do servidor, mas é o comportamento do Core (o implementador pode mudar as chaves):

| Dado | Conteúdo |
|---|---|
| tema | `claro` ou `escuro` |
| conversa ativa | id ou `mesa` |
| espaço de cada conversa e da mesa | posições dos cards por chave, lista de arquivos abertos, câmera |
| pastas abertas na árvore | lista de caminhos |
| árvore escondida | boolean |
| caixa "comece aqui" recolhida | boolean |
| conversas do WhatsApp assumidas no terminal | lista de ids |

## 6. Arquivos instalados no servidor

| Caminho | O que é |
|---|---|
| `/opt/core-os/.env` | segredos e configuração |
| `/opt/core-os/painel/` | código do painel com dependências |
| `/opt/core-os/dados/` | dados do painel (§3) |
| `/opt/core-os/stack/` | arquivo Compose, pasta `fluxos/` com o fluxo do n8n, script de publicação do fluxo, link `.env` |
| `/opt/core-os/caddy/` | configuração do proxy |
| `<casa do dono>/cerebro/` | o cérebro |
| unidade de serviço `core-os-painel` | serviço do painel |
| container `core-os-caddy` e volume de certificados | proxy |
| volumes do projeto Compose `core-os` | Postgres, Redis, Evolution, n8n |

## 7. Dependências do painel no Core (referência)

Servidor HTTP minimalista, biblioteca de WebSocket, módulo de pseudo-terminal com binários pré-compilados, emulador de terminal para navegador com extensões de ajuste de tamanho e Unicode moderno, e um renderizador de Markdown com suporte a GFM. Node 20 ou superior, módulos ES. Todas de licença permissiva. O implementador pode trocar qualquer uma (ver 08).

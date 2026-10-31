# 00 · Visão geral

> Especificação de comportamento do "Core" para uma reimplementação em sala limpa. Os arquivos 01 a 08 detalham cada parte. Onde um nome de rota, campo JSON, variável de ambiente, flag de linha de comando ou arquivo de dados aparece, ele faz parte da interface e deve ser mantido. Todo o resto (visual, textos, organização interna) é decisão do implementador (ver `08-liberdade-do-implementador.md`).

## 1. O que o produto faz

O Core transforma uma VPS Linux (Ubuntu ou Debian) num "segundo cérebro" ligado 24 horas:

- **Um cérebro em arquivos.** Uma pasta de notas Markdown com uma constituição (regras para o agente de IA), índices por pasta, skills (receitas passo a passo para o agente) e exemplos. O agente de IA trabalha dentro dessa pasta.
- **Um painel web com senha.** Mostra a árvore de arquivos do cérebro, um canvas infinito com cards arrastáveis, um grafo de ligações entre notas, uma galeria dos conteúdos produzidos e uma lista de conversas. Cada conversa é um agente de IA de verdade (por padrão o Claude Code) rodando num terminal no servidor, visível e controlável pelo navegador.
- **Uma ponte com o WhatsApp.** Mensagens recebidas num número de WhatsApp conectado chegam, via Evolution API e n8n, ao painel, que roda o agente em modo sem tela e devolve a resposta como mensagem. Só números autorizados dão ordens.
- **Um instalador idempotente.** Um script, guiado por uma skill do Claude Code, instala tudo numa VPS limpa: pacotes, Docker, Node, os containers (n8n, Evolution API, Postgres, Redis), o painel como serviço, o proxy reverso com HTTPS opcional e o firewall.

## 2. Quem usa

- **O dono do cérebro:** uma pessoa só, não técnica. Acessa o painel pelo navegador (computador ou celular), conversa pelo WhatsApp e, opcionalmente, pelo terminal via SSH. Não existe multiusuário: uma senha única dá acesso total.
- **Números autorizados no WhatsApp:** pessoas (normalmente o próprio dono, de outro número) que podem mandar ordens ao cérebro.
- **Quem instala:** o próprio dono, conduzido pelo Claude Code dentro da VPS, seguindo a skill de instalação.

## 3. Componentes

| Componente | Papel | Onde roda |
|---|---|---|
| Painel (servidor HTTP + WebSocket) | API, arquivos estáticos da interface, terminais (pseudo-terminal por conversa), leitura dos registros dos agentes, ponte do WhatsApp | Processo Node no host, como serviço do sistema, usuário dono do cérebro |
| Interface web | Aplicação de página única, sem etapa de build, servida pelo painel | Navegador |
| Agentes de IA ("motores") | Claude Code (padrão), Codex, Antigravity. Cada conversa é um processo de um motor | Host, iniciados pelo painel |
| Pasta do cérebro | Notas, skills, conteúdos gerados, notas de status das conversas | Host, na casa do usuário dono |
| Evolution API | Conexão com o WhatsApp (QR, envio, webhook de mensagens) | Container, só em 127.0.0.1:8080 |
| Postgres e Redis | Persistência e cache da Evolution API | Containers internos |
| n8n | Recebe o webhook da Evolution, filtra e repassa ao painel | Container, 127.0.0.1:5679 (porta interna 5678) |
| Proxy reverso (Caddy) | Expõe painel e n8n para a internet, com HTTPS automático quando há domínio | Container com rede do host |
| Firewall (ufw) | Fecha tudo menos SSH, 80, 443 (e 5678 sem domínio) | Host |

## 4. Como os componentes se falam

```
Navegador ──HTTPS──> Caddy ──> Painel :3000 ──(pty)──> claude / codex / agy (cwd = pasta do cérebro)
     └──── WebSocket /ws ───────────┘   │
                                         ├── lê ~/.claude/projects/... (registro do Claude Code)
                                         ├── lê ~/.codex/sessions/... (registro do Codex)
                                         ├── lê e escreve a pasta do cérebro
                                         └── HTTP ──> Evolution API :8080 (QR, estado, envio)

WhatsApp ──> Evolution API ──webhook──> n8n ──POST /api/ponte/whatsapp (token)──> Painel
Painel ──(processo sem tela)──> motor ──resposta──> Painel ──sendText──> Evolution API ──> WhatsApp
```

(O diagrama acima descreve a topologia; não é código.)

Pontos-chave:

1. **Um agente real por conversa.** O painel não reimplementa o agente: ele inicia o binário do motor num pseudo-terminal, com a pasta do cérebro como diretório de trabalho, e repassa bytes entre o terminal e o navegador.
2. **Nota de status.** Cada conversa recebe, por prompt de sistema, o caminho `sessoes/<id>.md`. O agente cria essa nota (título, resumo, checklist) e o painel a lê para mostrar título, resumo e progresso.
3. **Leitura passiva dos registros.** Status ("trabalhando", última ação, subagentes) vem da leitura dos arquivos de registro que o próprio motor grava em disco, não de integração direta.
4. **Mídias geradas viram cards.** Um observador periódico detecta imagens e vídeos novos em `conteudo/` e os associa à conversa ativa mais recente.
5. **WhatsApp com fila única.** Mensagens autorizadas entram numa fila global processada uma de cada vez. Cada número tem a sua conversa corrente, que expira após 6 horas sem uso ou com um comando de nova conversa.
6. **Segredos fora do cérebro.** Todas as credenciais ficam num arquivo de ambiente fora da pasta do cérebro (`/opt/core-os/.env`) e são removidas do ambiente dos agentes.

## 5. Índice dos documentos

| Arquivo | Conteúdo |
|---|---|
| `01-api-http.md` | Todas as rotas HTTP, autenticação, formatos, erros, proteção de caminhos |
| `02-conversas-e-terminal.md` | Ciclo de vida das conversas, WebSocket, registros dos motores, subagentes, nota de status |
| `03-interface.md` | Telas e comportamentos visíveis |
| `04-whatsapp-e-n8n.md` | Fluxo completo do WhatsApp, autorização, fila, fluxo do n8n |
| `05-instalacao.md` | Requisitos do instalador, skill de instalação, empacotamento |
| `06-modelo-do-cerebro.md` | Estrutura do cérebro de exemplo, skills, constituição |
| `07-configuracao-e-dados.md` | Variáveis de ambiente, arquivos de dados e formatos |
| `08-liberdade-do-implementador.md` | O que é obrigatório e o que é livre |

## 6. Glossário

| Termo | Significado |
|---|---|
| Cérebro / vault | A pasta de notas Markdown onde o agente trabalha (`CORE_OS_VAULT`) |
| Motor | O programa de agente de IA que roda uma conversa: `claude`, `codex` ou `antigravity` |
| Conversa | Um registro do painel ligado a uma sessão de um motor, com id UUID |
| Mesa | O espaço do canvas quando nenhuma conversa está selecionada |
| Espaço | O estado do canvas (posições, arquivos abertos, câmera) de uma conversa ou da mesa |
| Nota de status | `sessoes/<id>.md`, escrita pelo agente, lida pelo painel |
| Ponte | A rota que recebe mensagens do WhatsApp vindas do n8n |
| Chat "Você" | No WhatsApp, o chat em que o número conectado fala com ele próprio |
| Dados | Pasta de arquivos JSON do painel (`CORE_OS_DATA`) |

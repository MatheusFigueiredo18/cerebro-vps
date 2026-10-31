# 08 · Liberdade do implementador

> O que precisa ficar igual para o produto ser compatível (com instalações existentes, com o fluxo do n8n, com os motores e com cérebros já criados) e o que é decisão de quem implementa.

## 1. Essencial (não mudar)

### 1.1 Contratos com sistemas externos

| Item | Por quê |
|---|---|
| Rota `POST /api/ponte/whatsapp`, cabeçalho `x-core-os-token` e corpo `{ texto, tipo, deMim, chat, eu }` | o fluxo do n8n instalado depende disso |
| Respostas `202` (aceito e ignorado) e `401` da ponte | o n8n não deve registrar erro para números ignorados |
| Caminho do webhook `core-os-whatsapp`, id do fluxo `coreOsWhatsapp01`, evento `MESSAGES_UPSERT` | a Evolution e o instalador apontam para eles |
| Caractere invisível U+2063 no início das respostas ao próprio número, e o descarte dele no n8n | sem isso há laço infinito no chat "Você" |
| Regra de normalização de número (04, §3.2) | números gravados e comparados precisam continuar batendo |
| Flags dos motores (02, §4.3 e §4.4) | são a interface dos programas de terceiros |
| Leitura dos registros do Claude Code e do Codex (caminhos e campos de 02, §5) | formato definido por terceiros |
| Remoção das variáveis `CLAUDECODE*`, `CLAUDE_CODE_*` e afins do ambiente dos agentes | sem isso o Claude Code não grava histórico |
| Id da conversa igual ao id da sessão do Claude Code | o histórico, a retomada e os subagentes dependem disso |

### 1.2 Contratos com o cérebro

| Item | Por quê |
|---|---|
| Nota de status em `sessoes/<id>.md`, formato `# título`, `> resumo`, `- [ ]` / `- [x]` | é o contrato entre o agente e o painel; cérebros existentes já o seguem |
| Variável `CORE_OS_SESSAO` | motores sem prompt de sistema dependem dela |
| Variável `WHATS_PARA` | a skill `whatsapp` depende dela |
| Pasta `conteudo/` como fonte da galeria e da detecção de mídias | roteamento do cérebro |
| Exclusão de `CLAUDE.md` e `AGENTS.md` da galeria e das listas de pasta | são índices, não conteúdo |
| Visibilidade de `.claude` na árvore | o dono precisa ver skills e hooks |
| Marcador `{{NOME}}` no cérebro de exemplo | o instalador o substitui |
| Credenciais guardadas exclusivamente em `/opt/core-os/.env` | regra de segurança e da constituição |

### 1.3 Contratos de instalação

| Item | Por quê |
|---|---|
| Caminhos `/opt/core-os/.env`, `/opt/core-os/dados`, `/opt/core-os/painel`, `/opt/core-os/stack`, `<casa>/cerebro` | reinstalações e skills dependem deles |
| Nomes das variáveis de ambiente (07, §2) | o `.env` de instalações existentes precisa continuar valendo |
| Nomes e formatos dos arquivos de dados (07, §3) | atualizar o painel não pode perder conversas, acessos e logins |
| Flags do instalador (05, §2) | a skill de instalação as usa |
| Idempotência e preservação de segredos e cérebro | reinstalar é o caminho de conserto |
| Portas internas (3000, 5679, 8080) e exposição só pelo proxy | segurança e Compose |
| Nome da instância padrão `cerebro` e do serviço `core-os-painel` | scripts e instruções usam |

### 1.4 Contratos da interface com o servidor

Todas as rotas, métodos, nomes de campos e códigos de 01, e o protocolo do WebSocket de 02, §3.5. Se o implementador reescrever as duas pontas, pode mudar a API interna da interface, mas aí perde a compatibilidade com quem já tem a interface antiga aberta; recomenda-se manter.

### 1.5 Garantias de segurança (não negociáveis)

- Senha obrigatória (gerar uma quando não configurada).
- Comparação em tempo constante de senha e token.
- Limite de tentativas de login por IP.
- Cookie `HttpOnly`, `SameSite=Strict`, `Secure` sob HTTPS.
- Proteção de caminhos com resolução de links simbólicos.
- Verificação de origem no WebSocket.
- Segredos do painel fora do ambiente dos agentes.
- Escape de todo texto vindo de arquivos antes de entrar na página, e remoção de scripts do Markdown renderizado.
- Cabeçalhos contra exibição em frame e adivinhação de tipo.

## 2. Livre (decidir por conta própria)

| Área | Liberdade |
|---|---|
| Visual | cores, fontes, ícones, espaçamentos, animações, efeitos de vidro, logos, nome comercial |
| Textos | todas as frases da interface, mensagens de erro, respostas automáticas do WhatsApp (só a intenção precisa ser a mesma), textos dos pedidos pré-escritos, prompts de sistema (só as ideias de 02, §4.2 e 04, §5.3 precisam estar presentes) |
| Constituição, skills, guia, exemplos | escrever do zero, cobrindo as seções e finalidades de 06; as mídias de exemplo e os nomes das pastas de exemplo podem ser outros |
| Catálogo de extras | quais aplicações e MCPs oferecer, ids, logos e pedidos (mantendo o formato dos itens e a regra de guardar chaves no `.env`) |
| Primeiros testes | quais e quantos |
| Organização do código | linguagem, módulos, nomes internos, padrão de arquitetura; servidor e interface podem ter build ou não |
| Bibliotecas | servidor HTTP, WebSocket, pseudo-terminal, emulador de terminal, Markdown, simulação do grafo, desenho do canvas |
| Persistência interna | pode usar outro mecanismo, desde que os arquivos de 07, §3 continuem sendo lidos e escritos no mesmo formato (para migração e edição à mão) |
| Instalador | linguagem e forma de cada passo, mensagens, cores do terminal; o resultado e as verificações de 05 é que importam |
| Números de ajuste | intervalos de consulta (2 s, 3 s, 4 s, 6 s), tamanhos de cards, limites visuais, parâmetros do grafo, tamanho do buffer do terminal, janela de "trabalhando" (8 s, 30 s), janela de associação de mídias (3 min), desde que o comportamento percebido seja equivalente |

## 3. Melhorias aceitáveis (sem quebrar compatibilidade)

O Core tem limites que o implementador pode corrigir, desde que os contratos de §1 fiquem iguais:

- Limite de tamanho no envio de arquivos.
- Persistir a fila do WhatsApp e a marca de "arquivo enviado pelo dono" entre reinícios.
- Associação de mídia à conversa mais precisa (por exemplo, usando os arquivos escritos que o registro do Claude Code já lista).
- Gravação atômica dos arquivos de dados.
- Expiração de tokens de login no servidor (hoje só o cookie expira).
- Suporte a áudio (transcrição) no WhatsApp.
- Paralelismo por número no WhatsApp, mantendo a ordem dentro de cada número.

## 4. O que evitar

- Copiar textos, prompts, constituição ou skills do Core. Escreva os seus.
- Mudar nomes de rotas, campos, variáveis ou arquivos "porque ficou mais bonito".
- Pôr qualquer segredo dentro da pasta do cérebro ou no ambiente dos agentes.
- Decidir no n8n quem pode dar ordens (essa regra mora no painel, para não precisar mexer no fluxo).
- Executar automaticamente os pedidos pré-escritos: eles só são escritos, a pessoa aperta Enter.

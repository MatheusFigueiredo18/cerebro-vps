# 05 · Instalação

> Requisitos que o instalador precisa cumprir. A forma de implementar (shell, outra linguagem, outro gerenciador) é livre, desde que o resultado e as garantias sejam os mesmos.

## 1. Alvo

- VPS com Ubuntu ou Debian, acesso root (direto ou por `sudo`). Outros sistemas: o instalador para com mensagem clara.
- O Claude Code já instalado e logado para o usuário que vai ser o dono do cérebro (normalmente a pessoa já está rodando o Claude Code nessa VPS, guiada pela skill).
- **Usuário dono:** quem chamou o `sudo` (ou root, se rodou direto). É esse usuário que roda o painel e os agentes, porque o login do Claude Code está na casa dele.

## 2. Entrada (linha de comando)

| Flag | Obrigatória | Regra |
|---|---|---|
| `--nome "<nome>"` | sim | nome do dono, entra na constituição |
| `--dominio <host>` | não | ex.: `cerebro.exemplo.com`; ativa HTTPS e o subdomínio `n8n.<host>` |
| `--senha "<senha>"` | não | pelo menos 8 caracteres; recusada se contiver espaço em branco, aspas (simples ou duplas), `$`, crase ou barra invertida |
| `--whatsapp <número>` | não | só dígitos são mantidos; precisa ter pelo menos 12 (país, DDD e número); vira `WHATS_DONO` |
| `--sem-exemplos` | não | instala o cérebro sem os exemplos de conteúdo |

Opção desconhecida: para com erro. Falta de `--nome`, senha inválida, número curto ou falta de root: para com erro antes de mexer em qualquer coisa.

## 3. Idempotência

Rodar de novo é seguro e é o caminho recomendado para consertar uma falha:

- Segredos existentes no `.env` são **mantidos** (só a senha muda se `--senha` for passada de novo).
- O cérebro só é copiado se ainda não existe uma constituição (`CLAUDE.md`) na pasta de destino. Um cérebro existente nunca é sobrescrito.
- Conversas e dados do painel (`/opt/core-os/dados`) são preservados.
- O código do painel é substituído pela versão nova.
- O fluxo do n8n é reimportado (atualizado).
- Regras de firewall existentes não são apagadas, só acrescentadas.
- Cada passo mostra o que fez; em falha, a mensagem indica qual comando de log olhar.

## 4. Passos

O instalador anuncia 8 passos numerados.

### Passo 1: pacotes do sistema

Instalar, sem interação: `curl`, `ca-certificates`, `jq`, `git`, `openssl`, `ufw`, `ffmpeg` (capas de vídeo e skills), `qrencode` (QR no terminal), `python3`, `build-essential` (compilar o módulo de pseudo-terminal, se preciso).

### Passo 2: Docker

Instalar o Docker pelo instalador oficial se não existir; habilitar o serviço; verificar que o plugin Compose responde. Senão, parar.

### Passo 3: Node.js e Claude Code

- Garantir Node 20 ou mais novo; se estiver abaixo (ou ausente), instalar a linha 22.
- Localizar o executável `claude` **no ambiente de login do usuário dono** (o PATH dele). Não achou: parar, dizendo como instalar o Claude Code e pedindo para rodar de novo.

### Passo 4: segredos e configuração

- Criar `/opt/core-os/` e o arquivo `/opt/core-os/.env` com permissão 600.
- Formato do `.env`: uma linha `CHAVE=valor` por variável (ver 07). Escrever uma chave substitui a linha existente ou acrescenta no fim; valores com caracteres especiais devem ser gravados de forma segura.
- **Gerados só se ausentes:** `CORE_OS_HOOK_TOKEN`, `EVO_KEY`, `POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY` (aleatórios em hexadecimal), `N8N_IMAGE` e `EVOLUTION_IMAGE` (versões fixas testadas das imagens; mantê-las fixas evita quebras por atualização).
- **Senha do painel:** a passada em `--senha`; senão a já existente; senão uma gerada com 16 caracteres alfanuméricos.
- **Sempre reescritos:** `CORE_OS_PORT=3000`, `CORE_OS_HOST=0.0.0.0`, `CORE_OS_VAULT=<casa do dono>/cerebro`, `CORE_OS_DATA=/opt/core-os/dados`, `CLAUDE_BIN=<caminho achado>`, `EVO_URL=http://127.0.0.1:8080`, `EVO_INSTANCE=cerebro`, e `WHATS_DONO` se informado.
- Descobrir o IP público (consulta a um serviço externo com tempo limite curto; senão o primeiro IP local).
- **Com domínio:** `N8N_HOST=n8n.<domínio>`, `N8N_PROTOCOL=https`, `N8N_PUBLIC_URL=https://n8n.<domínio>/`, `N8N_SECURE_COOKIE=true`. Painel em `https://<domínio>`.
- **Sem domínio:** `N8N_HOST=<IP>`, `N8N_PROTOCOL=http`, `N8N_PUBLIC_URL=http://<IP>:5678/`, `N8N_SECURE_COOKIE=false`. Painel em `http://<IP>`.

### Passo 5: cérebro

- Destino: `<casa do dono>/cerebro`.
- Se não existe `CLAUDE.md` lá: copiar o cérebro de exemplo inteiro (incluindo arquivos ocultos como `.claude/` e o link `.agents/skills`).
  - Com `--sem-exemplos`: remover as pastas de exemplo dentro de cada categoria de `conteudo/` e os `.md` que não sejam índice (`CLAUDE.md`) nesses níveis, mantendo as categorias e os índices.
  - Substituir o marcador `{{NOME}}` pelo nome em todos os arquivos (constituição e ponte para outros motores).
  - Passar a posse de tudo para o usuário dono.
- Se já existe: manter como está.
- **Sempre:** dar permissão de execução aos scripts nas pastas `motor/` das skills (arquivos baixados em pacote compactado pelo navegador perdem essa permissão).

### Passo 6: n8n e Evolution API

- Copiar a pilha (arquivo Compose e pasta de fluxos) para `/opt/core-os/stack/` e fazer o `.env` da pilha apontar para `/opt/core-os/.env` (link, para ter uma fonte única).
- Baixar as imagens e subir os containers. Nome do projeto Compose: `core-os` (o volume do n8n se chama `core-os_n8n`).
- Esperar a Evolution responder em `127.0.0.1:8080` (até cerca de 2 minutos). Não respondeu: parar indicando o comando de logs do container.
- Esperar o n8n responder no endpoint de saúde em `127.0.0.1:5679`.
- **Fluxo:** importar o arquivo do fluxo (ver 04, §7) pela linha de comando do n8n dentro do container; registrar uma versão publicada no banco SQLite do n8n (no volume do n8n): gerar um id de versão novo, gravá-lo no fluxo e inserir a linha de histórico correspondente copiando nós, conexões e nome; ativar o fluxo pela linha de comando; reiniciar o n8n e esperar a saúde de novo. Qualquer falha para com o caminho do log.
- **Instância do WhatsApp:** se `cerebro` não existe, criar (integração `WHATSAPP-BAILEYS`). Sempre apontar o webhook para `http://n8n:5678/webhook/core-os-whatsapp` (evento `MESSAGES_UPSERT`). Sempre aplicar as preferências: ignorar grupos, não rejeitar chamadas, não ficar sempre online, não marcar mensagens nem status como lidos, não sincronizar o histórico completo.

### Passo 7: painel

- Copiar o código do painel para uma pasta temporária ao lado do destino, sem `node_modules` e sem `data`; instalar dependências de produção; só então substituir `/opt/core-os/painel` (troca quase atômica: uma falha no `npm` não deixa o painel antigo quebrado).
- Criar `/opt/core-os/dados` com posse do dono.
- Ajustar o `.env`: grupo do dono, permissão 640 (o serviço lê, ninguém mais).
- Serviço do sistema `core-os-painel`:
  - usuário: o dono; diretório de trabalho: `/opt/core-os/painel`;
  - ambiente: `CORE_OS_ENV=/opt/core-os/.env`, `HOME=<casa do dono>`, e `PATH` com a pasta do `claude` mais as pastas padrão do sistema;
  - comando: Node rodando o servidor;
  - reiniciar sempre, com 2 s de espera; iniciar no boot, depois da rede e do Docker.
- Reiniciar o serviço e esperar `GET /api/eu` responder em `127.0.0.1:3000` (até cerca de 20 s). Senão parar indicando o comando de log do serviço.

### Passo 8: acesso pela internet e firewall

- **Proxy reverso** (Caddy, container oficial, rede do host, reinício automático, volume para certificados), com configuração gravada em `/opt/core-os/caddy/`:

| Situação | Regra |
|---|---|
| Com domínio | `<domínio>` para `127.0.0.1:3000`; `n8n.<domínio>` para `127.0.0.1:5679`; HTTPS automático com certificado emitido pelo próprio proxy |
| Sem domínio | porta 80 para `127.0.0.1:3000`; porta 5678 para `127.0.0.1:5679` |

  O container antigo do proxy é removido e recriado a cada instalação.
- **Firewall:**
  - liberar a porta do SSH **detectada** (a que o servidor SSH está escutando; padrão 22), para não trancar a pessoa fora;
  - liberar 80 e 443;
  - sem domínio, liberar 5678;
  - política padrão: negar entrada, permitir saída;
  - liberar a porta 3000 **só** para a faixa de rede privada do Docker (172.16.0.0/12), para o n8n falar com o painel;
  - ativar sem pergunta.

### Fim

- Mostrar um resumo: endereço do painel, senha, endereço do n8n (com o lembrete de que a primeira visita a ele cadastra o administrador), caminho do cérebro, e onde as senhas estão guardadas.
- Se o WhatsApp não está conectado: pedir o código de pareamento à Evolution e desenhar o QR no terminal, com instruções de onde ler no celular. Se não for possível, indicar o script de QR.
- Se já está conectado: dizer isso.

## 5. Portas e exposição

| Porta | Quem escuta | Exposição |
|---|---|---|
| 22 (ou a do SSH) | SSH | internet |
| 80, 443 | proxy | internet |
| 5678 | proxy para o n8n | internet, só sem domínio |
| 3000 | painel (em todas as interfaces) | bloqueada pelo firewall, exceto rede do Docker; acesso público só pelo proxy |
| 5679 | n8n | só loopback |
| 8080 | Evolution API | só loopback |
| Postgres, Redis | containers | só rede interna do Compose |

## 6. Pilha de containers (requisitos)

| Serviço | Requisitos |
|---|---|
| Postgres | versão 16; usuário `coreos`; banco `evolution`; senha `POSTGRES_PASSWORD`; volume persistente; verificação de saúde |
| Redis | versão 7; persistência em arquivo de anexação; volume |
| Evolution API | imagem `EVOLUTION_IMAGE`; só em `127.0.0.1:8080`; chave de autenticação `EVO_KEY`; banco Postgres acima; cache no Redis (cache local desligado); nome do cliente exibido no aparelho conectado identificando o produto; log só de erro e aviso; volume das instâncias; sobe depois do Postgres saudável |
| n8n | imagem `N8N_IMAGE`; porta interna 5678 publicada só em `127.0.0.1:5679`; consegue alcançar o host pelo nome `host.docker.internal`; variáveis: `N8N_ENCRYPTION_KEY`, `N8N_HOST`, `N8N_PROTOCOL`, `WEBHOOK_URL` = `N8N_PUBLIC_URL`, `N8N_SECURE_COOKIE`, fuso `America/Sao_Paulo`, acesso a variáveis de ambiente nos nós liberado, diagnósticos e personalização desligados, `CORE_OS_HOOK_TOKEN`, e `CORE_OS_PONTE` = `http://host.docker.internal:<CORE_OS_PORT>/api/ponte/whatsapp`; volume de dados; pasta de fluxos montada só para leitura em `/fluxos` |

As variáveis vêm do `/opt/core-os/.env` (ligado como `.env` da pilha).

## 7. Script de QR

Script à parte (`whatsapp-qr.sh`), para quando o QR do instalador expira:

- Lê o `/opt/core-os/.env`.
- Se a instância já está conectada, diz isso e sai com sucesso.
- Senão, pede o código de pareamento e desenha o QR no terminal, com a instrução de onde ler. Sem código: diz para tentar de novo em alguns segundos e sai com erro.

## 8. A skill de instalação (`skill/SKILL.md`)

Skill do Claude Code ativada quando a pessoa pede para instalar o produto na VPS. Comportamento:

1. **Perguntar o mínimo, numa mensagem só:** nome; se tem domínio (e, se tiver, avisar para criar antes, no DNS, dois registros A para o IP da VPS: o domínio e o `n8n.` dele); se prefere definir a própria senha de acesso (respeitando as regras de §2) em vez de receber uma gerada; e se os exemplos devem ser instalados (na falta de resposta, instalam).
2. **Conferir o Claude Code** com o comando de versão (o login precisa existir, porque painel e WhatsApp usam essa assinatura).
3. **Rodar o instalador** na pasta da skill com as flags correspondentes. Avisar que demora alguns minutos e mostra 8 passos. Em falha, ler a mensagem, consertar e rodar de novo (continua de onde parou).
4. **Entregar, nesta ordem:** endereço do painel e senha; o QR do WhatsApp (e o script de QR se expirar); o endereço do n8n e o aviso da conta de dono no primeiro acesso, com o fluxo já ativo; um teste mandando uma pergunta no chat "Você" e, se a pessoa usa outro número, autorizá-lo no painel.
5. **Regras:** a senha só aparece depois de a pessoa ser alertada (ela pode estar gravando a tela); nenhuma porta além das do instalador; sem travessão.
6. **Explicação do WhatsApp para a pessoa:** o número conectado é o número do cérebro (conta pessoal ou comercial); quem dá ordens (chat "Você" e números autorizados); grupos e números de fora são ignorados; trocar número não exige mexer no n8n; comando de conversa nova; expiração de 6 horas; conversas aparecem no painel com selo.

## 9. Pacote de distribuição

Existe um script de empacotamento, `montar-pacote.sh`. Saídas: `dist/core-os.tar.gz`, além de `dist/core-os.zip`, ambos com, numa pasta `core-os/`:

- o conteúdo da pasta da skill na raiz (skill, instalador, script de QR, pilha);
- `painel/` sem `node_modules` e sem `data`;
- `cerebro/` com o cérebro de exemplo, sem arquivos de metadados de sistema operacional (como os que o gerenciador de arquivos do computador cria sozinho).

O instalador procura `cerebro/` e `painel/` ao lado de si (pacote) e, se não achar, `../cerebro-demo` e `../painel` (repositório clonado).

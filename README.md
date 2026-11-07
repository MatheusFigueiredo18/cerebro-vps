# cerebro-vps

Painel web para um segundo cérebro em arquivos Markdown, pensado para rodar numa VPS: você escreve e organiza páginas e bancos de dados, conversa com o Claude Code e controla WhatsApp e n8n, tudo na mesma tela.

## Créditos

Este projeto é uma **adaptação para uso pessoal** do **Core OS**, projeto de **Felipe Tâmbara**. O original está em https://github.com/felipefernandees/core-os e tem licença própria do autor. O comportamento e a arquitetura vêm dele; a implementação deste repositório foi reescrita e estendida (guias, páginas em blocos e bancos de dados). Para qualquer uso além do pessoal, consulte o autor do projeto original.

## Como a tela funciona

- **Guias no topo, como no Chrome.** A primeira é sempre o **Grafo**. Cada página, banco ou função aberta vira uma guia. Abaixo fica a barra de caminho, com voltar, avançar e favorito.
- **Lateral com 4 abas:** Arquivos (árvore e ações: nova página, pasta, banco, ordenar, recolher), Busca, Favoritos e Funções.
- **Páginas em blocos:** cada página é um `.md`. Digite `/` para escolher o tipo de bloco. Salva sozinha e avisa se o arquivo mudou por fora.
- **Bancos de dados:** uma pasta com um `.banco.json` e uma página `.md` por linha. Visões de tabela, quadro (arrastar muda o valor) e calendário.
- **Funções:** Conversas (terminais do Claude Code num canvas), Conteúdos (galeria de mídias), WhatsApp (conexão e quem pode dar ordens) e n8n.

## Como os dados ficam

Tudo é arquivo, sem banco de dados escondido. Uma página é `Nome.md` (o cabeçalho é preservado). Um banco é uma pasta com `.banco.json` e as propriedades de cada linha no cabeçalho do `.md` dela. As preferências da tela (guias abertas, favoritos) ficam no navegador.

## Rodar no seu computador

Precisa de Node 20 ou mais novo.

```bash
npm install
mkdir -p /tmp/cerebro-teste /tmp/dados-teste
CORE_OS_ENV=/nao-existe CORE_OS_VAULT=/tmp/cerebro-teste CORE_OS_DATA=/tmp/dados-teste CORE_OS_PASSWORD=teste123 CORE_OS_PORT=3917 npm start
```

Abra `http://127.0.0.1:3917` e entre com a senha. Variáveis principais: `CORE_OS_VAULT` (pasta do cérebro), `CORE_OS_DATA` (dados do painel), `CORE_OS_PASSWORD`, `CORE_OS_PORT`, `CORE_OS_HOST`, `CORE_OS_ENV` (arquivo `.env`). O resumo completo está em `docs/especificacao/07-configuracao-e-dados.md`.

O terminal das conversas usa `node-pty` (instalado como opcional). Sem ele, o painel cai num terminal simples por pipes.

## Testes

```bash
npm test
```

Cobrem servidor, páginas, bancos, conversão de Markdown em blocos e a lógica da interface. A parte visual foi conferida à mão num navegador, com um motor de IA e uma Evolution API falsos. Nada foi testado ainda com Claude Code, Codex, Antigravity, Grok, Evolution ou n8n reais, nem em Linux.

## Instalar numa VPS com um prompt

**Antes de começar**

- VPS com **Ubuntu ou Debian**.
- Um **usuário comum com `sudo`** (não root). Como root, o Claude Code não responde no modo sem confirmações, que é o que atende o WhatsApp. Se a VPS só tem root, crie um: `adduser cerebro && usermod -aG sudo cerebro`, depois entre nele com `su - cerebro` (ou `ssh cerebro@IP`).
- **Claude Code instalado e logado nesse usuário.** O painel e o WhatsApp usam essa mesma assinatura.
- Este repositório é **público**: o clone não precisa de login no GitHub. Só o Claude Code precisa estar logado.

**O prompt.** Logado no usuário comum, abra o Claude Code e cole:

```
Clona o repositório https://github.com/MatheusFigueiredo18/cerebro-vps em ~/cerebro-vps, lê o ~/cerebro-vps/skill/SKILL.md e instala o painel neste servidor seguindo ele.
```

Se a sessão estiver como root, a skill para e mostra como criar o usuário comum antes de seguir.

**O que o Claude Code pergunta** (numa mensagem só): seu nome, se você tem domínio, se quer escolher a senha do painel e se instala os exemplos de conteúdo.

**O que ele entrega:** o endereço do painel e a senha (avisando antes de mostrar), o QR do WhatsApp para ler no celular, o endereço do n8n (a primeira visita cria a conta de dono; o fluxo do WhatsApp já vem ativo) e um teste mandando uma pergunta no chat "Você" do WhatsApp.

**Com domínio.** Antes de instalar, crie no DNS do domínio dois registros do tipo A apontando para o IP da VPS: o domínio (ex.: `cerebro.seusite.com`) e o `n8n.` dele (ex.: `n8n.cerebro.seusite.com`). O certificado HTTPS sai sozinho quando o DNS já aponta para a VPS. Sem domínio, o painel fica em `http://<IP>` e o n8n em `http://<IP>:5678`.

**Instalação à mão**, sem o Claude Code guiando:

```bash
git clone https://github.com/MatheusFigueiredo18/cerebro-vps.git ~/cerebro-vps
cd ~/cerebro-vps
sudo bash instalador/instalar.sh --nome "Seu Nome" [--dominio cerebro.seusite.com] [--senha "SuaSenha123"] [--whatsapp 5562999998888] [--sem-exemplos]
```

`--simular` mostra os 8 passos sem mudar nada. Chamado direto como root (sem `sudo` a partir de um usuário comum), o instalador para e explica; `--aceitar-root` força a instalação, sabendo que o WhatsApp com o Claude não vai responder. Em caso de erro, a mensagem diz qual log olhar; depois de corrigir, rode o mesmo comando de novo (ele continua de onde parou e não apaga senhas, dados nem o cérebro). Se o QR do WhatsApp vencer: `sudo bash instalador/whatsapp-qr.sh`.

**O que fica onde:** segredos em `/opt/core-os/.env`, painel em `/opt/core-os/painel` (serviço `core-os-painel`), dados em `/opt/core-os/dados`, n8n e Evolution em `/opt/core-os/stack` (projeto Compose `core-os`) e o cérebro em `~/cerebro` do dono.

**Atualizar.** Na VPS:

```bash
cd ~/cerebro-vps && git pull
sudo bash instalador/instalar.sh --nome "Seu Nome" [as mesmas opções de antes]
```

O código do painel e o fluxo do n8n são atualizados; senhas, conversas e o cérebro ficam como estão. Para gerar um pacote sem git: `bash montar-pacote.sh` cria `dist/cerebro-vps.tar.gz`.

## Estrutura

| Pasta | O que é |
|---|---|
| `servidor/` | Servidor Node (Express e WebSocket) |
| `cliente/` | Interface (JavaScript e CSS sem etapa de build) |
| `instalador/` | Instalador da VPS, script do QR do WhatsApp e pilha (Compose, fluxo do n8n) |
| `skill/` | Skill que o Claude Code da VPS segue para instalar |
| `cerebro-exemplo/` | Cérebro que o instalador copia (constituição, skills, hooks e exemplos) |
| `teste/` | Testes automáticos (`node --test`) |
| `docs/especificacao/` | Especificação do comportamento do painel |
| `docs/DECISOES.md` | Escolhas de implementação e o porquê |
| `scripts/` | Geração dos ícones a partir do Lucide |

## Ainda não existe

- Teste numa VPS de verdade: o instalador só foi testado com comandos falsos (Docker, n8n, Evolution e HTTPS reais ainda não rodaram).
- Transcrição de áudio no WhatsApp (por enquanto o cérebro pede para escrever).

Ícones: Lucide (licença ISC), ver `THIRD-PARTY.md`.

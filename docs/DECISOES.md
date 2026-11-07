# Decisões do implementador

> Escolhas que a especificação deixou em aberto. Formato: o quê, por quê, custo se estiver errado.

## Servidor

| # | Decisão | Por quê | Custo se errado |
|---|---|---|---|
| 1 | Express 5 como servidor HTTP, `ws` para WebSocket, `node-pty` como dependência opcional | Express já resolve Range, download, MIME, `trust proxy` e limite de corpo; `node-pty` tem binários prontos, mas é opcional para o painel subir mesmo sem ele (cai num terminal por pipes) | Trocar de biblioteca exige reescrever só `app.js` |
| 2 | Arquivos de dados gravados de forma atômica (temporário e `rename`); se o `rename` falhar com EPERM, EACCES ou EBUSY, grava direto no destino | Melhoria aceita em 08, §3; no Windows um antivírus segurando o arquivo fazia o `rename` falhar de vez em quando (pego como teste instável) | No caso de reserva a gravação deixa de ser atômica |
| 3 | O limite de 50 tokens vale também na memória, não só no arquivo | Mantém memória e `logins.json` iguais; um token que sai do arquivo deixaria de valer após reinício de qualquer forma | Quem tem mais de 50 aparelhos logados perde o mais antigo na hora, não só no reinício |
| 4 | Pasta padrão do cérebro: `../cerebro` relativa à pasta do painel | Bate com o pacote (`core-os/painel` e `core-os/cerebro` lado a lado). Se não existir, o painel não sobe e diz qual caminho faltou | Quem rodar do repositório precisa definir `CORE_OS_VAULT` |
| 5 | `HOME` do ambiente vence `os.homedir()` para achar `~/.claude` e `~/.codex` | O serviço recebe `HOME` explícito (05, passo 7) e os testes usam uma casa temporária | Nenhum em produção |
| 6 | Árvore: itens até o nível 8 aparecem; pasta no nível 8 vem com `filhos` vazio | Leitura literal de "8 níveis abaixo da raiz" | Uma pasta a mais ou a menos de profundidade visível |
| 7 | Árvore não segue links simbólicos (aparecem como arquivo) | Evita expor nomes de fora do cérebro e laços; a leitura continua protegida por `resolverNoVault` | Quem usa link para pasta dentro do cérebro não vê os filhos na árvore |
| 8 | Wikilink com caminho (`[[pasta/nota]]`) casa só pelo nome base | A especificação manda casar pelo nome base | Duas notas de mesmo nome em pastas diferentes: o link vai para a primeira da árvore |
| 9 | Envio cria a pasta pedida só se o ancestral existente, já resolvido, estiver dentro do cérebro | A checagem só por texto deixaria um link simbólico criar pastas fora do cérebro antes da recusa | Nenhum |
| 10 | Envio sem limite de tamanho | Comportamento do Core (01, §6.4); o limite é melhoria opcional | Disco cheio se alguém logado mandar arquivos enormes |
| 11 | Capa com `-ss 1`: vídeo com menos de 1 s não gera quadro e responde 404 | Segue a especificação à risca | Vídeos curtíssimos ficam sem miniatura (a interface mostra o selo genérico) |
| 12 | Corpo das rotas de banco: `POST /api/bancos {pasta,nome}`, `POST /api/banco/linhas {pasta,titulo}`, `PATCH /api/banco/linha {caminho,prop,valor}`, `PUT /api/banco/esquema {pasta,esquema}`; resposta sem valor de retorno vira `{ ok: true }` | A tarefa definiu só as rotas; os nomes seguem os parâmetros das funções de `bancos.js` | A interface precisa usar os mesmos nomes |
| 13 | Erros 400 e 404 de páginas e bancos devolvem a mensagem do módulo em `erro`; 500 devolve texto genérico | As mensagens dos módulos já são curtas e em português; o 500 não vaza detalhe interno | Mensagens técnicas como "fora do vault" chegam à pessoa |
| 14 | Sem `node-pty`, o terminal cai num substituto por pipes com a mesma interface (sem TTY real, sem redimensionar) | O painel sobe mesmo se o binário nativo falhar; os testes usam esse substituto para não depender de pseudo-terminal | O agente roda sem cores e pode se comportar diferente; em produção o `node-pty` deve estar instalado |
| 15 | `CLAUDE_BIN`, `CODEX_BIN`, `AGY_BIN` e `GROK_BIN` terminados em `.js` ou `.mjs` rodam com o próprio Node | Permite um motor falso portátil nos testes (Windows e Linux) | Nenhum para binários reais |
| 16 | Pedido pré-escrito: a tela considerada é o fim do buffer a partir da última limpeza de tela; telas iniciais detectadas por palavras (trust, login, select login, choose the, enter to confirm, confia, escolha) | Texto antigo de uma tela de confiança já respondida não pode travar o pedido para sempre | Uma tela nova do motor com texto diferente pode receber o pedido cedo demais; a pessoa ainda precisa apertar Enter |
| 17 | Histórico de id válido mas desconhecido lê o registro do Claude Code por esse id (lista vazia se não houver) | A especificação só define o 400; o registro depende só do id | Nenhum: não expõe nada além do que o id aponta |
| 18 | Título padrão de conversa do WhatsApp no formato `WhatsApp 31/10, 14:05` (fuso de São Paulo) | Saída padrão do `Intl` em pt-BR | Só visual |
| 19 | Mídia nova vai para a conversa com maior atividade (terminal ou registro do motor) nos últimos 3 min; ocultos em `conteudo/` são ignorados | Segue 02, §7; ocultos seguem a regra das outras listagens | Duas conversas ativas: a mídia vai para a mais recente (limite aceito pelo Core) |
| 20 | Corpos da Evolution no formato da v2: `webhook/set` com `{ webhook: { enabled, url, byEvents, base64, events } }` e `instance/create` com `{ instanceName, integration, qrcode: false }` | É a versão que o instalador usa hoje | Com a Evolution v1 o webhook não é gravado; muda só `evolution.js` |
| 21 | `GET /api/config` com falha da Evolution mantém `estado: "indisponivel"` e põe a mensagem em `erro` | A interface mostra o selo "indisponível" com o erro (03, §12) | Nenhum |
| 22 | `qr` sem prefixo `data:` ganha `data:image/png;base64,` | A rota promete uma data URL; algumas versões da Evolution mandam só o base64 | Nenhum |
| 23 | `posicao` da ponte conta as mensagens esperando mais a que está rodando | "Tamanho da fila" ficava ambíguo; assim 1 significa "é a próxima ou já está rodando" | Só informativo para o n8n |
| 24 | Corpo da ponte sem `tipo` é tratado como `texto` | O fluxo antigo pode não mandar o campo | Uma mídia sem `tipo` vira texto vazio e recebe 400 |
| 25 | `sessaoMotor` só é gravado para Codex, Antigravity e Grok | No Claude Code o id da sessão já é o id da conversa; no Grok a sessão é nomeada com o id da conversa (-s) | Nenhum |
| 26 | Catálogo com textos próprios: 7 aplicações e 8 MCPs; aplicação instalada se achar o executável, um pacote npm global nas pastas padrão (sem rodar `npm`) ou uma pasta de cache na casa | Rápido o bastante para a consulta de 3 s das configurações | Instalação fora das pastas padrão aparece como não instalada |
| 27 | Projeto do `~/.claude.json` casa com o cérebro por `path.resolve` igual ao caminho real | O Claude Code grava o caminho absoluto do projeto | Cérebro acessado por link simbólico pode não casar |
| 28 | A senha aleatória (quando `CORE_OS_PASSWORD` está vazia) é gerada dentro de `criarServidor`, não só no `index.js` | Qualquer forma de subir o servidor fica protegida, inclusive testes e scripts | Nenhum |
| 29 | `CORE_OS_PORT=0` é aceito (porta livre escolhida pelo sistema) e o log mostra a porta real | Facilita testar o `index.js` de verdade | Nenhum em produção |
| 30 | (substituída na fase 2) `cliente/index.html` provisório | A fase 1 era só servidor | Ver decisões 31 a 43 |

## Interface (fase 2)

| # | Decisão | Por quê | Custo se errado |
|---|---|---|---|
| 31 | Desenho do dono no lugar do mapa de 03, §2: guias no topo (Grafo fixo), barra de caminho, lateral com 4 abas, funções em guias (Conversas, Conteúdos, WhatsApp, n8n). Sem dock: tema e sair no rodapé da lateral | Pedido explícito do dono; 03 diz que a aparência é livre | Quem conhece o Core procura o dock |
| 32 | Arquivos abrem em guia (página no editor, banco na tabela, o resto numa guia de leitura); mídias abrem no visor. A mesa do canvas não recebe cards de arquivo, só o cartão de boas-vindas | Com guias, abrir o mesmo arquivo também como card duplicava o caminho | Quem quer ver uma nota ao lado do terminal precisa alternar guias |
| 33 | Configurações viraram a guia WhatsApp (motor, conexão, acesso, extras, MCP, endereço); a seção n8n virou guia própria, que abre `N8N_PUBLIC_URL` em aba nova | Desenho do dono; o n8n costuma recusar ser exibido dentro de outra página | Um clique a mais para chegar ao n8n |
| 34 | `GET /api/arvore` ganhou `mtime` em todo item e `banco: true` nas pastas com `.banco.json` (campos novos, os antigos ficam iguais) | A árvore esconde arquivos ocultos, então a interface não tinha como saber o que é banco; "ordenar por recentes" precisa da data | Um `lstat` a mais por item a cada 6 s |
| 35 | Bibliotecas do terminal (`@xterm/xterm`, `addon-fit`, `addon-unicode11`) vêm do npm e são servidas em `/vendor/<pacote>/lib` e `/vendor/xterm/css`, só essas pastas, sem login | 01, §1 já prevê `/vendor`; liberar só as pastas de build evita expor `package.json` e outros pacotes | Atualizar o xterm pode mudar o nome dos arquivos de build |
| 36 | Sem logotipos: motores, extras e MCPs mostram um selo com a inicial | `/logos` não faz parte do pacote e logotipo de terceiro tem licença própria | Visual menos reconhecível |
| 37 | Nenhum `alert` ou `confirm`: encerrar conversa, desconectar o WhatsApp e afins pedem confirmação no próprio botão (segundo clique); fechar uma página com conflito aberto é recusado e o aviso pisca | Diálogos do navegador travam automação e somem com o texto de contexto | Um clique a mais |
| 38 | 401 mostra o login por cima, sem recarregar a página: depois de entrar de novo, guias e texto não salvo continuam lá | 03, §1 pede só "voltar para o login"; recarregar perderia o que estava sendo digitado | Nenhum |
| 39 | Markdown de leitura (visor, guia de arquivo, balões do WhatsApp) feito em casa por cima de `mdParaBlocos`, montando nós DOM com `textContent`; HTML cru do arquivo aparece como texto | Sem dependência nova e sem `innerHTML` com dado do cérebro; não há como um `<script>` virar elemento | HTML legítimo dentro de notas não é renderizado |
| 40 | Envio de arquivos por `XMLHttpRequest` | `fetch` não informa o progresso do envio, e 03, §9.3 pede barra de progresso | Nenhum |
| 41 | Arquivo de tipo desconhecido na guia de leitura mostra "sem prévia" e botão de baixar, como no visor, em vez de texto pré-formatado | Binário como texto vira lixo na tela | Arquivo de texto com extensão rara precisa ser baixado |
| 42 | Funções na lateral: fixar, subir, descer e ocultar guardados no navegador com `aplicarPrefs`; subir e descer só trocam dentro do mesmo grupo (fixas ou não) | Os fixos sempre vêm primeiro em `aplicarPrefs` | Nenhum |
| 43 | O grafo só simula enquanto a guia dele está à mostra; com a aba do navegador em segundo plano segue em ritmo menor por `setTimeout` | Economiza processador com o grafo fora da vista | Ao voltar, a simulação recomeça morna em vez de continuar de onde parou |

## Instalação (fase 3)

| # | Decisão | Por quê | Custo se errado |
|---|---|---|---|
| 44 | Instalador em bash; todo caminho de sistema passa pelo prefixo `CEREBRO_VPS_RAIZ` e a casa do dono pode vir de `CEREBRO_VPS_CASA`; `--simular` só imprime | Permite rodar o instalador inteiro nos testes, com comandos falsos no PATH, sem root e sem VPS | Nenhum em produção (as variáveis ficam vazias) |
| 45 | Docker e Node.js vêm dos repositórios apt oficiais (chave assinada em `/etc/apt/keyrings`), não do `get.docker.com` nem do script da NodeSource | Regra de não executar `curl \| bash` de terceiros quando há pacote; o apt confere a assinatura | Distribuição muito nova pode ainda não ter repositório da Docker para o seu codinome |
| 46 | Versões fixas: n8n `2.46.3`, Evolution API `v2.3.7` (`evoapicloud/evolution-api`), Caddy `2.11.7`, Postgres `16-alpine`, Redis `7-alpine` | As mais recentes estáveis no Docker Hub em 31/10/2026; a spec pede versões fixas | Não foram testadas contra containers reais: a ativação do fluxo e o QR podem mudar entre versões |
| 47 | Ativação do fluxo: tenta `n8n publish:workflow` e, se não existir, `n8n update:workflow --active=true` | O n8n 2.x trocou o "ativar" por "publicar"; o 1.x só tem o segundo | Se as duas falharem numa versão futura, o passo 6 para com o caminho do log |
| 48 | Versão publicada gravada por `stack/publicar-fluxo.py` (Python do sistema) direto no SQLite do volume `core-os_n8n`, preenchendo só as colunas que existem; depois devolve os arquivos `-wal`/`-shm` ao dono do banco | O esquema do histórico muda entre versões; Python e `sqlite3` já vêm no sistema e o script fica testável fora do container | Escrever com o n8n rodando depende do travamento do SQLite (há espera de 30 s); um esquema com coluna obrigatória nova faz o passo falhar com o log |
| 49 | Chave da Evolution passada ao `curl` por arquivo temporário (`-H @arquivo`), nunca na linha de comando | Não aparece em `ps`, no log nem na saída | Nenhum |
| 50 | Valores do `.env` só ganham aspas simples quando têm caractere fora de `[A-Za-z0-9_./:@+,-]` | O painel e o Compose tiram o par de aspas e não interpretam nada dentro; a senha já recusa aspas, `$`, crase e barra invertida | Nenhum para os valores que o instalador grava |
| 51 | Senha gerada com 16 caracteres de `/dev/urandom` filtrados para letras e dígitos; segredos com `od` em hexadecimal (64 caracteres, 48 no Postgres) | Não depende do `openssl` e não tem `SIGPIPE` com `pipefail` | Nenhum |
| 52 | Log da instalação em `/var/log/core-os-instalacao.log`; a tela mostra só o resumo de cada passo e, em erro, o comando de log certo (`tail` do log, `docker compose logs`, `journalctl -u core-os-painel` ou `docker logs core-os-caddy`) | A saída do apt e do npm esconderia os 8 passos | Quem quer ver tudo precisa abrir o log |
| 53 | Cérebro montado numa pasta de preparo ao lado do destino (limpa metadados de sistema, refaz o link `.agents/skills`, tira exemplos, troca `{{NOME}}`) e só então movido; se a pasta já existia sem `CLAUDE.md`, a cópia nunca sobrescreve (`cp -n`) | Nada do que o dono tenha lá é apagado ou trocado | Uma pasta com arquivos de mesmo nome fica com a versão do dono |
| 54 | `.agents/skills` guardado no git como link simbólico (modo 120000) e recriado pelo instalador quando chega como arquivo comum | Clone no Windows e download em zip transformam o link em texto | Nenhum |
| 55 | Painel copiado como `servidor`, `cliente`, `package.json`, `package-lock.json` e `THIRD-PARTY.md`, com `npm ci --omit=dev` na pasta nova antes da troca | Lista explícita serve tanto ao repositório clonado quanto ao pacote; `npm ci` respeita a trava de versões | Arquivo novo na raiz do painel precisa entrar na lista (instalador e `montar-pacote.sh`) |
| 56 | Pacote `dist/cerebro-vps.tar.gz` com `skill/`, `instalador/`, `painel/` e `cerebro/` dentro de `cerebro-vps/`; sem zip | O nome do repositório no lugar de `core-os`, e o mesmo layout relativo do repositório (a skill aponta para `instalador/instalar.sh` nos dois casos); o instalador procura `../painel` e `../cerebro` e cai em `..` e `../cerebro-exemplo` | Quem esperava o `.zip` da spec precisa extrair o tar |
| 57 | Ferramenta da skill `whatsapp` escrita em Node (`motor/whatsapp.mjs`), com `motor/whatsapp.sh` só repassando os argumentos | JSON, base64, `fetch` e fuso de São Paulo nativos; o Node já está na VPS por causa do painel; testável com uma Evolution falsa | Rodar fora da VPS exige Node 20+ |
| 58 | Corpos da Evolution v2 na ferramenta: `chat/findChats`, `chat/findContacts` (`where: {}`), `chat/findMessages` (`where.key.remoteJid`), `message/sendMedia` (`mediatype`, `mimetype`, `media`, `fileName`, `caption`) e `message/sendWhatsAppAudio` (`audio`) | Formato da v2 usada no compose | Mudança de formato da Evolution exige ajustar só `whatsapp.mjs` |
| 59 | O filtro do n8n também descarta mídia cuja legenda começa com U+2063 | Imagem que o cérebro manda ao chat "Você" voltaria como "só leio texto" | Nenhum: o painel nunca recebe as próprias mídias |
| 60 | Dono root aborta o instalador antes de qualquer mudança, explicando como criar um usuário comum com sudo; só segue com `--aceitar-root`, avisando no começo e no fim. A skill para logo no início se a sessão for root. README e prompt clonam em `~/cerebro-vps` | Decisão do dono: como root o Claude Code recusa `--dangerously-skip-permissions`, e é esse modo que responde no WhatsApp; nenhum desvio de segurança é ligado | Quem tem só root precisa criar o usuário e logar o Claude Code de novo nele |
| 61 | O QR do fim da instalação é o próprio `whatsapp-qr.sh` | Uma lógica só para o instalador e para quando o QR vence | Nenhum |
| 62 | Porta do SSH lida de `sshd -T`; sem ela, de `ss`; por fim 22 | `sshd -T` mostra a configuração efetiva, inclusive `Include` | Servidor SSH que não é o OpenSSH cai no 22 |

## Pendências conhecidas da fase 1

- Interface web: feita na fase 2 (ver decisões 31 a 43).
- Persistência da fila do WhatsApp e da marca de envio do dono entre reinícios (limites aceitos pelo Core).
- Teste com `node-pty` real fica fora da suíte (no Windows o pseudo-terminal segura o processo de teste); conferido à mão uma vez com o motor falso.
- Nada foi testado contra Claude Code, Codex, Antigravity, Evolution ou n8n reais: só contra os falsos dos testes.
- Instalador (fase 3): testado só com comandos falsos num prefixo temporário e em `--simular`. Ainda não rodou numa VPS real, nem com Docker, Caddy (HTTPS), Evolution ou n8n de verdade.

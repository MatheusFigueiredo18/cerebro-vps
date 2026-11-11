# 01 · API HTTP

> Todas as rotas que o painel expõe. Caminhos, métodos, nomes de campos e códigos de status são interface: a interface web e o fluxo do n8n dependem deles.

## 1. Regras gerais

| Regra | Comportamento |
|---|---|
| Corpo JSON | Rotas que recebem corpo aceitam `application/json` com limite de 1 MB. A rota de envio de arquivo é a exceção (corpo binário cru, ver §6.5). |
| Erros | Quando há corpo de erro, ele é um objeto JSON com o campo `erro` (texto curto em português, voltado à pessoa). Algumas rotas respondem erro sem corpo (indicado em cada uma). |
| Cabeçalhos de segurança | Toda resposta leva: proibição de exibição em frame (`X-Frame-Options: DENY`), `X-Content-Type-Options: nosniff` e `Referrer-Policy: no-referrer`. O cabeçalho que anuncia o framework do servidor é desligado. |
| Proxy | O servidor confia em cabeçalhos de proxy só quando a conexão vem do loopback (o Caddy roda no mesmo host). Isso define o IP real do cliente e se a requisição é HTTPS. |
| Estáticos | A interface (`/`, `/app.js`, `/app.css`, `/logos/*`) e as bibliotecas de terceiros (sob `/vendor/...`) são servidas sem exigir login. Os dados nunca são estáticos: tudo que vem do cérebro passa por `/api`. |

## 2. Autenticação

### 2.1 Modelo

- Senha única, lida de `CORE_OS_PASSWORD`. Se estiver vazia, o servidor gera uma senha aleatória curta a cada inicialização e a escreve no log, para que o painel nunca fique aberto sem senha.
- Login bem-sucedido gera um token aleatório de 32 bytes, em hexadecimal. O token vai num cookie chamado `coreos`, com `HttpOnly`, `SameSite=Strict`, `Path=/`, validade de 30 dias (2.592.000 s) e `Secure` quando a requisição chegou por HTTPS.
- Os tokens válidos ficam em memória e são persistidos em `logins.json` (ver 07). Ao gravar após um login, só os 50 mais recentes são mantidos. Reiniciar o painel não desloga ninguém.
- Comparação da senha em tempo constante (comparar resumos de mesmo tamanho, por exemplo SHA-256 da senha enviada e da senha correta), para não vazar informação por tempo de resposta.

### 2.2 Limite de tentativas

- Contagem por IP de cliente das tentativas **erradas** nos últimos 60 segundos.
- Com 5 ou mais erros na janela, novas tentativas recebem `429` com `erro` dizendo para esperar um minuto, **sem** checar a senha.
- Tentativa correta não zera o contador, mas também não soma. A janela é deslizante.
- O contador vive só em memória.

### 2.3 Barreira

Ordem de avaliação:

1. Rotas livres: `POST /api/login`, `POST /api/logout`, `GET /api/eu`, `POST /api/ponte/whatsapp` (esta tem token próprio).
2. Qualquer outra rota sob `/api` exige cookie `coreos` com token válido. Sem ele: `401` com `erro` pedindo login.
3. Cada rota pertence a uma seção (`servidor/acessos.js`, `secaoDaRota`). O admin passa em tudo; outra pessoa precisa da seção com nível `ver` (GET e HEAD) ou `editar` (qualquer método). Sem a permissão: `403 { erro }`. Rotas de Conversas, de usuários, da geração de vídeo, dos números autorizados do WhatsApp e qualquer rota sem seção definida são só do admin. `/api/arquivo`, `/api/capa` e `/api/enviar` fora de `conteudo/` exigem a seção Arquivos; dentro de `conteudo/` também servem Conteúdos, Quadro ou Vídeo.
4. O WebSocket `/ws` exige cookie do admin (ver 02).

## 3. Rotas de sessão

| Método e caminho | Entrada | Sucesso | Erros |
|---|---|---|---|
| `POST /api/login` | `{ "usuario"?: string, "senha": string }`. Sem usuário ou com `admin`, confere a senha do `.env` | `200 { "ok": true }` e `Set-Cookie` | `401 { erro }` usuário ou senha errados (pessoa suspensa também); `429 { erro }` limite |
| `POST /api/logout` | nada | `200 { "ok": true }`, cookie apagado (validade zero); o token sai da lista e a lista é regravada | nunca falha |
| `GET /api/eu` | nada | `200 { "logado": false }` ou `{ "logado": true, admin, usuario, nome, permissoes }` (`permissoes` é `null` para o admin) | nunca falha. É também a rota de saúde usada pelo instalador |

### 3.1 Pessoas (só admin)

| Método e caminho | Entrada | Sucesso | Erros |
|---|---|---|---|
| `GET /api/usuarios` | nada | lista `{ id, usuario, nome, ativo, permissoes }` (a senha nunca sai) | |
| `POST /api/usuarios` | `{ usuario, nome?, senha, permissoes }` | a pessoa criada | `400 { erro }` usuário inválido, repetido ou `admin`; senha com menos de 8 caracteres |
| `PUT /api/usuarios/:id` | qualquer um de `{ nome, senha, ativo, permissoes }` | a pessoa atualizada. Senha nova ou `ativo: false` derrubam as sessões abertas dela | `404`, `400` |
| `DELETE /api/usuarios/:id` | nada | `{ ok: true }` e as sessões dela caem | `404` |

`permissoes` é `{ secao: 'ver' | 'editar' }` com as seções `grafo`, `arquivos`, `conteudos`, `whatsapp`, `n8n`, `lousa` e `video`; seção ausente é sem acesso. As pessoas ficam em `usuarios.json` na pasta de dados, com a senha guardada como resumo scrypt.

## 4. Proteção de caminhos

Toda rota que recebe um caminho do cérebro (parâmetro `caminho` ou `pasta`) aplica a mesma regra:

1. Remover barras iniciais do valor recebido (o caminho é sempre relativo à raiz do cérebro).
2. Resolver contra a raiz do cérebro e obter o caminho **real** (seguindo links simbólicos).
3. Se o caminho não existe, ou se o caminho real não é a própria raiz nem está dentro dela, a rota trata como "não encontrado".
4. A raiz do cérebro também é resolvida para o caminho real na inicialização, para que a comparação seja coerente.

Consequência: `..`, caminhos absolutos e links simbólicos que apontem para fora do cérebro são recusados. Arquivos ocultos (começando por ponto) **podem** ser lidos se o caminho for pedido explicitamente.

## 5. Arquivos e árvore

### 5.1 `GET /api/arvore`

Devolve a árvore inteira do cérebro como lista de nós:

| Campo | Tipo | Observação |
|---|---|---|
| `nome` | string | nome do item |
| `caminho` | string | relativo à raiz, separador `/` |
| `tipo` | `"pasta"` ou `"arquivo"` | |
| `filhos` | lista de nós | só em pastas |

Regras:

- Esconde `.git`, `node_modules`, `.DS_Store`, `.obsidian`, `.trash` e qualquer item que comece com ponto, **exceto** `.claude` (as skills e hooks ficam visíveis).
- Ordem: pastas antes de arquivos; dentro de cada grupo, ordem alfabética com regras do português.
- Profundidade máxima de 8 níveis abaixo da raiz; abaixo disso a pasta aparece com `filhos` vazio.
- Pasta ilegível vira lista vazia, sem erro.

### 5.2 `GET /api/arquivo?caminho=<rel>[&baixar=1]`

- Caminho passa pela proteção (§4) e precisa ser arquivo. Senão `404 { erro }`.
- Sem `baixar`: devolve o conteúdo com o tipo MIME pela extensão e `Cache-Control: no-cache`. Deve suportar requisições parciais (Range) para que vídeos possam ser avançados no navegador.
- Com `baixar` (qualquer valor não vazio): devolve como anexo para download, com o nome original.

### 5.3 `GET /api/pasta?caminho=<rel>`

- Caminho precisa ser pasta. Senão `404 { erro }`.
- Devolve **todos os arquivos** dentro dela, recursivamente, como lista plana: `{ caminho, nome, tamanho (bytes), mtime (ms desde a época) }`.
- Ignora, em qualquer nível, itens que comecem com ponto e os arquivos de índice `CLAUDE.md` e `AGENTS.md`.
- Ordem: caminho em ordem natural (números comparados como números, regras do português).

## 6. Conteúdos

"Conteúdos" é a galeria da pasta `conteudo/` do cérebro.

### 6.1 `GET /api/conteudos`

Devolve uma lista de **categorias** (subpastas diretas de `conteudo/`):

| Campo | Tipo | Observação |
|---|---|---|
| `nome` | string | nome da subpasta (ex.: `carrosseis`) |
| `caminho` | string | `conteudo/<nome>` |
| `itens` | lista | ver abaixo |
| `mtime` | número | maior `mtime` dos itens (0 se vazia) |

Cada **item** é uma entrada direta da categoria (pasta ou arquivo solto):

| Campo | Tipo | Observação |
|---|---|---|
| `nome` | string | |
| `caminho` | string | |
| `pasta` | boolean | |
| `arquivos` | número | quantidade de arquivos (recursiva, com as mesmas exclusões de §5.3); 1 para arquivo solto |
| `mtime` | número | maior `mtime` entre os arquivos (0 se vazia) |
| `capa` | `{ caminho, tipo: "imagem" \| "video" }` ou `null` | ver §6.2 |

Regras: categorias e itens ignoram nomes que começam com ponto, `CLAUDE.md` e `AGENTS.md`. Itens ordenados do mais recente para o mais antigo; categorias também, pelo `mtime` agregado. Se `conteudo/` não existir, lista vazia.

Extensões consideradas: imagem = png, jpg, jpeg, webp, gif, svg; vídeo = mp4, mov, webm, m4v (sem diferenciar maiúsculas).

### 6.2 Escolha da capa

Entre os arquivos de mídia do item, escolhe-se o de menor "peso", desempatando pela ordem natural do caminho:

| Peso | Critério |
|---|---|
| 0 | arquivo cujo nome começa com `capa.` |
| 1 | imagem dentro de uma subpasta `entrega/` |
| 2 | imagem que não está numa subpasta `original/` |
| 3 | qualquer outra imagem |
| 4 | vídeo cujo nome contém `depois`, `final` ou `editado` |
| 5 | qualquer outro vídeo |

Sem mídia, `capa` é `null`. Intenção: mostrar o resultado final, não o material bruto.

### 6.3 `GET /api/capa?caminho=<rel>`

Miniatura de vídeo em JPEG.

- Caminho precisa existir no cérebro e ter extensão de vídeo. Senão `404` sem corpo.
- Gera, com `ffmpeg`, um único quadro tirado em 1 segundo, redimensionado para 480 px de largura (altura proporcional e par), qualidade JPEG média.
- Cache em `<dados>/capas/`, com nome derivado de um resumo do caminho real mais o `mtime` do vídeo (vídeo alterado gera nova capa).
- Requisições simultâneas para a mesma capa esperam a mesma geração (não disparam vários `ffmpeg`).
- Se `ffmpeg` falhar ou não existir: `404` sem corpo.
- Resposta com `Cache-Control: private, max-age=86400`.

### 6.4 Envio de arquivos: `POST /api/enviar?pasta=<rel>&nome=<arquivo>`

- Corpo: o conteúdo binário cru do arquivo (`application/octet-stream`), um arquivo por requisição.
- `pasta` padrão: `conteudo/enviados`. Se a pasta pedida estiver dentro do cérebro e não existir, é criada (com intermediárias). Depois passa pela proteção (§4) e precisa ser pasta, senão `400 { erro }`.
- `nome`: reduzido ao nome base (sem diretórios), sem `/`, `\` e caractere nulo, aparado. Vazio ou começando com ponto: `400 { erro }`.
- Colisão: se já existe, acrescenta `-2`, `-3`, ... antes da extensão até achar nome livre.
- Escrita atômica: grava num temporário `<destino>.enviando` e renomeia no fim.
- Sucesso: `200 { "caminho": "<rel do arquivo final>" }`.
- Falha de escrita ou conexão abortada: apaga o temporário e responde `500 { erro }` se ainda for possível.
- O arquivo enviado é marcado (em memória) como "vindo do dono", para não ser tratado como mídia gerada por conversa (ver 02, §7).
- O Core não impõe limite de tamanho nesta rota.

## 7. Grafo: `GET /api/grafo`

Resposta: `{ "nos": [...], "ligacoes": [...] }`.

**Nós** `{ id, nome, tipo }`:

- `id` é o caminho relativo; `nome` é o nome sem `.md`; `tipo` é `pasta`, `nota` (arquivo `.md`) ou `midia` (imagem ou vídeo). Outros arquivos ficam de fora.
- Parte da mesma árvore de §5.1, excluindo `.claude/hooks` (e o que estiver dentro) e a pasta `sessoes` inteira.

**Ligações** `{ de, para, tipo }`:

- `tipo: "pasta"`: de cada pasta para cada filho incluído.
- `tipo: "link"`: de uma nota para o alvo de uma referência no texto. Três formas são reconhecidas:
  1. **Wikilink** `[[alvo]]` ou `![[alvo]]` (ignorando o que vem depois de `|` ou `#`): casa pelo nome base, sem `.md`, sem diferenciar maiúsculas, com o **primeiro** arquivo (nota ou mídia) de mesmo nome na ordem da árvore.
  2. **Link Markdown** `[texto](caminho)` (ignorando âncora): caminho relativo à pasta da nota, decodificado de URL; precisa existir entre os nós.
  3. **Código em linha** com um caminho, sem espaços: vale se existir como caminho relativo à raiz (barra final ignorada) ou relativo à pasta da nota. Pode apontar para pasta.
- Sem ligação de uma nota para ela mesma; repetições dentro da mesma nota contam uma vez.

## 8. Conversas

Detalhes de ciclo de vida em `02-conversas-e-terminal.md`.

| Método e caminho | Entrada | Sucesso | Erros |
|---|---|---|---|
| `POST /api/conversas` | `{ motor?, cols?, rows?, pedido? }` | `200` com o objeto da conversa criada (ver 07, §3.2) | nenhum específico |
| `DELETE /api/conversas/:id` | nada | `200 { "ok": true }` | `404` sem corpo se o id não existe |
| `GET /api/estado` | nada | `200` lista de resumos das conversas não arquivadas | |
| `GET /api/conversas/:id/historico` | nada | `200` lista de itens de histórico (máx. 300, os mais recentes) | `400` sem corpo se o id não tem 36 caracteres hexadecimais ou hífen |

Regras de `POST /api/conversas`:

- `motor` só é aceito se for um id conhecido (`claude`, `codex`, `antigravity`); senão usa o padrão configurado.
- `cols` e `rows`: números; padrão 120 por 32; limitados a 400 e 200.
- `pedido`: texto opcional que será **escrito** na caixa de entrada do agente quando ele estiver pronto, **sem** apertar Enter (ver 02, §3.4).

**Resumo em `GET /api/estado`** (um por conversa, na ordem de criação):

| Campo | Tipo | Significado |
|---|---|---|
| `id` | string | UUID |
| `motor` | string | id do motor |
| `motorNome` | string | nome de exibição do motor |
| `titulo` | string | primeiro título de nível 1 da nota de status; sem nota, um rótulo padrão (ver 02, §6) |
| `nota` | string | conteúdo bruto da nota de status (vazio se não existe) |
| `numero` | número | número sequencial da conversa |
| `criada` | número | ms |
| `origem` | `"painel"` ou `"whatsapp"` | |
| `processando` | boolean | o WhatsApp está rodando o agente agora |
| `ativo` | boolean | existe processo de terminal vivo para ela |
| `trabalhando` | boolean | `processando`, ou registro do motor alterado há menos de 8 s sem ter terminado a vez |
| `ultimaAcao` | string ou null | descrição curta da última ferramenta usada |
| `midias` | lista de caminhos | mídias associadas à conversa |
| `subagentes` | lista | só para Claude Code (ver 02, §5) |

**Item de histórico**: `{ papel: "voce" | "claude" | "acao", texto, quando }`, com `quando` em ms ou `null`. O papel `claude` é usado para a resposta de **qualquer** motor.

## 9. Configurações

### 9.1 `GET /api/config`

```
{
  whatsapp: { configurado, acesso: { numeros, chatVoce }, estado, numero, nomePerfil?, erro? },
  n8n: { url },
  servidor: { painel, cerebro }
}
```

(Forma do objeto; não é código.)

- `configurado`: verdadeiro se `EVO_URL` e `EVO_KEY` estão definidos.
- `estado`: `indisponivel` se não configurado; senão o estado da instância na Evolution: `open`, `connecting` ou `close`.
- `numero`: dígitos do número conectado (parte antes do `@` do dono da instância). `nomePerfil`: nome de perfil do WhatsApp, se houver.
- `erro`: presente quando a Evolution falhou; a rota ainda responde `200`.
- `n8n.url`: `N8N_PUBLIC_URL` (vazio se não definido).
- `servidor.painel`: protocolo e host da própria requisição; `servidor.cerebro`: caminho absoluto do cérebro.

### 9.2 WhatsApp

| Método e caminho | Entrada | Sucesso | Erro |
|---|---|---|---|
| `POST /api/config/whatsapp/conectar` | `{ novo?: boolean }` | `{ estado: "open" }` se já conectado; senão `{ qr: <imagem base64 em data URL> ou null, estado: "connecting" }` | `502 { erro }` |
| `GET /api/config/whatsapp/qr` | nada | `{ estado }` se não está em `connecting`; senão `{ estado: "connecting", qr }` | `502 { erro }` |
| `POST /api/config/whatsapp/desconectar` | nada | `{ ok: true, estado }` | `502 { erro }` se não conseguir ler o estado depois |
| `POST /api/config/whatsapp/acesso` | `{ numeros: [string], chatVoce?: boolean }` | o objeto de acesso gravado | nenhum |

Regras:

- **conectar:** garante que a instância exista; se ela sumiu, é criada de novo já apontando para o n8n (ver 04). Se `novo` for verdadeiro e o estado for `connecting`, faz logout antes (zera uma tentativa presa) e pede um QR novo. Também zera o cache do "meu número".
- **qr:** a interface chama esta rota de 3 em 3 s durante a exibição do código de pareamento. Quando o estado vira `open`, zera o cache do "meu número".
- **desconectar:** faz logout ignorando falha, zera o cache do "meu número" e devolve o estado atual.
- **acesso:** cada número vira só dígitos; ficam os que têm de 10 a 13 dígitos; os de até 11 dígitos ganham o prefixo `55`; repetidos são removidos; no máximo 20. `chatVoce` é verdadeiro a menos que venha explicitamente `false`. Grava em `whatsapp-acesso.json` e devolve.

### 9.3 Motores

| Método e caminho | Entrada | Sucesso |
|---|---|---|
| `GET /api/config/motores` | nada | `{ padrao, whatsapp, motores: { <id>: { nome, instalado, login } } }` |
| `POST /api/config/motores` | `{ padrao?, whatsapp? }` | `{ padrao, whatsapp }` gravados |

- `padrao`: motor das novas conversas do painel; `whatsapp`: motor das conversas do WhatsApp. Ambos começam em `claude`.
- No POST, cada campo só é aceito se for um id de motor conhecido; os demais são ignorados sem erro.
- `instalado`: se o executável do motor foi encontrado (ver 02, §4.1). `login`: dica curta de como autenticar aquele motor.

### 9.4 Catálogo

| Método e caminho | Sucesso |
|---|---|
| `GET /api/extras` | `{ aplicacoes: [item], mcps: [item] }` |
| `GET /api/primeiros-testes` | `[ { id, titulo, faz, icone, pedido } ]` |

Item de `aplicacoes` e `mcps`: `{ id, nome, logo, faz, pedido, instalado }`.

- `logo`: nome de arquivo dentro de `/logos/`. `faz`: frase curta do benefício. `pedido`: texto que abre uma conversa pedindo ao agente que instale aquilo.
- Ao final de todo `pedido` do catálogo vai um complemento comum, com duas instruções ao agente: credenciais exigidas pela instalação são solicitadas à pessoa dentro da conversa e gravadas exclusivamente no arquivo de ambiente do servidor, jamais no cérebro; e, concluída a instalação, o agente a testa e resume numa frase o benefício obtido.
- `instalado` de **aplicação**: verificado no servidor procurando o executável correspondente no PATH e nas pastas extras de 02, §4.1, um pacote global do npm, ou uma pasta de cache conhecida, conforme a aplicação.
- `instalado` de **MCP**: verdadeiro se algum servidor MCP configurado tem, no nome em minúsculas, o `id` do item como substring. Os nomes configurados vêm de três fontes: os servidores globais do arquivo de configuração do usuário do Claude Code (`~/.claude.json`, chave `mcpServers`), os servidores do projeto cujo caminho é a raiz do cérebro (mesmo arquivo, chave `projects`) e o `.mcp.json` na raiz do cérebro. Só nomes são lidos: nada de chave ou URL sai do servidor.
- `icone` dos primeiros testes é o nome de um ícone da interface.

Conteúdo do catálogo no Core (resumo de intenção, não copiar textos):

- **Aplicações:** editor de vídeo e áudio de linha de comando (necessário também para as capas), baixador de vídeos de redes sociais, transcritor de áudio local sem placa de vídeo (com criação de uma skill de transcrição), motion design renderizado por código, navegador automatizado, CLI de publicação de sites, CLI de repositório de código.
- **MCPs:** o próprio n8n do servidor, gerador de imagem e vídeo, roteador de modelos, editor de notas e bancos de dados, banco de dados com login para apps, painel de deploys, documentação de bibliotecas, agendador de posts em rede social.
- **Primeiros testes:** cinco pedidos de um clique, pensados para dar resultado em segundos, de preferência pelo WhatsApp: mandar uma mensagem dizendo que o cérebro está no ar; resumir um link (o texto termina com espaço para a pessoa colar o link); listar quem está esperando resposta no WhatsApp sem enviar nada; agendar um lembrete em 2 minutos; criar um carrossel curto e mandar as imagens.

## 10. Ponte do WhatsApp: `POST /api/ponte/whatsapp`

Avaliada **antes** da barreira de login.

- Cabeçalho `x-core-os-token` comparado em tempo constante com `CORE_OS_HOOK_TOKEN`. Se o token configurado estiver vazio ou não bater: `401 { "erro": "token" }`.
- Corpo: `{ texto, tipo, deMim, chat, eu }` (ver 04 para o significado).
- Remetente não autorizado: `202 { ok: true, ignorado: true }` (o n8n não deve tratar como erro).
- `tipo` igual a `texto` com `texto` vazio após aparar: `400 { erro }`.
- Aceito: `202 { ok: true, posicao: <tamanho da fila> }`, e o processamento continua em segundo plano.

## 11. Resumo de códigos

| Código | Quando |
|---|---|
| 200 | sucesso síncrono |
| 202 | ponte do WhatsApp aceitou ou ignorou |
| 400 | id de conversa inválido no histórico; pasta ou nome inválido no envio; texto vazio na ponte |
| 401 | sem login (qualquer `/api` protegida); senha errada; token da ponte errado |
| 404 | arquivo, pasta, conversa ou capa inexistente ou fora do cérebro |
| 429 | limite de tentativas de login |
| 500 | envio de arquivo interrompido |
| 502 | falha ao falar com a Evolution API nas rotas de WhatsApp |

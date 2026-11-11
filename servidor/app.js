// Monta o painel: Express com barreira de login, rotas da API e arquivos estáticos da interface.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { criarConversas, idValido, limitar } from './conversas.js';
import { carregarPty, spawnPorPipes } from './terminal.js';
import { lerAcesso, gravarAcesso, criarWhatsApp } from './whatsapp.js';
import { criarEvolution } from './evolution.js';
import { MOTORES, localizar, lerPreferencias, gravarPreferencias } from './motores.js';
import { extras, PRIMEIROS_TESTES } from './catalogo.js';
import { criarAuth, lerCookie, iguaisSeguro } from './auth.js';
import { criarUsuarios, pode } from './acessos.js';
import { resolverNoVault, arvore, listarPasta, conteudos, grafo, tipoMidia, relDe, nomeDeEnvio, pastaDeEnvio, destinoLivre, listarNivel, moverConteudo, renomearConteudo, apagarConteudo } from './arquivos.js';
import { criarCapas } from './capas.js';
import { criarPagina, criarPasta, lerPagina, salvarPagina, buscar } from './paginas.js';
import { criarBanco, lerBanco, criarLinha, salvarProp, salvarEsquema } from './bancos.js';
import { criarLousas } from './lousas.js';
import { criarVideos } from './videos.js';
import { criarGeracao } from './geracao.js';

const CLIENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'cliente');
const MODULOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules');
const COOKIE = 'coreos';
const TRINTA_DIAS_S = 2_592_000;

function cookieSessao(token, maxAge, seguro) {
  return `${COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${seguro ? '; Secure' : ''}`;
}

export function criarServidor(cfg, deps = {}) {
  const agora = deps.agora ?? Date.now;
  const log = deps.silencioso ? () => {} : (...a) => console.log(...a);
  // sem senha configurada, uma aleatória por execução: o painel nunca fica aberto
  const senhaGerada = cfg.senha ? '' : crypto.randomBytes(9).toString('base64url');
  const usuarios = criarUsuarios(cfg.dados);
  const auth = criarAuth({ senha: cfg.senha || senhaGerada, dados: cfg.dados, agora, usuarios });
  const perfilDe = (req) => auth.perfil(lerCookie(req.headers.cookie, COOKIE));
  const logado = (req) => perfilDe(req) !== null;
  const capa = criarCapas(cfg.dados);
  // shortcut: a marca de "enviado pelo dono" vive só em memória (aceito em 02, §7), persistir se incomodar
  const enviadosPeloDono = new Set();
  const conversas = criarConversas({
    cfg,
    spawnTerminal: deps.spawnTerminal ?? carregarPty() ?? spawnPorPipes,
    agora,
    log,
    enviadosPeloDono,
    whatsParaTerminal: () => lerAcesso(cfg).numeros[0] ?? '',
  });
  const evo = criarEvolution(cfg.evo, deps.fetch);
  const whatsapp = criarWhatsApp({ cfg, evo, conversas, agora, log });

  const app = express();
  app.disable('x-powered-by');
  // o Caddy roda no mesmo host: só ele pode informar IP real e HTTPS
  app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    next();
  });

  const json1mb = express.json({ limit: '1mb' });
  // PUT /api/pagina (3 MB) e PUT /api/lousas/:id e /api/video/:id (10 MB) têm parser próprio depois do login; o envio de arquivo lê o corpo cru
  const corpoProprio = (req) => (req.method === 'PUT' && (req.path === '/pagina' || /^\/(lousas|video)\/[^/]+$/.test(req.path))) || req.path === '/enviar';
  app.use('/api', (req, res, next) => (corpoProprio(req) ? next() : json1mb(req, res, next)));

  app.post('/api/login', (req, res) => {
    const r = auth.entrar(req.body?.senha, req.ip, req.body?.usuario);
    if (r.token) res.set('Set-Cookie', cookieSessao(r.token, TRINTA_DIAS_S, req.secure));
    res.status(r.status).json(r.corpo);
  });
  app.post('/api/logout', (req, res) => {
    auth.sair(lerCookie(req.headers.cookie, COOKIE));
    res.set('Set-Cookie', cookieSessao('', 0, req.secure)).json({ ok: true });
  });
  app.get('/api/eu', (req, res) => {
    const p = perfilDe(req);
    res.json(p ? { logado: true, admin: p.admin, usuario: p.usuario, nome: p.nome, permissoes: p.admin ? null : p.permissoes } : { logado: false });
  });
  app.post('/api/ponte/whatsapp', (req, res) => {
    // token vazio no painel recusa tudo: a ponte nunca fica aberta por falta de configuração
    if (!cfg.tokenPonte || !iguaisSeguro(req.headers['x-core-os-token'] ?? '', cfg.tokenPonte)) return res.status(401).json({ erro: 'token' });
    const r = whatsapp.receber(req.body ?? {});
    return res.status(r.status).json(r.corpo);
  });

  app.use('/api', (req, res, next) => (logado(req) ? next() : res.status(401).json({ erro: 'Faça login para continuar.' })));
  // cada rota pertence a uma seção; quem só pode ver não grava nada (ver acessos.js)
  app.use('/api', (req, res, next) => (pode(perfilDe(req), req.method, req.path, req.query) ? next() : res.status(403).json({ erro: 'Você não tem acesso a isso. Peça ao admin.' })));

  // ---------- acessos (só o admin chega aqui) ----------
  const rotaUsuarios = (fn) => (req, res) => {
    try { res.json(fn(req.body ?? {}, req.params.id) ?? { ok: true }); } catch (e) {
      res.status(e.code === 'ENOENT' ? 404 : e.code === 'INVALIDO' ? 400 : 500).json({ erro: e.code ? e.message : 'Erro interno.' });
    }
  };
  app.get('/api/usuarios', rotaUsuarios(() => usuarios.listar()));
  app.post('/api/usuarios', rotaUsuarios((b) => usuarios.criar(b)));
  app.put('/api/usuarios/:id', rotaUsuarios((b, id) => {
    const u = usuarios.atualizar(id, b);
    if (b.senha || b.ativo === false) auth.sairDe(id); // senha nova ou acesso suspenso: derruba as sessões abertas
    return u;
  }));
  app.delete('/api/usuarios/:id', rotaUsuarios((b, id) => {
    if (!usuarios.apagar(id)) throw Object.assign(new Error('Usuário não encontrado.'), { code: 'ENOENT' });
    auth.sairDe(id);
  }));

  // ---------- arquivos ----------
  const naoEncontrado = (res) => res.status(404).json({ erro: 'Não encontrado.' });
  const vault = cfg.vault;

  app.get('/api/arvore', (req, res) => res.json(arvore(vault)));
  app.get('/api/arquivo', (req, res, next) => {
    const abs = resolverNoVault(vault, req.query.caminho);
    if (!abs || !fs.statSync(abs).isFile()) return naoEncontrado(res);
    const pronto = (err) => err && next(err);
    if (req.query.baixar) return res.download(abs, path.basename(abs), { dotfiles: 'allow' }, pronto);
    return res.sendFile(abs, { dotfiles: 'allow', cacheControl: false, headers: { 'Cache-Control': 'no-cache' } }, pronto);
  });
  app.get('/api/pasta', (req, res) => {
    const lista = listarPasta(vault, req.query.caminho);
    return lista ? res.json(lista) : naoEncontrado(res);
  });
  app.get('/api/conteudos', (req, res) => res.json(conteudos(vault)));
  app.get('/api/grafo', (req, res) => res.json(grafo(vault)));
  app.get('/api/capa', async (req, res) => {
    const abs = resolverNoVault(vault, req.query.caminho);
    const jpg = abs && tipoMidia(abs) === 'video' && fs.statSync(abs).isFile() ? await capa(abs) : null;
    if (!jpg) return res.status(404).end();
    return res.sendFile(jpg, { cacheControl: false, headers: { 'Cache-Control': 'private, max-age=86400' } });
  });
  app.post('/api/enviar', (req, res) => {
    const dir = pastaDeEnvio(vault, req.query.pasta);
    if (!dir) return res.status(400).json({ erro: 'Pasta de destino inválida.' });
    const nome = nomeDeEnvio(req.query.nome);
    if (!nome) return res.status(400).json({ erro: 'Nome de arquivo inválido.' });
    const destino = destinoLivre(dir, nome);
    const temp = `${destino}.enviando`;
    const saida = fs.createWriteStream(temp, { flags: 'wx' });
    let falhou = false;
    const falhar = () => {
      if (falhou) return;
      falhou = true;
      saida.destroy();
      fs.rm(temp, { force: true }, () => {});
      if (!res.headersSent && !res.destroyed) res.status(500).json({ erro: 'O envio foi interrompido.' });
    };
    req.on('aborted', falhar);
    req.on('error', falhar);
    saida.on('error', falhar);
    saida.on('finish', () => {
      if (falhou) return;
      try { fs.renameSync(temp, destino); } catch { falhar(); return; }
      enviadosPeloDono.add(destino);
      res.json({ caminho: relDe(vault, destino) });
    });
    return req.pipe(saida);
  });

  // ---------- páginas e bancos ----------
  const rotaVault = (fn) => (req, res) => {
    try {
      res.json(fn(req.body ?? {}, req.query) ?? { ok: true });
    } catch (e) {
      const m = String(e.message);
      const status = e.code === 'CONFLITO' ? 409
        : e.code === 'ENOENT' || /não encontrad[ao]|não é um banco/.test(m) ? 404
          : /fora do vault|somente \.md|grande demais|inválid/.test(m) ? 400 : 500;
      if (status === 500) log('erro em página/banco', req.method, req.path, e);
      res.status(status).json({ erro: status === 500 ? 'Erro interno.' : m });
    }
  };
  app.post('/api/paginas', rotaVault((b) => criarPagina(vault, b.pasta, b.titulo)));
  app.post('/api/pastas', rotaVault((b) => criarPasta(vault, b.pasta, b.nome)));
  app.get('/api/conteudos/nivel', (req, res) => {
    const nivel = listarNivel(vault, req.query.caminho);
    return nivel ? res.json(nivel) : naoEncontrado(res);
  });
  app.post('/api/conteudos/mover', rotaVault((b) => moverConteudo(vault, b.de, b.para)));
  app.post('/api/conteudos/renomear', rotaVault((b) => renomearConteudo(vault, b.de, b.nome)));
  app.post('/api/conteudos/apagar', rotaVault((b) => apagarConteudo(vault, b.de)));
  app.get('/api/pagina', rotaVault((b, q) => lerPagina(vault, q.caminho)));
  app.put('/api/pagina', express.json({ limit: '3mb' }), rotaVault((b) => salvarPagina(vault, b.caminho, b.texto, b.mtime)));
  app.get('/api/busca', rotaVault((b, q) => buscar(vault, q.q)));
  app.post('/api/bancos', rotaVault((b) => criarBanco(vault, b.pasta, b.nome)));
  app.get('/api/banco', rotaVault((b, q) => lerBanco(vault, q.pasta)));
  app.post('/api/banco/linhas', rotaVault((b) => criarLinha(vault, b.pasta, b.titulo)));
  app.patch('/api/banco/linha', rotaVault((b) => salvarProp(vault, b.caminho, b.prop, b.valor)));
  app.put('/api/banco/esquema', rotaVault((b) => salvarEsquema(vault, b.pasta, b.esquema)));

  // ---------- lousas ----------
  const lousas = criarLousas(cfg.dados, agora);
  app.get('/api/lousas', rotaVault(() => lousas.listar()));
  app.post('/api/lousas', rotaVault((b) => lousas.criar(b.titulo)));
  app.get('/api/lousas/:id', (req, res) => rotaVault(() => lousas.ler(req.params.id))(req, res));
  app.put('/api/lousas/:id', express.json({ limit: '10mb' }), (req, res) => rotaVault((b) => lousas.salvar(req.params.id, b))(req, res));
  app.post('/api/lousas/:id/duplicar', (req, res) => rotaVault(() => lousas.duplicar(req.params.id))(req, res));

  // ---------- criação de vídeo (sessões) ----------
  const videos = criarVideos(cfg.dados, agora);
  app.get('/api/video', rotaVault(() => videos.listar()));
  app.post('/api/video', rotaVault((b) => videos.criar(b)));
  app.get('/api/video/:id', (req, res) => rotaVault(() => videos.ler(req.params.id))(req, res));
  app.put('/api/video/:id', express.json({ limit: '10mb' }), (req, res) => rotaVault((b) => videos.salvar(req.params.id, b))(req, res));
  app.post('/api/video/:id/arquivar', (req, res) => rotaVault(() => videos.arquivar(req.params.id))(req, res));
  const geracao = criarGeracao({ cfg, videos, registroExiste: conversas.registroClaudeExiste, agora, log, ...(deps.rodarGerador ? { rodar: deps.rodarGerador } : {}) });
  app.get('/api/video/:id/geracao', (req, res) => rotaVault(() => geracao.estado(req.params.id))(req, res));
  app.post('/api/video/:id/gerar', (req, res) => rotaVault((b) => geracao.gerar(req.params.id, b))(req, res));

  // ---------- conversas ----------
  app.post('/api/conversas', (req, res) => {
    const b = req.body ?? {};
    res.json(conversas.criar({ motor: b.motor, cols: b.cols, rows: b.rows, pedido: b.pedido }));
  });
  app.delete('/api/conversas/:id', (req, res) => (conversas.encerrar(req.params.id) ? res.json({ ok: true }) : res.status(404).end()));
  app.get('/api/estado', (req, res) => res.json(conversas.estado()));
  app.get('/api/conversas/:id/historico', (req, res) => (idValido(req.params.id) ? res.json(conversas.historico(req.params.id)) : res.status(400).end()));

  // ---------- configurações ----------
  app.get('/api/config', async (req, res) => {
    const w = { configurado: evo.configurado, acesso: lerAcesso(cfg), estado: 'indisponivel', numero: '' };
    if (evo.configurado) {
      try {
        w.estado = await evo.estado();
        const d = await evo.dados();
        w.numero = d?.numero ?? '';
        if (d?.nomePerfil) w.nomePerfil = d.nomePerfil;
      } catch (e) { w.erro = e.message; }
    }
    res.json({ whatsapp: w, n8n: { url: cfg.n8nUrl }, servidor: { painel: `${req.protocol}://${req.get('host')}`, cerebro: vault } });
  });
  const rotaEvo = (fn) => async (req, res) => {
    try { res.json(await fn(req.body ?? {})); } catch (e) { res.status(502).json({ erro: e.message }); }
  };
  app.post('/api/config/whatsapp/conectar', rotaEvo(async (b) => {
    whatsapp.zerarCache();
    if (!evo.configurado) await evo.estado(); // lança o aviso de não configurada
    if (!(await evo.dados())) await evo.criar(cfg.whatsWebhook);
    const estado = await evo.estado();
    if (estado === 'open') return { estado };
    if (b.novo === true && estado === 'connecting') await evo.logout().catch(() => {});
    return { qr: (await evo.qr()).qr, estado: 'connecting' };
  }));
  app.get('/api/config/whatsapp/qr', rotaEvo(async () => {
    const estado = await evo.estado();
    if (estado !== 'connecting') {
      if (estado === 'open') whatsapp.zerarCache();
      return { estado };
    }
    return { estado, qr: (await evo.qr()).qr };
  }));
  app.post('/api/config/whatsapp/desconectar', rotaEvo(async () => {
    await evo.logout().catch(() => {});
    whatsapp.zerarCache();
    return { ok: true, estado: await evo.estado() };
  }));
  app.post('/api/config/whatsapp/acesso', (req, res) => res.json(gravarAcesso(cfg, req.body ?? {})));
  app.get('/api/config/motores', (req, res) => {
    const motores = Object.fromEntries(Object.entries(MOTORES).map(([id, m]) => [id, { nome: m.nome, instalado: Boolean(localizar(cfg.bins[id], cfg.env, cfg.casa)), login: m.login }]));
    res.json({ ...lerPreferencias(cfg.dados), motores });
  });
  app.post('/api/config/motores', (req, res) => res.json(gravarPreferencias(cfg.dados, req.body ?? {})));
  app.get('/api/extras', (req, res) => res.json(extras(cfg)));
  app.get('/api/primeiros-testes', (req, res) => res.json(PRIMEIROS_TESTES));

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  // bibliotecas de navegador vindas do npm: só as pastas de build, nada de package.json nem outros pacotes
  for (const [rota, pasta] of [['xterm/lib', 'xterm/lib'], ['xterm/css', 'xterm/css'], ['addon-fit/lib', 'addon-fit/lib'], ['addon-unicode11/lib', 'addon-unicode11/lib']]) {
    app.use(`/vendor/${rota}`, express.static(path.join(MODULOS, '@xterm', pasta)));
  }
  app.use(express.static(CLIENTE));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) return res.end();
    const status = err.status ?? err.statusCode;
    if (status >= 400 && status < 500) return res.status(status).json({ erro: status === 413 ? 'Conteúdo grande demais.' : 'Requisição inválida.' });
    log('erro na rota', req.method, req.path, err);
    return res.status(500).json({ erro: 'Erro interno.' });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://local');
    const c = conversas.porId(url.searchParams.get('conversa'));
    let origemOk = true;
    // outro site não pode abrir o terminal usando o cookie da pessoa
    if (req.headers.origin) { try { origemOk = new URL(req.headers.origin).host === req.headers.host; } catch { origemOk = false; } }
    if (url.pathname !== '/ws' || !perfilDe(req)?.admin || !c || !origemOk) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      conversas.conectar(ws, c, limitar(url.searchParams.get('cols'), 120, 400), limitar(url.searchParams.get('rows'), 32, 200));
    });
  });

  return {
    app,
    server,
    auth,
    senhaGerada,
    conversas,
    enviadosPeloDono,
    fechar: () => new Promise((ok) => {
      conversas.fechar();
      for (const ws of wss.clients) ws.terminate();
      server.closeAllConnections?.();
      server.close(() => ok());
    }),
  };
}

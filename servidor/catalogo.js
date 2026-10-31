// Catálogo de extras (aplicações e conexões MCP) e os primeiros testes de um clique.
import fs from 'node:fs';
import path from 'node:path';
import { localizar } from './motores.js';

const COMPLEMENTO = ' Se a instalação pedir chave, senha ou login, me peça aqui na conversa e grave só no arquivo de ambiente do servidor (/opt/core-os/.env), nunca no cérebro. No fim, teste se funcionou e me diga numa frase o que ganhei com isso.';

const APLICACOES = [
  { id: 'ffmpeg', nome: 'FFmpeg', logo: 'ffmpeg.svg', faz: 'Corta, junta e converte vídeo e áudio. Também gera as miniaturas da galeria.', pedido: 'Instale o ffmpeg neste servidor pelo gerenciador de pacotes e confira a versão.', bins: ['ffmpeg'] },
  { id: 'yt-dlp', nome: 'yt-dlp', logo: 'yt-dlp.svg', faz: 'Baixa vídeos de redes sociais e sites a partir do link.', pedido: 'Instale o yt-dlp neste servidor (versão mais recente, não a do apt) e confira a versão.', bins: ['yt-dlp'] },
  { id: 'whisper', nome: 'Transcrição local', logo: 'whisper.svg', faz: 'Transforma áudio em texto no próprio servidor, sem placa de vídeo.', pedido: 'Instale um transcritor de áudio local que rode bem só com processador (por exemplo whisper.cpp com um modelo pequeno) e crie no cérebro uma skill de transcrição que use ele.', bins: ['whisper-cli', 'whisper'], pastas: ['.cache/whisper', 'whisper.cpp'] },
  { id: 'remotion', nome: 'Remotion', logo: 'remotion.svg', faz: 'Cria vídeos animados escritos em código, renderizados no servidor.', pedido: 'Prepare o Remotion neste servidor para renderizar vídeos por linha de comando, com as dependências do navegador que ele precisa.', npm: ['remotion', '@remotion/cli'] },
  { id: 'playwright', nome: 'Navegador automático', logo: 'playwright.svg', faz: 'Abre sites sozinho para tirar prints, preencher formulários e coletar dados.', pedido: 'Instale o Playwright com o Chromium e as dependências do sistema neste servidor.', npm: ['playwright'], pastas: ['.cache/ms-playwright'] },
  { id: 'vercel', nome: 'Vercel CLI', logo: 'vercel.svg', faz: 'Publica sites e páginas na internet com um comando.', pedido: 'Instale a CLI da Vercel globalmente pelo npm e me guie no login.', bins: ['vercel'], npm: ['vercel'] },
  { id: 'gh', nome: 'GitHub CLI', logo: 'github.svg', faz: 'Cria e atualiza repositórios de código direto do servidor.', pedido: 'Instale a CLI oficial do GitHub (gh) e me guie no login.', bins: ['gh'] },
];

const MCPS = [
  { id: 'n8n', nome: 'n8n', logo: 'n8n.svg', faz: 'Deixa o agente criar e rodar automações no n8n deste servidor.', pedido: 'Conecte o n8n deste servidor ao Claude Code como servidor MCP, usando a URL interna e uma chave de API do n8n.' },
  { id: 'fal', nome: 'fal', logo: 'fal.svg', faz: 'Gera imagens e vídeos com modelos de IA.', pedido: 'Adicione o servidor MCP da fal ao Claude Code deste cérebro.' },
  { id: 'openrouter', nome: 'OpenRouter', logo: 'openrouter.svg', faz: 'Dá acesso a vários modelos de IA com uma chave só.', pedido: 'Adicione um servidor MCP do OpenRouter ao Claude Code deste cérebro.' },
  { id: 'notion', nome: 'Notion', logo: 'notion.svg', faz: 'Lê e escreve páginas e bancos de dados no Notion.', pedido: 'Adicione o servidor MCP oficial do Notion ao Claude Code deste cérebro.' },
  { id: 'supabase', nome: 'Supabase', logo: 'supabase.svg', faz: 'Banco de dados com login de usuários para os apps que você criar.', pedido: 'Adicione o servidor MCP do Supabase ao Claude Code deste cérebro.' },
  { id: 'vercel', nome: 'Vercel', logo: 'vercel.svg', faz: 'Acompanha publicações, erros e domínios dos seus sites.', pedido: 'Adicione o servidor MCP da Vercel ao Claude Code deste cérebro.' },
  { id: 'context7', nome: 'Context7', logo: 'context7.svg', faz: 'Traz a documentação atualizada de bibliotecas para o agente.', pedido: 'Adicione o servidor MCP do Context7 ao Claude Code deste cérebro.' },
  { id: 'postiz', nome: 'Postiz', logo: 'postiz.svg', faz: 'Agenda posts nas redes sociais.', pedido: 'Adicione um servidor MCP do Postiz ao Claude Code deste cérebro para agendar posts.' },
];

export const PRIMEIROS_TESTES = [
  { id: 'no-ar', titulo: 'O cérebro está no ar', faz: 'Manda uma mensagem no seu WhatsApp avisando que tudo funciona.', icone: 'whatsapp', pedido: 'Me mande uma mensagem no WhatsApp dizendo que o cérebro está no ar e pronto para receber pedidos.' },
  { id: 'resumir-link', titulo: 'Resumir um link', faz: 'Lê uma página e devolve os pontos principais.', icone: 'link', pedido: 'Leia esta página e me resuma em cinco tópicos curtos: ' },
  { id: 'esperando-resposta', titulo: 'Quem espera resposta', faz: 'Lista quem está aguardando você no WhatsApp, sem enviar nada.', icone: 'inbox', pedido: 'Veja no WhatsApp quem me mandou mensagem e ainda está esperando resposta. Só liste, não envie nada para ninguém.' },
  { id: 'lembrete', titulo: 'Lembrete em 2 minutos', faz: 'Agenda um aviso no WhatsApp para daqui a pouco.', icone: 'relogio', pedido: 'Daqui a 2 minutos, me mande no WhatsApp um lembrete dizendo "beber água".' },
  { id: 'carrossel', titulo: 'Carrossel rápido', faz: 'Cria um carrossel curto e manda as imagens.', icone: 'imagens', pedido: 'Crie um carrossel de 3 páginas sobre como organizar a semana e me mande as imagens no WhatsApp.' },
];

function npmGlobal(pacote, casa) {
  const raizes = ['/usr/lib/node_modules', '/usr/local/lib/node_modules', path.join(casa, '.npm-global', 'lib', 'node_modules'), path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules')];
  return raizes.some((r) => fs.existsSync(path.join(r, pacote)));
}

const chavesMcp = (o) => (o?.mcpServers && typeof o.mcpServers === 'object' ? Object.keys(o.mcpServers) : []);
const lerJsonSolto = (arq) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return null; } };

// Só os nomes dos servidores MCP; chaves e URLs nunca saem daqui.
export function nomesMcp(casa, vault) {
  const global = lerJsonSolto(path.join(casa, '.claude.json'));
  const projetos = Object.entries(global?.projects ?? {}).filter(([p]) => path.resolve(p) === vault).flatMap(([, v]) => chavesMcp(v));
  return [...chavesMcp(global), ...projetos, ...chavesMcp(lerJsonSolto(path.join(vault, '.mcp.json')))].map((n) => n.toLowerCase());
}

export function extras(cfg) {
  const pedido = (texto) => texto + COMPLEMENTO;
  const nomes = nomesMcp(cfg.casa, cfg.vault);
  const aplicacoes = APLICACOES.map(({ bins = [], npm = [], pastas = [], ...item }) => ({
    ...item,
    pedido: pedido(item.pedido),
    instalado: bins.some((b) => localizar(b, cfg.env, cfg.casa)) || npm.some((p) => npmGlobal(p, cfg.casa)) || pastas.some((p) => fs.existsSync(path.join(cfg.casa, p))),
  }));
  const mcps = MCPS.map((item) => ({ ...item, pedido: pedido(item.pedido), instalado: nomes.some((n) => n.includes(item.id)) }));
  return { aplicacoes, mcps };
}

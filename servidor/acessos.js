// Acessos: pessoas que o admin cria no painel, com senha guardada só como resumo (scrypt) e permissão por seção.
// O admin não mora aqui: é o usuário "admin" com a senha do .env (CORE_OS_PASSWORD), que entra mesmo sem este arquivo.
import crypto from 'node:crypto';
import { lerJson, gravarJson } from './dados.js';

// Conversas fica de fora de propósito: abre um terminal no servidor, o que passa por cima de qualquer permissão.
export const SECOES = ['grafo', 'arquivos', 'conteudos', 'whatsapp', 'n8n', 'lousa', 'video'];
export const NIVEIS = ['ver', 'editar'];
export const ADMIN = 'admin';
const USUARIO = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const ID = /^[0-9a-f]{16}$/;
const LEITURA = new Set(['GET', 'HEAD']);

const invalido = (m) => Object.assign(new Error(m), { code: 'INVALIDO' });

export function resumirSenha(senha, sal = crypto.randomBytes(16)) {
  return `scrypt$${sal.toString('hex')}$${crypto.scryptSync(String(senha), sal, 32).toString('hex')}`;
}
export function conferirSenha(senha, salvo) {
  const [tipo, sal, hash] = String(salvo ?? '').split('$');
  if (tipo !== 'scrypt' || !sal || !hash) return false;
  const a = crypto.scryptSync(String(senha), Buffer.from(sal, 'hex'), 32);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const SENHA_FALSA = resumirSenha(crypto.randomBytes(12).toString('hex')); // usuário inexistente gasta o mesmo tempo

function limparPermissoes(p) {
  const saida = {};
  for (const s of SECOES) if (NIVEIS.includes(p?.[s])) saida[s] = p[s];
  return saida;
}
const limparNome = (n, reserva) => (String(n ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || reserva);

export function criarUsuarios(dados) {
  const brutos = lerJson(dados, 'usuarios.json', []);
  let lista = Array.isArray(brutos) ? brutos.filter((u) => ID.test(u?.id) && USUARIO.test(u?.usuario)) : [];
  const gravar = () => gravarJson(dados, 'usuarios.json', lista);
  const publico = ({ hash, ...u }) => u;
  const achar = (id) => lista.find((u) => u.id === id);

  function validarSenha(senha) {
    if (typeof senha !== 'string' || senha.length < 8 || senha.length > 200) throw invalido('A senha precisa ter de 8 a 200 caracteres.');
  }

  return {
    listar: () => lista.map(publico),
    porId: (id) => { const u = achar(id); return u ? publico(u) : null; },
    criar(b) {
      const usuario = String(b?.usuario ?? '').trim().toLowerCase();
      if (!USUARIO.test(usuario) || usuario === ADMIN) throw invalido('Usuário inválido: use de 2 a 32 letras minúsculas, números, ponto, traço ou sublinhado (e não "admin").');
      if (lista.some((u) => u.usuario === usuario)) throw invalido('Já existe alguém com esse usuário.');
      validarSenha(b?.senha);
      const u = { id: crypto.randomBytes(8).toString('hex'), usuario, nome: limparNome(b?.nome, usuario), ativo: true, permissoes: limparPermissoes(b?.permissoes), hash: resumirSenha(b.senha) };
      lista.push(u);
      gravar();
      return publico(u);
    },
    atualizar(id, b) {
      const u = achar(id);
      if (!u) throw Object.assign(new Error('Usuário não encontrado.'), { code: 'ENOENT' });
      if ('nome' in b) u.nome = limparNome(b.nome, u.usuario);
      if ('ativo' in b) u.ativo = b.ativo === true;
      if ('permissoes' in b) u.permissoes = limparPermissoes(b.permissoes);
      if (b.senha) { validarSenha(b.senha); u.hash = resumirSenha(b.senha); }
      gravar();
      return publico(u);
    },
    apagar(id) {
      const antes = lista.length;
      lista = lista.filter((u) => u.id !== id);
      if (lista.length === antes) return false;
      gravar();
      return true;
    },
    verificar(usuario, senha) {
      const u = lista.find((x) => x.usuario === String(usuario ?? '').trim().toLowerCase());
      const ok = conferirSenha(senha, u?.hash ?? SENHA_FALSA);
      return ok && u?.ativo ? publico(u) : null;
    },
  };
}

// Seção de cada rota da API (caminho sem o /api). 'admin' = só o admin; lista = qualquer uma delas serve.
export function secaoDaRota(metodo, caminho, query = {}) {
  const p = caminho;
  if (p === '/extras' || p === '/primeiros-testes') return 'livre';
  if (/^\/(usuarios|conversas|estado)(\/|$)/.test(p)) return ADMIN;
  if (p === '/config/motores' && !LEITURA.has(metodo)) return ADMIN;
  if (p === '/config/whatsapp/acesso') return ADMIN; // números autorizados mandam no agente: é poder de servidor
  if (/^\/video\/[^/]+\/gerar$/.test(p)) return ADMIN; // a geração roda um Claude sem tela no servidor
  if (p === '/config' || p === '/config/motores') return ['whatsapp', 'n8n'];
  if (p.startsWith('/config/whatsapp/')) return 'whatsapp';
  if (p === '/grafo') return 'grafo';
  if (/^\/(arvore|pasta|pagina|paginas|pastas|busca|banco|bancos)(\/|$)/.test(p)) return 'arquivos';
  if (/^\/conteudos(\/|$)/.test(p)) return 'conteudos';
  if (/^\/lousas(\/|$)/.test(p)) return 'lousa';
  if (/^\/video(\/|$)/.test(p)) return 'video';
  // arquivos soltos: quem só tem Conteúdos, Quadro ou Vídeo enxerga e envia só dentro de conteudo/
  if (p === '/arquivo' || p === '/capa' || p === '/enviar') {
    const alvo = String((p === '/enviar' ? query.pasta : query.caminho) ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
    const emConteudo = (alvo === 'conteudo' || alvo.startsWith('conteudo/')) && !alvo.split('/').includes('..');
    return emConteudo ? ['arquivos', 'conteudos', 'lousa', 'video'] : 'arquivos';
  }
  return ADMIN; // rota nova sem dono: fechada até alguém decidir
}

// perfil = { admin: true } ou { permissoes: { secao: 'ver' | 'editar' } }
export function pode(perfil, metodo, caminho, query) {
  if (!perfil) return false;
  if (perfil.admin) return true;
  const secao = secaoDaRota(metodo, caminho, query);
  if (secao === 'livre') return true;
  if (secao === ADMIN) return false;
  const precisa = LEITURA.has(metodo) ? ['ver', 'editar'] : ['editar'];
  return [].concat(secao).some((s) => precisa.includes(perfil.permissoes?.[s]));
}

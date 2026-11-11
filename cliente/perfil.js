// Quem está usando o painel e o que pode fazer em cada seção. O servidor confere tudo de novo; aqui é só para esconder o que não serve.
let atual = null;

export const perfil = () => atual;
export const definirPerfil = (p) => { atual = p; };

// seção de cada tipo de guia (as mesmas de servidor/acessos.js); Conversas é só do admin
const SECAO = { grafo: 'grafo', pagina: 'arquivos', banco: 'arquivos', arquivo: 'arquivos', conteudos: 'conteudos', whatsapp: 'whatsapp', n8n: 'n8n', lousa: 'lousa', video: 'video', conversas: 'admin' };
export const secaoDe = (tipo) => SECAO[tipo] ?? 'livre';

// 'editar', 'ver' ou null (sem acesso)
export function nivel(secao) {
  if (secao === 'livre') return 'editar';
  if (atual?.admin) return 'editar';
  if (secao === 'admin') return null;
  return atual?.permissoes?.[secao] ?? null;
}
export const iniciais = (nome) => String(nome ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

// Core OS · Criação de vídeo: uma sessão por arquivo JSON em <dados>/video/<id>.json (nós, ligações, desenho livre e notas).
// Mesma ideia das Lousas: versão otimista (duas abas não se sobrescrevem) e nada é apagado; "remover" só arquiva.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { lerJson, gravarJson } from './dados.js';
import { validarObjetos } from './lousas.js';

const ID = /^[a-f0-9-]{8,40}$/;
export const LIMITES = { bytes: 8 * 1024 * 1024, nos: 2000, ligacoes: 5000, notas: 2000, dadosDoNo: 20000 };

const invalida = (porque) => new Error(`sessão de vídeo inválida: ${porque}`);
const finito = (n) => typeof n === 'number' && Number.isFinite(n);
const texto = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function validarGrafo(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) throw invalida('grafo');
  if (g.cam != null && !(finito(g.cam.x) && finito(g.cam.y) && finito(g.cam.z) && g.cam.z > 0.01 && g.cam.z < 100)) throw invalida('câmera');
  const nos = g.nos ?? []; const links = g.links ?? []; const tracos = g.tracos ?? []; const notas = g.notas ?? [];
  if (![nos, links, tracos, notas].every(Array.isArray)) throw invalida('listas');
  if (nos.length > LIMITES.nos || links.length > LIMITES.ligacoes || notas.length > LIMITES.notas) throw new Error('sessão de vídeo grande demais');
  nos.forEach((n, i) => {
    if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 64 || typeof n.tipo !== 'string' || n.tipo.length > 40) throw invalida(`nó ${i}`);
    for (const k of ['x', 'y', 'w', 'h']) if (!finito(n[k])) throw invalida(`número ${k} do nó ${i}`);
    if (n.dados != null && (typeof n.dados !== 'object' || JSON.stringify(n.dados).length > LIMITES.dadosDoNo)) throw invalida(`dados do nó ${i}`);
  });
  links.forEach((l, i) => { if (!l || typeof l.a !== 'string' || typeof l.b !== 'string') throw invalida(`ligação ${i}`); });
  notas.forEach((n, i) => {
    if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 64) throw invalida(`nota ${i}`);
    for (const k of ['x', 'y', 'w', 'h']) if (!finito(n[k])) throw invalida(`número ${k} da nota ${i}`);
    if (n.texto != null && (typeof n.texto !== 'string' || n.texto.length > 20000)) throw invalida(`texto da nota ${i}`);
    if (n.cor != null && (typeof n.cor !== 'string' || n.cor.length > 40)) throw invalida(`cor da nota ${i}`);
  });
  validarObjetos(tracos);
  if (tracos.some((t) => t.t !== 'stroke')) throw invalida('traços');
}

export function criarVideos(dados, agora = Date.now) {
  const dir = path.join(dados, 'video');
  fs.mkdirSync(dir, { recursive: true });
  const nomeArq = (id) => {
    if (!ID.test(String(id))) throw invalida('id');
    return `${id}.json`;
  };
  const gravar = (s) => gravarJson(dir, nomeArq(s.id), s, { compacto: true });
  const grafoVazio = () => ({ cam: { x: 40, y: 80, z: 1 }, nos: [], links: [], tracos: [], notas: [] });

  function ler(id) {
    const s = lerJson(dir, nomeArq(id), null);
    if (!s || s.arquivada) throw new Error('sessão de vídeo não encontrada');
    return s;
  }

  function listar() {
    const lista = [];
    for (const nome of fs.readdirSync(dir)) {
      if (!nome.endsWith('.json')) continue;
      const s = lerJson(dir, nome, null);
      if (!s || s.arquivada || !ID.test(String(s.id))) continue;
      lista.push({ id: s.id, numero: s.numero, titulo: s.titulo, criada: s.criada, atualizada: s.atualizada, versao: s.versao, nos: s.grafo?.nos?.length ?? 0 });
    }
    return lista.sort((a, b) => b.criada - a.criada);
  }

  // id opcional (o painel já cria o dele); criar de novo com o mesmo id devolve a que existe
  function criar(b = {}) {
    const id = ID.test(String(b.id ?? '')) ? b.id : crypto.randomUUID();
    const existente = lerJson(dir, nomeArq(id), null);
    if (existente) return existente;
    if (b.grafo != null) validarGrafo(b.grafo);
    const t = agora();
    const numero = Number.isInteger(b.numero) && b.numero > 0 ? b.numero : listar().reduce((m, s) => Math.max(m, s.numero ?? 0), 0) + 1;
    const s = { id, numero, titulo: texto(b.titulo, 120) || `Vídeo ${numero}`, criada: finito(b.criada) ? b.criada : t, atualizada: t, versao: 1, arquivada: false, grafo: b.grafo ? { ...grafoVazio(), ...b.grafo } : grafoVazio() };
    if (Buffer.byteLength(JSON.stringify(s)) > LIMITES.bytes) throw new Error('sessão de vídeo grande demais');
    gravar(s);
    return s;
  }

  function salvar(id, b) {
    const atual = ler(id);
    if (b.versao !== atual.versao) throw Object.assign(new Error('a sessão mudou em outra aba ou aparelho'), { code: 'CONFLITO' });
    validarGrafo(b.grafo);
    const novo = { ...atual, titulo: 'titulo' in b ? (texto(b.titulo, 120) || atual.titulo) : atual.titulo, grafo: { ...grafoVazio(), ...b.grafo }, atualizada: agora(), versao: atual.versao + 1 };
    if (Buffer.byteLength(JSON.stringify(novo)) > LIMITES.bytes) throw new Error('sessão de vídeo grande demais');
    gravar(novo);
    return { versao: novo.versao, atualizada: novo.atualizada };
  }

  // "remover" não apaga o arquivo: ele sai da lista e continua guardado
  function arquivar(id) {
    const atual = ler(id);
    gravar({ ...atual, arquivada: true, atualizada: agora(), versao: atual.versao + 1 });
    return { ok: true };
  }

  return { listar, criar, ler, salvar, arquivar };
}

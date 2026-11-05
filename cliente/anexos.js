// Arquivos arrastados para a área de trabalho das conversas. Sem DOM, para poder testar.

export const TIPO_ARRASTO = 'application/x-cerebro-arquivos';

// Texto que vai para o prompt: no Claude Code, @caminho anexa o arquivo; nos outros motores vai o caminho puro.
// Caminho com espaço vai entre aspas (sem @, que não aceita espaço sem aspas).
export function referenciaPrompt(caminhos, motor = 'claude') {
  const partes = caminhos.filter(Boolean).map((c) => {
    if (/\s/.test(c)) return `"${c}"`;
    return motor === 'claude' ? `@${c}` : c;
  });
  return partes.length ? `${partes.join(' ')} ` : '';
}

// Lê o que o arrasto carrega: lista de caminhos do cérebro (vindos da galeria ou de um card de arquivo).
export function caminhosDoArrasto(dt) {
  try {
    const bruto = dt?.getData?.(TIPO_ARRASTO);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter((c) => typeof c === 'string' && c && !c.includes('..')) : [];
  } catch { return []; }
}

export const arrastoTemArquivos = (dt) => [...(dt?.types ?? [])].some((t) => t === TIPO_ARRASTO || t === 'Files');

// Ponto do mundo onde o card cai, com o centro do card sob o ponteiro.
export function posicaoSolta(cam, palco, clientX, clientY, w, h) {
  return { x: Math.round((clientX - palco.left - cam.x) / cam.z - w / 2), y: Math.round((clientY - palco.top - cam.y) / cam.z - h / 2) };
}

// Linha entre o card principal (t) e um card de arquivo (c): sai do lado do terminal mais perto do arquivo.
export function pontaLigacao(t, c) {
  const ct = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  const cc = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  const dx = (cc.x - ct.x) / (t.w / 2 + c.w / 2);
  const dy = (cc.y - ct.y) / (t.h / 2 + c.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    const dir = dx >= 0;
    return { x1: dir ? t.x + t.w : t.x, y1: ct.y, x2: dir ? c.x : c.x + c.w, y2: cc.y, h: true, dir: dir ? 1 : -1 };
  }
  const baixo = dy >= 0;
  return { x1: ct.x, y1: baixo ? t.y + t.h : t.y, x2: cc.x, y2: baixo ? c.y : c.y + c.h, h: false, dir: baixo ? 1 : -1 };
}

export function caminhoCurvo(p, folga = 70) {
  const f = folga * p.dir;
  return p.h
    ? `M${p.x1} ${p.y1} C${p.x1 + f} ${p.y1} ${p.x2 - f} ${p.y2} ${p.x2} ${p.y2}`
    : `M${p.x1} ${p.y1} C${p.x1} ${p.y1 + f} ${p.x2} ${p.y2 - f} ${p.x2} ${p.y2}`;
}

// Junta anexos sem repetir o mesmo arquivo; o novo ganha posição, os já existentes ficam onde estavam.
export function adicionarAnexos(lista, caminhos, pos, passo = 28) {
  const saida = [...lista];
  let i = 0;
  for (const c of caminhos) {
    if (saida.some((a) => a.caminho === c)) continue;
    saida.push({ caminho: c, x: pos.x + i * passo, y: pos.y + i * passo });
    i += 1;
  }
  return saida;
}

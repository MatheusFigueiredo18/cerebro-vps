// Escolha do ícone de cada motor, aplicação e conexão. Sem DOM.

// "ffmpeg.svg" (nome de arquivo do catálogo) vira "ffmpeg".
export const chaveDoLogo = (valor) => String(valor ?? '').trim().toLowerCase().replace(/\.svg$/, '');

// O motor aparece ora pelo id ("claude"), ora pelo nome ("Claude Code", "Codex (OpenAI)").
export function chaveDoMotor(texto) {
  const t = String(texto ?? '').toLowerCase();
  if (t.includes('claude')) return 'claude';
  if (t.includes('codex')) return 'codex';
  if (t.includes('antigravity') || t === 'agy') return 'antigravity';
  return '';
}

// A cor da marca só vale se aparecer nos dois temas: preto some no escuro e branco some no claro.
// Nesses casos o ícone usa a cor do texto, que muda com o tema.
export function usaCorDaMarca(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const luz = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luz > 0.25 && luz < 0.85;
}

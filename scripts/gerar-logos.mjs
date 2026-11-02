// Gera cliente/logos.js a partir do pacote simple-icons (dados em domínio público; as marcas pertencem aos seus donos
// e aparecem só para identificar cada serviço). Quem não tem marca no pacote usa um ícone de função (ver SEMANTICOS).
// Rode `node scripts/gerar-logos.mjs` ao mudar o mapa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pacote = path.join(raiz, 'node_modules', 'simple-icons');

// chave usada na interface -> slug no simple-icons
const MARCAS = {
  claude: 'claude', antigravity: 'googlegemini', whatsapp: 'whatsapp', ffmpeg: 'ffmpeg', vercel: 'vercel', github: 'github',
  n8n: 'n8n', openrouter: 'openrouter', notion: 'notion', supabase: 'supabase', postiz: 'postiz',
};
// chave sem marca no pacote -> nome do ícone em cliente/icones.js
const SEMANTICOS = {
  codex: 'robo', 'yt-dlp': 'baixar', whisper: 'ondas', remotion: 'filme', playwright: 'globo', fal: 'brilho', context7: 'livro',
};

const dados = JSON.parse(fs.readFileSync(path.join(pacote, 'data', 'simple-icons.json'), 'utf8'));
const linhas = Object.entries(MARCAS).map(([chave, slug]) => {
  const item = dados.find((x) => x.slug === slug);
  const arquivo = path.join(pacote, 'icons', `${slug}.svg`);
  if (!item || !fs.existsSync(arquivo)) throw new Error(`marca ${slug} não existe no simple-icons`);
  const d = /<path d="([^"]+)"/.exec(fs.readFileSync(arquivo, 'utf8'))?.[1];
  if (!d) throw new Error(`marca ${slug} sem caminho SVG`);
  return `  ${JSON.stringify(chave)}: { d: ${JSON.stringify(d)}, cor: ${JSON.stringify(`#${item.hex}`)} },`;
});

const saida = `// GERADO por scripts/gerar-logos.mjs a partir do simple-icons (ver THIRD-PARTY.md). Não edite à mão.\n`
  + `export const MARCAS = {\n${linhas.join('\n')}\n};\n\n`
  + `export const SEMANTICOS = ${JSON.stringify(SEMANTICOS, null, 2)};\n`;
fs.writeFileSync(path.join(raiz, 'cliente', 'logos.js'), saida);
console.log(`logos.js gerado: ${linhas.length} marcas e ${Object.keys(SEMANTICOS).length} ícones de função`);

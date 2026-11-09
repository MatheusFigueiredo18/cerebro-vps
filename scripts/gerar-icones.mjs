// Gera cliente/icones.js a partir do pacote lucide-static (licença ISC), para a interface não depender
// de desenhos próprios nem de pacote em tempo de execução. Rode `node scripts/gerar-icones.mjs` ao mudar o mapa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pasta = path.join(raiz, 'node_modules', 'lucide-static', 'icons');

// nome usado na interface -> nome do ícone no Lucide
const MAPA = {
  menos: 'minus', ondas: 'audio-lines', filme: 'film', globo: 'globe', brilho: 'sparkles', livro: 'book-open',
  grafo: 'network', pasta: 'folder', doc: 'file-text', imagem: 'image', video: 'video', banco: 'table', busca: 'search',
  estrela: 'star', raio: 'zap', conversa: 'message-square', whatsapp: 'message-circle', n8n: 'workflow', conteudos: 'layout-grid',
  imagens: 'images', sol: 'sun', lua: 'moon', sair: 'log-out', mais: 'plus', x: 'x', voltar: 'chevron-left', avancar: 'chevron-right',
  seta: 'chevron-right', novaPagina: 'file-plus', novaPasta: 'folder-plus', novoBanco: 'table-properties', ordenar: 'arrow-up-down',
  recolher: 'chevrons-down-up', recarregar: 'refresh-cw', alvo: 'crosshair', baixar: 'download', enviar: 'upload', fixar: 'pin',
  olho: 'eye', ocultar: 'eye-off', cima: 'chevron-up', baixo: 'chevron-down', play: 'play', terminal: 'terminal', lateral: 'panel-left', copiar: 'copy', lateralDireita: 'panel-right',
  link: 'link', inbox: 'inbox', relogio: 'clock', robo: 'bot', config: 'settings',
  // Lousas
  lousa: 'presentation', mao: 'hand', cursor: 'mouse-pointer-2', caneta: 'pen', marca: 'highlighter', inteligente: 'wand-sparkles', borracha: 'eraser',
  precisao: 'scissors', laco: 'lasso', postit: 'sticky-note', texto: 'type', formas: 'shapes', retangulo: 'rectangle-horizontal', oval: 'circle',
  triangulo: 'triangle', losango: 'diamond', linha: 'slash', setaDiag: 'arrow-up-right', quadro: 'frame', desfazer: 'undo-2', refazer: 'redo-2',
  grade: 'grid-3x3', mapa: 'map', ajustar: 'maximize', lixeira: 'trash-2', cadeado: 'lock', destravar: 'lock-open', frente: 'arrow-up-to-line',
  tras: 'arrow-down-to-line', agrupar: 'group', paleta: 'palette', balde: 'paint-bucket', ajuda: 'circle-help',
  // Criação de vídeo
  musica: 'music', duplicar: 'copy-plus', colar: 'clipboard-paste',
};

const interno = (svg) => svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim();

const linhas = Object.entries(MAPA).map(([nome, lucide]) => {
  const arquivo = path.join(pasta, `${lucide}.svg`);
  if (!fs.existsSync(arquivo)) throw new Error(`ícone ${lucide} não existe no lucide-static`);
  return `  ${nome}: '${interno(fs.readFileSync(arquivo, 'utf8')).replace(/'/g, "\\'")}',`;
});

const saida = `// GERADO por scripts/gerar-icones.mjs a partir do Lucide (licença ISC, ver THIRD-PARTY.md). Não edite à mão.\nexport const P = {\n${linhas.join('\n')}\n};\n`;
fs.writeFileSync(path.join(raiz, 'cliente', 'icones.js'), saida);
console.log(`icones.js gerado com ${linhas.length} ícones`);

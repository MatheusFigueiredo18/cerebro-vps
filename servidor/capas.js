// Miniatura JPEG de vídeo com ffmpeg, guardada em <dados>/capas e gerada uma vez por versão do vídeo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function criarCapas(pastaDados, ffmpeg = 'ffmpeg') {
  const pasta = path.join(pastaDados, 'capas');
  const emAndamento = new Map();

  const gerar = (video, destino) => new Promise((ok) => {
    fs.mkdirSync(pasta, { recursive: true });
    const temp = `${destino}.${process.pid}.tmp.jpg`;
    const p = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-ss', '1', '-i', video, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', temp], { stdio: 'ignore' });
    p.on('error', () => ok(false));
    p.on('close', (codigo) => {
      if (codigo === 0 && fs.existsSync(temp)) { fs.renameSync(temp, destino); ok(true); } else { fs.rmSync(temp, { force: true }); ok(false); }
    });
  });

  // devolve o caminho do JPEG, ou null se não deu para gerar
  return async function capa(videoReal) {
    const { mtimeMs } = fs.statSync(videoReal);
    const nome = crypto.createHash('sha1').update(`${videoReal}\n${mtimeMs}`).digest('hex');
    const destino = path.join(pasta, `${nome}.jpg`);
    if (fs.existsSync(destino)) return destino;
    if (!emAndamento.has(destino)) {
      emAndamento.set(destino, gerar(videoReal, destino).finally(() => emAndamento.delete(destino)));
    }
    return (await emAndamento.get(destino)) ? destino : null;
  };
}

#!/usr/bin/env node
// Transcreve a fala com tempo por palavra usando o whisper.cpp do projeto Remotion (local, sem custo).
// Uso: node transcrever.mjs <video-ou-audio> <pasta-saida> [--projeto /opt/core-os/dados/remotion] [--modelo small] [--idioma pt]
// Saída: <pasta>/captions.json (tipo Caption do @remotion/captions) e <pasta>/palavras.json ({ words: [{ text, start, end }] }, formato dos scripts de corte).
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opc = (nome, padrao) => { const i = args.indexOf(`--${nome}`); return i >= 0 ? args.splice(i, 2)[1] : padrao; };
const projeto = opc('projeto', process.env.REMOTION_PROJETO || '/opt/core-os/dados/remotion');
const modelo = opc('modelo', 'small');
const idioma = opc('idioma', 'pt');
const [entrada, saida] = args;
if (!entrada || !saida) { console.error('uso: node transcrever.mjs <video-ou-audio> <pasta-saida> [--projeto dir] [--modelo small] [--idioma pt]'); process.exit(2); }

const exigir = createRequire(path.join(projeto, 'package.json'));
const { transcribe, toCaptions } = exigir('@remotion/install-whisper-cpp');
const whisperPath = path.join(projeto, 'whisper.cpp');
if (!fs.existsSync(path.join(whisperPath, `ggml-${modelo}.bin`))) {
  console.error(`modelo ggml-${modelo}.bin não está em ${whisperPath}: instale com installWhisperCpp/downloadWhisperModel do @remotion/install-whisper-cpp`);
  process.exit(1);
}

fs.mkdirSync(saida, { recursive: true });
const wav = path.join(saida, 'fala-16k.wav'); // whisper.cpp só aceita WAV 16 kHz
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', entrada, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { stdio: 'inherit' });
if (ff.status !== 0) process.exit(ff.status ?? 1);

const r = await transcribe({ inputPath: wav, whisperPath, whisperCppVersion: '1.5.5', model: modelo, tokenLevelTimestamps: true, splitOnWord: true, language: idioma });
const { captions } = toCaptions({ whisperCppOutput: r });
const words = captions.map((c) => ({ text: c.text.trim(), start: c.startMs / 1000, end: c.endMs / 1000 })).filter((w) => w.text);
const dur = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', entrada], { encoding: 'utf8' });

fs.writeFileSync(path.join(saida, 'captions.json'), JSON.stringify(captions, null, 1));
fs.writeFileSync(path.join(saida, 'palavras.json'), JSON.stringify({ audio_duration_secs: Number(dur.stdout) || undefined, words }, null, 1));
console.log(`${words.length} palavras. ${words.slice(0, 12).map((w) => w.text).join(' ')}…`);

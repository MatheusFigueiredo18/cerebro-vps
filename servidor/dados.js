// Arquivos JSON da pasta de dados: leitura tolerante e gravação atômica (temporário + rename).
import fs from 'node:fs';
import path from 'node:path';

export function lerJson(dir, nome, padrao) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, nome), 'utf8')) ?? padrao; } catch { return padrao; }
}

// compacto: sem recuo, para arquivos grandes (lousas com milhares de pontos); os demais seguem legíveis
export function gravarJson(dir, nome, valor, { compacto = false } = {}) {
  const destino = path.join(dir, nome);
  const temp = `${destino}.${process.pid}.tmp`;
  const texto = `${compacto ? JSON.stringify(valor) : JSON.stringify(valor, null, 2)}\n`;
  fs.writeFileSync(temp, texto);
  try {
    fs.renameSync(temp, destino);
  } catch (e) {
    // no Windows o rename falha se outro processo (antivírus, indexador) segura o destino: grava direto
    if (!['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
    fs.writeFileSync(destino, texto);
    fs.rmSync(temp, { force: true });
  }
}

export const existeJson = (dir, nome) => fs.existsSync(path.join(dir, nome));

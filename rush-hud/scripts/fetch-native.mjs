import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = 'https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-windows-x86-64-universal.zip';
const sha256 = '3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7';
export async function ensureNative() {
  const vendor = path.join(here, 'vendor'); await fs.mkdir(vendor, { recursive: true });
  const archive = path.join(vendor, 'stockfish19-windows.zip');
  let bytes;
  try { bytes = await fs.readFile(archive); } catch {
    const response = await fetch(source, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw Error('Не удалось скачать официальный Stockfish 19: ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw Error('SHA256 официального Stockfish не совпал.');
  await fs.writeFile(archive, bytes);
  const staging = path.join(vendor, 'stockfish-extract');
  await fs.rm(staging, { recursive: true, force: true }); await fs.mkdir(staging);
  await promisify(execFile)('tar', ['-xf', archive, '-C', staging]);
  const folder = path.join(staging, 'stockfish');
  await fs.access(path.join(folder, 'stockfish-windows-x86-64-universal.exe'));
  await fs.access(path.join(folder, 'Copying.txt')); await fs.access(path.join(folder, 'src', 'search.cpp'));
  const target = path.join(vendor, 'stockfish-native');
  await fs.rm(target, { recursive: true, force: true }); await fs.rename(folder, target);
  await fs.rm(staging, { recursive: true, force: true });
  return target;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await ensureNative();

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxBytes = 16 * 1024 * 1024;
export class SetError extends Error {}

function render(command: string, args: string[], bytes: Buffer, svg: boolean): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe' });
    const chunks: Buffer[] = [];
    let count = 0;
    let stderr = '';
    let failure: SetError | undefined;
    const generic = new SetError(svg ? 'The SVG set could not be rendered.' : 'The image set could not be rendered.');
    const kill = (error: SetError) => { failure ??= error; child.kill('SIGKILL'); };
    const timer = setTimeout(() => kill(new SetError('Set preparation exceeded its time limit. Simplify the artwork or use a PNG.')), 5000);
    child.on('error', () => { clearTimeout(timer); reject(generic); });
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk: Buffer) => {
      count += chunk.length;
      if (count > maxBytes) kill(generic);
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(0, 1024); });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0) return reject(svg && stderr.trim() ? new SetError(stderr.trim()) : generic);
      const output = Buffer.concat(chunks);
      if (!output.subarray(0, 8).equals(pngMagic)) return reject(generic);
      resolve(output);
    });
    child.stdin.end(bytes);
  });
}

export async function prepareSet(mime: string, bytes: Buffer): Promise<Buffer> {
  if (bytes.length > maxBytes) throw new SetError('Set images must be 16 MB or smaller.');
  if (mime === 'image/svg+xml') {
    if (bytes.length > 1024 * 1024) throw new SetError('SVG sets must be 1 MB or smaller.');
    return render(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./set-svg.ts', import.meta.url))], bytes, true);
  }
  const png = mime === 'image/png' && bytes.subarray(0, 8).equals(pngMagic);
  const jpeg = mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = mime === 'image/webp' && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
  if (!png && !jpeg && !webp) throw new SetError('Choose a valid PNG, JPEG, WebP or SVG set.');
  const demuxer = png ? 'png_pipe' : jpeg ? 'jpeg_pipe' : 'webp_pipe';
  return render('ffmpeg', ['-v', 'error', '-protocol_whitelist', 'pipe', '-f', demuxer, '-max_pixels', '16777216',
    '-i', 'pipe:0', '-frames:v', '1', '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
    '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'], bytes, false);
}

const preparing = new Map<string, Promise<Buffer>>();
export async function preparedSet(mime: string, path: string): Promise<string> {
  const original = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!original?.isFile()) throw new SetError('The set is unavailable.');
  if (original.size > maxBytes) throw new SetError('Set images must be 16 MB or smaller.');
  if (mime === 'image/svg+xml' && original.size > 1024 * 1024) throw new SetError('SVG sets must be 1 MB or smaller.');
  const bytes = await readFile(path);
  const digest = createHash('sha256').update(mime).update(bytes).digest('hex');
  const cache = path + '.set-v1-' + digest + '.png';
  let pending = preparing.get(cache);
  if (!pending) {
    pending = (async () => {
      const existing = await lstat(cache).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
      if (existing?.isFile() && existing.size <= maxBytes) {
        const png = await readFile(cache);
        if (png.subarray(0, 8).equals(pngMagic)) return png;
      }
      const png = await prepareSet(mime, bytes);
      const temp = cache + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temp, png, { flag: 'wx' });
        await rename(temp, cache);
      } finally { await rm(temp, { force: true }); }
      return png;
    })().finally(() => preparing.delete(cache));
    preparing.set(cache, pending);
  }
  return 'data:image/png;base64,' + (await pending).toString('base64');
}

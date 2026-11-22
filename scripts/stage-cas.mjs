import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const runtime = dirname(require.resolve('pyodide'));
const destination = fileURLToPath(new URL('../public/cas/', import.meta.url));
const manifest = JSON.parse(await readFile(join(runtime, 'pyodide-lock.json'), 'utf8'));
const { version } = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'));
const release = new URL('https://cdn.jsdelivr.net/pyodide/v' + version + '/full/');

await mkdir(destination, { recursive: true });
const files = ['pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
await Promise.all(files.map(async name => {
  const source = join(runtime, name);
  const target = join(destination, name);
  await copyFile(source, target);
}));

const included = ['sympy', ...manifest.packages.sympy.depends];
await Promise.all(included.map(async packageName => {
  const entry = manifest.packages[packageName];
  const target = join(destination, entry.file_name);
  const validate = bytes => createHash('sha256').update(bytes).digest('hex') === entry.sha256;
  const cached = await readFile(target).catch(() => undefined);
  if (cached && validate(cached)) return;

  const response = await fetch(new URL(entry.file_name, release), { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('Could not download ' + entry.file_name + ' (HTTP ' + response.status + ').');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!validate(bytes)) throw new Error('Checksum mismatch for ' + entry.file_name + '.');
  const temporary = target + '.' + process.pid + '.tmp';
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}));

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const files = (await readdir(root, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name !== 'sw.js')
  .map(entry => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
  .sort();
const required = ['index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'cas/pyodide.asm.wasm'];
for (const file of required) {
  if (!files.includes(file)) throw new Error('Missing offline asset: ' + file);
}
const digest = createHash('sha256');
digest.update(await readFile(fileURLToPath(import.meta.url)));
for (const file of files) {
  digest.update(file);
  digest.update(createHash('sha256').update(await readFile(join(root, file))).digest());
}
const revision = digest.digest('hex').slice(0, 20);

await writeFile(join(root, 'sw.js'), [
  'const revision = ' + JSON.stringify(revision) + ';',
  'const files = ' + JSON.stringify(files) + ';',
  '',
  'const scope = new URL(self.registration.scope);',
  'const prefix = "calc-studio-" + scope.pathname + "-";',
  'const cacheName = prefix + revision;',
  'const index = new URL("index.html", scope);',
  'const resources = new Set(files.map(file => new URL(file, scope).href));',
  '',
  'self.addEventListener("install", event => {',
  '  event.waitUntil((async () => {',
  '    const cache = await caches.open(cacheName);',
  '    const requests = [...resources].map(url => new Request(url, { cache: "reload" }));',
  '    try {',
  '      for (let i = 0; i < requests.length; i += 8) await cache.addAll(requests.slice(i, i + 8));',
  '    } catch (error) {',
  '      await caches.delete(cacheName);',
  '      throw error;',
  '    }',
  '  })());',
  '});',
  '',
  'self.addEventListener("activate", event => {',
  '  event.waitUntil((async () => {',
  '    const names = await caches.keys();',
  '    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName).map(name => caches.delete(name)));',
  '    await self.clients.claim();',
  '  })());',
  '});',
  '',
  'self.addEventListener("fetch", event => {',
  '  const { request } = event;',
  '  if (request.method !== "GET") return;',
  '  const url = new URL(request.url);',
  '  if (url.origin !== scope.origin) return;',
  '  const shell = request.mode === "navigate" && (url.pathname === scope.pathname || url.pathname === index.pathname);',
  '  if (!shell && !resources.has(url.href)) return;',
  '  event.respondWith((async () => {',
  '    const cache = await caches.open(cacheName);',
  '    return (await cache.match(shell ? index.href : request, { ignoreVary: true })) ?? fetch(request);',
  '  })());',
  '});',
  '',
].join('\n'));

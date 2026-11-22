import code from './sympy-cas.py?raw';
import type { loadPyodide as LoadPyodide, PyodideInterface } from 'pyodide';
import type { ExactMessage, ExactReply, ExactResult } from './exact-worker-types';

let interpreter: Promise<PyodideInterface> | undefined;

async function initialize() {
  const url = new URL('../cas/', self.location.href);
  const moduleUrl = new URL('pyodide.mjs', url).href;
  const { loadPyodide }: { loadPyodide: typeof LoadPyodide } = await import(/* @vite-ignore */ moduleUrl);
  const python = await loadPyodide({ indexURL: url.href, packages: ['sympy'] });
  python.runPython(code);
  return python;
}

self.addEventListener('message', async ({ data: { id, request } }: MessageEvent<ExactMessage>) => {
  const reply: ExactReply = { id };
  try {
    const python = await (interpreter ??= initialize().catch(error => {
      interpreter = undefined;
      throw error;
    }));
    python.globals.set('incoming_request', JSON.stringify(request));
    const json = python.runPython('json.dumps(evaluate_request(incoming_request))') as string;
    reply.result = JSON.parse(json) as ExactResult | null;
  } catch {
    // The caller can fall back to its independently computed numerical result.
  }
  self.postMessage(reply);
});

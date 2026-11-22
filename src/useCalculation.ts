import { useEffect, useRef, useState } from 'react';
import type { Requests, Responses, WorkerResponse } from './model';

export function useCalculation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const pending = useRef<{ id: number; cancel: () => void } | null>(null);
  const sequence = useRef(0);

  useEffect(() => () => {
    pending.current?.cancel();
    worker.current?.terminate();
    worker.current = null;
  }, []);

  function cancel() {
    if (pending.current) {
      pending.current.cancel();
      worker.current?.terminate();
      worker.current = null;
      setBusy(false);
    }
  }

  function run<K extends keyof Requests>(kind: K, payload: Requests[K]): Promise<Responses[K] | undefined> {
    cancel();
    setBusy(true);
    setError('');
    const instance = worker.current ??= new Worker(new URL('./calculator.worker.ts', import.meta.url), { type: 'module' });
    const id = ++sequence.current;

    return new Promise(resolve => {
      function finish() {
        clearTimeout(timeout);
        instance.removeEventListener('message', onMessage);
        instance.removeEventListener('error', onError);
        if (pending.current?.id === id) pending.current = null;
      }
      function onMessage({ data }: MessageEvent<WorkerResponse>) {
        if (data.id !== id) return;
        finish();
        setBusy(false);
        if ('error' in data) {
          setError(data.error);
          resolve(undefined);
        } else resolve(data.data as Responses[K]);
      }
      function onError() {
        finish();
        instance.terminate();
        worker.current = null;
        setBusy(false);
        setError('計算処理を起動できませんでした。もう一度お試しください。');
        resolve(undefined);
      }
      const timeout = window.setTimeout(() => {
        finish();
        instance.terminate();
        worker.current = null;
        setBusy(false);
        setError('計算が時間内に終わりませんでした。式を簡単にするか、範囲を狭めてください。');
        resolve(undefined);
      }, kind === 'calculate' ? 17000 : 12000);
      pending.current = { id, cancel: () => { finish(); resolve(undefined); } };
      instance.addEventListener('message', onMessage);
      instance.addEventListener('error', onError);
      instance.postMessage({ id, kind, payload });
    });
  }

  return { run, cancel, busy, error, clearError: () => setError('') };
}

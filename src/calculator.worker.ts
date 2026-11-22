import { extendedCalculation } from './extendedCalculation';
import { graph } from './graph';
import { matrix, system } from './solvers';
import type { WorkerRequest, WorkerResponse } from './model';

self.addEventListener('message', async ({ data: request }: MessageEvent<WorkerRequest>) => {
  const { id, kind, payload } = request;
  let reply: WorkerResponse;
  try {
    switch (kind) {
      case 'calculate': reply = { id, data: await extendedCalculation(payload) }; break;
      case 'system': reply = { id, data: system(payload) }; break;
      case 'matrix': reply = { id, data: matrix(payload) }; break;
      case 'graph': reply = { id, data: graph(payload) }; break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    reply = { id, error: /[ぁ-んァ-ヶ一-龠]/.test(message) ? message : '式を計算できませんでした。入力と定義域を確認してください。' };
  }
  self.postMessage(reply);
});

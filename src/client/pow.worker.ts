import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/sha';
import type { Challenge } from 'altcha-lib/types';

self.onmessage = async (e: MessageEvent<{ id: number; challenge: Challenge }>) => {
  const { id, challenge } = e.data;
  const solution = await solveChallenge({ challenge, deriveKey, timeout: 300_000 });
  self.postMessage({ id, solution });
};

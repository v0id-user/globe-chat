import { deriveKey } from 'altcha-lib/algorithms/web/sha';
import type { Pow } from '../shared/protocol';

const hexBytes = (h: string) => {
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
  return a;
};
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

// Re-derives the key the way altcha-lib's solver does: SHA-256(salt, nonce, counter as uint32 big-endian).
export async function verifyPow(p: Pow): Promise<{ ok: boolean; ms: number }> {
  const t0 = performance.now();
  const nonce = hexBytes(p.nonce);
  const password = new Uint8Array(nonce.length + 4);
  password.set(nonce);
  new DataView(password.buffer).setUint32(nonce.length, p.counter, false);
  const params = { algorithm: 'SHA-256', cost: 1, keyLength: 32, keyPrefix: p.prefix, nonce: p.nonce, salt: p.salt };
  const { derivedKey } = await deriveKey(params, hexBytes(p.salt), password);
  const key = toHex(derivedKey);
  return { ok: key === p.key && key.startsWith(p.prefix), ms: performance.now() - t0 };
}

export function powBytesHex(p: Pow): string {
  return p.salt + ' ' + p.nonce + ' ' + p.counter.toString(16).padStart(8, '0');
}

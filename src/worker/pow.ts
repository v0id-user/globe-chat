import { createChallenge, verifySolution, type Challenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/sha';
import { CHALLENGE_TTL_S, PREFIX, type ProofKind, type Proof } from '../shared/protocol';

export function issue(secret: string, kind: ProofKind, hub: string, conn: string): Promise<Challenge> {
  return createChallenge({
    algorithm: 'SHA-256',
    cost: 1,
    deriveKey,
    keyPrefix: PREFIX[kind],
    hmacSignatureSecret: secret,
    expiresAt: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_S,
    data: { kind, hub, conn }
  });
}

// `expected` is the signature of the one challenge this connection holds.
// The signature covers `data`, so kind, hub and connection can't be swapped.
export async function check(secret: string, proof: Proof | undefined, expected: string | null, kind: ProofKind): Promise<boolean> {
  const c = proof?.challenge;
  if (!c || !proof.solution || !expected || c.signature !== expected) return false;
  if (c.parameters?.data?.kind !== kind) return false;
  const r = await verifySolution({ challenge: c, solution: proof.solution, hmacSignatureSecret: secret, deriveKey });
  return r.verified;
}

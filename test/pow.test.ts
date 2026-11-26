import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/sha';
import { describe, expect, it } from 'vitest';
import { check, issue } from '../src/worker/pow';

const SECRET = 'test-secret';

describe('proof check', () => {
  it('accepts the held challenge once solved, and nothing else', async () => {
    const challenge = await issue(SECRET, 'say', 'EUE', 'conn-1');
    const solution = (await solveChallenge({ challenge, deriveKey }))!;
    const proof = { challenge, solution };
    const held = challenge.signature!;

    expect(await check(SECRET, proof, held, 'say')).toBe(true);
    // Already used: the hub cleared what it holds.
    expect(await check(SECRET, proof, null, 'say')).toBe(false);
    // A join challenge can't pay for a message.
    expect(await check(SECRET, proof, held, 'join')).toBe(false);
    // Changing the signed data breaks the signature.
    const forged = { ...challenge, parameters: { ...challenge.parameters, data: { ...challenge.parameters.data, conn: 'conn-2' } } };
    expect(await check(SECRET, { challenge: forged, solution }, held, 'say')).toBe(false);
    // A wrong counter fails the key check.
    expect(await check(SECRET, { challenge, solution: { ...solution, counter: solution.counter + 1 } }, held, 'say')).toBe(false);
  });
});

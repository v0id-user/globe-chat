import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/sha';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { open } from './ws';

const RIYADH = { city: 'Riyadh', country: 'SA', latitude: '24.7', longitude: '46.7', colo: 'RUH' };
const TOKYO = { city: 'Tokyo', country: 'JP', latitude: '35.7', longitude: '139.7', colo: 'NRT' };

describe('admin', () => {
  it('only the right key can delete, and the delete reaches every hub', async () => {
    const riyadh = await open(RIYADH);
    const tokyo = await open(TOKYO);
    const hello = await riyadh.next('hello');
    await tokyo.next('hello');
    riyadh.send({ t: 'join', nick: 'falcon', proof: { challenge: hello.challenge, solution: (await solveChallenge({ challenge: hello.challenge, deriveKey }))! } });
    await riyadh.next('joined');
    const c = (await riyadh.next('challenge')).challenge;
    riyadh.send({ t: 'say', cid: 'c1', text: 'delete me', proof: { challenge: c, solution: (await solveChallenge({ challenge: c, deriveKey }))! } });
    const { id } = (await tokyo.next('msg')).msg;
    await riyadh.next('msg');

    tokyo.send({ t: 'admin', key: 'wrong' });
    expect((await tokyo.next('admin')).ok).toBe(false);
    tokyo.send({ t: 'admin', key: env.ADMIN_KEY });
    expect((await tokyo.next('admin')).ok).toBe(true);
    tokyo.send({ t: 'remove', ids: [id] });
    expect((await riyadh.next('removed')).ids).toEqual([id]);

    const later = await open(RIYADH);
    expect((await later.next('hello')).history.map((m) => m.id)).not.toContain(id);
    for (const s of [riyadh, tokyo, later]) s.ws.close();
  }, 120_000);
});

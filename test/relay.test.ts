import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/sha';
import { describe, expect, it } from 'vitest';
import { open } from './ws';

describe('relay', () => {
  it('a message said at one hub reaches people on another hub', async () => {
    const riyadh = await open({ city: 'Riyadh', country: 'SA', latitude: '24.7', longitude: '46.7', colo: 'RUH' });
    const tokyo = await open({ city: 'Tokyo', country: 'JP', latitude: '35.7', longitude: '139.7', colo: 'NRT' });
    const hello = await riyadh.next('hello');
    await tokyo.next('hello');

    const joinSolution = (await solveChallenge({ challenge: hello.challenge, deriveKey }))!;
    riyadh.send({ t: 'join', nick: 'falcon', proof: { challenge: hello.challenge, solution: joinSolution } });
    expect((await riyadh.next('joined')).nick).toBe('falcon');
    const sayChallenge = (await riyadh.next('challenge')).challenge;
    const saySolution = (await solveChallenge({ challenge: sayChallenge, deriveKey }))!;
    riyadh.send({ t: 'say', cid: 'c1', text: 'salam', proof: { challenge: sayChallenge, solution: saySolution } });

    const got = (await tokyo.next('msg')).msg;
    expect(got).toMatchObject({ nick: 'falcon', text: 'salam', city: 'Riyadh', colo: 'RUH', hub: 'EUE' });
    riyadh.ws.close();
    tokyo.ws.close();
  }, 120_000);
});

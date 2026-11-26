import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/sha';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ClientMsg, ServerMsg } from '../src/shared/protocol';

async function open(cf: Record<string, unknown>) {
  const res = await (exports as unknown as { default: Fetcher }).default.fetch('http://x/hub', { headers: { Upgrade: 'websocket' }, cf } as RequestInit);
  const ws = res.webSocket!;
  ws.accept();
  const inbox: ServerMsg[] = [];
  const waiters: [(m: ServerMsg) => boolean, (m: ServerMsg) => void][] = [];
  ws.addEventListener('message', (e: MessageEvent) => {
    const m = JSON.parse(String(e.data)) as ServerMsg;
    const i = waiters.findIndex(([f]) => f(m));
    if (i >= 0) waiters.splice(i, 1)[0][1](m);
    else inbox.push(m);
  });
  const next = <T extends ServerMsg['t']>(t: T) =>
    new Promise<Extract<ServerMsg, { t: T }>>((resolve) => {
      const i = inbox.findIndex((m) => m.t === t);
      if (i >= 0) return resolve(inbox.splice(i, 1)[0] as Extract<ServerMsg, { t: T }>);
      waiters.push([(m) => m.t === t, resolve as (m: ServerMsg) => void]);
    });
  const send = (m: ClientMsg) => ws.send(JSON.stringify(m));
  return { ws, next, send };
}

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

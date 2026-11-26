import { exports } from 'cloudflare:workers';
import type { ClientMsg, ServerMsg } from '../src/shared/protocol';

export async function open(cf: Record<string, unknown>) {
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

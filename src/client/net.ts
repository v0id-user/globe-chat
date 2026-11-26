import ReconnectingWebSocket from 'partysocket/ws';
import type { Challenge, Solution } from 'altcha-lib/types';
import { MIN_GAP_MS, type ClientMsg, type Proof, type Removal, type ServerMsg } from '../shared/protocol';

const makeWorker = () => new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' });

// One socket to the nearest hub. The hub hands out one challenge at a time;
// the browser solves it right away so the next join or message can go out at once.
export class Net {
  private ws: ReconnectingWebSocket;
  private worker = makeWorker();
  private busy = false;
  private job = 0;
  private ready: Proof | null = null;
  private nick: string | null = null;
  private queue: { cid: string; text: string }[] = [];
  private lastSay = 0;
  private waitT: ReturnType<typeof setTimeout> | null = null;
  private adminKey: string | null = null;

  constructor(private on: (m: ServerMsg) => void) {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/hub';
    this.ws = new ReconnectingWebSocket(url);
    this.ws.addEventListener('message', (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === 'hello' && this.adminKey) this.ws.send(JSON.stringify({ t: 'admin', key: this.adminKey } satisfies ClientMsg));
      if (m.t === 'hello' || m.t === 'challenge') this.solve(m.challenge);
      this.on(m);
    });
  }

  join(nick: string) {
    this.nick = nick;
    this.flush();
  }

  // Sent again after every reconnect, since a new connection starts without admin rights.
  setAdmin(key: string) {
    this.adminKey = key;
    this.ws.send(JSON.stringify({ t: 'admin', key } satisfies ClientMsg));
  }

  remove(ids: Removal) {
    this.ws.send(JSON.stringify({ t: 'remove', ids } satisfies ClientMsg));
  }

  cancelJoin() {
    this.nick = null;
  }

  say(cid: string, text: string) {
    this.queue.push({ cid, text });
    this.flush();
  }

  private solve(challenge: Challenge) {
    this.ready = null;
    if (this.busy) {
      this.worker.terminate();
      this.worker = makeWorker();
    }
    const id = ++this.job;
    this.busy = true;
    this.worker.onmessage = (e: MessageEvent<{ id: number; solution: Solution | null }>) => {
      if (e.data.id !== this.job) return;
      this.busy = false;
      if (!e.data.solution) return;
      this.ready = { challenge, solution: e.data.solution };
      this.flush();
    };
    this.worker.postMessage({ id, challenge });
  }

  private send(m: ClientMsg) {
    this.ready = null;
    this.ws.send(JSON.stringify(m));
  }

  private flush() {
    const r = this.ready;
    if (!r) return;
    const kind = r.challenge.parameters.data?.kind;
    if (kind === 'join' && this.nick !== null) return this.send({ t: 'join', nick: this.nick, proof: r });
    if (kind !== 'say' || !this.queue.length) return;
    const wait = this.lastSay + MIN_GAP_MS + 50 - Date.now();
    if (wait > 0) {
      if (!this.waitT) this.waitT = setTimeout(() => { this.waitT = null; this.flush(); }, wait);
      return;
    }
    const q = this.queue.shift()!;
    this.lastSay = Date.now();
    this.send({ t: 'say', cid: q.cid, text: q.text, proof: r });
  }
}

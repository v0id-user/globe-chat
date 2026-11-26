import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { HUBS, hubByCode, type HubCode } from '../shared/hubs';
import {
  HISTORY, MIN_GAP_MS, NICK_RE, cleanText,
  type ChatMsg, type ClientMsg, type Listener, type Place, type ServerMsg
} from '../shared/protocol';
import { check, issue } from './pow';

interface ConnState {
  place: Place;
  nick: string | null;
  sig: string | null;
  last: number;
}

const PRESENCE_DEBOUNCE_MS = 3000;

export function readPlace(raw: string | null): Place {
  try {
    const p = JSON.parse(decodeURIComponent(raw ?? ''));
    return {
      city: String(p.city || 'Somewhere').slice(0, 64),
      cc: String(p.cc || '??').slice(0, 2),
      lat: Number.isFinite(p.lat) ? p.lat : 0,
      lon: Number.isFinite(p.lon) ? p.lon : 0,
      colo: String(p.colo || '???').slice(0, 4)
    };
  } catch {
    return { city: 'Somewhere', cc: '??', lat: 0, lon: 0, colo: '???' };
  }
}

export class Hub extends Server<Env> {
  static options = { hibernate: true };

  // Other hubs' listener cities. Memory only: refilled on the first
  // connection after a wake, then kept fresh by pushes.
  private others = new Map<HubCode, Listener[]>();
  private pulled = false;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private inserts = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql`CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, body TEXT NOT NULL)`;
  }

  private get code(): HubCode {
    return this.name as HubCode;
  }

  private peer(code: HubCode) {
    const hub = hubByCode(code)!;
    return this.env.Hub.get(this.env.Hub.idFromName(code), { locationHint: hub.hint });
  }

  private peers() {
    return HUBS.filter((h) => h.code !== this.code);
  }

  private send(conn: Connection, msg: ServerMsg) {
    conn.send(JSON.stringify(msg));
  }

  async onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
    const place = readPlace(ctx.request.headers.get('x-gc-place'));
    const challenge = await issue(this.env.POW_SECRET, 'join', this.code, conn.id);
    conn.setState({ place, nick: null, sig: challenge.signature ?? null, last: 0 });
    await this.pullPresence();
    const history = this.sql<{ body: string }>`SELECT body FROM messages ORDER BY ts DESC LIMIT ${HISTORY}`
      .map((r) => JSON.parse(r.body) as ChatMsg)
      .reverse();
    const presence = Object.fromEntries(this.others);
    presence[this.code] = this.cities();
    this.send(conn, { t: 'hello', me: { ...place, hub: this.code }, history, presence, challenge });
    this.schedulePresence();
  }

  onClose() {
    this.schedulePresence();
  }

  async onMessage(conn: Connection<ConnState>, raw: WSMessage) {
    const st = conn.state;
    if (!st || typeof raw !== 'string') return;
    let m: ClientMsg;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t === 'join') return this.join(conn, st, m);
    if (m.t === 'say') return this.say(conn, st, m);
  }

  private async join(conn: Connection<ConnState>, st: ConnState, m: Extract<ClientMsg, { t: 'join' }>) {
    if (st.nick) return;
    // Clear the challenge before awaiting, so a replay sent alongside can't pass too.
    conn.setState({ ...st, sig: null });
    const ok = await check(this.env.POW_SECRET, m.proof, st.sig, 'join');
    const kind = ok ? 'say' : 'join';
    const next = await issue(this.env.POW_SECRET, kind, this.code, conn.id);
    const nick = typeof m.nick === 'string' && NICK_RE.test(m.nick) ? m.nick : 'guest' + Math.floor(1000 + Math.random() * 9000);
    conn.setState({ ...st, sig: next.signature ?? null, nick: ok ? nick : null });
    if (!ok) this.send(conn, { t: 'error', reason: 'proof rejected' });
    else this.send(conn, { t: 'joined', nick });
    this.send(conn, { t: 'challenge', challenge: next });
  }

  private async say(conn: Connection<ConnState>, st: ConnState, m: Extract<ClientMsg, { t: 'say' }>) {
    const cid = typeof m.cid === 'string' ? m.cid.slice(0, 32) : '';
    const text = cleanText(m.text);
    const now = Date.now();
    let reason = '';
    if (!st.nick) reason = 'join first';
    else if (!text) reason = 'empty message';
    else if (now - st.last < MIN_GAP_MS) reason = 'slow down';
    if (reason) return this.send(conn, { t: 'error', reason, cid });

    conn.setState({ ...st, sig: null });
    const ok = await check(this.env.POW_SECRET, m.proof, st.sig, 'say');
    const next = await issue(this.env.POW_SECRET, 'say', this.code, conn.id);
    conn.setState({ ...st, sig: next.signature ?? null, last: ok ? now : st.last });
    if (!ok) {
      this.send(conn, { t: 'error', reason: 'proof rejected', cid });
      return this.send(conn, { t: 'challenge', challenge: next });
    }

    const p = m.proof.challenge.parameters;
    const msg: ChatMsg = {
      id: crypto.randomUUID(),
      cid,
      ts: now,
      nick: st.nick!,
      text,
      ...st.place,
      hub: this.code,
      pow: { salt: p.salt, nonce: p.nonce, counter: m.proof.solution.counter, key: m.proof.solution.derivedKey, prefix: p.keyPrefix, ms: Math.round(m.proof.solution.time ?? 0) }
    };
    this.send(conn, { t: 'challenge', challenge: next });
    this.relay(msg);
    this.ctx.waitUntil(Promise.allSettled(this.peers().map((h) => this.peer(h.code).relay(msg))));
  }

  // Called locally for the origin hub and over RPC by the other hubs.
  relay(msg: ChatMsg) {
    this.sql`INSERT OR IGNORE INTO messages (id, ts, body) VALUES (${msg.id}, ${msg.ts}, ${JSON.stringify(msg)})`;
    if (++this.inserts % 20 === 0) {
      this.sql`DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY ts DESC LIMIT ${HISTORY})`;
    }
    this.broadcast(JSON.stringify({ t: 'msg', msg } satisfies ServerMsg));
  }

  presence(hub: HubCode, cities: Listener[]) {
    this.others.set(hub, cities);
    this.broadcast(JSON.stringify({ t: 'presence', hub, cities } satisfies ServerMsg));
  }

  listCities(): Listener[] {
    return this.cities();
  }

  private cities(): Listener[] {
    const by = new Map<string, Listener>();
    for (const c of this.getConnections<ConnState>()) {
      const p = c.state?.place;
      if (!p) continue;
      const k = p.city + '|' + p.cc;
      const e = by.get(k);
      if (e) e.n++;
      else by.set(k, { city: p.city, cc: p.cc, lat: p.lat, lon: p.lon, n: 1 });
    }
    return [...by.values()].sort((a, b) => b.n - a.n).slice(0, 50);
  }

  private async pullPresence() {
    if (this.pulled) return;
    this.pulled = true;
    await Promise.allSettled(
      this.peers().map(async (h) => {
        this.others.set(h.code, await this.peer(h.code).listCities());
      })
    );
  }

  private schedulePresence() {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      const cities = this.cities();
      this.broadcast(JSON.stringify({ t: 'presence', hub: this.code, cities } satisfies ServerMsg));
      this.ctx.waitUntil(Promise.allSettled(this.peers().map((h) => this.peer(h.code).presence(this.code, cities))));
    }, PRESENCE_DEBOUNCE_MS);
  }
}

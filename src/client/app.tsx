import { Component, createRef } from 'preact';
import { HUBS, hubByCode, type HubCode } from '../shared/hubs';
import { MAX_TEXT, type ChatMsg, type Place, type Presence, type ServerMsg } from '../shared/protocol';
import { FLIGHT_S, PixelGlobe, type Flight } from './globe';
import { Net } from './net';
import { ProofDialog } from './proof';
import { Row } from './row';

export interface Entry {
  id: string;
  cid?: string;
  ts: number;
  nick: string;
  place: string;
  text: string;
  mine: boolean;
  status: 'ok' | 'sent' | 'bad';
  reason?: string;
  msg?: ChatMsg;
}

type Phase = 'connecting' | 'join' | 'joining' | 'linked' | 'live';
type Me = Place & { hub: HubCode; hubColo?: string };

interface State {
  phase: Phase;
  me: Me | null;
  myNick: string;
  presence: Presence;
  hubColos: Partial<Record<HubCode, string>>;
  log: Entry[];
  draft: string;
  nick: string;
  selId: string | null;
  dot: number;
  clock: string;
  joinError: string;
}

const hm = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const hubIndex = (code: string) => Math.max(0, HUBS.findIndex((h) => h.code === code));
const placeOf = (p: { city: string; cc: string }) => p.city + ', ' + p.cc;

export class App extends Component<{}, State> {
  state: State = { phase: 'connecting', me: null, myNick: '', presence: {}, hubColos: {}, log: [], draft: '', nick: '', selId: null, dot: 0, clock: hm(new Date()), joinError: '' };
  private cv = createRef<HTMLCanvasElement>();
  private logEl = createRef<HTMLDivElement>();
  private globe = new PixelGlobe();
  private flights: Flight[] = [];
  private net!: Net;
  private raf = 0;
  private t0 = performance.now();
  private last = this.t0;
  private now = 0;
  private drag: { x: number; y: number; lam: number; phi: number } | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private dotT: ReturnType<typeof setInterval> | null = null;
  private clockT: ReturnType<typeof setInterval> | null = null;
  private joinAt = 0;
  private lid = 0;

  componentDidMount() {
    this.net = new Net((m) => this.onServer(m));
    const loop = (now: number) => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.clockT = setInterval(() => this.setState({ clock: hm(new Date()) }), 5000);
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.raf);
    if (this.clockT) clearInterval(this.clockT);
    if (this.dotT) clearInterval(this.dotT);
    this.timers.forEach(clearTimeout);
  }

  componentDidUpdate(_: {}, prev: State) {
    const el = this.logEl.current;
    if (el && prev.log.length !== this.state.log.length) el.scrollTop = el.scrollHeight;
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }

  private onServer(m: ServerMsg) {
    switch (m.t) {
      case 'hello':
        this.setState((s) => ({
          me: m.me,
          presence: m.presence,
          hubColos: m.hubColos ?? {},
          phase: s.phase === 'connecting' ? 'join' : s.phase,
          log: this.merge(s.log, m.history.map((x) => this.entryOf(x, s.myNick)))
        }));
        break;
      case 'joined': {
        this.setState({ myNick: m.nick });
        if (this.state.phase !== 'joining') break;
        const wait = Math.max(0, 1400 - (performance.now() - this.joinAt));
        this.later(wait, () => {
          if (this.dotT) clearInterval(this.dotT);
          this.setState({ phase: 'linked' });
          this.later(800, () => this.setState({ phase: 'live' }));
        });
        break;
      }
      case 'msg': {
        const mine = this.state.log.some((e) => e.cid && e.cid === m.msg.cid);
        this.setState((s) => {
          const e = this.entryOf(m.msg, s.myNick);
          const i = s.log.findIndex((x) => x.cid && x.cid === m.msg.cid);
          if (i >= 0) {
            const log = s.log.slice();
            log[i] = { ...e, mine: true };
            return { log };
          }
          return { log: this.merge(s.log, [e]) };
        });
        this.fly(m.msg, mine);
        break;
      }
      case 'presence':
        this.setState((s) => ({ presence: { ...s.presence, [m.hub]: m.cities } }));
        break;
      case 'error':
        if (m.cid) this.setState((s) => ({ log: s.log.map((e) => (e.cid === m.cid ? { ...e, status: 'bad', reason: m.reason } : e)) }));
        else if (this.state.phase === 'joining') {
          if (this.dotT) clearInterval(this.dotT);
          this.setState({ phase: 'join', joinError: 'The hub turned that down (' + m.reason + '). Try again.' });
        }
        break;
    }
  }

  private entryOf(m: ChatMsg, myNick: string): Entry {
    return { id: m.id, cid: m.cid, ts: m.ts, nick: m.nick, place: placeOf(m), text: m.text, mine: !!myNick && m.nick === myNick && m.city === this.state.me?.city, status: 'ok', msg: m };
  }

  private merge(log: Entry[], add: Entry[]): Entry[] {
    const seen = new Set(log.map((e) => e.id));
    const out = log.concat(add.filter((e) => !seen.has(e.id)));
    out.sort((a, b) => a.ts - b.ts);
    return out.slice(-200);
  }

  private listeners(): { ll: [number, number]; hub: number }[] {
    const out: { ll: [number, number]; hub: number }[] = [];
    for (const [code, cities] of Object.entries(this.state.presence)) {
      for (const c of cities ?? []) out.push({ ll: [c.lon, c.lat], hub: hubIndex(code) });
    }
    return out.slice(0, 40);
  }

  private fly(m: ChatMsg, mine: boolean) {
    const hub = hubIndex(m.hub);
    this.flights.push({
      t: this.now, mine, nick: m.nick, place: placeOf(m), text: m.text, key: m.pow.key, colo: m.colo,
      from: [m.lon, m.lat], hub, relays: HUBS.map((_, i) => i).filter((i) => i !== hub), listeners: this.listeners()
    });
  }

  private frame(now: number) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.now = (now - this.t0) / 1000;
    if (!this.drag) this.globe.lam += (dt * 0.16) / (Math.PI / 180);
    this.flights = this.flights.filter((f) => this.now - f.t <= FLIGHT_S);
    const dots: [number, number][] = [];
    for (const cities of Object.values(this.state.presence)) for (const c of cities ?? []) dots.push([c.lon, c.lat]);
    const me = this.state.me;
    const labels = HUBS.map((h) => (this.state.hubColos[h.code] ? h.code + ' ' + this.state.hubColos[h.code] : h.code));
    this.globe.draw(this.cv.current, this.now, this.flights, dots, me ? [me.lon, me.lat] : null, labels);
  }

  private down = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, lam: this.globe.lam, phi: this.globe.phi };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  private move = (e: PointerEvent) => {
    if (!this.drag) return;
    this.globe.lam = this.drag.lam + (e.clientX - this.drag.x) * 0.35;
    this.globe.phi = Math.max(-80, Math.min(80, this.drag.phi - (e.clientY - this.drag.y) * 0.35));
  };
  private up = () => { this.drag = null; };

  private join = () => {
    if (this.state.phase !== 'join') return;
    const nick = this.state.nick.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
    this.joinAt = performance.now();
    this.setState({ phase: 'joining', dot: 0, joinError: '' });
    this.dotT = setInterval(() => this.setState((s) => ({ dot: s.dot + 1 })), 90);
    this.net.join(nick);
  };

  private send = () => {
    const text = this.state.draft.trim().slice(0, MAX_TEXT);
    const me = this.state.me;
    if (!text || this.state.phase !== 'live' || !me) return;
    const cid = 'c' + ++this.lid + '-' + Math.random().toString(36).slice(2, 8);
    const e: Entry = { id: cid, cid, ts: Date.now(), nick: this.state.myNick, place: placeOf(me), text, mine: true, status: 'sent' };
    this.setState((s) => ({ draft: '', log: s.log.concat([e]) }));
    this.net.say(cid, text);
  };

  private route(m: ChatMsg) {
    const cities = Object.values(this.state.presence).flatMap((c) => c ?? []);
    return { relays: HUBS.filter((h) => h.code !== m.hub).map((h) => h.name), listeners: cities.map((c) => c.city) };
  }

  render(_: {}, s: State) {
    const me = s.me;
    const hub = me ? hubByCode(me.hub) : null;
    const colo = me?.colo ?? '...';
    const hubName = (hub?.name ?? '...') + (me?.hubColo ? ` (${me.hubColo})` : '');
    const linked = s.phase === 'linked' || s.phase === 'live';
    const joining = s.phase === 'joining';
    const blinkOn = Math.floor(s.dot / 4) % 2 === 0;
    const lit = (seg: number, i: number) => linked || (joining && ((((i + seg * 6 - s.dot) % 12) + 12) % 12) < 3);
    const dots = (seg: number) => [0, 1, 2, 3, 4, 5].map((i) => <span style={{ width: '6px', height: '6px', background: lit(seg, i) ? '#000080' : '#808080' }} />);
    const linkText = !me
      ? 'Looking for the nearest data center...'
      : linked
        ? `Linked: you > ${colo} > hub ${hubName}.`
        : joining
          ? `Dialing ${colo} data center, then hub ${hubName}...`
          : `You > ${colo} data center > hub ${hubName}`;
    const sel = s.selId ? s.log.find((e) => e.id === s.selId && e.msg) : null;
    const total = Object.values(s.presence).reduce((n, c) => n + (c ?? []).reduce((k, x) => k + x.n, 0), 0);
    const routeLine = (m: ChatMsg) => `${m.city} > ${m.colo} > hub ${m.hub}${m.hubColo ? ' in ' + m.hubColo : ''} > ${HUBS.length - 1} hubs > everyone`;
    return (
      <div class="desk">
        <div class="w-raise window">
          <div class="titlebar">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="4" y="1" width="8" height="1" fill="#ffffff" /><rect x="2" y="2" width="12" height="12" fill="#0000ff" /><rect x="1" y="4" width="14" height="8" fill="#0000ff" /><rect x="4" y="14" width="8" height="1" fill="#ffffff" /><rect x="4" y="4" width="4" height="3" fill="#00ff00" /><rect x="9" y="8" width="3" height="4" fill="#00ff00" /><rect x="3" y="9" width="3" height="2" fill="#00ff00" /></svg>
            <h1>Globe Chat - #global</h1>
          </div>
          <div class="main">
            <section aria-label="Live globe" class="globe-col">
              <div class="w-sink globe-box">
                <canvas ref={this.cv} class="w-cv" onPointerDown={this.down} onPointerMove={this.move} onPointerUp={this.up} onPointerCancel={this.up} role="img" aria-label="Pixel globe. Drag to spin. Messages fly from the sender's city up to its hub, across to the other hubs, then out to every listener." />
              </div>
            </section>
            <section aria-label="Messages" class="chat-col">
              <div class="w-log w-sink log" ref={this.logEl} aria-live="polite">
                {s.log.length === 0 && <p class="muted pad">Waiting for the first message...</p>}
                {s.log.map((e) => (
                  <Row key={e.id} e={e} route={e.msg ? routeLine(e.msg) : ''} onOpen={() => this.setState({ selId: e.id })} />
                ))}
              </div>
              <div class="compose">
                <label for="w-msg" class="sr">Message</label>
                <input id="w-msg" class="w-field w-sink" autocomplete="off" maxLength={MAX_TEXT} value={s.draft} disabled={s.phase !== 'live'} placeholder="Say something, press Enter"
                  onInput={(e) => this.setState({ draft: (e.target as HTMLInputElement).value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); this.send(); } }} />
                <button type="button" class="w-btn w-def btn" disabled={s.phase !== 'live'} onClick={this.send}>Send</button>
              </div>
            </section>
          </div>
          <footer class="status">
            <span class="w-cell grow">{s.phase === 'live' && me ? `Connected as ${s.myNick}, ${placeOf(me)} via ${colo} to hub ${hubName}` : me ? 'Not joined' : 'Connecting...'}</span>
            <span class="w-cell">{HUBS.length} hubs</span>
            <span class="w-cell">{total} online</span>
            <span class="w-cell">{s.clock}</span>
          </footer>
        </div>

        {s.phase !== 'live' && (
          <div class="overlay">
            <div role="dialog" aria-label="Join Globe Chat" class="w-raise dialog join">
              <div class="titlebar"><h2>Join Globe Chat</h2></div>
              <div class="dialog-body col">
                <div class="link">
                  <figure>
                    <svg role="img" aria-label="Your computer" width="32" height="32" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="1" y="1" width="14" height="10" fill="#dfdfdf" /><rect x="1" y="1" width="14" height="1" fill="#ffffff" /><rect x="3" y="3" width="10" height="6" fill={linked ? '#008080' : joining ? '#000080' : '#000000'} /><rect x="5" y="11" width="6" height="2" fill="#808080" /><rect x="2" y="13" width="12" height="2" fill="#dfdfdf" /><rect x="2" y="14" width="12" height="1" fill="#808080" /></svg>
                    <figcaption>You</figcaption>
                  </figure>
                  <div aria-hidden="true" class="dots">{dots(0)}</div>
                  <figure>
                    <svg role="img" aria-label="Cloudflare data center" width="32" height="32" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="7" y="3" width="2" height="12" fill="#808080" /><rect x="5" y="14" width="6" height="1" fill="#404040" /><rect x="6" y="1" width="4" height="3" fill="#c0c0c0" /><rect x="6" y="1" width="4" height="1" fill="#ffffff" />{[[3, 2], [2, 3], [12, 2], [13, 3]].map(([x, y]) => <rect x={x} y={y} width="1" height="1" fill={linked || (joining && blinkOn) ? '#000080' : '#c0c0c0'} />)}</svg>
                    <figcaption>{colo}</figcaption>
                  </figure>
                  <div aria-hidden="true" class="dots">{dots(1)}</div>
                  <figure>
                    <svg role="img" aria-label="Your hub" width="32" height="32" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="4" y="1" width="8" height="14" fill="#c0c0c0" /><rect x="4" y="1" width="8" height="1" fill="#ffffff" /><rect x="11" y="1" width="1" height="14" fill="#808080" /><rect x="5" y="4" width="6" height="1" fill="#808080" /><rect x="5" y="6" width="6" height="1" fill="#808080" /><rect x="6" y="11" width="1" height="1" fill={linked ? '#00ff00' : joining && blinkOn ? '#ffff00' : '#008000'} /></svg>
                    <figcaption>hub {me?.hub ?? '...'}</figcaption>
                  </figure>
                </div>
                <p class="muted small min">{linkText}</p>
                <label for="j-nick">Pick a <u>n</u>ickname:</label>
                <input id="j-nick" class="w-field w-sink" autocomplete="off" maxLength={16} value={s.nick} disabled={joining || linked} placeholder="nightowl"
                  onInput={(e) => this.setState({ nick: (e.target as HTMLInputElement).value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); this.join(); } }} />
                <p class="muted">{me ? <>You'll show up in <b class="ink">{placeOf(me)}</b>, read from your connection.</> : 'Finding where you are...'}</p>
                {s.joinError && <p class="err">{s.joinError}</p>}
                {joining && (
                  <div class="stack">
                    <div class="w-sink progress" role="progressbar" aria-label="Joining">
                      {Array.from({ length: 16 }, (_, i) => <span style={{ background: ((i - s.dot) % 16 + 16) % 16 < 4 ? '#000080' : 'transparent' }} />)}
                    </div>
                    <span class="muted small">Doing a little proof of work...</span>
                  </div>
                )}
                <div class="right">
                  <button type="button" class="w-btn w-def btn" disabled={s.phase !== 'join'} onClick={this.join}>
                    {s.phase === 'connecting' ? 'Connecting...' : joining ? 'Joining...' : linked ? 'Linked' : 'Join'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {sel?.msg && <ProofDialog m={sel.msg} mine={sel.mine} {...this.route(sel.msg)} onClose={() => this.setState({ selId: null })} />}
      </div>
    );
  }
}

import { useEffect, useState } from 'preact/hooks';
import type { ChatMsg } from '../shared/protocol';
import { hubByCode } from '../shared/hubs';
import { powBytesHex, verifyPow } from './verify';

const OK = 'M8 1h1v2H8v1H7v1H6v1H5v1H4v1H3V7H2V6H1V5H0V3h1v1h1v1h1v1h1V5h1V4h1V3h1V2h1z';
const BAD = 'M0 0h2v1h1v1h1v1h1V2h1V1h1V0h2v2H8v1H7v1H6v1h1v1h1v1h1v2H7V8H6V7H5V6H4v1H3v1H2v1H0V7h1V6h1V5h1V4H2V3H1V2H0z';
const fmt = (n: number) => n.toLocaleString('en-US');
type Tab = 'general' | 'proof' | 'route';

export function ProofDialog({ m, mine, relays, listeners, onClose }: { m: ChatMsg; mine: boolean; relays: string[]; listeners: string[]; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('proof');
  const [ver, setVer] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setVer(null), [m.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  const p = m.pow;
  const bits = p.prefix.length * 4;
  const z = (p.key.match(/^0*/) || [''])[0];
  const secs = (p.ms / 1000).toFixed(2) + ' s';
  const verify = async () => {
    const r = await verifyPow(p);
    setVer({ ok: r.ok, text: r.ok ? `Match: the key starts with ${p.prefix}. Checking took ${r.ms.toFixed(2)} ms, making it took ${(p.ms / 1000).toFixed(1)} s.` : 'No match. This proof is not valid.' });
  };
  const hubName = hubByCode(m.hub)?.name ?? m.hub;
  return (
    <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="Message properties" class="w-raise dialog proof">
        <div class="titlebar">
          <h2>Message Properties</h2>
          <button type="button" class="w-btn x" aria-label="Close" onClick={onClose}>
            <svg aria-hidden="true" width="8" height="7" viewBox="0 0 8 7" shape-rendering="crispEdges"><path d="M0 0h2v1h1v1h2V1h1V0h2v1H7v1H6v1H5v1h1v1h1v1h1v1H6V6H5V5H3v1H2v1H0V6h1V5h1V4h1V3H2V2H1V1H0z" fill="#000000" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <div role="tablist" aria-label="Sections" class="tabs">
            {(['general', 'proof', 'route'] as Tab[]).map((id) => (
              <button type="button" role="tab" aria-selected={tab === id} class={'tab' + (tab === id ? ' sel' : '')} onClick={() => setTab(id)}>
                {id[0].toUpperCase() + id.slice(1)}
              </button>
            ))}
          </div>
          <div role="tabpanel" class="w-raise panel">
            {tab === 'general' && (
              <div class="grid">
                <span>From:</span><b style={{ color: mine ? '#800080' : '#000080' }}>{m.nick}</b>
                <span>City:</span><span>{m.city}, {m.cc}<br /><small class="muted">Set by the Cloudflare edge from the connection. The sender can't type it.</small></span>
                <span>Received:</span><span>{new Date(m.ts).toLocaleTimeString()}</span>
                <span>Message:</span><div class="w-sink box">{m.text}</div>
              </div>
            )}
            {tab === 'proof' && (
              <>
                <div class="grid">
                  <span>Challenge:</span><span><code>{p.salt.slice(0, 8)}</code> <small class="muted">salt and nonce from the sender's hub, used once</small></span>
                  <span>Counter:</span><code>{fmt(p.counter)}</code>
                  <span>Work:</span><span>key starts with {p.prefix}, {bits} zero bits <small class="muted">(about {fmt(Math.pow(2, bits))} tries on average)</small></span>
                  <span>Spent:</span><span>{fmt(p.counter + 1)} hashes in {secs}</span>
                </div>
                <div class="stack"><span>Hashed bytes (salt, nonce, counter):</span><div class="w-sink box mono">{powBytesHex(p)}</div></div>
                <div class="stack"><span>Derived key, SHA-256 of those bytes:</span><div class="w-sink box mono"><b class="hl">{z}</b>{p.key.slice(z.length)}</div></div>
                <div class="verify">
                  <button type="button" class="w-btn btn" onClick={verify}><u>V</u>erify in this browser</button>
                  {ver && (
                    <span class="ver" style={{ color: ver.ok ? '#008000' : '#c00000' }}>
                      <svg aria-hidden="true" width="9" height="9" viewBox="0 0 9 9" shape-rendering="crispEdges"><path d={ver.ok ? OK : BAD} fill={ver.ok ? '#008000' : '#c00000'} /></svg>
                      {ver.text}
                    </span>
                  )}
                </div>
                <p class="muted small">This shows the sender's browser spent time on a one-time challenge before sending. It doesn't prove a person or a real browser sent it.</p>
              </>
            )}
            {tab === 'route' && (
              <ol class="route">
                <li>The browser in <b>{m.city}, {m.cc}</b> solved its hub's challenge in {fmt(p.counter + 1)} hashes ({secs}).</li>
                <li>It entered Cloudflare at the <b>{m.colo}</b> data center, which stamped the city on the connection.</li>
                <li><b>Hub {hubName}</b>, the sender's hub{m.hubColo ? <> running in <b>{m.hubColo}</b></> : null}, checked the proof and retired the challenge.</li>
                <li>The hub put it on the bus to {relays.length} other hubs: <span class="muted">{relays.join(', ')}</span></li>
                <li>Each hub delivered it to its own people, {listeners.length} {listeners.length === 1 ? 'city' : 'cities'} online now: <span class="muted">{listeners.join(', ') || 'nobody else yet'}</span></li>
              </ol>
            )}
          </div>
          <div class="actions">
            <button type="button" class="w-btn w-def btn" onClick={onClose}>OK</button>
          </div>
        </div>
      </div>
    </div>
  );
}

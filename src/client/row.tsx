import { useState } from 'preact/hooks';
import type { Entry } from './app';

const ICONS = {
  ok: 'M8 1h1v2H8v1H7v1H6v1H5v1H4v1H3V7H2V6H1V5H0V3h1v1h1v1h1v1h1V5h1V4h1V3h1V2h1z',
  sent: 'M1 0h7v2H7v1H6v1H5v1h1v1h1v1h1v2H1V7h1V6h1V5h1V4H3V3H2V2H1z',
  bad: 'M0 0h2v1h1v1h1v1h1V2h1V1h1V0h2v2H8v1H7v1H6v1h1v1h1v1h1v2H7V8H6V7H5V6H4v1H3v1H2v1H0V7h1V6h1V5h1V4H2V3H1V2H0z'
};
const LOOK = { ok: ['#008000', 'hub ok'], sent: ['#404040', 'sending'], bad: ['#c00000', 'rejected'] } as const;
const fmt = (n: number) => n.toLocaleString('en-US');
const hm = (ts: number) => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

function Status({ e }: { e: Entry }) {
  const [color, label] = LOOK[e.status];
  return (
    <span class="row-status" style={{ color }}>
      <svg aria-hidden="true" width="9" height="9" viewBox="0 0 9 9" shape-rendering="crispEdges"><path d={ICONS[e.status]} fill={color} /></svg>
      {e.status === 'bad' ? e.reason || label : label}
    </span>
  );
}

export function Row({ e, route, onOpen, onRemove }: { e: Entry; route: string; onOpen: () => void; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  const p = e.msg?.pow;
  const z = p ? (p.key.match(/^0*/) || [''])[0] : '';
  const canOpen = !!p;
  return (
    <div class="row">
      <div class="row-line">
        <span class="row-time">{hm(e.ts)}</span>
        <div class="row-body">
          <b style={{ color: e.mine ? '#800080' : '#000080' }}>{e.nick}</b> <span class="muted">({e.place})</span>:{' '}
          <span style={{ color: e.status === 'bad' ? '#606060' : '#000000' }}>{e.text}</span>
          {!open && <> <Status e={e} /></>}
        </div>
        {onRemove && (
          <button type="button" class="row-remove" aria-label="Delete this message for everyone" title="Delete for everyone" onClick={onRemove}>
            ✕
          </button>
        )}
        {canOpen && (
          <button type="button" class="row-toggle" aria-expanded={open} aria-label={open ? 'Hide proof' : 'Show proof'} title={open ? 'Hide proof' : 'Show proof'} onClick={() => setOpen(!open)}>
            {open ? '-' : '+'}
          </button>
        )}
      </div>
      {open && p && (
        <div class="row-tree">
          <span class="wrap">├ route   {route}</span>
          <span>├ counter {fmt(p.counter)}</span>
          <span>├ work    {p.prefix.length * 4} bits, {fmt(p.counter + 1)} hashes, {(p.ms / 1000).toFixed(2)} s</span>
          <span>├ key     <button type="button" class="link" title="Open the proof" onClick={onOpen}><b style={{ color: '#000080' }}>{z}</b>{p.key.slice(z.length, z.length + 12)}…</button></span>
          <span>└ hub     <Status e={e} /></span>
        </div>
      )}
    </div>
  );
}

import { geoGraticule10, geoInterpolate, geoOrthographic, geoPath, geoRotation, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';
import { HUBS } from '../shared/hubs';

type V3 = { x: number; y: number; z: number };
type LL = [number, number];
type RGB = readonly [number, number, number];

export interface Flight {
  t: number;
  mine: boolean;
  nick: string;
  place: string;
  text: string;
  key: string;
  from: LL;
  hub: number;
  relays: number[];
  listeners: { ll: LL; hub: number }[];
  bus?: ((s: number) => LL)[];
}

export interface HubSpot {
  ll: LL;
  label: string;
}

export const FLIGHT_S = 7.2;
const DEG = Math.PI / 180;
const HUB_R = 1.22;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LIGHT = (() => { const l = Math.hypot(-0.55, 0.55, 0.65); return { x: -0.55 / l, y: 0.55 / l, z: 0.65 / l }; })();
const C: Record<string, RGB> = {
  black: [0, 0, 0], navy: [0, 0, 128], blue: [0, 0, 255], green: [0, 128, 0], lime: [0, 255, 0],
  teal: [0, 128, 128], aqua: [0, 255, 255], yellow: [255, 255, 0], white: [255, 255, 255],
  gray: [128, 128, 128], silver: [192, 192, 192], red: [255, 0, 0], fuchsia: [255, 0, 255], olive: [128, 128, 0]
};
const SANS = 'Tahoma, Geneva, Verdana, sans-serif';
const MONO = '"Lucida Console", Monaco, "Courier New", monospace';
const LAND = feature(land110 as any, (land110 as any).objects.land) as unknown as GeoPermissibleObjects;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const norm = (v: V3, len: number): V3 => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l * len, y: v.y / l * len, z: v.z / l * len }; };
const bez = (a: V3, c: V3, b: V3, s: number): V3 => {
  const u = 1 - s;
  return { x: u * u * a.x + 2 * u * s * c.x + s * s * b.x, y: u * u * a.y + 2 * u * s * c.y + s * s * b.y, z: u * u * a.z + 2 * u * s * c.z + s * s * b.z };
};
const hidden = (p: V3) => p.z < 0 && p.x * p.x + p.y * p.y < 1;

export class PixelGlobe {
  lam = -30;
  phi = -18;
  private px = 3;
  private scale = 0.35;
  private cxF = 0.47;
  private cyF = 0.55;
  private low = document.createElement('canvas');
  private mask = document.createElement('canvas');
  private mctx: CanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private proj = geoOrthographic().clipAngle(90).precision(0.7);
  private grat = geoGraticule10();
  private rotFn = geoRotation([this.lam, this.phi]);
  private stars: [number, number, boolean][] = [];

  constructor() {
    for (let i = 0; i < 160; i++) this.stars.push([Math.random(), Math.random(), Math.random() < 0.2]);
  }

  private vec(ll: LL): V3 {
    const r = this.rotFn(ll);
    const l = r[0] * DEG, p = r[1] * DEG;
    return { x: Math.cos(p) * Math.sin(l), y: Math.sin(p), z: Math.cos(p) * Math.cos(l) };
  }

  draw(cv: HTMLCanvasElement | null, t: number, flights: Flight[], dots: LL[], me: { ll: LL; label: string } | null, hubs: HubSpot[]) {
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ps = Math.max(2, Math.round(this.px * dpr));
    const lw = Math.ceil(W / ps), lh = Math.ceil(H / ps);
    const low = this.low, mk = this.mask;
    if (low.width !== lw || low.height !== lh) { low.width = lw; low.height = lh; mk.width = lw; mk.height = lh; this.img = null; }
    const lctx = low.getContext('2d')!;
    if (!this.mctx) this.mctx = mk.getContext('2d', { willReadFrequently: true })!;
    if (!this.img) this.img = lctx.createImageData(lw, lh);

    // On a tall, narrow screen there is no side room for the log, so center the globe.
    const narrow = lw < lh;
    const R = Math.min(lw, lh) * this.scale, cx = lw * (narrow ? 0.5 : this.cxF), cy = lh * this.cyF;
    this.proj.scale(R).translate([cx, cy]).rotate([this.lam, this.phi]);
    this.rotFn = geoRotation([this.lam, this.phi]);
    const mc = this.mctx;
    mc.globalCompositeOperation = 'source-over';
    mc.fillStyle = '#000000';
    mc.fillRect(0, 0, lw, lh);
    const path = geoPath(this.proj, mc);
    mc.globalCompositeOperation = 'lighter';
    mc.fillStyle = '#ff0000'; mc.beginPath(); path(LAND); mc.fill();
    mc.strokeStyle = '#00ff00'; mc.lineWidth = 0.8; mc.beginPath(); path(this.grat); mc.stroke();
    const md = mc.getImageData(0, 0, lw, lh).data;

    const img = this.img, px = img.data;
    const set = (x: number, y: number, col: RGB) => {
      x = x | 0; y = y | 0;
      if (x < 0 || y < 0 || x >= lw || y >= lh) return;
      const k = (y * lw + x) * 4;
      px[k] = col[0]; px[k + 1] = col[1]; px[k + 2] = col[2]; px[k + 3] = 255;
    };
    for (let k = 0; k < px.length; k += 4) { px[k] = 0; px[k + 1] = 0; px[k + 2] = 0; px[k + 3] = 255; }
    for (const s of this.stars) {
      const tw = s[2] && Math.floor(t * 2 + s[0] * 10) % 3 === 0;
      set(s[0] * lw, s[1] * lh, tw ? C.white : C.gray);
    }

    const x0 = Math.floor(cx - R - 2), x1 = Math.ceil(cx + R + 2), y0 = Math.floor(cy - R - 2), y1 = Math.ceil(cy + R + 2);
    for (let py = y0; py <= y1; py++) {
      if (py < 0 || py >= lh) continue;
      for (let pxx = x0; pxx <= x1; pxx++) {
        if (pxx < 0 || pxx >= lw) continue;
        const nx = (pxx + 0.5 - cx) / R, ny = -(py + 0.5 - cy) / R;
        const r2 = nx * nx + ny * ny;
        if (r2 > 1) {
          if (r2 < 1.035) set(pxx, py, (pxx + py) & 1 ? C.teal : C.black);
          continue;
        }
        const nz = Math.sqrt(1 - r2);
        const k = (py * lw + pxx) * 4;
        const isLand = md[k] > 120, grat = md[k + 1] > 60;
        const light = clamp(nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z, 0, 1);
        const v = light * 2.1;
        const th = (BAYER[((py & 3) << 2) | (pxx & 3)] + 0.5) / 16;
        let col: RGB;
        if (v < 1) col = v > th ? (isLand ? C.green : C.navy) : (isLand ? C.olive : C.black);
        else col = v - 1 > th ? (isLand ? C.lime : C.blue) : (isLand ? C.green : C.navy);
        if (!isLand && light < 0.08) col = C.black;
        if (!isLand && grat && light > 0.12 && (pxx + py) & 1) col = C.teal;
        set(pxx, py, col);
      }
    }

    const P = (p: V3): [number, number] => [cx + p.x * R, cy - p.y * R];
    for (const d of dots) { const v = this.vec(d); if (v.z > 0.05) { const q = P(v); set(q[0], q[1], C.yellow); } }
    let meQ: [number, number] | null = null;
    if (me) {
      const v = this.vec(me.ll);
      if (v.z > 0.05) {
        meQ = P(v);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(meQ[0] + dx, meQ[1] + dy, C.fuchsia);
        const blink = Math.floor(t * 2) % 2 === 0;
        for (let a = 0; a < 16; a++) {
          const an = (a / 16) * Math.PI * 2;
          if (blink) set(meQ[0] + Math.cos(an) * 3, meQ[1] + Math.sin(an) * 3, C.white);
        }
      }
    }

    const hubVecs = hubs.map((h) => { const v = this.vec(h.ll); return { x: v.x * HUB_R, y: v.y * HUB_R, z: v.z * HUB_R }; });
    const flash = hubs.map(() => 0);
    const plot = (fn: (s: number) => V3, s0: number, s1: number, col: RGB, dotted: boolean) => {
      if (s1 <= s0) return null;
      const steps = Math.max(8, Math.round(R * 3 * (s1 - s0)));
      let head: [number, number] | null = null;
      for (let i = 0; i <= steps; i++) {
        if (dotted && i & 1) continue;
        const p = fn(s0 + (s1 - s0) * (i / steps));
        if (hidden(p)) continue;
        const q = P(p);
        set(q[0], q[1], col);
        if (i === steps) head = q;
      }
      return head;
    };
    const dot2 = (q: [number, number], col: RGB) => { set(q[0], q[1], col); set(q[0] + 1, q[1], col); set(q[0], q[1] + 1, col); set(q[0] + 1, q[1] + 1, col); };
    const rise = (a: V3, b: V3, lift: number) => { const c = norm({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }, lift); return (s: number) => bez(a, c, b, s); };

    const bubbles: { m: Flight; o: V3; age: number; q: [number, number] }[] = [];
    for (const m of flights) {
      const age = t - m.t;
      if (age < 0 || age > FLIGHT_S) continue;
      const ov = this.vec(m.from);
      const col = m.mine ? C.fuchsia : C.yellow;
      const up = rise(ov, hubVecs[m.hub], 1.42);
      const h1 = clamp(age / 1.0, 0, 1), t1 = clamp((age - 0.35) / 1.0, 0, 1);
      const hp = plot(up, t1, h1, col, false);
      if (hp && h1 < 1) dot2(hp, C.white);
      if (age > 1.0 && age < 1.6) flash[m.hub] = 1;
      if (!m.bus) m.bus = m.relays.map((r) => geoInterpolate(hubs[m.hub].ll, hubs[r].ll) as (s: number) => LL);
      const h2 = clamp((age - 1.1) / 0.9, 0, 1), t2 = clamp((age - 1.45) / 0.9, 0, 1);
      m.relays.forEach((r, k) => {
        const ip = m.bus![k];
        const fn = (s: number) => { const v = this.vec(ip(s)); const rr = HUB_R + 0.2 * Math.sin(Math.PI * s); return { x: v.x * rr, y: v.y * rr, z: v.z * rr }; };
        const bp = plot(fn, t2, h2, C.white, true);
        if (bp && h2 < 1) dot2(bp, C.white);
        if (age > 2.0 && age < 2.6) flash[r] = 1;
      });
      for (const li of m.listeners) {
        const st = li.hub === m.hub ? 1.1 : 2.0;
        const l = this.vec(li.ll);
        const down = rise(hubVecs[li.hub], l, 1.3);
        plot(down, clamp((age - st - 0.35) / 0.8, 0, 1), clamp((age - st) / 0.8, 0, 1), C.aqua, true);
        const ra = age - st - 0.8;
        if (ra > 0 && ra < 0.9 && l.z > 0.1) {
          const q = P(l), rr = 1 + Math.floor(ra * 6);
          for (let a = 0; a < 24; a++) {
            const an = (a / 24) * Math.PI * 2;
            set(q[0] + Math.cos(an) * rr, q[1] + Math.sin(an) * rr * Math.max(0.35, l.z), C.aqua);
          }
        }
      }
      if (ov.z > 0) bubbles.push({ m, o: ov, age, q: P(ov) });
    }

    const hubLabels: { q: [number, number]; code: string; dim: boolean }[] = [];
    hubVecs.forEach((hv, i) => {
      if (hidden(hv)) return;
      const hq = P(hv), dim = hv.z < 0;
      const hx = Math.round(hq[0]) - 3, hy = Math.round(hq[1]) - 4;
      for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 6; xx++) {
        const edge = xx === 0 || yy === 0, shade = xx === 5 || yy === 7;
        set(hx + xx, hy + yy, dim ? (edge ? C.gray : C.black) : edge ? C.white : shade ? C.gray : C.silver);
      }
      if (!dim) for (let xx = 1; xx < 5; xx++) set(hx + xx, hy + 3, C.gray);
      set(hx + 1, hy + 5, flash[i] ? C.red : Math.floor(t * 2 + i) % 2 ? C.lime : C.green);
      hubLabels.push({ q: hq, code: hubs[i].label, dim });
    });

    lctx.putImageData(img, 0, 0);
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(low, 0, 0, lw * ps, lh * ps);
    ctx.textBaseline = 'middle';
    ctx.font = Math.round(10 * dpr) + 'px ' + SANS;
    for (const hl of hubLabels) {
      ctx.fillStyle = hl.dim ? '#808080' : '#c0c0c0';
      const w = ctx.measureText(hl.code).width;
      let x = Math.round((hl.q[0] + 5) * ps);
      // Flip to the left of the hub when the label would run off the right edge.
      if (x + w > W - 2) x = Math.round((hl.q[0] - 5) * ps - w);
      ctx.fillText(hl.code, x, Math.round(hl.q[1] * ps));
    }
    if (me && meQ) {
      // "You are here" tag, kept inside the canvas.
      ctx.font = 'bold ' + Math.round(10 * dpr) + 'px ' + SANS;
      const w = ctx.measureText(me.label).width + Math.round(8 * dpr), h = Math.round(14 * dpr);
      let x = Math.round((meQ[0] + 5) * ps);
      if (x + w > W - 2) x = Math.round((meQ[0] - 5) * ps - w);
      const y = Math.round(meQ[1] * ps);
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(x, y - h / 2, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(me.label, x + Math.round(4 * dpr), y);
    }
    ctx.textBaseline = 'alphabetic';
    for (const b of bubbles) this.balloon(ctx, b, ps, dpr, cx);
  }

  private balloon(ctx: CanvasRenderingContext2D, b: { m: Flight; o: V3; age: number; q: [number, number] }, ps: number, dpr: number, cxLow: number) {
    const { m, o, age, q } = b;
    if (age > 6.2 || o.z < 0.12) return;
    if (age > 5.6 && Math.floor(age * 8) % 2) return;
    const D = (v: number) => Math.round(v * dpr);
    const qx = Math.round(q[0] * ps) + Math.round(ps / 2), qy = Math.round(q[1] * ps) + Math.round(ps / 2);
    const up = Math.round(easeOut(clamp(age / 0.5, 0, 1)) * 4) / 4;
    const lift = D(14 + up * 26);
    const F = (w: string, s: number) => (w ? w + ' ' : '') + D(s) + 'px ' + SANS;
    const lines = [
      { t: m.nick + '  ' + m.place, f: F('bold', 11), c: m.mine ? '#800080' : '#000080' },
      { t: trunc(m.text, 38), f: F('', 12), c: '#000000' },
      { t: 'pow ' + m.key.slice(0, 8) + '  hub ' + HUBS[m.hub].code, f: D(10) + 'px ' + MONO, c: '#505050' }
    ];
    let wmax = 0;
    for (const L of lines) { ctx.font = L.f; wmax = Math.max(wmax, ctx.measureText(L.t).width); }
    const padx = D(6), lineH = D(14);
    const bw = Math.round(wmax + padx * 2), bh = lines.length * lineH + D(8);
    // Keep the whole balloon on the canvas; the tail still points at the city.
    const W = ctx.canvas.width;
    const left = clamp(q[0] > cxLow ? qx - bw + D(8) : qx - D(8), D(2), Math.max(D(2), W - bw - D(2)));
    const top = qy - lift - bh;
    const x0 = clamp(qx - D(5), left + D(6), left + bw - D(16));
    const steps = 6, th = lift - D(4);
    for (let i = 0; i < steps; i++) {
      const f = i / steps, w = Math.max(D(2), Math.round(D(10) * (1 - f)));
      const x = Math.round(x0 + (qx - x0) * f), y = top + bh - D(1) + Math.round(th * f), hgt = Math.ceil(th / steps) + 1;
      ctx.fillStyle = '#000000'; ctx.fillRect(x - D(1), y, w + D(2), hgt);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, hgt);
    }
    ctx.fillStyle = '#000000';
    ctx.fillRect(left + D(2), top, bw - D(4), bh);
    ctx.fillRect(left, top + D(2), bw, bh - D(4));
    ctx.fillRect(left + D(1), top + D(1), bw - D(2), bh - D(2));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left + D(2), top + D(1), bw - D(4), bh - D(2));
    ctx.fillRect(left + D(1), top + D(2), bw - D(2), bh - D(4));
    ctx.fillRect(x0, top + bh - D(2), D(10), D(2));
    lines.forEach((L, i) => {
      ctx.font = L.f;
      ctx.fillStyle = L.c;
      ctx.fillText(L.t, left + padx, top + D(4) + (i + 1) * lineH - D(3));
    });
  }
}

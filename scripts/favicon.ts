// Builds the favicons in public/ from the 16 x 16 globe in src/client/globe-icon.tsx.
// Run: bun run scripts/favicon.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const src = readFileSync('src/client/globe-icon.tsx', 'utf8');
const paths = [...src.matchAll(/<path fill="(#[0-9a-f]{6})" d="([^"]+)"/g)].map(([, fill, d]) => ({ fill, d }));
const px: (string | null)[] = Array(256).fill(null);
for (const { fill, d } of paths) for (const [, x, y] of d.matchAll(/M(\d+) (\d+)/g)) px[+y * 16 + +x] = fill;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${paths.map((p) => `<path fill="${p.fill}" d="${p.d}"/>`).join('')}</svg>\n`;
writeFileSync('public/favicon.svg', svg);

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const t = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([len, t, c]); };

// Each globe pixel becomes a scale x scale block, centered on a canvas of `size` filled with `bg` (null = transparent).
function png(size: number, scale: number, bg: string | null) {
  const off = (size - 16 * scale) >> 1;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = Math.floor((x - off) / scale), gy = Math.floor((y - off) / scale);
    const c = gx >= 0 && gx < 16 && gy >= 0 && gy < 16 ? px[gy * 16 + gx] ?? bg : bg;
    const i = y * (size * 4 + 1) + 1 + x * 4;
    if (c) { raw[i] = parseInt(c.slice(1, 3), 16); raw[i + 1] = parseInt(c.slice(3, 5), 16); raw[i + 2] = parseInt(c.slice(5, 7), 16); raw[i + 3] = 255; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// favicon.ico holding one 32 x 32 PNG, for browsers that ask for /favicon.ico.
const ico32 = png(32, 2, null);
const head = Buffer.alloc(22); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 32; head[7] = 32; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(ico32.length, 14); head.writeUInt32LE(22, 18);
writeFileSync('public/favicon.ico', Buffer.concat([head, ico32]));
// iOS home screen: no transparency there, so the globe sits on window gray.
writeFileSync('public/apple-touch-icon.png', png(180, 10, '#c0c0c0'));

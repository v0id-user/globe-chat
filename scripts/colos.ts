// Builds src/shared/colos.json: Cloudflare data center code -> [lat, lon].
// Codes come from Cloudflare's status page, coordinates from OurAirports (public domain).
// Run: bun run scripts/colos.ts
const STATUS = 'https://www.cloudflarestatus.com/api/v2/components.json';
const AIRPORTS = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

const status = (await (await fetch(STATUS)).json()) as { components: { name: string }[] };
const codes = new Set<string>();
for (const c of status.components) {
  const m = /\(([A-Z]{3})\)\s*$/.exec(c.name);
  if (m) codes.add(m[1]);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const rank: Record<string, number> = { large_airport: 3, medium_airport: 2, small_airport: 1 };
const lines = (await (await fetch(AIRPORTS)).text()).split('\n');
const head = parseCsvLine(lines[0]);
const col = (n: string) => head.indexOf(n);
const [iI, latI, lonI, typeI] = [col('iata_code'), col('latitude_deg'), col('longitude_deg'), col('type')];
const best = new Map<string, { lat: number; lon: number; r: number }>();
for (const line of lines.slice(1)) {
  if (!line) continue;
  const f = parseCsvLine(line);
  const code = f[iI];
  if (!codes.has(code)) continue;
  const r = rank[f[typeI]] ?? 0;
  const prev = best.get(code);
  if (!prev || r > prev.r) best.set(code, { lat: +(+f[latI]).toFixed(2), lon: +(+f[lonI]).toFixed(2), r });
}

const out: Record<string, [number, number]> = {};
for (const code of [...codes].sort()) {
  const b = best.get(code);
  if (b) out[code] = [b.lat, b.lon];
}
const missing = [...codes].filter((c) => !best.has(c)).sort();
await Bun.write('src/shared/colos.json', JSON.stringify(out) + '\n');
console.log(`${codes.size} data centers, ${Object.keys(out).length} placed, missing: ${missing.join(' ') || 'none'}`);

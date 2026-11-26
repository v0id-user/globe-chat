import { geoDistance } from 'd3-geo';

export type HubCode = 'USW' | 'USE' | 'EUW' | 'EUE' | 'ASIA' | 'OC';

export interface HubInfo {
  code: HubCode;
  name: string;
  hint: 'wnam' | 'enam' | 'weur' | 'eeur' | 'apac' | 'oc';
  lat: number;
  lon: number;
}

// Cloudflare does not create Durable Objects in sam, afr or me, so those
// regions join the nearest of these. The coordinates are where the dot is
// drawn; the data center inside each region is Cloudflare's choice.
export const HUBS: readonly HubInfo[] = [
  { code: 'USW', name: 'US West', hint: 'wnam', lat: 37.4, lon: -121.9 },
  { code: 'USE', name: 'US East', hint: 'enam', lat: 39.0, lon: -77.5 },
  { code: 'EUW', name: 'Europe West', hint: 'weur', lat: 51.5, lon: -0.1 },
  { code: 'EUE', name: 'Europe East', hint: 'eeur', lat: 52.2, lon: 21.0 },
  { code: 'ASIA', name: 'Asia', hint: 'apac', lat: 1.35, lon: 103.8 },
  { code: 'OC', name: 'Oceania', hint: 'oc', lat: -33.9, lon: 151.2 }
];

export function hubByCode(code: string): HubInfo | undefined {
  return HUBS.find((h) => h.code === code);
}

export function nearestHub(lat: number, lon: number): HubInfo {
  let best = HUBS[0];
  let bestD = Infinity;
  for (const h of HUBS) {
    const d = geoDistance([lon, lat], [h.lon, h.lat]);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

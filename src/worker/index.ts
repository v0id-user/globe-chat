import { HUBS, nearestHub } from '../shared/hubs';
import type { Place } from '../shared/protocol';

export { Hub } from './hub';

const round1 = (v: number) => Math.round(v * 10) / 10;

export function placeOf(cf: IncomingRequestCfProperties | undefined): { place: Place; known: boolean } {
  const lat = Number(cf?.latitude), lon = Number(cf?.longitude);
  const known = cf?.latitude != null && cf?.longitude != null && Number.isFinite(lat) && Number.isFinite(lon);
  return {
    known,
    place: {
      city: (cf?.city as string) || 'Somewhere',
      cc: (cf?.country as string) || '??',
      lat: known ? round1(lat) : 0,
      lon: known ? round1(lon) : 0,
      colo: (cf?.colo as string) || '???'
    }
  };
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/hub') return new Response('Not found', { status: 404 });
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });

    const { place, known } = placeOf(req.cf as IncomingRequestCfProperties | undefined);
    const hub = known ? nearestHub(place.lat, place.lon) : HUBS[1];
    // Place travels in a header the Worker sets; whatever the browser sent is replaced.
    const headers = new Headers(req.headers);
    headers.set('x-gc-place', encodeURIComponent(JSON.stringify(place)));
    return env.Hub.getByName(hub.code, { locationHint: hub.hint }).fetch(new Request(req, { headers }));
  }
} satisfies ExportedHandler<Env>;

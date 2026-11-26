# Globe Chat

A 90s-style chat room on a pixel globe: https://globe.lab.v0id.me

Your message goes from your city to the Cloudflare data center you came in on, then to your hub, then to the other hubs, and out to everyone connected. You watch the whole trip on the globe. Before a message can go out, your browser has to solve a small SHA-256 puzzle, and anyone can click the message and check that proof.

The 6 hubs are Durable Objects, one per region (`src/worker/hub.ts`). Each one stores the last 100 messages and relays new ones to the others. Each hub also records which hubs took the message and who was connected at the time. A hub finds out which data center it runs in by fetching `cloudflare.com/cdn-cgi/trace`, since no API tells it.

## Run it

`.dev.vars` needs `POW_SECRET` and `ADMIN_KEY`.

```bash
bun install
```

```bash
bun run dev
```

```bash
bun run test
```

## Deploy

```bash
bunx wrangler secret put POW_SECRET
```

```bash
bunx wrangler secret put ADMIN_KEY
```

```bash
bun run deploy
```

To get admin mode (delete one message or clear the room), open the site with `#admin=<ADMIN_KEY>` at the end of the URL.

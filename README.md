# Globe Chat

Live at https://globe.lab.v0id.me

A 90s dial-up chat room on a pixel globe. Every message flies from the sender's city, through the Cloudflare data center they came in on, to their hub, across to the other hubs, and out to everyone. Each message carries a proof of work you can check in your own browser.

## How it works

- **Worker** (`src/worker/index.ts`): serves the app and `GET /hub`. It reads the city, coordinates and data center from `request.cf` and sends the WebSocket to the nearest hub.
- **Hub** (`src/worker/hub.ts`): one Durable Object per region, 6 in total: `USW`, `USE`, `EUW`, `EUE`, `ASIA`, `OC`. Cloudflare doesn't create Durable Objects in South America, Africa or the Middle East, so people there join the nearest of these. A hub:
  - checks each proof
  - stamps the message
  - keeps the last 100 messages in SQLite
  - relays each message to the other 5 hubs over RPC
  - learns which data center it runs in by fetching `cloudflare.com/cdn-cgi/trace`. No documented API gives this. On the first deploy the hubs reported SEA, IAD, MRS, MXP, NRT and MEL.
- **Proof of work** (`src/worker/pow.ts`): [altcha-lib](https://github.com/altcha-org/altcha-lib) v2 with SHA-256. Each connection holds one signed challenge at a time. A join needs a key that starts with `00000`; a message needs `0000`. The browser solves the next challenge in a Web Worker while you type.
- **Client** (`src/client`): Preact, `partysocket`, and `d3-geo` for the dithered globe.

## Run it

```bash
bun install
```

```bash
bun run dev
```

`.dev.vars` holds a local `POW_SECRET`. Tests:

```bash
bun run test
```

## Deploy

```bash
bunx wrangler login
```

```bash
bunx wrangler secret put POW_SECRET
```

```bash
bun run deploy
```

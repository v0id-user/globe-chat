import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { POW_SECRET: 'test-secret' } } })],
  // obscenity ships an .mjs that wraps its CommonJS build, which the Workers test runner can't load as is. Pre-bundling turns it into plain ESM.
  test: { include: ['test/**/*.test.ts'], deps: { optimizer: { ssr: { enabled: true, include: ['obscenity'] } } } }
});

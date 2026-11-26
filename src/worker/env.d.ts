declare namespace Cloudflare {
  interface Env {
    Hub: DurableObjectNamespace<import('./hub').Hub>;
    POW_SECRET: string;
  }
}
interface Env extends Cloudflare.Env {}

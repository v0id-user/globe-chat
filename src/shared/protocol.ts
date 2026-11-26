import type { Challenge, Solution } from 'altcha-lib/types';
import type { HubCode } from './hubs';

export const MAX_TEXT = 280;
export const NICK_RE = /^[A-Za-z0-9_]{1,16}$/;
export const HISTORY = 100;
export const MIN_GAP_MS = 1000;
export const CHALLENGE_TTL_S = 600;
// Leading hex zeros the derived key must start with: 4 bits each.
export const PREFIX = { join: '00000', say: '0000' } as const;
export type ProofKind = keyof typeof PREFIX;

export interface Place {
  city: string;
  cc: string;
  lat: number;
  lon: number;
  colo: string;
}

export interface Pow {
  salt: string;
  nonce: string;
  counter: number;
  key: string;
  prefix: string;
  ms: number;
}

export interface ChatMsg extends Place {
  id: string;
  // Data center the sender's hub runs in, when Cloudflare's trace endpoint says.
  hubColo?: string;
  cid: string;
  ts: number;
  nick: string;
  text: string;
  hub: HubCode;
  pow: Pow;
  // Filled in once the relay is done: every hub that took the message, with who was connected to it at that moment.
  // A hub missing from here didn't answer.
  delivered?: Partial<Record<HubCode, Listener[]>>;
}

export interface Listener {
  city: string;
  cc: string;
  lat: number;
  lon: number;
  n: number;
}

export type Presence = Partial<Record<HubCode, Listener[]>>;

export interface Proof {
  challenge: Challenge;
  solution: Solution;
}

export type Removal = string[] | 'all';

export type ClientMsg =
  | { t: 'join'; nick: string; proof: Proof }
  | { t: 'say'; cid: string; text: string; proof: Proof }
  | { t: 'admin'; key: string }
  | { t: 'remove'; ids: Removal };

export type ServerMsg =
  | { t: 'hello'; me: Place & { hub: HubCode; hubColo?: string };
      hubColos: Partial<Record<HubCode, string>>; history: ChatMsg[]; presence: Presence; challenge: Challenge }
  | { t: 'challenge'; challenge: Challenge }
  | { t: 'joined'; nick: string }
  | { t: 'msg'; msg: ChatMsg }
  | { t: 'presence'; hub: HubCode; cities: Listener[] }
  | { t: 'error'; reason: string; cid?: string }
  | { t: 'admin'; ok: boolean }
  | { t: 'removed'; ids: Removal };

export function cleanText(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_TEXT);
}

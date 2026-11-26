import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

// Everyday swearing is fine; slurs and sexual terms are not.
const ALLOWED = new Set(['fuck', 'shit', 'ass', 'arse', 'bastard', 'bollocks', 'piss', 'turd', 'sex']);

const matcher = new RegExpMatcher({
  ...englishDataset.removePhrasesIf((p) => ALLOWED.has(p.metadata?.originalWord ?? '')).build(),
  ...englishRecommendedTransformers
});

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|ru|xyz|co|me|ly|app|dev|link|site|info|biz|tk|top|shop)\b)/i;

// Why a message can't be posted, or null when it can.
export function rejectText(text: string): string | null {
  if (LINK.test(text)) return 'links are not allowed';
  if (matcher.hasMatch(text)) return "that word isn't allowed here";
  return null;
}

export function badNick(nick: string): boolean {
  return matcher.hasMatch(nick);
}

// Compares without leaking how many leading characters matched.
export function sameKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

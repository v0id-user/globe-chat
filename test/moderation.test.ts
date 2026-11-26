import { describe, expect, it } from 'vitest';
import { badNick, rejectText } from '../src/worker/moderation';

describe('moderation', () => {
  it('blocks slurs, even with swapped letters', () => {
    expect(rejectText('you n1gger')).toBe("that word isn't allowed here");
    expect(badNick('f4ggot')).toBe(true);
  });

  it('blocks links', () => {
    expect(rejectText('go to example.com now')).toBe('links are not allowed');
    expect(rejectText('https://x.y/z')).toBe('links are not allowed');
  });

  it('lets ordinary swearing through', () => {
    expect(rejectText('this is fucking cool, shit')).toBeNull();
    expect(badNick('falcon')).toBe(false);
  });
});

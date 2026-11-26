import { describe, expect, it } from 'vitest';
import { nearestHub } from '../src/shared/hubs';

describe('nearestHub', () => {
  it('sends regions without their own hub to the closest real one', () => {
    expect(nearestHub(24.7, 46.7).code).toBe('EUE'); // Riyadh
    expect(nearestHub(-23.5, -46.6).code).toBe('USE'); // Sao Paulo
    expect(nearestHub(35.7, 139.7).code).toBe('ASIA'); // Tokyo
    expect(nearestHub(-36.8, 174.8).code).toBe('OC'); // Auckland
  });
});

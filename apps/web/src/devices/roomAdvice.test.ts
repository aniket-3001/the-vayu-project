import { describe, expect, it } from 'vitest';
import { roomAdvice } from './roomAdvice';

describe('advice for the room', () => {
  it('says to air the room when outside is clearly cleaner', () => {
    expect(roomAdvice(120, 60).kind).toBe('air');
  });
  it('says to keep windows shut when the room is clearly cleaner than outside', () => {
    const a = roomAdvice(60, 160);
    expect(a.kind).toBe('shut');
    expect(a.text).toContain('Keep windows and doors shut');
  });
  it('says the room is unhealthy when it is, and outside is no better', () => {
    expect(roomAdvice(180, 175).kind).toBe('clean-up');
    expect(roomAdvice(180, undefined).kind).toBe('clean-up');
  });
  it('calls good air good, and close numbers the same air', () => {
    expect(roomAdvice(30, undefined).kind).toBe('fine');
    expect(roomAdvice(80, 85).kind).toBe('same');
  });
});

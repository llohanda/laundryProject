// Timer tests with a fake clock (GDD 9.1, 21).
import { describe, expect, it } from 'vitest';
import { RunTimer } from '../services/timer';

function fakeClock(start = 1000) {
  let now = start;
  return { clock: () => now, advance: (ms: number) => { now += ms; } };
}

describe('RunTimer', () => {
  it('does not run until started', () => {
    const c = fakeClock();
    const t = new RunTimer(c.clock);
    c.advance(5000);
    expect(t.nowMs()).toBe(0);
    t.start();
    c.advance(1200);
    expect(t.nowMs()).toBe(1200);
  });

  it('a second start does not reset the clock', () => {
    const c = fakeClock();
    const t = new RunTimer(c.clock);
    t.start();
    c.advance(500);
    t.start();
    c.advance(500);
    expect(t.nowMs()).toBe(1000);
  });

  it('a card pauses the timer', () => {
    const c = fakeClock();
    const t = new RunTimer(c.clock);
    t.start();
    c.advance(1000);
    t.pause('card');
    c.advance(9000);
    t.resume('card');
    c.advance(1000);
    expect(t.nowMs()).toBe(2000);
  });

  it('a hidden page pauses, and overlapping pauses need every reason cleared', () => {
    const c = fakeClock();
    const t = new RunTimer(c.clock);
    t.start();
    t.pause('washing');
    t.pause('hidden');
    c.advance(4000);
    t.resume('washing');
    c.advance(4000);
    expect(t.isRunning).toBe(false);
    t.resume('hidden');
    c.advance(250);
    expect(t.nowMs()).toBe(250);
  });

  it('adds the exact integer cycle cost instantly', () => {
    const c = fakeClock();
    const t = new RunTimer(c.clock);
    t.start();
    c.advance(4100);
    t.addCost(7800);
    expect(t.nowMs()).toBe(11900);
  });

  it('returns integers that never decrease with a sub-millisecond clock', () => {
    const c = fakeClock(0.3);
    const t = new RunTimer(c.clock);
    t.start();
    let last = 0;
    for (let i = 0; i < 50; i++) {
      c.advance(0.37);
      if (i % 7 === 0) { t.pause('hidden'); c.advance(3.3); t.resume('hidden'); }
      const now = t.nowMs();
      expect(Number.isInteger(now)).toBe(true);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });
});

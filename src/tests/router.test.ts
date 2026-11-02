import { describe, expect, it } from 'vitest';
import { hrefFor, parseRoute } from '../ui/router';

describe('hash router', () => {
  it.each([
    ['', { name: 'boot' }],
    ['#/', { name: 'boot' }],
    ['#/levels', { name: 'levels' }],
    ['#/levels/', { name: 'levels' }],
    ['#/level/2-3', { name: 'level', id: '2-3' }],
    ['#/level/banana', { name: 'boot' }],
    ['#/nowhere', { name: 'boot' }],
  ])('parses %j', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it('round-trips hrefFor through parseRoute', () => {
    for (const r of [{ name: 'boot' }, { name: 'levels' }, { name: 'level', id: '4-1' }] as const) {
      expect(parseRoute(hrefFor(r))).toEqual(r);
    }
  });
});

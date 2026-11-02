// Seeded RNG (GDD 13.5). Port of tools/rng_reference.js; vectors in fixtures.json (`rng`).
import type { Config, InstanceId } from './types';

const textEncoder = new TextEncoder();

/** FNV-1a 32-bit over the UTF-8 bytes of `str`. */
export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (const b of textEncoder.encode(str)) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: returns nextU32(), the next unsigned 32-bit integer. */
export function mulberry32U32(seed: number): () => number {
  let a = seed >>> 0;
  return function nextU32() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/**
 * Lost vs stretched for one loose small item: the first draw of a generator seeded per item,
 * so processing order never matters. `loadIndex` is 0-based and counts Start presses.
 */
export function isLost(levelSeed: number, loadIndex: number, instanceId: InstanceId, cfg: Config): boolean {
  return mulberry32U32(fnv1a32(`${levelSeed}:${loadIndex}:${instanceId}`))() < cfg.lostThresholdU32;
}

/** Hamper order (visual only, never recorded or scored): seeded Fisher-Yates. */
export function shuffleIds(ids: InstanceId[], levelSeed: number): InstanceId[] {
  const out = ids.slice();
  const next = mulberry32U32(fnv1a32(`${levelSeed}:hamper`));
  for (let i = out.length - 1; i > 0; i--) {
    // u32 * (i + 1) < 2^53 and dividing by 2^32 is exact, so this is integer arithmetic.
    const j = Math.floor((next() * (i + 1)) / 4294967296);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

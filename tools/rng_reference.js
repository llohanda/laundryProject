// Reference RNG for Fresh Laundry. Copy into src/engine/rng.ts (add types). Must match fixtures.json.
// Run `node rng_reference.js` to self-check against fixtures.json.

// FNV-1a, 32-bit, over the UTF-8 bytes of the string.
function fnv1a32(str) {
  const bytes = new TextEncoder().encode(str);
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: returns a function giving the next unsigned 32-bit integer.
function mulberry32U32(seed) {
  let a = seed >>> 0;
  return function nextU32() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// Seeded Fisher-Yates used only for the hamper's visual order (never affects scoring).
function shuffleIds(ids, levelSeed) {
  const out = ids.slice();
  const next = mulberry32U32(fnv1a32(`${levelSeed}:hamper`));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor((next() / 4294967296) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Lost-vs-stretched for one loose small item. loadIndex is 0-based.
const LOST_THRESHOLD = 2147483648; // floor(0.5 * 2^32)
function isLost(levelSeed, loadIndex, instanceId) {
  return mulberry32U32(fnv1a32(`${levelSeed}:${loadIndex}:${instanceId}`))() < LOST_THRESHOLD;
}

module.exports = { fnv1a32, mulberry32U32, shuffleIds, isLost, LOST_THRESHOLD };

if (require.main === module) {
  const fx = require("./fixtures.json");
  let bad = 0;
  for (const c of fx.rng.fnv1a32) if (fnv1a32(c.input) !== c.hash) { bad++; console.log("fnv1a32 mismatch", c); }
  for (const c of fx.rng.mulberry32) {
    const g = mulberry32U32(c.seed);
    const got = [g(), g(), g(), g()];
    if (JSON.stringify(got) !== JSON.stringify(c.u32)) { bad++; console.log("mulberry32 mismatch", c.seed, got, c.u32); }
  }
  for (const c of fx.hamperShuffle) {
    const got = shuffleIds(c.instanceIdsIn, c.levelSeed);
    if (JSON.stringify(got) !== JSON.stringify(c.instanceIdsOut)) { bad++; console.log("shuffle mismatch", c.levelId); }
  }
  for (const c of fx.consequences) {
    for (const [id, o] of Object.entries(c.expect)) {
      const small = ["sock_", "undies_"].some((p) => id.startsWith(p));
      const loose = c.load.items.includes(id);
      if (small && loose) {
        const shape = isLost(c.levelSeed, c.loadIndex, id) ? "lost" : "stretched";
        if (shape !== o.shape) { bad++; console.log("shape mismatch", id, shape, o.shape); }
      }
    }
  }
  console.log(bad === 0 ? "JS RNG matches fixtures.json" : `${bad} mismatches`);
  process.exit(bad === 0 ? 0 : 1);
}

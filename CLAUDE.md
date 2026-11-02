# laundry days
Offline-first mobile-first PWA puzzle game. The full spec is in GDD.md; read it before changing anything.

- Build in the order of GDD Section 20 (milestones). One milestone per session.
- src/engine is pure TypeScript: no DOM, React, timers or Math.random.
- items.json and levels.json are canonical content. Do not edit numbers by hand.
- tools/verify_gdd.py is the reference model. The TS engine must match it
  on every level and trap case (GDD Section 21). If they disagree, the TS engine is wrong.
- Stack: TypeScript, Vite, React, SVG, Zustand, Vitest, vite-plugin-pwa.
- Run `npm test` and `python3 tools/verify_gdd.py` before saying a milestone is done.
/* LEVEL 2 - "SMALL SPIKES, BIG LIES" (World A)
 * Flat run. Tiny spikes pop up in front of you (x 420, 640, 860, 990). The last two come
 * back-to-back, so jump twice in a row. Low ceiling block makes the end tight.
 */
CD.registerLevel(2, {
  name: 'SMALL SPIKES, BIG LIES',
  world: 'A',
  build() {
    const slab = { x: 100, y: 450, w: 1080, h: 120 };
    const ceil = { x: 740, y: 150, w: 440, h: 160 };
    const door = { x: 1100, y: 406, w: 28, h: 44 };
    const xs = [420, 640, 860, 990];
    const sp = xs.map((x) => CD.spike(x, 450, 16, 16, 1));
    const trig = [-1, -1, -1, -1];
    return {
      spawns: [{ x: 150, y: 450 }],
      solids: [slab, ceil],
      hazards: sp,
      door,
      update(api) {
        for (let i = 0; i < 4; i++) {
          if (trig[i] < 0) {
            for (const p of api.players) {
              if (!p.dead && p.x + p.w > xs[i] - 50) { trig[i] = api.frame; api.sfx.spike(); break; }
            }
          }
          if (trig[i] >= 0) sp[i].ext = Math.min(1, (api.frame - trig[i] + 1) / 4);
        }
      },
    };
  },
});

/* LEVEL 3 - "NARROW MINDED" (World A)
 * Start on the left block, drop into the 60 px shaft. Spikes grow out of the shaft floor a
 * moment after you enter: jump out to the right wall at once. A hidden spike waits on the door ledge.
 */
CD.registerLevel(3, {
  name: 'NARROW MINDED',
  world: 'A',
  build() {
    const block = { x: 0, y: 300, w: 420, h: 260 };
    const w1 = { x: 420, y: 320, w: 30, h: 240 };
    const shaft = { x: 450, y: 380, w: 60, h: 180 };
    const w2 = { x: 510, y: 320, w: 30, h: 240 };
    const ledge = { x: 540, y: 440, w: 240, h: 120 };
    const door = { x: 720, y: 396, w: 28, h: 44 };
    const grow = [];
    for (let i = 0; i < 4; i++) grow.push(CD.spike(452 + i * 14, 380, 14, 40, 1));
    const hid = CD.spike(650, 440, 16, 16, 1);
    let go = -1, hidT = -1;
    return {
      spawns: [{ x: 90, y: 300 }],
      solids: [block, w1, shaft, w2, ledge],
      hazards: grow.concat([hid]),
      door,
      update(api) {
        if (go < 0) {
          for (const p of api.players) {
            const cx = p.x + p.w / 2;
            if (!p.dead && cx > 452 && cx < 508 && p.y + p.h > 335) { go = api.frame; break; }
          }
        }
        if (go >= 0) {
          const g = api.frame - go - 20;
          if (g >= 0) {
            const e = Math.min(1, (g + 1) * 0.1);
            for (const s of grow) s.ext = e;
            if (g === 0) api.sfx.spike();
          }
        }
        if (hidT < 0) {
          for (const p of api.players) if (!p.dead && p.x + p.w > 600 && p.y > 380) { hidT = api.frame; api.sfx.spike(); break; }
        }
        if (hidT >= 0) hid.ext = Math.min(1, (api.frame - hidT + 1) / 4);
      },
    };
  },
});

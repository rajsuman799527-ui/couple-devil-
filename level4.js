/* LEVEL 4 - "FOLLOW THE DOTS" (World B)
 * The dots lure you into jumping too early. Touching an early dot widens gap 1. Jump late.
 * A dot above gap 2 drops like a rock: wait for it to fall. Jump twice quickly to reveal a secret tile.
 */
CD.registerLevel(4, {
  name: 'FOLLOW THE DOTS',
  world: 'B',
  build() {
    const seg1 = { x: 0, y: 400, w: 300, h: 160 };
    const seg2 = { x: 370, y: 400, w: 370, h: 160 };
    const seg3 = { x: 830, y: 400, w: 450, h: 160 };
    const tile = { x: 770, y: 372, w: 40, h: 12, off: true };
    const door = { x: 1100, y: 356, w: 28, h: 44 };
    const dots = [{ x: 215, y: 340, on: true }, { x: 248, y: 316, on: true }, { x: 276, y: 326, on: true },
      { x: 390, y: 350, on: true }, { x: 520, y: 350, on: true }, { x: 640, y: 350, on: true }, { x: 700, y: 350, on: true }];
    const fd = { x: 775, y: 300, vy: 0, on: false, w: 14, h: 14, type: 'fdot',
      hit() { return this.on && this.y < 560 ? this : null; } };
    let widened = false, lastJump = -999;
    return {
      spawns: [{ x: 60, y: 400 }],
      solids: [seg1, seg2, seg3, tile],
      hazards: [fd],
      door,
      update(api) {
        for (const p of api.players) {
          if (p.dead) continue;
          if (p.jumping && p.jumpT === 1) {
            if (api.frame - lastJump < 45) tile.off = false;
            lastJump = api.frame;
          }
          for (let i = 0; i < 3; i++) {
            const d = dots[i];
            if (d.on && p.x < d.x + 12 && p.x + p.w > d.x && p.y < d.y + 12 && p.y + p.h > d.y) {
              d.on = false;
              if (!widened) { widened = true; seg2.x = 400; seg2.w = 340; api.sfx.thud && api.sfx.thud(); }
            }
          }
          if (!fd.on && p.x + p.w > 740 && p.x < 830) { fd.on = true; api.sfx.spike(); }
        }
        if (fd.on) { fd.vy += 0.5; fd.y += fd.vy; }
      },
      drawBack(g, w) {
        g.fillStyle = w.dot || '#E8892B';
        for (const d of dots) if (d.on) g.fillRect(d.x, d.y, 12, 12);
        if (!fd.on) g.fillRect(fd.x, fd.y, 14, 14);
      },
      drawFront(g, w) {
        if (fd.on && fd.y < 560) { g.fillStyle = w.spike; g.fillRect(Math.round(fd.x), Math.round(fd.y), 14, 14); }
      },
    };
  },
});

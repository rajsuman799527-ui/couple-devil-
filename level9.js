/* LEVEL 9 - "TWO KEYS, ONE FATE" (World C) - co-op troll (solo-playable build for now)
 * Two stacked rooms. In each room press the REAL button (gold outline) to open the gate, never the fake.
 * Cross the timed spikes while they are down. Drop through the hole to the bottom room, reach the door on the left.
 */
CD.registerLevel(9, {
  name: 'TWO KEYS, ONE FATE',
  world: 'C',
  build() {
    const topL = { x: 100, y: 300, w: 740, h: 30 };
    const topR = { x: 940, y: 300, w: 240, h: 30 };
    const bot = { x: 100, y: 540, w: 1080, h: 60 };
    const g1 = { x: 700, y: 200, w: 24, h: 100 };
    const g2 = { x: 620, y: 440, w: 24, h: 100 };
    const door = { x: 130, y: 496, w: 28, h: 44 };
    const zones = [{ x0: 300, x1: 428, y: 300, ph: 0, s: [] }, { x0: 400, x1: 528, y: 540, ph: 55, s: [] }];
    const haz = [];
    for (const z of zones) for (let x = z.x0; x + 16 <= z.x1; x += 16) { const s = CD.spike(x, z.y, 16, 16, 1); z.s.push(s); haz.push(s); }
    const btn = [
      { x: 560, y: 300, real: true, done: false }, { x: 480, y: 300, real: false },
      { x: 700 + 20, y: 540, real: true, done: false }, { x: 790, y: 540, real: false },
    ];
    const fakeHit = { type: 'fake', hit() { return this.on ? this._r : null; }, on: false, _r: { x: 0, y: 0, w: 0, h: 0 } };
    haz.push(fakeHit);
    return {
      spawns: [{ x: 150, y: 300 }],
      solids: [topL, topR, bot, g1, g2],
      hazards: haz,
      door,
      update(api) {
        for (const z of zones) {
          const c = (api.frame + z.ph) % 110;
          const e = c < 40 ? Math.min(1, (c + 1) / 4) : c < 44 ? 1 - (c - 39) / 4 : (c >= 102 ? 0.12 : 0);
          for (const s of z.s) s.ext = e;
        }
        for (let i = 0; i < btn.length; i++) {
          const b = btn[i];
          for (const p of api.players) {
            const cx = p.x + p.w / 2;
            if (p.dead || !p.onGround || Math.abs(p.y + p.h - b.y) > 2 || cx < b.x || cx > b.x + 40) continue;
            if (b.real) {
              if (!b.done) { b.done = true; api.sfx.button(); if (i === 0) g1.off = true; else g2.off = true; }
            } else if (!fakeHit.on) {
              fakeHit.on = true; fakeHit._r.x = b.x; fakeHit._r.y = b.y - 30; fakeHit._r.w = 40; fakeHit._r.h = 30; api.sfx.spike();
            }
          }
        }
      },
      drawFront(g, w) {
        for (const b of btn) {
          g.fillStyle = b.real ? w.edge : '#B24E12'; g.fillRect(b.x, b.y - 6, 40, 6);
          if (b.real) { g.fillStyle = '#FFE45C'; g.fillRect(b.x, b.y - 8, 40, 2); }
          g.fillStyle = w.crack; g.fillRect(b.x + 16, b.y - 12, 8, 6);
        }
        if (fakeHit.on) for (let i = 0; i < 2; i++) { const f = fakeHit._r; CD.drawSpike(g, f.x + i * 20, f.y + 30, 20, 30, 1, w.spike, 1); }
        for (const gt of [g1, g2]) if (!gt.off) {
          g.fillStyle = w.edge; g.fillRect(gt.x, gt.y, gt.w, gt.h);
          g.fillStyle = w.crack; for (let y = gt.y + 8; y < gt.y + gt.h; y += 20) g.fillRect(gt.x + 6, y, 12, 4);
        }
      },
    };
  },
});

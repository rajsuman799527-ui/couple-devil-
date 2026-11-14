/* LEVEL 6 - "V FOR VICTIM" (World B)
 * Run down the stairs and across the valley. Stop at the bottom and the ceiling spikes slam down.
 * The right-side steps vanish shortly after you touch them, so keep hopping.
 */
CD.registerLevel(6, {
  name: 'V FOR VICTIM',
  world: 'B',
  build() {
    const mk = (x, w, y) => ({ x, y, w, h: 560 - y });
    const solids = [mk(80, 180, 300), mk(260, 60, 340), mk(320, 60, 380), mk(380, 60, 420), mk(440, 60, 460), mk(500, 220, 500)];
    const right = [mk(720, 60, 460), mk(780, 60, 420), mk(840, 60, 380), mk(900, 60, 340)];
    const gone = [-1, -1, -1, -1];
    for (const s of right) solids.push(s);
    solids.push(mk(960, 240, 300));
    const door = { x: 1100, y: 256, w: 28, h: 44 };
    let stand = 0, dropT = -1;
    const bar = { x: 560, w: 100, drop: 0, type: 'bar', hit() {
      if (this.drop < 10) return null;
      this._r.x = this.x + 8; this._r.w = this.w - 16; this._r.y = 0; this._r.h = 180 + this.drop; return this._r;
    }, _r: { x: 0, y: 0, w: 0, h: 0 } };
    return {
      spawns: [{ x: 130, y: 300 }],
      solids,
      hazards: [bar],
      door,
      update(api) {
        let on = false;
        for (const p of api.players) {
          if (p.dead) continue;
          if (p.onGround && p.x + p.w / 2 > 500 && p.x + p.w / 2 < 720 && Math.abs(p.y + p.h - 500) < 2 && Math.abs(p.vx) < 1) on = true;
          for (let i = 0; i < 4; i++) {
            const s = right[i];
            if (gone[i] < 0 && p.onGround && Math.abs(p.y + p.h - s.y) < 2 && p.x + p.w > s.x && p.x < s.x + s.w) gone[i] = api.frame;
          }
        }
        for (let i = 0; i < 4; i++) if (gone[i] >= 0 && api.frame - gone[i] >= 14) right[i].off = true;
        stand = on ? stand + 1 : Math.max(0, stand - 1);
        if (dropT < 0 && stand >= 24) { dropT = api.frame; api.sfx.spike(); }
        if (dropT >= 0) bar.drop = Math.min(300, (api.frame - dropT + 1) * 30);
      },
      drawFront(g, w) {
        const sh = (dropT < 0 && stand > 14) ? Math.round((Math.random() * 2 - 1) * 3) : 0;
        const y0 = 100 + bar.drop;
        g.fillStyle = w.edge; g.fillRect(bar.x + sh, 0, bar.w, y0 + 50);
        g.fillStyle = w.crack; g.fillRect(bar.x + sh, y0 + 44, bar.w, 6);
        for (let i = 0; i < 6; i++) CD.drawSpike(g, bar.x + sh + 2 + i * 16, y0 + 50, 16, 30, -1, w.spike, 1);
      },
    };
  },
});

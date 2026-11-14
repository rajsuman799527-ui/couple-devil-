/* LEVEL 8 - "TRUST ME" (World C) - co-op troll (solo-playable build for now)
 * Step on plate A: spike wall 1 opens for 2.5 s. Step on plate B: wall 2 opens for 2.5 s.
 * Hidden spikes pop up right after each plate. Both walls must be passed to finish.
 */
CD.registerLevel(8, {
  name: 'TRUST ME',
  world: 'C',
  build() {
    const floor = { x: 160, y: 480, w: 960, h: 80 };
    const door = { x: 1050, y: 436, w: 28, h: 44 };
    const plates = [{ x: 360, w: 40, open: 0 }, { x: 740, w: 40, open: 0 }];
    const walls = [{ x: 560, w: 24 }, { x: 920, w: 24 }];
    const hid = [CD.spike(470, 480, 16, 16, 1), CD.spike(850, 480, 16, 16, 1)];
    const hidT = [-1, -1];
    const hidX = [420, 800];
    const wallHit = (wl, k) => ({ type: 'wall', hit() {
      if (plates[k].open > 0) return null;
      this._r.x = wl.x + 2; this._r.w = wl.w - 4; this._r.y = 330; this._r.h = 150; return this._r;
    }, _r: { x: 0, y: 0, w: 0, h: 0 } });
    return {
      spawns: [{ x: 210, y: 480 }],
      solids: [floor],
      hazards: [wallHit(walls[0], 0), wallHit(walls[1], 1), hid[0], hid[1]],
      door,
      update(api) {
        for (let k = 0; k < 2; k++) {
          const pl = plates[k];
          if (pl.open > 0) pl.open--;
          for (const p of api.players) {
            const cx = p.x + p.w / 2;
            if (!p.dead && p.onGround && cx > pl.x && cx < pl.x + pl.w && Math.abs(p.y + p.h - 480) < 2) {
              if (pl.open <= 0) api.sfx.button();
              pl.open = 150;
            }
            if (hidT[k] < 0 && !p.dead && p.x + p.w > hidX[k]) { hidT[k] = api.frame; api.sfx.spike(); }
          }
          if (hidT[k] >= 0) hid[k].ext = Math.min(1, (api.frame - hidT[k] + 1) / 4);
        }
      },
      drawFront(g, w) {
        for (let k = 0; k < 2; k++) {
          const pl = plates[k];
          g.fillStyle = pl.open > 0 ? '#FFE45C' : w.edge;
          g.fillRect(pl.x, 476, pl.w, 4);
          g.fillStyle = w.crack; g.fillRect(pl.x + 14, 470, 12, 6);
          const wl = walls[k];
          const open = pl.open > 0 && !(pl.open < 20 && (pl.open & 2));
          if (!open) {
            g.fillStyle = w.edge; g.fillRect(wl.x, 330, wl.w, 150);
            for (let y = 334; y < 476; y += 16) { g.fillStyle = w.spike; g.fillRect(wl.x - 8, y, 8, 10); g.fillRect(wl.x + wl.w, y, 8, 10); }
          } else {
            g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(wl.x, 470, wl.w, 10);
          }
        }
      },
    };
  },
});

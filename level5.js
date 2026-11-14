/* LEVEL 5 - "WRONG WAY" (World B)
 * Spawn at the right, door at the far LEFT on a raised ledge. Spike pairs pop up 90 px ahead of you.
 * Pass x 300 and a spiked floor line chases you from behind: keep running and climb the ledge.
 */
CD.registerLevel(5, {
  name: 'WRONG WAY',
  world: 'B',
  build() {
    const floor = { x: 100, y: 460, w: 1100, h: 60 };
    const ledge = { x: 100, y: 380, w: 100, h: 140 };
    const door = { x: 120, y: 336, w: 28, h: 44 };
    const cx = [980, 820, 640, 480];
    const sp = [], trig = [];
    for (const c of cx) { sp.push(CD.spike(c, 460, 16, 16, 1)); sp.push(CD.spike(c + 16, 460, 16, 16, 1)); trig.push(-1); }
    let front = 420, chase = -1;
    const line = { type: 'line', hit() {
      if (chase < 0) return null;
      this._r.x = front + 2; this._r.w = 1200 - front; this._r.y = 442; this._r.h = 18;
      return this._r;
    }, _r: { x: 0, y: 0, w: 0, h: 0 } };
    return {
      spawns: [{ x: 1140, y: 460 }],
      solids: [floor, ledge],
      hazards: sp.concat([line]),
      door,
      update(api) {
        for (let i = 0; i < cx.length; i++) {
          if (trig[i] < 0) {
            for (const p of api.players) if (!p.dead && p.x < cx[i] + 32 + 90) { trig[i] = api.frame; api.sfx.spike(); break; }
          }
          if (trig[i] >= 0) { const e = Math.min(1, (api.frame - trig[i] + 1) / 4); sp[i * 2].ext = e; sp[i * 2 + 1].ext = e; }
        }
        if (chase < 0) {
          for (const p of api.players) if (!p.dead && p.x < 300) { chase = api.frame; api.sfx.spike(); api.shake(6); break; }
        } else front -= 1.8;
      },
      drawFront(g, w) {
        if (chase < 0) return;
        for (let x = Math.round(front); x < 1200; x += 16) CD.drawSpike(g, x, 460, 16, 20, 1, w.spike, 1);
      },
    };
  },
});

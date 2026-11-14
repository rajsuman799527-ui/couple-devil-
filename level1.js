/* LEVEL 1 - "THE FLOOR IS LYING" (World A)
 * Run right. When the player passes x 882 the door-side floor sinks 80 px,
 * 5 spikes pop out of the floor and a spiked ceiling drops behind them.
 * Solution: jump the moment the floor starts to move and land on the sunken door slab.
 */
CD.registerLevel(1, {
  name: 'THE FLOOR IS LYING',
  world: 'A',
  build() {
    const left = { x: 90, y: 440, w: 910, h: 120 };
    const right = { x: 1000, y: 440, w: 190, h: 120 };
    const door = { x: 1086, y: 396, w: 28, h: 44 };

    const floorSpikes = [];
    for (let i = 0; i < 5; i++) floorSpikes.push(CD.spike(912 + i * 16, 440, 16, 24, 1));

    // hidden ceiling bar with downward spikes
    const ceil = {
      type: 'bar', x: 912, w: 80, drop: 0,
      hit() {
        if (this.drop < 0.3) return null;
        const by = 300 * this.drop;
        this._r.x = this.x + 8; this._r.w = this.w - 16; this._r.y = 0; this._r.h = by + 24;
        return this._r;
      },
      _r: { x: 0, y: 0, w: 0, h: 0 },
    };

    let trig = -1, sunk = 0;

    return {
      spawns: [{ x: 150, y: 440 }],
      solids: [left, right],
      hazards: floorSpikes.concat([ceil]),
      door,

      update(api) {
        if (trig < 0) {
          for (const p of api.players) {
            if (!p.dead && p.x + p.w / 2 > 882) { trig = api.frame; break; }
          }
        }
        if (trig < 0) return;
        const f = api.frame - trig;

        if (f <= 10) {
          const t = f / 10, e = t * t * (3 - 2 * t);
          const target = 80 * e, dy = target - sunk;
          if (dy !== 0) {
            api.carry(right, dy);
            right.y += dy;
            door.y += dy;
            sunk = target;
          }
          if (f === 0) api.sfx.button();
        }
        if (f >= 22) {
          const ext = Math.min(1, (f - 22) / 4);
          for (const s of floorSpikes) s.ext = ext;
          if (f === 22) api.sfx.spike();
        }
        if (f >= 38) {
          ceil.drop = Math.min(1, (f - 38) / 4);
          if (f === 38) api.sfx.spike();
        }
      },

      drawBack(g, w) {
        // narrow pillar rising under the sinking slab
        const h = 30 * (sunk / 80);
        if (h > 0) {
          g.fillStyle = w.edge;
          g.fillRect(1066, 670 - h, 60, h);
        }
      },

      drawFront(g, w) {
        if (ceil.drop > 0) {
          const by = Math.round(300 * ceil.drop);
          g.fillStyle = w.edge;
          g.fillRect(ceil.x - 6, 0, ceil.w + 12, by);
          g.fillStyle = w.crack;
          g.fillRect(ceil.x - 6, by - 6, ceil.w + 12, 6);
          for (let i = 0; i < 5; i++) CD.drawSpike(g, ceil.x + i * 16, by, 16, 30, -1, w.spike, 1);
        }
      },
    };
  },
});

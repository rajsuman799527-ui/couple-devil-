/* LEVEL 10 - "THE DEVIL'S DOOR" (Boss, solo-playable build for now)
 * 2560 px wide, 5 mini-rooms: 1) sinking floor + spikes, 2) hidden spikes, 3) gap with fake dots,
 * 4) chasing spike wall, 5) press plate A then plate B within 3 s to open the gate. Big horned door at the end.
 */
CD.registerLevel(10, {
  name: "THE DEVIL'S DOOR",
  world: 'BOSS',
  build() {
    const A = { x: 0, y: 500, w: 340, h: 60 };
    const slab = { x: 340, y: 500, w: 172, h: 60 };
    const F2 = { x: 512, y: 500, w: 678, h: 60 };
    const F3 = { x: 1280, y: 500, w: 1280, h: 60 };
    const gate = { x: 2400, y: 300, w: 24, h: 200 };
    const door = { x: 2480, y: 456, w: 28, h: 44 };
    const spikes1 = [];
    for (let i = 0; i < 5; i++) spikes1.push(CD.spike(252 + i * 16, 500, 16, 16, 1));
    const hx = [640, 760, 880, 1740, 1900];
    const hid = hx.map((x) => CD.spike(x, 500, 16, 16, 1));
    const hidT = hx.map(() => -1);
    let sink = -1, sunk = 0, front = 0, chase = -1, pa = -9999, pb = -9999, alert = 0;
    const wall = { type: 'wall', hit() {
      if (chase < 0) return null;
      this._r.x = front - 70; this._r.w = 68; this._r.y = 0; this._r.h = 720; return this._r;
    }, _r: { x: 0, y: 0, w: 0, h: 0 } };
    const dots = [{ x: 1090, y: 440 }, { x: 1120, y: 418 }, { x: 1152, y: 428 }];
    return {
      worldW: 2560,
      spawns: [{ x: 80, y: 500 }],
      solids: [A, slab, F2, F3, gate],
      hazards: spikes1.concat(hid, [wall]),
      door,
      update(api) {
        const f = api.frame;
        let near = false;
        for (const p of api.players) {
          if (p.dead) continue;
          if (sink < 0 && p.x > 230) sink = f;
          if (chase < 0 && p.x > 1560) { chase = f; front = 1410; api.sfx.spike(); api.shake(8); }
          for (let i = 0; i < hx.length; i++) {
            if (hidT[i] < 0 && p.x + p.w > hx[i] - 50 && p.x < hx[i] + 40) { hidT[i] = f; api.sfx.spike(); }
          }
          const cx = p.x + p.w / 2;
          if (p.onGround && Math.abs(p.y + p.h - 500) < 2) {
            if (cx > 2150 && cx < 2190) { if (f - pa > 180 || pa < 0) api.sfx.button(); pa = f; }
            if (cx > 2280 && cx < 2320) { if (f - pb > 180 || pb < 0) api.sfx.button(); pb = f; }
          }
          for (const hz of [250, 640, 760, 880, 1170, 1740, 1900, 2150]) if (Math.abs(cx - hz) < 140) near = true;
        }
        alert += ((near ? 1 : 0) - alert) * 0.15;
        if (sink >= 0) {
          const k = f - sink;
          if (k <= 10) {
            const t = k / 10, e = t * t * (3 - 2 * t), target = 60 * e, dy = target - sunk;
            if (dy !== 0) { api.carry(slab, dy); slab.y += dy; sunk = target; }
            if (k === 0) api.sfx.button();
          }
          if (k >= 18) { const e = Math.min(1, (k - 18) / 4); for (const s of spikes1) s.ext = e; if (k === 18) api.sfx.spike(); }
        }
        for (let i = 0; i < hx.length; i++) if (hidT[i] >= 0) hid[i].ext = Math.min(1, (f - hidT[i] + 1) / 4);
        if (chase >= 0) front += 1.6;
        if (!gate.off && Math.abs(pa - pb) <= 180 && pa > -9000 && pb > -9000) { gate.off = true; api.sfx.door(); }
      },
      drawBack(g, w) {
        for (let k = 0; k < 5; k++) {
          const cx = 256 + 512 * k, cy = 230, sq = Math.round(alert * 14);
          g.fillStyle = w.edge;
          for (const s of [-1, 1]) {
            g.beginPath();
            g.moveTo(cx + s * 40, cy + 6 + sq);
            g.lineTo(cx + s * 170, cy - 30 + sq * 2);
            g.lineTo(cx + s * 168, cy + 6 + sq);
            g.lineTo(cx + s * 120, cy + 44 - sq);
            g.closePath(); g.fill();
          }
        }
        g.fillStyle = w.plat;
        for (const d of dots) g.fillRect(d.x, d.y, 12, 12);
        const h = 30 * (sunk / 60);
        if (h > 0) { g.fillStyle = w.edge; g.fillRect(380, 640 - h, 80, h); }
      },
      drawFront(g, w) {
        if (chase >= 0) {
          g.fillStyle = w.spike; g.fillRect(front - 70, 0, 70, 720);
          g.fillStyle = w.crack; g.fillRect(front - 70, 0, 6, 720);
          for (let y = 0; y < 720; y += 24) CD.drawSpike(g, front, y, 24, 22, -1, w.spike, 1);
        }
        // plates
        for (const x of [2150, 2280]) {
          g.fillStyle = w.spike; g.fillRect(x, 496, 40, 4); g.fillStyle = '#FFE45C'; g.fillRect(x + 14, 490, 12, 6);
        }
        if (!gate.off) {
          g.fillStyle = w.edge; g.fillRect(gate.x - 6, gate.y, gate.w + 12, 4); 
          g.fillStyle = w.spike;
          for (let y = gate.y; y < 500; y += 16) { g.fillRect(gate.x - 8, y + 2, 8, 10); g.fillRect(gate.x + gate.w, y + 2, 8, 10); }
        }
        // horns + flames on the final door
        g.fillStyle = w.spike;
        g.fillRect(door.x - 8, door.y - 22, 8, 22); g.fillRect(door.x + door.w, door.y - 22, 8, 22);
        g.fillRect(door.x - 14, door.y - 34, 8, 14); g.fillRect(door.x + door.w + 6, door.y - 34, 8, 14);
      },
    };
  },
});

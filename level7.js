/* LEVEL 7 - "STAIRCASE TO NOWHERE" (World B)
 * Step 5 crumbles 10 frames after you land on it, step 8 is a fake (no collision).
 * Jump 4 -> 6 and 7 -> 9. When you pass step 8 a spike falls onto the top ledge: hop it.
 */
CD.registerLevel(7, {
  name: 'STAIRCASE TO NOWHERE',
  world: 'B',
  build() {
    const tops = [520, 490, 460, 430, 400, 370, 340, 310, 280];
    const start = { x: 40, y: 520, w: 180, h: 120 };
    const steps = [];
    for (let i = 2; i <= 8; i++) steps[i] = { x: 150 + 85 * (i - 1), y: tops[i - 1], w: 70, h: 24 };
    const top = { x: 830, y: 280, w: 400, h: 120 };
    const door = { x: 1150, y: 236, w: 28, h: 44 };
    const solids = [start, top];
    for (let i = 2; i <= 7; i++) solids.push(steps[i]);
    const fake = steps[8];
    const fs = CD.spike(880, 280, 16, 20, 1);
    fs.y = -40; fs.ext = 1;
    let landed = -1, fall = -1;
    return {
      spawns: [{ x: 90, y: 520 }],
      solids,
      hazards: [fs],
      door,
      update(api) {
        const s5 = steps[5];
        for (const p of api.players) {
          if (p.dead) continue;
          if (landed < 0 && p.onGround && Math.abs(p.y + p.h - s5.y) < 2 && p.x + p.w > s5.x && p.x < s5.x + s5.w) landed = api.frame;
          if (fall < 0 && p.x + p.w > 745) { fall = api.frame; api.sfx.spike(); }
        }
        if (landed >= 0 && api.frame - landed >= 10) s5.off = true;
        if (fall >= 0) fs.y = Math.min(280, -40 + (api.frame - fall) * 22);
      },
      drawBack(g, w) {
        g.fillStyle = w.plat; g.fillRect(fake.x, fake.y, fake.w, fake.h);
        g.fillStyle = w.edge; g.fillRect(fake.x, fake.y + fake.h - 8, fake.w, 8);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(fake.x, fake.y, fake.w, 4);
        g.fillStyle = w.dot || '#E8892B';
        for (const i of [2, 3, 4, 5, 6, 7]) g.fillRect(steps[i].x + steps[i].w + 1, steps[i].y - 70, 12, 12);
      },
    };
  },
});

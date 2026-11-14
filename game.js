/* COUPLE DEVIL - engine (phase 1)
 * One full-screen canvas, 1280x720 virtual space, fixed 60 Hz physics.
 * Levels live in level1.js ... level10.js and register through CD.registerLevel().
 */
(() => {
  'use strict';

  // ======================================================================
  // constants
  // ======================================================================
  const W = 1280, H = 720, STEP = 1000 / 60;
  const FONT = '"Press Start 2P", "Courier New", monospace';
  const COL = {
    maroon: '#6B1A0A', orange: '#C85535', shadow: '#7A2410', gold: '#FFC870', press: '#FFB566',
    yellow: '#FFF35C', dark: '#3A0D05', spike: '#7A1A0A', tan: '#C8903A', panel: '#4A1306',
  };
  const WORLDS = {
    A:    { bg: '#996F06', plat: '#FFB347', edge: '#C97A12', crack: '#D98A1C', spike: '#7A1A0A', strip: '#C8903A' },
    B:    { bg: '#F9C84E', plat: '#E57F0E', edge: '#B85F08', crack: '#C96E0C', spike: '#7A1A0A', strip: '#E0A23A', dot: '#E8892B' },
    C:    { bg: '#E3C24A', plat: '#E26A1F', edge: '#B24E12', crack: '#C85A18', spike: '#D9531E', strip: '#D0A23A' },
    BOSS: { bg: '#3A0D05', plat: '#8A2E12', edge: '#5C1D0B', crack: '#6E2410', spike: '#FF4A1C', strip: '#5C1D0B' },
  };
  const PH = { RUN: 3.2, ACC: 0.5, FRIC: 0.6, GRAV: 0.55, JUMP: -10.5, MAXFALL: 12, COYOTE: 6, BUFFER: 6 };
  const PW = 20, PHGT = 32;
  const LEVEL_COUNT = 10;

  // ======================================================================
  // save data (localStorage only, no database)
  // ======================================================================
  const SAVE_KEY = 'couple-devil-v1';
  function defaultSave() {
    return { totalDeaths: 0, levels: {}, tutorialDone: false, color: '#111111',
      settings: { sound: true, vibration: true, left: false } };
  }
  function loadSave() {
    const d = defaultSave();
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') {
        d.totalDeaths = Math.max(0, s.totalDeaths | 0);
        if (s.levels && typeof s.levels === 'object') d.levels = s.levels;
        d.tutorialDone = !!s.tutorialDone;
        if (typeof s.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color)) d.color = s.color;
        if (s.settings) Object.assign(d.settings, s.settings);
      }
    } catch (e) { /* ignore */ }
    return d;
  }
  const save = loadSave();
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

  function completedCount() {
    let n = 0;
    while (n < LEVEL_COUNT && save.levels[n + 1] && save.levels[n + 1].completed) n++;
    return n;
  }
  function currentLevel() { return Math.min(LEVEL_COUNT, completedCount() + 1); }

  // ======================================================================
  // audio (WebAudio chiptune blips)
  // ======================================================================
  let actx = null, voices = 0;
  function ensureAudio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume().catch(() => {});
    } catch (e) { actx = null; }
  }
  function tone(freq, dur, type, vol, slide, delay) {
    if (!actx || !save.settings.sound || voices >= 8) return;
    try {
      const t = actx.currentTime + (delay || 0);
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(vol || 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      voices++;
      o.onended = () => { voices = Math.max(0, voices - 1); };
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  const sfx = {
    jump: () => tone(330, 0.12, 'square', 0.04, 700),
    land: () => tone(140, 0.06, 'triangle', 0.05, 80),
    death: () => { tone(220, 0.35, 'sawtooth', 0.06, 45); tone(110, 0.3, 'square', 0.04, 40, 0.05); },
    door: () => { tone(523, 0.1, 'square', 0.04, 784); tone(784, 0.16, 'square', 0.04, 1046, 0.09); },
    button: () => tone(400, 0.08, 'square', 0.04, 500),
    spike: () => tone(900, 0.06, 'square', 0.035, 300),
    ui: () => tone(660, 0.05, 'square', 0.035, 760),
    thud: () => tone(90, 0.12, 'triangle', 0.07, 50),
    complete: () => { tone(523, 0.12, 'square', 0.05, 0); tone(659, 0.12, 'square', 0.05, 0, 0.12); tone(784, 0.2, 'square', 0.05, 0, 0.24); },
    invite: () => tone(880, 0.1, 'square', 0.04, 1320),
  };
  function vibrate(ms) {
    if (save.settings.vibration && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
  }

  // ======================================================================
  // canvas + fit
  // ======================================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const rotateEl = document.getElementById('rotate');
  let scale = 1, offX = 0, offY = 0, dpr = 1, portrait = false;

  function fit() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    scale = Math.min(canvas.width / W, canvas.height / H);
    offX = Math.floor((canvas.width - W * scale) / 2);
    offY = Math.floor((canvas.height - H * scale) / 2);
    portrait = ch > cw;
    rotateEl.classList.toggle('show', portrait);
    ctx.imageSmoothingEnabled = false;
    releaseAll();
  }

  // ======================================================================
  // draw helpers
  // ======================================================================
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function text(s, x, y, size, color, align, shadow) {
    ctx.font = size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    if (shadow !== false) {
      const o = Math.max(2, Math.round(size / 10));
      ctx.fillStyle = COL.shadow; ctx.fillText(s, x + o, y + o);
    }
    ctx.fillStyle = color || COL.orange;
    ctx.fillText(s, x, y);
  }
  function drawGrid(rows, x, y, s, color) {
    ctx.fillStyle = color;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(x + c * s, y + r * s, s, s);
    }
  }
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  function box(x, y, w, h, fill, border, bw) {
    bw = bw || 2;
    rect(x, y, w, h, border);
    rect(x + bw, y + bw, w - bw * 2, h - bw * 2, fill);
  }

  // ======================================================================
  // pixel character
  // ======================================================================
  const IDLE = [
    '..######..', '..######..', '..######..', '..######..', '...####...',
    '.########.', '.########.', '.##.##.##.', '.##.##.##.', '.##.##.##.',
    '...####...', '...#..#...', '...#..#...', '...#..#...', '..##..##..', '..##..##..',
  ];
  const SPR = {
    idle: IDLE,
    idle2: ['..........'].concat(IDLE.slice(0, 4), IDLE.slice(5)),
    run1: [
      '...######.', '...######.', '...######.', '...######.', '....####..',
      '..#######.', '.########.', '##.#####..', '#..#####.#', '...####...',
      '...####...', '..##..##..', '.##...###.', '##.....##.', '#.......##', '.#......##',
    ],
    run2: [
      '...######.', '...######.', '...######.', '...######.', '....####..',
      '..#######.', '.########.', '#..#####.#', '##.#####..', '...####...',
      '...####...', '...#..#...', '...#..#...', '..##..##..', '..##..##..', '..##..##..',
    ],
    jump: [
      '#.######.#', '#.######.#', '##.####.##', '..######..', '...####...',
      '..######..', '..######..', '..######..', '..######..', '...####...',
      '..##..##..', '.##....##.', '.#......#.', '.#......#.', '##......##', '#........#',
    ],
  };
  const sprCache = new Map();
  function sprite(name, color) {
    const key = name + color;
    let c = sprCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = 20; c.height = 32;
      const g = c.getContext('2d');
      g.fillStyle = color;
      const rows = SPR[name];
      for (let r = 0; r < rows.length; r++) for (let i = 0; i < 10; i++) if (rows[r][i] === '#') g.fillRect(i * 2, r * 2, 2, 2);
      sprCache.set(key, c);
    }
    return c;
  }
  function frameFor(p) {
    if (!p.onGround) return 'jump';
    if (Math.abs(p.vx) > 0.4) return ((p.runT >> 3) & 1) ? 'run2' : 'run1';
    return ((p.idleT >> 5) & 1) ? 'idle2' : 'idle';
  }
  function drawPlayer(p, alpha) {
    if (p.dead) return;
    const x = Math.round(p.px + (p.x - p.px) * alpha);
    const y = Math.round(p.py + (p.y - p.py) * alpha);
    let sc = 1, a = 1, dx = 0, dy = 0;
    if (p.inDoor) {
      const t = Math.min(1, p.doorT / 20);
      sc = 1 - t; a = 1 - t;
      const d = run.L.door;
      dx = (d.x + d.w / 2 - (x + PW / 2)) * t;
      dy = (d.y + d.h - (y + PHGT)) * t;
      if (t >= 1) return;
    }
    const spr = sprite(frameFor(p), p.color);
    const fast = Math.abs(p.vx) > 2.4 || (!p.onGround && Math.abs(p.vx) > 1);
    if (fast && !p.inDoor) {
      ctx.fillStyle = p.color;
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = 0.25 * (1 - i / 6);
        const tx = p.facing > 0 ? x - 8 * (i + 1) : x + PW + 8 * i;
        ctx.fillRect(tx, y + 6 + i * 2, 8, 20);
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(x + PW / 2 + dx, y + PHGT + dy);
    ctx.scale(p.facing < 0 ? -sc : sc, sc);
    ctx.drawImage(spr, -PW / 2, -PHGT);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ======================================================================
  // particles
  // ======================================================================
  const PARTS = [];
  for (let i = 0; i < 96; i++) PARTS.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '', s: 4, g: 0.3 });
  function part(x, y, vx, vy, life, c, s, g) {
    for (let i = 0; i < PARTS.length; i++) {
      const q = PARTS[i];
      if (!q.on) { q.on = true; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = life; q.max = life; q.c = c; q.s = s; q.g = g; return; }
    }
  }
  function clearParts() { for (let i = 0; i < PARTS.length; i++) PARTS[i].on = false; }
  function updateParts() {
    for (let i = 0; i < PARTS.length; i++) {
      const q = PARTS[i];
      if (!q.on) continue;
      q.x += q.vx; q.y += q.vy; q.vy += q.g;
      if (--q.life <= 0) q.on = false;
    }
  }
  function drawParts() {
    for (let i = 0; i < PARTS.length; i++) {
      const q = PARTS[i];
      if (!q.on) continue;
      ctx.globalAlpha = Math.min(1, q.life / (q.max * 0.6));
      ctx.fillStyle = q.c;
      ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s);
    }
    ctx.globalAlpha = 1;
  }
  function dust(p, n) {
    for (let i = 0; i < n; i++) part(p.x + PW / 2 + (Math.random() - 0.5) * 12, p.y + PHGT - 3, (Math.random() - 0.5) * 1.6, -0.3 - Math.random() * 0.4, 14, '#FFE9B0', 3, 0);
  }
  function shatter(p) {
    for (let i = 0; i < 18; i++) {
      part(p.x + Math.random() * PW, p.y + Math.random() * PHGT, (Math.random() - 0.5) * 9, -2 - Math.random() * 6, 36, p.color, 4, 0.35);
    }
  }

  // ======================================================================
  // spikes (shared helpers for level files)
  // ======================================================================
  const tmpRect = { x: 0, y: 0, w: 0, h: 0 };
  function spike(x, baseY, w, h, dir) {
    // dir: 1 = points up (base at bottom), -1 = points down (base at top). ext 0..1 = how far it has popped out.
    return {
      type: 'spike', x, y: baseY, w, h, dir, ext: 0,
      hit() {
        if (this.ext < 0.15) return null;
        const vh = this.h * this.ext, hw = this.w * 0.8, hh = vh * 0.8;
        tmpRect.x = this.x + (this.w - hw) / 2; tmpRect.w = hw; tmpRect.h = hh;
        tmpRect.y = this.dir > 0 ? this.y - hh : this.y;
        return tmpRect;
      },
    };
  }
  function drawSpike(g, x, baseY, w, h, dir, color, ext) {
    const vh = h * (ext === undefined ? 1 : ext);
    if (vh < 2) return;
    const n = Math.max(1, Math.ceil(vh / 4));
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      let rw = Math.round((w * (1 - (i + 0.5) / n)) / 2) * 2;
      if (rw < 2) rw = 2;
      const rx = x + (w - rw) / 2;
      const ry = dir > 0 ? baseY - (i + 1) * (vh / n) : baseY + i * (vh / n);
      g.fillRect(rx, Math.round(ry), rw, Math.ceil(vh / n));
    }
  }

  // ======================================================================
  // level registry + asset loading
  // ======================================================================
  const LEVELS = {};
  window.CD = { registerLevel(n, def) { LEVELS[n] = def; }, spike, drawSpike, W, H, PH };

  function loadScript(src) {
    return new Promise((res) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res(true);
      s.onerror = () => res(false);
      document.head.appendChild(s);
    });
  }
  let assetsDone = 0, assetsTotal = 1 + LEVEL_COUNT, assetsReady = false;
  function loadAssets() {
    const tick = (v) => { assetsDone++; return v; };
    const font = Promise.race([
      (document.fonts && document.fonts.load ? document.fonts.load('16px "Press Start 2P"') : Promise.resolve()).catch(() => {}),
      new Promise((r) => setTimeout(r, 2500)),
    ]).then(tick);
    const lv = [];
    for (let i = 1; i <= LEVEL_COUNT; i++) lv.push(loadScript('level' + i + '.js').then(tick));
    Promise.all([font].concat(lv)).then(() => { assetsReady = true; });
  }

  // ======================================================================
  // input
  // ======================================================================
  const kb = { left: false, right: false, jump: false };
  const touches = new Map();
  let jumpLatch = false;
  function held(n) {
    if (kb[n]) return true;
    for (const v of touches.values()) if (v === n) return true;
    return false;
  }
  function releaseAll() { kb.left = kb.right = kb.jump = false; touches.clear(); jumpLatch = false; }

  const hits = [];
  let hitN = 0, hitsOn = true, pressedId = '', pressedAt = -1000, now = 0;
  function addHit(x, y, w, h, id) {
    if (!hitsOn) return;
    let o = hits[hitN];
    if (!o) o = hits[hitN] = { x: 0, y: 0, w: 0, h: 0, id: '' };
    o.x = x; o.y = y; o.w = w; o.h = h; o.id = id;
    hitN++;
  }
  function hitAt(x, y) {
    for (let i = hitN - 1; i >= 0; i--) {
      const o = hits[i];
      if (x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) return o.id;
    }
    return null;
  }

  const CTRL = {
    left:  { x: 64,   y: 592, w: 166, h: 70 },
    right: { x: 294,  y: 592, w: 167, h: 70 },
    jump:  { x: 1050, y: 592, w: 166, h: 70 },
  };
  const ctrlR = { x: 0, y: 0, w: 0, h: 0 };
  function ctrlRect(name) {
    const b = CTRL[name];
    ctrlR.y = b.y; ctrlR.w = b.w; ctrlR.h = b.h;
    if (save.settings.left) {
      // swap sides: movement on the right, jump on the left
      ctrlR.x = W - (b.x + b.w);
    } else ctrlR.x = b.x;
    return ctrlR;
  }
  function ctrlAt(x, y) {
    let best = null, bd = 1e9;
    for (const n of ['left', 'right', 'jump']) {
      const r = ctrlRect(n);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const hw = r.w * 0.7, hh = r.h * 0.7;
      if (Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh) {
        const d = Math.abs(x - cx);
        if (d < bd) { bd = d; best = n; }
      }
    }
    return best;
  }

  const vp = { x: 0, y: 0 };
  function vpos(e) {
    vp.x = (e.clientX * dpr - offX) / scale;
    vp.y = (e.clientY * dpr - offY) / scale;
    return vp;
  }
  let fsTried = false;
  function firstTap() {
    ensureAudio();
    if (fsTried) return;
    fsTried = true;
    try {
      const el = document.documentElement;
      const rq = el.requestFullscreen || el.webkitRequestFullscreen;
      if (rq) { const p = rq.call(el); if (p && p.catch) p.catch(() => {}); }
      if (window.screen && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch (e) { /* ignore */ }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    firstTap();
    const p = vpos(e);
    onDown(e.pointerId, p.x, p.y);
  }, { passive: false });
  const onUp = (e) => { touches.delete(e.pointerId); };
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', releaseAll);
  window.addEventListener('orientationchange', releaseAll);
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump' };
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    ensureAudio();
    if (k) {
      e.preventDefault();
      if (!kb[k]) { kb[k] = true; if (k === 'jump') jumpLatch = true; }
      if (scene === 'level') run.keyUsed = true;
    } else if ((e.code === 'KeyP' || e.code === 'Escape') && scene === 'level' && !e.repeat) {
      if (run.state === 'play') act('pause'); else if (run.state === 'paused') act('resume');
    } else if (e.code === 'KeyR' && scene === 'level' && run.state === 'play' && !e.repeat) {
      act('restart');
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) { e.preventDefault(); kb[k] = false; }
  });

  function onDown(id, x, y) {
    if (T.active) return;
    const hid = hitAt(x, y);
    if (hid) {
      pressedId = hid; pressedAt = now;
      sfx.ui();
      act(hid);
      return;
    }
    if (scene === 'level' && run) {
      if (run.state === 'play') {
        const c = ctrlAt(x, y);
        if (c) {
          touches.set(id, c);
          if (c === 'jump') jumpLatch = true;
          run.keyUsed = true;
        }
      } else if (run.state === 'dead' && run.deadT > 4) {
        restartFast();
      }
    }
  }

  // ======================================================================
  // toast
  // ======================================================================
  const toastS = { text: '', t: 0 };
  function toast(s) { toastS.text = s; toastS.t = 1800; }
  function drawToast() {
    if (toastS.t <= 0) return;
    const a = Math.min(1, toastS.t / 300);
    ctx.globalAlpha = a;
    ctx.font = '16px ' + FONT;
    const w = Math.ceil(ctx.measureText(toastS.text).width) + 48;
    const x = Math.round((W - w) / 2);
    box(x, 628, w, 48, COL.maroon, COL.gold, 4);
    text(toastS.text, W / 2, 643, 16, COL.gold, 'center', false);
    ctx.globalAlpha = 1;
  }

  // ======================================================================
  // transition: spike jaw + devil eyes
  // ======================================================================
  const T = { active: false, t: 0, total: 0, close: 0, hold: 0, open: 0, cb: null, swapped: false };
  function startTransition(cb, fast) {
    if (T.active) return false;
    const d = fast ? 200 : 400;
    T.active = true; T.t = 0; T.cb = cb; T.swapped = false;
    T.close = d; T.hold = d; T.open = d; T.total = d * 3;
    return true;
  }
  function updateTransition() {
    T.t += STEP;
    if (!T.swapped && T.t >= T.close + T.hold) {
      T.swapped = true;
      const cb = T.cb; T.cb = null;
      if (cb) cb();
    }
    if (T.t >= T.total) { T.active = false; T.cb = null; }
  }
  

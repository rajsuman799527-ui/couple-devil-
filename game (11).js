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
    yellow: '#FFF35C', dark: '#3A0D05', spike: '#7A1A0A', tan: '#C8903A', panel: '#4A1306', ctrl: '#FEB954',
  };
  const WORLDS = {
    A:    { bg: '#986B06', plat: '#FEB954', edge: '#C97A12', crack: '#D98A1C', spike: '#7A1A0A', strip: '#CC9344' },
    B:    { bg: '#F9C84E', plat: '#E57F0E', edge: '#B85F08', crack: '#C96E0C', spike: '#7A1A0A', strip: '#E0A23A', dot: '#E8892B' },
    C:    { bg: '#E3C24A', plat: '#E26A1F', edge: '#B24E12', crack: '#C85A18', spike: '#D9531E', strip: '#D0A23A' },
    BOSS: { bg: '#3A0D05', plat: '#8A2E12', edge: '#5C1D0B', crack: '#6E2410', spike: '#FF4A1C', strip: '#5C1D0B' },
  };
  const PH = { RUN: 3.2, ACC: 1.0, FRIC: 1.3, GRAV: 0.55, JUMP: -10.5, MAXFALL: 12, COYOTE: 6, BUFFER: 6 };
  // feel tuning (can be overridden from feel.js): turn = extra braking when reversing direction,
  // airAcc / airFric = multipliers while in the air, net* = online input-delay settings
  const FEEL = { turn: 1.5, airAcc: 0.8, airFric: 0.45, netMin: 5, netMargin: 30, netExtra: 2 };
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
  // visible screen edges in virtual (1280x720) coordinates: vT < 0 / vB > H when the screen is taller than 16:9
  let vL = 0, vT = 0, vR = W, vB = H;

  function fit() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    scale = Math.min(canvas.width / W, canvas.height / H);
    offX = Math.floor((canvas.width - W * scale) / 2);
    offY = Math.floor((canvas.height - H * scale) / 2);
    vL = -offX / scale; vT = -offY / scale;
    vR = (canvas.width - offX) / scale; vB = (canvas.height - offY) / scale;
    ctrlCache.clear();
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
  // Silhouette sprites, 3 virtual px per cell. Standing = 5x13 (15x39), running = 9x11 (27x33).
  const IDLE = [
    '.###.', '.###.', '.###.',
    '#####', '#####', '#####', '#####', '#####', '#####', '#####',
    '##.##', '##.##', '##.##',
  ];
  const SPR = {
    idle: IDLE,
    idle2: IDLE,
    run1: [
      '...###...', '...###...', '...###...',
      '.######..', '.######..', '.######..', '.######..',
      '..#####..', '..#######', '#########', '####...##',
    ],
    run2: [
      '...###...', '...###...', '...###...',
      '.######..', '.######..', '.######..', '.######..',
      '..#####..', '.###.###.', '.##...##.', '##.....##',
    ],
    runA: [
      '.###.', '.###.', '.###.',
      '#####', '#####', '#####', '#####', '#####', '#####',
      '.####', '.####', '.###.', '..##.',
    ],
    runB: [
      '..###..', '..###..', '..###..',
      '.#####.', '.#####.', '.#####.', '.#####.', '.#####.',
      '.######', '.######', '.##..##', '##...##', '##.....',
    ],
    runB2: [
      '...###.', '...###.', '...###.',
      '..#####', '..#####', '..#####', '..#####', '..#####', '..#####', '..#####',
      '.###.##', '###..##', '.#...##',
    ],
    jump: [
      '#.###.#', '#.###.#', '#.###.#',
      '#######', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.',
      '.##.##.', '.##.##.', '##...##', '#.....#',
    ],
  };
  const SPR_U = 3;
  const sprCache = new Map();
  function sprite(name, color) {
    const key = name + color;
    let c = sprCache.get(key);
    if (!c) {
      const rows = SPR[name];
      c = document.createElement('canvas');
      c.width = rows[0].length * SPR_U; c.height = rows.length * SPR_U;
      const g = c.getContext('2d');
      g.fillStyle = color;
      for (let r = 0; r < rows.length; r++) for (let i = 0; i < rows[r].length; i++) if (rows[r][i] === '#') g.fillRect(i * SPR_U, r * SPR_U, SPR_U, SPR_U);
      sprCache.set(key, c);
    }
    return c;
  }
  function frameFor(p) {
    if (!p.onGround) return 'jump';
    if (Math.abs(p.vx) > 0.4) return RUN_POSES[((p.runT + 13) % 14)][0];
    return 'idle';
  }
  // running style (copied from the reference video): crouch-hop, stride, passing, stride
  const RUN_POSES = [];
  for (let i = 0; i < 14; i++) RUN_POSES.push(i < 5 ? ['run1', -9] : i < 8 ? ['runB2', -3] : i < 11 ? ['runA', 0] : ['runB', 0]);
  function runBob(p) {
    return (p.onGround && Math.abs(p.vx) > 0.4) ? RUN_POSES[((p.runT + 13) % 14)][1] : 0;
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
    dy += runBob(p);
    const fast = Math.abs(p.vx) > 2.4 || (!p.onGround && Math.abs(p.vx) > 1);
    if (false && fast && !p.inDoor) { // speed trail disabled (felt like sliding)
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
    ctx.drawImage(spr, -spr.width / 2, -spr.height);
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
  window.CD = {
    registerLevel(n, def) { LEVELS[n] = def; }, spike, drawSpike, W, H, PH, FEEL,
    // hooks used by online.js (friends / lobby)
    scene: () => scene,
    netSend: null, netRecv: (m) => netRecv(m), tapOnlineStart: () => tapDoor(currentLevel()),
    toast: (s) => toast(s),
    blip: () => sfx.ui(),
    inviteSound: () => sfx.invite(),
    getColor: () => save.color,
    setColor(c) { if (/^#[0-9a-fA-F]{6}$/.test(c)) { save.color = c; persist(); } },
    drawPreview(cv, color) {
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(sprite('idle', color), 0, 0, cv.width, cv.height);
    },
  };

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
    lv.push(loadScript('feel.js')); // optional tuning file (missing file is fine)
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

  // Reference layout (virtual px): buttons are 72 px tall, 28 px above the bottom edge of the SCREEN.
  const CTRL = {
    left:  { side: 'L', dx: 57,  w: 180 },
    right: { side: 'L', dx: 291, w: 177 },
    jump:  { side: 'R', dx: 60,  w: 175 },
  };
  const CTRL_H = 72, CTRL_BOT = 28;
  const ctrlR = { x: 0, y: 0, w: 0, h: 0 };
  function ctrlRect(name) {
    const b = CTRL[name];
    let x = b.side === 'L' ? vL + b.dx : vR - b.dx - b.w;
    if (save.settings.left) x = vL + vR - (x + b.w); // left-handed: mirror across the screen
    ctrlR.x = Math.round(x); ctrlR.y = Math.round(vB - CTRL_BOT - CTRL_H); ctrlR.w = b.w; ctrlR.h = CTRL_H;
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
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
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
  const onUp = (e) => { touches.delete(e.pointerId); if (e.type === 'pointerup') firstTap(); };
  window.addEventListener('touchend', () => firstTap(), { passive: true });
  window.addEventListener('click', () => firstTap());
  document.addEventListener('fullscreenchange', () => setTimeout(fit, 60));
  document.addEventListener('webkitfullscreenchange', () => setTimeout(fit, 60));
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', releaseAll);
  window.addEventListener('orientationchange', releaseAll);
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump' };
  const typing = (e) => !!(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName));
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    const k = KEYMAP[e.code];
    ensureAudio();
    if (k) {
      e.preventDefault();
      if (!kb[k]) { kb[k] = true; if (k === 'jump') jumpLatch = true; }
      if (scene === 'level') run.keyUsed = true;
    } else if (!NET.on && (e.code === 'KeyP' || e.code === 'Escape') && scene === 'level' && !e.repeat) {
      if (run.state === 'play') act('pause'); else if (run.state === 'paused') act('resume');
    } else if (!NET.on && e.code === 'KeyR' && scene === 'level' && run.state === 'play' && !e.repeat) {
      act('restart');
    }
  });
  window.addEventListener('keyup', (e) => {
    if (typing(e)) return;
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
  function teeth(y, dir, xo) {
    ctx.fillStyle = COL.spike;
    for (let x = Math.floor(vL / 32) * 32 + xo - 32; x < vR; x += 32) {
      for (let i = 0; i < 8; i++) {
        const w = 32 - i * 4;
        const rx = x + (32 - w) / 2;
        const ry = dir > 0 ? y + i * 4 : y - (i + 1) * 4;
        ctx.fillRect(rx, ry, w, 4);
      }
    }
  }
  function drawJaw(c) {
    if (c <= 0) return;
    const half = (vB - vT) / 2, edge = Math.round(c * (half - 8));
    rect(vL - 1, vT - 1, vR - vL + 2, edge + 1, COL.maroon);
    rect(vL - 1, vB - edge, vR - vL + 2, edge + 1, COL.maroon);
    teeth(vT + edge, 1, 0);
    teeth(vB - edge, -1, 16);
  }
  function eyeOpenAt(p) {
    if (p < 0.3) return ease(p / 0.3);
    if (p < 0.55) return 1;
    if (p < 0.68) return 1 - 0.9 * ((p - 0.55) / 0.13);
    if (p < 0.82) return 0.1 + 0.9 * ((p - 0.68) / 0.14);
    return 1;
  }
  const EYE = [
    '#........................................',
    '#........................................',
    '##.......................................',
    '.#.......................................',
    '.##......................................',
    '.##......................................',
    '.###.....................................',
    '..###....................................',
    '..####...................................',
    '...#####.................................',
    '...#######...............................',
    '...############......................###.',
    '....##################....#############..',
    '....###################################..',
    '.....#################################...',
    '.....#################################...',
    '......###############################....',
    '......###############################....',
    '.......#############################.....',
    '........############################.....',
    '........############################.....',
    '.........##########################......',
    '..........#########################......',
    '............######################.......',
    '..............###################........',
    '.................###############.........',
    '......................#########..........',
    '.........................................',
  ];
  const EYE_RUNS = EYE.map((row) => {
    const runs = []; let st = -1;
    for (let i = 0; i <= row.length; i++) {
      const on = i < row.length && row[i] === '#';
      if (on && st < 0) st = i;
      if (!on && st >= 0) { runs.push(st, i); st = -1; }
    }
    return runs;
  });
  function drawEyes(cx, cy, open, s) {
    s = s || 1;
    const cs = 20 / 3 * s, cols = 41, rows = EYE.length;
    const ys = Math.max(0.05, Math.min(1, open));
    const gap = 105 * s; // half distance between the two inner tips
    ctx.fillStyle = COL.orange;
    for (let r = 0; r < rows; r++) {
      const runs = EYE_RUNS[r];
      if (!runs.length) continue;
      const y0 = Math.round(cy + (r - rows / 2) * cs * ys);
      const y1 = Math.max(y0 + 1, Math.round(cy + (r + 1 - rows / 2) * cs * ys));
      for (let k = 0; k < runs.length; k += 2) {
        const c0 = runs[k], c1 = runs[k + 1];
        const lx0 = Math.round(cx - gap - cols * cs + c0 * cs), lx1 = Math.round(cx - gap - cols * cs + c1 * cs);
        ctx.fillRect(lx0, y0, lx1 - lx0, y1 - y0);
        const rx0 = Math.round(cx + gap + (cols - c1) * cs), rx1 = Math.round(cx + gap + (cols - c0) * cs);
        ctx.fillRect(rx0, y0, rx1 - rx0, y1 - y0);
      }
    }
  }
  const eyeCy = () => vT + (vB - vT) * 0.292;
  function drawTransition() {
    if (!T.active) return;
    const t = T.t;
    if (t < T.close) {
      drawJaw(ease(t / T.close));
    } else if (t < T.close + T.hold) {
      rect(vL - 1, vT - 1, vR - vL + 2, vB - vT + 2, COL.maroon);
      const mid = (vT + vB) / 2;
      teeth(Math.round(mid - 8), 1, 0); teeth(Math.round(mid + 8), -1, 16);
      drawEyes(W / 2, eyeCy(), eyeOpenAt((t - T.close) / T.hold), 1);
    } else {
      drawJaw(1 - ease((t - T.close - T.hold) / T.open));
    }
  }

  // ======================================================================
  // scenes
  // ======================================================================
  let scene = 'splash'; // splash | home | level
  let run = null;
  const ui = { modal: null };

  // ---- splash ----
  const splash = { t: 0, leaving: false };
  function updateSplash() {
    splash.t += STEP;
    if (!splash.leaving && splash.t >= 2500 && assetsReady) {
      splash.leaving = true;
      startTransition(() => { goHome(0, 0); });
    }
  }
  function renderSplash() {
    rect(vL - 1, vT - 1, vR - vL + 2, vB - vT + 2, COL.maroon);
    const t = splash.t;
    let open = 0;
    if (t > 400) open = ease((t - 400) / 400);
    drawEyes(W / 2, eyeCy(), open, 1);
    if (!assetsReady || t < 2500) {
      const pr = Math.min(1, assetsDone / assetsTotal);
      box(W / 2 - 160, 600, 320, 24, COL.maroon, COL.orange, 4);
      rect(W / 2 - 152, 608, Math.round(304 * pr / 8) * 8, 8, COL.orange);
    }
  }

  // ---- home ----
  const DOORS = [];
  (function () {
    const xs = [190, 300, 410, 520, 630, 740, 850, 960, 1060];
    for (let i = 0; i < 9; i++) DOORS.push({ x: xs[i], y: i % 2 === 0 ? 478 : 426, boss: false });
    DOORS.push({ x: 1150, y: 392, boss: true });
  })();
  const home = { t: 0, shown: 0, shake: [], spark: null };
  for (let i = 0; i <= LEVEL_COUNT; i++) home.shake[i] = 0;

  function goHome(shownFrom, sparkLevel) {
    netEnd();
    scene = 'home';
    run = null;
    ui.modal = null;
    releaseAll();
    clearParts();
    home.t = 0;
    home.shown = Math.min(shownFrom, save.totalDeaths);
    home.spark = sparkLevel ? { n: sparkLevel, t: 0 } : null;
  }

  function updateHome() {
    home.t++;
    for (let i = 1; i <= LEVEL_COUNT; i++) if (home.shake[i] > 0) home.shake[i] -= STEP;
    if (home.shown < save.totalDeaths && home.t % 5 === 0) { home.shown++; tone(500, 0.03, 'square', 0.02, 0); }
    if (home.spark) { home.spark.t++; if (home.spark.t > 90) home.spark = null; }
  }

  function makeIsland() {
    const Y0 = 270, HH = 340;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = HH; return c; };
    const spans = [];
    for (let y = 292; y < 560; y += 8) {
      const dy = (y + 4 - 420) / 130;
      if (Math.abs(dy) >= 1) continue;
      const hw = 560 * Math.sqrt(1 - dy * dy);
      const w1 = ((y * 37) % 5 - 2) * 8, w2 = ((y * 53) % 5 - 2) * 8;
      spans.push([y, Math.round((640 - hw + w1) / 8) * 8, Math.round((640 + hw - w2) / 8) * 8]);
    }
    const main = mk(), sil = mk();
    const g = main.getContext('2d');
    for (const [y, x1, x2] of spans) { g.fillStyle = '#C97A12'; g.fillRect(x1, y - Y0 + 24, x2 - x1, 8); }
    for (const [y, x1, x2] of spans) { g.fillStyle = '#F5A02B'; g.fillRect(x1, y - Y0, x2 - x1, 8); }
    // cracks (seeded)
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    g.fillStyle = '#D98A1C';
    for (let i = 0; i < 26; i++) {
      let cx = 160 + Math.floor(rnd() * 960), cy = 320 + Math.floor(rnd() * 200);
      for (let k = 0; k < 4; k++) {
        const horiz = rnd() < 0.6, len = 12 + Math.floor(rnd() * 16);
        if (horiz) { g.fillRect(cx, cy - Y0, len, 3); cx += len; } else { g.fillRect(cx, cy - Y0, 3, 10); cy += 10; }
      }
    }
    // crater
    g.fillStyle = '#8A4B12';
    g.fillRect(256, 520 - Y0, 56, 8); g.fillRect(248, 528 - Y0, 72, 8); g.fillRect(256, 536 - Y0, 56, 8);
    g.fillStyle = '#5A2F0A';
    g.fillRect(264, 524 - Y0, 40, 8); g.fillRect(272, 532 - Y0, 24, 8);
    const s = sil.getContext('2d');
    s.fillStyle = '#7D2410';
    for (const [y, x1, x2] of spans) s.fillRect(x1, y - Y0 + 24, x2 - x1, 16);
    for (const [y, x1, x2] of spans) s.fillRect(x1, y - Y0, x2 - x1, 8);
    return { main, sil, Y0 };
  }
  const island = makeIsland();

  const G_SKULL = ['.######.', '########', '#..##..#', '#..##..#', '########', '.######.', '.#.##.#.', '.#.##.#.'];
  const G_WRENCH = ['##....##', '##....##', '.##..##.', '..####..', '...##...', '...##...', '...##...', '..####..'];
  const G_BOOT = ['..###...', '..###...', '..###...', '..###...', '.####...', '#######.', '########', '########'];
  const G_VIDEO = ['........', '######..', '######.#', '######.#', '######..', '........'];
  const G_CHAT = ['########', '#......#', '#......#', '########', '..#.....', '..#.....'];
  const G_HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  const G_TICK = ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'];
  const G_NOADS = ['#......#', '##....##', '.##..##.', '..####..', '..####..', '.##..##.', '##....##', '#......#'];

  function button(label, x, y, w, h, id, size) {
    addHit(x, y, w, h, id);
    let s = 1;
    if (pressedId === id && now - pressedAt < 80) s = 0.95;
    ctx.save();
    if (s !== 1) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s); ctx.translate(-(x + w / 2), -(y + h / 2)); }
    box(x, y, w, h, COL.maroon, COL.gold, 2);
    text(label, x + w / 2, y + h / 2 - (size || 16) / 2, size || 16, COL.gold, 'center', false);
    ctx.restore();
  }
  function iconButton(x, y, id, grid, color) {
    addHit(x - 4, y - 4, 64, 64, id);
    let s = 1;
    if (pressedId === id && now - pressedAt < 80) s = 0.95;
    ctx.save();
    if (s !== 1) { ctx.translate(x + 28, y + 28); ctx.scale(s, s); ctx.translate(-(x + 28), -(y + 28)); }
    box(x, y, 56, 56, COL.maroon, COL.gold, 2);
    const gw = grid[0].length * 4, gh = grid.length * 4;
    drawGrid(grid, x + Math.round((56 - gw) / 2), y + Math.round((56 - gh) / 2), 4, color || COL.gold);
    ctx.restore();
  }
  function smallIsland(x, y, w, h) {
    rect(x + 8, y, w - 16, h, '#F5A02B');
    rect(x, y + 8, w, h - 16, '#F5A02B');
    rect(x + 8, y + h - 10, w - 16, 10, '#C97A12');
    rect(x, y + h - 18, 8, 10, '#C97A12'); rect(x + w - 8, y + h - 18, 8, 10, '#C97A12');
  }
  function arch(x, y, w, h, fill, outline) {
    rect(x - 2, y + 6, w + 4, h - 4, outline);
    rect(x + 6, y - 2, w - 12, 6, outline);
    rect(x + 2, y + 2, w - 4, 6, outline);
    rect(x, y + 8, w, h - 8, fill);
    rect(x + 8, y, w - 16, 4, fill);
    rect(x + 4, y + 4, w - 8, 4, fill);
  }

  function renderHome() {
    const bob = Math.round(Math.sin(home.t / 30));
    const sbob = Math.round(Math.sin(home.t / 50) * 2);
    rect(0, 0, W, H, COL.maroon);
    hitsOn = !ui.modal;

    text('COUPLE DEVIL', W / 2, 22 + bob, 48, COL.orange, 'center');

    ctx.drawImage(island.sil, 0, island.Y0 + 14 + sbob);
    ctx.drawImage(island.main, 0, island.Y0);

    const cur = currentLevel();
    // path trails
    ctx.fillStyle = '#D98A1C';
    for (let i = 0; i < 9; i++) {
      const a = DOORS[i], b = DOORS[i + 1];
      for (let k = 1; k <= 3; k++) {
        const f = k / 4;
        ctx.fillRect(Math.round(a.x + (b.x - a.x) * f - 3), Math.round(a.y + (b.y - a.y) * f - 3), 6, 6);
      }
    }
    // doors
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const n = i + 1, d = DOORS[i];
      const unlocked = n <= cur, done = !!(save.levels[n] && save.levels[n].completed);
      const sh = home.shake[n] > 0 ? Math.round(Math.sin(home.shake[n] / 25) * 5) : 0;
      const w = d.boss ? 44 : 32, h = d.boss ? 64 : 48;
      const dx = Math.round(d.x - w / 2) + sh, dy = d.y - h;
      addHit(d.x - 36, dy - 16, 72, h + 40, 'door:' + n);
      if (n === cur && !done) {
        const pulse = ((home.t >> 4) & 1) ? '#FFF7B0' : '#FFD84A';
        rect(dx - 6, dy - 4, w + 12, h + 10, pulse);
      }
      let fill, outline;
      if (d.boss) { fill = unlocked ? '#7A1A0A' : COL.dark; outline = unlocked ? '#FF4A1C' : '#1E0702'; }
      else if (n === cur) { fill = '#FFE45C'; outline = '#C97A12'; }
      else if (unlocked) { fill = '#F7B25A'; outline = '#C97A12'; }
      else { fill = '#8A4B12'; outline = '#5A2F0A'; }
      arch(dx, dy, w, h, fill, outline);
      if (d.boss) {
        rect(dx - 6, dy - 14, 8, 6, COL.dark); rect(dx - 10, dy - 22, 8, 10, COL.dark); rect(dx - 14, dy - 28, 6, 8, COL.dark);
        rect(dx + w - 2, dy - 14, 8, 6, COL.dark); rect(dx + w + 2, dy - 22, 8, 10, COL.dark); rect(dx + w + 8, dy - 28, 6, 8, COL.dark);
      } else {
        rect(dx + w - 10, dy + h / 2, 4, 4, outline);
      }
      text(String(n), d.x, d.y + 8, 8, '#FFE9B0', 'center', false);
      if (done) {
        drawGrid(G_TICK, d.x - 11, dy - 26, 3, COL.dark);
        drawGrid(G_TICK, d.x - 13, dy - 28, 3, '#FFE45C');
      } else if (n === cur) {
        const ay = dy - 34 + Math.round(Math.sin(home.t / 8) * 4);
        rect(d.x - 12, ay, 24, 4, '#FFE45C'); rect(d.x - 8, ay + 4, 16, 4, '#FFE45C'); rect(d.x - 4, ay + 8, 8, 4, '#FFE45C');
      }
      if (home.spark && home.spark.n === n) {
        const f = home.spark.t;
        for (let k = 0; k < 4; k++) {
          const ang = k * Math.PI / 2 + f / 10, r = 8 + f / 2.2;
          const sx = Math.round(d.x + Math.cos(ang) * r), sy = Math.round(dy + h / 2 + Math.sin(ang) * r);
          ctx.globalAlpha = Math.max(0, 1 - f / 90);
          rect(sx - 4, sy - 1, 8, 2, '#FFF7B0'); rect(sx - 1, sy - 4, 2, 8, '#FFF7B0');
        }
        ctx.globalAlpha = 1;
      }
    }

    // banner
    box(12, 232, 232, 76, '#F5C98A', '#C97A12', 4);
    const pn = window.CDOnline && window.CDOnline.partnerNames();
    if (pn) {
      text(pn[0], 128, 240, 14, '#8A4B12', 'center', false);
      drawGrid(G_HEART, 116, 262, 3, '#D02A1A');
      text(pn[1], 128, 282, 14, '#8A4B12', 'center', false);
    } else {
      text('WAITING', 128, 246, 16, '#8A4B12', 'center', false);
      text('FOR PARTNER', 128, 274, 16, '#8A4B12', 'center', false);
    }

    // top-left buttons
    button('EDITOR BETA', 16, 12, 272, 48, 'soon', 16);
    button('INFINITE LEVELS', 16, 68, 272, 48, 'soon', 16);

    // deaths island
    smallIsland(1000, 18, 124, 128);
    drawGrid(G_SKULL, 1030, 30, 8, '#BFBFC6');
    rect(1046, 62, 8, 8, '#F5A02B'); rect(1062, 62, 8, 8, '#F5A02B');
    text(String(home.shown), 1062, 104, 16, COL.dark, 'center', false);

    // settings + profile
    iconButton(1144, 10, 'settings', G_WRENCH);
    iconButton(1208, 10, 'profile', G_BOOT);

    // next world
    smallIsland(1128, 556, 140, 76);
    addHit(1160, 540, 80, 80, 'soon');
    box(1166, 566, 64, 44, '#7B3FC2', '#4A1F82', 4);
    rect(1190, 580, 8, 16, '#E8D5FF'); rect(1198, 584, 8, 8, '#E8D5FF'); rect(1206, 586, 4, 4, '#E8D5FF');

    // bottom right
    iconButton(1064, 650, 'soon', G_VIDEO);
    iconButton(1128, 650, 'soon', G_CHAT);
    iconButton(1192, 650, 'soon', G_NOADS);

    // lobby handle (right edge)
    addHit(1216, 330, 64, 80, 'lobby');
    box(1244, 344, 36, 52, COL.maroon, COL.orange, 4);
    rect(1252, 360, 20, 20, COL.orange); rect(1256, 364, 12, 12, COL.maroon); rect(1260, 368, 4, 4, COL.orange);

    hitsOn = true;
    if (ui.modal === 'settings') drawSettings();
  }

  function drawSettings() {
    rect(0, 0, W, H, 'rgba(20,4,0,0.6)');
    box(380, 150, 520, 420, COL.panel, COL.orange, 4);
    text('SETTINGS', W / 2, 176, 24, COL.orange, 'center');
    const s = save.settings;
    button('SOUND  ' + (s.sound ? 'ON' : 'OFF'), 430, 240, 420, 56, 'set_sound', 16);
    button('VIBRATION  ' + (s.vibration ? 'ON' : 'OFF'), 430, 312, 420, 56, 'set_vib', 16);
    button('LEFT HANDED  ' + (s.left ? 'ON' : 'OFF'), 430, 384, 420, 56, 'set_left', 16);
    button('BACK', 430, 480, 420, 56, 'set_back', 16);
  }

  // ---- actions (taps on registered buttons) ----
  function act(id) {
    if (id.indexOf('door:') === 0) { tapDoor(parseInt(id.slice(5), 10)); return; }
    switch (id) {
      case 'soon': toast('COMING SOON'); break;
      case 'settings': ui.modal = 'settings'; break;
      case 'lobby': if (window.CDOnline) window.CDOnline.toggle(); else toast('ONLINE NOT READY'); break;
      case 'profile': if (window.CDOnline) window.CDOnline.openProfile(); else toast('ONLINE NOT READY'); break;
      case 'set_back': ui.modal = null; break;
      case 'set_sound': save.settings.sound = !save.settings.sound; persist(); break;
      case 'set_vib': save.settings.vibration = !save.settings.vibration; persist(); vibrate(30); break;
      case 'set_left': save.settings.left = !save.settings.left; persist(); break;
      // level
      case 'pause': if (NET.on) { toast('NO PAUSE ONLINE'); break; }
        if (run && run.state === 'play') { run.state = 'paused'; releaseAll(); } break;
      case 'resume': case 'no': if (run && (run.state === 'paused' || run.state === 'confirm')) run.state = 'play'; break;
      case 'restart':
        if (NET.on) { toast('NO RESTART ONLINE'); break; }
        if (run && (run.state === 'paused' || run.state === 'play')) {
          run.state = 'restarting';
          startTransition(() => { resetAttempt(); }, true);
        }
        break;
      case 'quit': case 'yes': quitLevel(); break;
      case 'exit': if (run && run.state === 'play') { run.state = 'confirm'; releaseAll(); } break;
      default: break;
    }
  }

  function tapDoor(n) {
    if (T.active || scene !== 'home') return;
    if (n > currentLevel()) { home.shake[n] = 300; sfx.thud(); return; }
    if (!LEVELS[n]) { toast('COMING SOON'); return; }
    const on = window.CDOnline;
    if (on && on.partnerNames()) {
      if (on.role() !== 'host') { toast('HOST PICKS THE LEVEL'); return; }
      const c = on.colors(), rtt = on.rtt();
      // input delay (frames) from the measured round trip: half RTT + jitter margin + batching
      const d = rtt == null ? 12 : Math.max(FEEL.netMin, Math.min(30, Math.ceil((rtt / 2 + FEEL.netMargin) / STEP) + FEEL.netExtra));
      if (!c || !netSend({ t: 'start', n, c, d })) { toast('CONNECTING...'); return; }
      if (rtt != null) toast('PING ' + Math.round(rtt) + ' MS ' + (on.mode ? on.mode() : ''));
      NET.armed = true; NET.buf = {};
      startTransition(() => startOnline(n, 0, c, d), false);
      return;
    }
    startTransition(() => startLevel(n), false);
  }

  // ---- level runtime ----
  function newPlayer(sp, color) {
    return {
      x: sp.x - PW / 2, y: sp.y - PHGT, px: sp.x - PW / 2, py: sp.y - PHGT, w: PW, h: PHGT,
      vx: 0, vy: 0, onGround: false, facing: 1, coyote: 0, buf: 0, jumping: false, jumpT: 0,
      runT: 0, idleT: 0, dead: false, inDoor: false, doorT: 0, color: color || save.color,
    };
  }
  function startLevel(n) {
    run = {
      n, def: LEVELS[n], L: null, players: [], frame: 0, state: 'play', attempt: 0,
      sessionDeaths: 0, levelDeaths: 0, time: 0, deadT: 0, shakeT: 0, completeT: 0,
      deathsAtStart: save.totalDeaths, camX: 0, keyUsed: false, tutT: 0,
      tutorial: n === 1 && !save.tutorialDone,
    };
    scene = 'level';
    ui.modal = null;
    resetAttempt();
  }
  function resetAttempt() {
    if (!run) return;
    run.L = run.def.build();
    if (!run.L.worldW) run.L.worldW = W;
    run.players = [];
    if (NET.on) {
      const sp = run.L.spawns[0];
      run.players.push(newPlayer({ x: sp.x - 12, y: sp.y }, NET.col[0]));
      run.players.push(newPlayer({ x: sp.x + 12, y: sp.y }, NET.col[1]));
      NET.sent = NET.D; NET.pend = null;
    } else for (const sp of run.L.spawns) run.players.push(newPlayer(sp));
    run.frame = 0; run.attempt++; run.state = 'play'; run.deadT = 0; run.shakeT = 0;
    run.doorSink = 0; run.doorPhase = 0; run.doorWait = 0; run.endSink = 0;
    jumpLatch = false;
    clearParts();
  }
  function quitLevel() {
    if (!run || T.active) return;
    const from = run.deathsAtStart;
    if (NET.on) netSend({ t: 'quit' });
    run.state = 'leaving';
    startTransition(() => goHome(from, 0), false);
  }
  function restartFast() {
    if (!run || run.state !== 'dead' || T.active) return;
    run.state = 'restarting';
    startTransition(() => { resetAttempt(); }, true);
  }

  const apiObj = {
    players: null, frame: 0, sfx,
    carry(solid, dy) {
      const ps = this.players;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (p.dead || !p.onGround) continue;
        if (Math.abs(p.y + p.h - solid.y) <= 1.5 && p.x + p.w > solid.x && p.x < solid.x + solid.w) p.y += dy;
      }
    },
    kill() { killAll(); },
    shake(n) { run.shakeT = Math.max(run.shakeT, n); },
  };

  // ======================================================================
  // online co-op: deterministic lockstep. Both phones simulate BOTH players; only the
  // inputs travel (Supabase broadcast, sent by online.js). Input delay NET.D frames.
  // ======================================================================
  const NET = { on: false, armed: false, my: 0, col: ['#111111', '#FFFFFF'], D: 8, sent: 0, buf: {}, pend: null, stall: 0 };
  const localInp = () => ({ l: held('left'), r: held('right'), j: held('jump'), press: jumpLatch });
  const decode = (b) => ({ l: !!(b & 1), r: !!(b & 2), j: !!(b & 4), press: !!(b & 8) });
  function netSend(m) { return !!(window.CD && window.CD.netSend && window.CD.netSend(m)); }
  function netBuf(a) { return NET.buf[a] || (NET.buf[a] = [{}, {}]); }
  function netFlush() {
    if (NET.pend) { netSend({ t: 'in', p: NET.my, a: NET.pend.a, f: NET.pend.f, n: NET.pend.n, b: NET.pend.b }); NET.pend = null; }
  }
  function netSample(a, F) {
    const i = localInp();
    const bits = (i.l ? 1 : 0) | (i.r ? 2 : 0) | (i.j ? 4 : 0) | (i.press ? 8 : 0);
    jumpLatch = false;
    netBuf(a)[NET.my][F] = bits;
    const p = NET.pend;
    if (p && p.a === a && p.b === bits && p.n < 3 && p.f + p.n === F) { p.n++; if (p.n >= 3) netFlush(); }
    else { netFlush(); NET.pend = { a, f: F, n: 1, b: bits }; }
  }
  function netInputs(f) {
    const a = run.attempt;
    while (NET.sent <= f + NET.D) { netSample(a, NET.sent); NET.sent++; }
    const b = netBuf(a), x = f < NET.D ? 0 : b[0][f], y = f < NET.D ? 0 : b[1][f];
    if (x === undefined || y === undefined) { netFlush(); return null; }
    return [decode(x), decode(y)];
  }
  function netEnd() { NET.on = false; NET.armed = false; NET.buf = {}; NET.pend = null; NET.stall = 0; }
  function startOnline(n, my, cols, d) {
    NET.on = true; NET.armed = true; NET.my = my; NET.col = cols || NET.col; NET.stall = 0;
    NET.D = Math.max(FEEL.netMin, Math.min(30, d | 0 || 12));
    startLevel(n);
  }
  function netRecv(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'start') {
      if (scene === 'home' && !NET.on && !T.active && LEVELS[m.n]) {
        NET.armed = true; NET.buf = {};
        startTransition(() => startOnline(m.n, 1, m.c, m.d), false);
      }
    } else if (m.t === 'in' && NET.armed) {
      const b = netBuf(m.a | 0), o = m.p === 1 ? 1 : 0;
      for (let i = 0; i < (m.n | 0) && i < 8; i++) b[o][(m.f | 0) + i] = m.b | 0;
    } else if (m.t === 'quit' && NET.on && run && run.state !== 'leaving') {
      NET.on = false; toast('PARTNER LEFT'); quitLevel();
    }
  }

  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function moveAxis(p, L, axis, d) {
    if (d === 0) return;
    const n = Math.ceil(Math.abs(d) / 4), s = d / n;
    for (let i = 0; i < n; i++) {
      if (axis === 0) p.x += s; else p.y += s;
      for (let k = 0; k < L.solids.length; k++) {
        const sd = L.solids[k];
        if (sd.off || !overlaps(p, sd)) continue;
        if (axis === 0) {
          p.x = s > 0 ? sd.x - p.w : sd.x + sd.w;
          p.vx = 0;
        } else if (s > 0) {
          p.y = sd.y - p.h; p.onGround = true; p.vy = 0;
        } else {
          p.y = sd.y + sd.h; p.vy = 0;
        }
        return;
      }
    }
  }
  function unstick(p, L) {
    for (let k = 0; k < L.solids.length; k++) {
      const s = L.solids[k];
      if (s.off || !overlaps(p, s)) continue;
      const l = p.x + p.w - s.x, r = s.x + s.w - p.x, t = p.y + p.h - s.y, b = s.y + s.h - p.y;
      const m = Math.min(l, r, t, b);
      if (m === t) { p.y = s.y - p.h; p.vy = 0; p.onGround = true; }
      else if (m === b) { p.y = s.y + s.h; if (p.vy < 0) p.vy = 0; }
      else if (m === l) p.x = s.x - p.w;
      else p.x = s.x + s.w;
    }
  }

  function stepPlayer(p, L, inp) {
    p.px = p.x; p.py = p.y;
    const left = inp.l, right = inp.r;
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const air = !p.onGround;
    if (dir !== 0) {
      // reversing direction brakes hard, so turning around does not feel like ice
      const turning = (dir > 0 && p.vx < 0) || (dir < 0 && p.vx > 0);
      p.vx += dir * (PH.ACC * (air ? FEEL.airAcc : 1) + (turning ? FEEL.turn : 0));
      if (p.vx > PH.RUN) p.vx = PH.RUN;
      if (p.vx < -PH.RUN) p.vx = -PH.RUN;
      p.facing = dir;
    } else {
      const fr = PH.FRIC * (air ? FEEL.airFric : 1);
      if (p.vx > 0) p.vx = Math.max(0, p.vx - fr);
      else if (p.vx < 0) p.vx = Math.min(0, p.vx + fr);
    }

    if (inp.press) p.buf = PH.BUFFER; else if (p.buf > 0) p.buf--;
    if (p.onGround) p.coyote = PH.COYOTE; else if (p.coyote > 0) p.coyote--;
    if (p.buf > 0 && p.coyote > 0) {
      p.vy = PH.JUMP; p.jumping = true; p.jumpT = 0; p.buf = 0; p.coyote = 0; p.onGround = false;
      sfx.jump(); dust(p, 3);
    }
    if (p.jumping) {
      p.jumpT++;
      if (!inp.j && p.jumpT > 2 && p.vy < 0) { p.vy *= 0.5; p.jumping = false; }
      if (p.vy >= 0) p.jumping = false;
    }
    p.vy = Math.min(p.vy + PH.GRAV, PH.MAXFALL);
    const was = p.onGround, preVy = p.vy;
    moveAxis(p, L, 0, p.vx);
    p.onGround = false;
    moveAxis(p, L, 1, p.vy);
    if (!was && p.onGround && preVy > 3) { sfx.land(); dust(p, 4); }
    if (p.onGround && Math.abs(p.vx) > 2.5 && (run.frame & 7) === 0) dust(p, 1);
    if (Math.abs(p.vx) > 0.4) p.runT++; else { p.idleT++; p.runT = 0; }
  }

  function hurtBy(p, L) {
    if (p.y > H + 60 || p.x < -60 || p.x > L.worldW + 60) return true;
    for (let i = 0; i < L.hazards.length; i++) {
      const h = L.hazards[i].hit();
      if (h && overlaps(p, h)) return true;
    }
    return false;
  }
  // door troll: sinks into the floor when a player walks near, rises again a moment later
  function doorSinkStep() {
    const d = run.L.door;
    if (run.n !== 1 || run.doorPhase === 4) return;
    let near = false;
    for (const p of run.players) if (!p.dead && !p.inDoor && Math.abs(p.x + p.w / 2 - (d.x + d.w / 2)) < 170) near = true;
    if (run.doorPhase === 0 && near) { run.doorPhase = 1; sfx.thud(); }
    if (run.doorPhase === 1) { run.doorSink = Math.min(1, run.doorSink + 0.07); if (run.doorSink >= 1) { run.doorPhase = 2; run.doorWait = 0; } }
    else if (run.doorPhase === 2) { if (++run.doorWait > 70) run.doorPhase = 3; }
    else if (run.doorPhase === 3) { run.doorSink = Math.max(0, run.doorSink - 0.07); if (run.doorSink <= 0) run.doorPhase = 4; sfx.button(); }
  }
  function inDoorZone(p, d) {
    if (run && run.doorSink > 0.05) return false;
    const ox = Math.min(p.x + p.w, d.x + d.w) - Math.max(p.x, d.x);
    const oy = Math.min(p.y + p.h, d.y + d.h) - Math.max(p.y, d.y);
    return ox >= d.w * 0.5 && oy >= 20;
  }

  function killAll() {
    if (!run || run.state !== 'play') return; // processed once per attempt
    run.state = 'dead';
    run.deadT = 0; run.shakeT = 12;
    run.sessionDeaths++; run.levelDeaths++;
    save.totalDeaths++;
    const lv = save.levels[run.n] || (save.levels[run.n] = {});
    lv.deaths = (lv.deaths || 0) + 1;
    persist();
    for (const p of run.players) if (!p.dead) { p.dead = true; shatter(p); }
    sfx.death(); vibrate(30);
  }

  function stepPlay() {
    const L = run.L;
    let inps = null;
    if (NET.on) {
      inps = netInputs(run.frame);
      if (!inps) {
        if (++NET.stall > 600) { NET.on = false; toast('CONNECTION LOST'); quitLevel(); }
        return;
      }
      NET.stall = 0;
    }
    run.frame++; run.time += STEP;
    apiObj.players = run.players; apiObj.frame = run.frame;
    for (let pi = 0; pi < run.players.length; pi++) {
      const p = run.players[pi];
      if (p.dead) continue;
      if (p.inDoor) { p.doorT++; p.px = p.x; p.py = p.y; continue; }
      stepPlayer(p, L, inps ? inps[pi] : localInp());
    }
    jumpLatch = false;
    if (L.update) L.update(apiObj);
    if (run.state !== 'play') return;
    for (const p of run.players) {
      if (p.dead || p.inDoor) continue;
      unstick(p, L);
      if (hurtBy(p, L)) { killAll(); return; }
    }
    doorSinkStep();
    let allIn = true;
    for (const p of run.players) {
      if (!p.inDoor && inDoorZone(p, L.door)) { p.inDoor = true; p.doorT = 0; p.vx = 0; sfx.door(); }
      if (!p.inDoor || p.doorT < 20) allIn = false;
    }
    if (allIn) completeLevel();

    if (run.tutorial) {
      run.tutT += STEP;
      if (run.keyUsed || run.tutT > 4000) { run.tutorial = false; save.tutorialDone = true; persist(); }
    }
    if (L.worldW > W) {
      let mx = 0;
      for (const p of run.players) mx += p.x + p.w / 2;
      mx /= run.players.length;
      const target = Math.max(0, Math.min(L.worldW - W, mx - W / 2));
      run.camX += (target - run.camX) * 0.1;
    }
  }

  function completeLevel() {
    run.state = 'complete';
    run.completeT = 0;
    const lv = save.levels[run.n] || (save.levels[run.n] = {});
    lv.completed = true;
    lv.bestMs = lv.bestMs ? Math.min(lv.bestMs, run.time) : Math.round(run.time);
    persist();
    sfx.complete(); vibrate(60);
  }

  function updateLevel() {
    if (!run) return;
    if (run.shakeT > 0) run.shakeT--;
    updateParts();
    if (run.state === 'play') stepPlay();
    else if (run.state === 'dead') {
      run.deadT++;
      if (run.deadT >= 36) restartFast();
    } else if (run.state === 'complete') {
      run.completeT++;
      // finish: players are inside the door, then the door sinks into the floor, short pause, then the jaw transition
      if (run.completeT === 16) sfx.thud();
      if (run.completeT >= 16) run.endSink = Math.min(1, run.endSink + 1 / 14);
      if (run.completeT >= 60 && !T.active) {
        const from = run.deathsAtStart, n = run.n;
        run.state = 'leaving';
        startTransition(() => goHome(from, n < LEVEL_COUNT ? n + 1 : 0), false);
      }
    }
  }

  // ---- level drawing ----
  function drawSolid(s, w) {
    if (s.off) return;
    rect(s.x, s.y, s.w, s.h, w.plat); // flat colour like the reference
  }
  function drawGoalDoor(d) {
    const sink = run ? Math.max(run.doorSink || 0, run.endSink || 0) : 0;
    ctx.save();
    ctx.beginPath(); ctx.rect(d.x - 6, d.y - 10, d.w + 12, d.h + 10); ctx.clip(); // hidden below the floor line
    ctx.translate(0, Math.round(sink * (d.h + 4)));
    arch(d.x, d.y, d.w, d.h, '#C8C8C8', '#986B06');
    rect(d.x + d.w - 8, d.y + d.h / 2, 3, 3, '#986B06');
    ctx.restore();
  }

  function renderLevel(alpha) {
    const w = WORLDS[run.def.world] || WORLDS.A;
    const L = run.L;
    rect(vL - 1, vT - 1, vR - vL + 2, vB - vT + 2, w.bg);
    ctx.save();
    let sx = 0, sy = 0;
    if (run.shakeT > 0) { sx = Math.round((Math.random() * 2 - 1) * 4); sy = Math.round((Math.random() * 2 - 1) * 4); }
    ctx.translate(sx - Math.round(run.camX), sy);
    if (L.drawBack) L.drawBack(ctx, w);
    for (const s of L.solids) drawSolid(s, w);
    for (const h of L.hazards) if (h.type === 'spike') drawSpike(ctx, h.x, h.y, h.w, h.h, h.dir, w.spike, h.ext);
    drawGoalDoor(L.door);
    if (L.drawFront) L.drawFront(ctx, w);
    if (run.state !== 'complete') {
      for (const p of run.players) drawPlayer(p, alpha);
    }
    drawParts();
    ctx.restore();
    // letterbox areas: tan bars on top/bottom, world colour on the sides (covers anything drawn outside the stage)
    if (vT < -0.5) {
      rect(vL - 1, vT - 1, vR - vL + 2, -vT + 1, w.strip);
      rect(vL - 1, H, vR - vL + 2, vB - H + 1, w.strip);
    }
    if (vL < -0.5) { rect(vL - 1, 0, -vL + 1, H, w.bg); rect(W, 0, vR - W + 1, H, w.bg); }
    drawHUD(w);
  }

  // Control buttons are rasterised on a coarse pixel grid (2.5 virtual px per cell) so the
  // diagonal edges are stair-stepped like the reference. Cached per button / state.
  const ctrlCache = new Map();
  const CU = 2.5, CPAD = 4;
  function polyHas(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function ctrlImage(name, pressed) {
    const key = name + (pressed ? 'P' : 'U');
    let c = ctrlCache.get(key);
    if (c) return c;
    const wc = Math.round(CTRL[name].w / CU), hc = Math.round(CTRL_H / CU), tip = 9;
    let pts;
    if (name === 'left') pts = [[0, hc / 2], [tip, 0], [wc, 0], [wc, hc], [tip, hc]];
    else if (name === 'right') pts = [[wc, hc / 2], [wc - tip, 0], [0, 0], [0, hc], [wc - tip, hc]];
    else pts = [[0, 16], [wc / 2, 0], [wc, 16], [wc, hc], [0, hc]];
    const cw = wc + CPAD * 2, ch = hc + CPAD * 2;
    const m = new Uint8Array(cw * ch); // 1 = inside shape
    for (let j = 0; j < hc; j++) for (let i = 0; i < wc; i++) if (polyHas(pts, i + 0.5, j + 0.5)) m[(j + CPAD) * cw + i + CPAD] = 1;
    const R = 2; // outline thickness in cells
    const stroke = new Uint8Array(cw * ch);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      if (!m[j * cw + i]) continue;
      let edge = false;
      for (let dj = -R; dj <= R && !edge; dj++) for (let di = -R; di <= R; di++) {
        const jj = j + dj, ii = i + di;
        if (jj < 0 || ii < 0 || jj >= ch || ii >= cw || !m[jj * cw + ii]) { edge = true; break; }
      }
      if (edge) stroke[j * cw + i] = 1;
    }
    c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const body = pressed ? m : stroke;
    g.fillStyle = 'rgba(0,0,0,0.3)'; // drop shadow, down-left
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) if (body[j * cw + i]) g.fillRect(i - 2, j + 2, 1, 1);
    g.globalCompositeOperation = 'destination-out';
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) if (body[j * cw + i]) g.fillRect(i, j, 1, 1);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = COL.ctrl;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) if (body[j * cw + i]) g.fillRect(i, j, 1, 1);
    ctrlCache.set(key, c);
    return c;
  }
  function drawControl(name) {
    const r = ctrlRect(name), img = ctrlImage(name, held(name));
    ctx.drawImage(img, r.x - CPAD * CU, r.y - CPAD * CU, img.width * CU, img.height * CU);
  }

  const EXIT_GLYPH = [
    '....#################.', '....##################', '....##################',
    '....####..........####', '....###...........####', '..................####',
    '....####..........####', '....####..........####', '..#######.........####',
    '###########.......####', '....####..........####', '....####..........####',
    '....##################', '....##################', '....##################',
  ];
  function drawHUD(w) {
    hitsOn = run.state === 'play';
    const top = Math.round(vT) + 64;
    // pause (two bars) + exit, both with a dark bottom edge
    rect(vL + 24, top, 22, 58, '#6D1102'); rect(vL + 24, top + 51, 22, 7, '#2C0701');
    rect(vL + 60, top, 22, 58, '#6D1102'); rect(vL + 60, top + 51, 22, 7, '#2C0701');
    addHit(vL + 10, top - 12, 86, 82, 'pause');
    rect(vL + 105, top, 58, 58, '#6D1102'); rect(vL + 105, top + 51, 58, 7, '#2C0701');
    ctx.fillStyle = COL.yellow;
    for (let r = 0; r < EXIT_GLYPH.length; r++) {
      const row = EXIT_GLYPH[r];
      const y0 = Math.round(top + 8 + r * 2.5), y1 = Math.round(top + 8 + (r + 1) * 2.5);
      for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(vL + 109 + c * 2, y0, 2, y1 - y0);
    }
    addHit(vL + 100, top - 12, 76, 82, 'exit');
    // death boxes (top centre)
    for (let i = 0; i < 5; i++) {
      const x = W / 2 - 72 + i * 30;
      box(x, Math.round(vT) + 53, 24, 24, run.sessionDeaths > i ? '#000000' : w.bg, '#000000', 3);
    }
    hitsOn = true;
    if (run.state === 'dead') text('TAP TO RETRY', W / 2, Math.round(vT) + 96, 16, COL.yellow, 'center', true);

    drawControl('left'); drawControl('right'); drawControl('jump');
    if (!('ontouchstart' in window)) text('ARROWS / A D MOVE   SPACE JUMP   P PAUSE', W / 2, Math.round(vB) - 16, 8, '#6D1102', 'center', false);

    if (run.tutorial && run.state === 'play') {
      text('REACH THE DOOR', W / 2, Math.round(vT) + 130, 16, COL.yellow, 'center', true);
      const bounce = Math.round(Math.sin(run.frame / 8) * 4);
      for (const n of ['left', 'right', 'jump']) {
        const r = ctrlRect(n);
        text(n.toUpperCase(), r.x + r.w / 2, r.y - 52 + bounce, 8, COL.yellow, 'center', true);
        rect(r.x + r.w / 2 - 8, r.y - 34 + bounce, 16, 4, COL.yellow); rect(r.x + r.w / 2 - 4, r.y - 30 + bounce, 8, 4, COL.yellow);
      }
    }

    if (run.state === 'paused') {
      rect(0, 0, W, H, 'rgba(20,4,0,0.6)');
      box(380, 150, 520, 420, COL.panel, COL.orange, 4);
      text('PAUSED', W / 2, 176, 24, COL.orange, 'center');
      button('RESUME', 430, 250, 420, 56, 'resume', 16);
      button('RESTART', 430, 330, 420, 56, 'restart', 16);
      button('QUIT TO MAP', 430, 410, 420, 56, 'quit', 16);
    } else if (run.state === 'confirm') {
      rect(0, 0, W, H, 'rgba(20,4,0,0.6)');
      box(380, 200, 520, 300, COL.panel, COL.orange, 4);
      text('LEAVE LEVEL?', W / 2, 240, 24, COL.orange, 'center');
      button('YES', 430, 330, 190, 56, 'yes', 16);
      button('NO', 660, 330, 190, 56, 'no', 16);
    }
  }

  // ======================================================================
  // main loop (exactly one rAF loop, fixed 60 Hz physics, interpolated render)
  // ======================================================================
  let rafId = 0, lastT = 0, acc = 0;
  function update() {
    if (toastS.t > 0) toastS.t -= STEP;
    if (T.active) updateTransition();
    if (scene === 'splash') updateSplash();
    else if (scene === 'home') updateHome();
    else if (scene === 'level') updateLevel();
  }
  function render(alpha) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COL.maroon;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    ctx.imageSmoothingEnabled = false;
    hitN = 0; hitsOn = true;
    if (scene === 'splash') renderSplash();
    else if (scene === 'home') renderHome();
    else if (scene === 'level' && run) renderLevel(alpha);
    drawTransition();
    drawToast();
    ctx.restore();
  }
  function loop(t) {
    rafId = requestAnimationFrame(loop);
    now = t;
    let dt = t - lastT;
    lastT = t;
    if (dt > 50) dt = 50;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) { update(); acc -= STEP; steps++; }
    if (steps >= 5) acc = 0;
    render(acc / STEP);
  }
  function startLoop() {
    if (rafId) return;
    lastT = performance.now(); acc = 0;
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopLoop(); releaseAll();
      if (actx && actx.suspend) actx.suspend().catch(() => {});
      if (scene === 'level' && run && run.state === 'play' && !NET.on) run.state = 'paused';
    } else {
      if (actx && actx.resume) actx.resume().catch(() => {});
      startLoop();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (scene === 'level' && run && run.state !== 'leaving') { e.preventDefault(); e.returnValue = ''; }
  });
  window.addEventListener('resize', fit);

  // ======================================================================
  // boot
  // ======================================================================
  fit();
  loadAssets();
  startLoop();
})();

/* COUPLE DEVIL - online.js
 * Profile + UID, friends, invite popup, 2-slot lobby (Supabase, polling).
 * Loaded after game.js. If Supabase is not configured the game still works offline.
 */
(() => {
  'use strict';

  // ---- 1) PUT YOUR KEY HERE (Supabase > Project Settings > API > "anon public") ----
  // (now lives in config.js, so updating this file never touches your key)
  const CFG = window.CD_CONFIG || {};
  const SUPABASE_URL = CFG.SUPABASE_URL || '';
  const SUPABASE_KEY = CFG.SUPABASE_KEY || '';
  // ------------------------------------------------------------------------------

  const PROFILE_KEY = 'cd-profile-v1';
  const COLORS = ['#111111', '#FFFFFF', '#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#1E88E5', '#8E24AA', '#EC407A'];
  const BAD = ['fuck', 'shit', 'bitch', 'porn', 'nigg', 'cunt', 'dick', 'asshole', 'randi', 'chut', 'gand'];
  const UID_RE = /^CD-[A-Z0-9]{6}$/;
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;

  const CDg = () => window.CD || {};
  const toast = (s) => { if (CDg().toast) CDg().toast(s); };
  const blip = () => { if (CDg().blip) CDg().blip(); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const configured = !!(window.supabase && SUPABASE_KEY && SUPABASE_KEY.indexOf('PASTE') < 0);
  const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }) : null;

  // ---------- state ----------
  let me = null;               // { uid, name, color }
  let friends = [];            // from friend_list
  let invites = [];            // incoming pending invites
  let lobbyId = null, lobby = null, role = null; // role: 'host' | 'guest'
  let netBad = false;
  const sentAt = {};           // uid -> time of last invite
  const seenReq = new Set();
  let panelOpen = false;

  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (p && UID_RE.test(p.uid) && typeof p.name === 'string' && HEX_RE.test(p.color)) me = p;
  } catch (e) { /* ignore */ }

  // ---------- network helper (retry 3x with backoff, business errors are not retried) ----------
  async function q(fn) {
    let last = null;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fn();
        if (!r.error) { if (netBad) { netBad = false; } return r; }
        last = r.error;
        if (r.error.code) break; // real database answer, retrying will not help
      } catch (e) { last = e; }
      await sleep(200 * Math.pow(2, i));
    }
    if (!(last && last.code)) {
      if (!netBad) { netBad = true; toast('CONNECTION LOST - RETRYING...'); }
    }
    const err = new Error(last && last.message ? last.message : 'network');
    err.code = last && last.code;
    throw err;
  }

  // ---------- tiny DOM helpers (text always via textContent: no HTML injection from other players) ----------
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function btn(label, cls, fn) {
    const b = el('button', 'cd-btn ' + (cls || ''), label);
    b.type = 'button';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); blip(); fn(ev); });
    return b;
  }
  function validName(n) {
    n = n.replace(/\s+/g, ' ').trim();
    if (n.length < 1 || n.length > 12) return null;
    try { if (!/^[\p{L}\p{N}\p{Extended_Pictographic} ]+$/u.test(n)) return null; } catch (e) { if (!/^[A-Za-z0-9 ]+$/.test(n)) return null; }
    const low = n.toLowerCase();
    for (let i = 0; i < BAD.length; i++) if (low.indexOf(BAD[i]) >= 0) return null;
    return n;
  }
  function genUid() {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let s = 'CD-';
    for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }
  function copyText(t) {
    const done = () => toast('COPIED!');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done));
    } else fallbackCopy(t, done);
  }
  function fallbackCopy(t, done) {
    const i = document.createElement('textarea');
    i.value = t; document.body.appendChild(i); i.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('COPY FAILED'); }
    document.body.removeChild(i);
  }
  const partnerColor = () => {
    if (!lobby || !me) return null;
    const o = lobby.host.uid === me.uid ? lobby.guest : lobby.host;
    return o ? o.color.toLowerCase() : null;
  };

  // ---------- realtime channel (in-game inputs, broadcast only, nothing stored) ----------
  let ch = null, chId = null, chReady = false;
  const rtts = [];   // last round-trip times (ms) between the two phones
  function rtt() { return rtts.length < 2 ? null : rtts.slice().sort((a, b) => a - b)[Math.floor((rtts.length - 1) * 0.8)]; }
  function openNet() {
    if (!db || !lobbyId || (ch && chId === lobbyId)) return;
    closeNet();
    chId = lobbyId;
    ch = db.channel('cd-' + lobbyId, { config: { broadcast: { self: false, ack: false } } });
    ch.on('broadcast', { event: 'm' }, (e) => {
      const m = e.payload;
      if (m && m.t === 'ping') { window.CD.netSend({ t: 'pong', ts: m.ts }); return; }
      if (m && m.t === 'pong') { rtts.push(Date.now() - m.ts); if (rtts.length > 8) rtts.shift(); return; }
      if (window.CD && window.CD.netRecv) window.CD.netRecv(m);
    });
    ch.subscribe((st) => { chReady = st === 'SUBSCRIBED'; });
  }
  function closeNet() {
    if (ch) { try { db.removeChannel(ch); } catch (e) { /* ignore */ } }
    ch = null; chId = null; chReady = false; rtts.length = 0;
  }
  if (window.CD) window.CD.netSend = (m) => {
    if (!ch || !chReady) return false;
    try { ch.send({ type: 'broadcast', event: 'm', payload: m }); return true; } catch (e) { return false; }
  };

  // ---------- DOM skeleton ----------
  const root = el('div', null); root.id = 'cd-root';
  const back = el('div', 'cd-back'); back.style.display = 'none';
  const panel = el('div', 'cd-panel');
  const modal = el('div', 'cd-layer'); modal.style.display = 'none';
  const inviteLayer = el('div', 'cd-layer cd-invite'); inviteLayer.style.display = 'none';
  root.appendChild(back); root.appendChild(panel); root.appendChild(modal); root.appendChild(inviteLayer);
  document.body.appendChild(root);

  // static panel parts
  const head = el('div', 'cd-head');
  head.appendChild(el('div', 'cd-title', 'FRIENDS'));
  head.appendChild(btn('X', 'cd-x', () => closePanel()));
  const uidLabel = el('div', 'cd-small', 'MY UID');
  const uidRow = el('div', 'cd-row');
  const uidText = el('div', 'cd-uid', '--');
  uidRow.appendChild(uidText);
  uidRow.appendChild(btn('COPY', '', () => { if (me) copyText(me.uid); }));
  const addLabel = el('div', 'cd-small', 'ADD FRIEND');
  const addRow = el('div', 'cd-row');
  const addInput = el('input', 'cd-input'); addInput.placeholder = 'CD-XXXXXX'; addInput.maxLength = 9;
  addInput.autocomplete = 'off'; addInput.autocapitalize = 'characters'; addInput.spellcheck = false;
  addRow.appendChild(addInput);
  addRow.appendChild(btn('ADD', '', () => addFriend()));
  const reqBox = el('div', 'cd-box');
  const friendBox = el('div', 'cd-box');
  const lobbyBox = el('div', 'cd-box');
  [head, uidLabel, uidRow, addLabel, addRow, reqBox, friendBox, lobbyBox].forEach((n) => panel.appendChild(n));

  function openPanel() {
    if (!ready()) return;
    panelOpen = true; back.style.display = 'block';
    panel.classList.add('open');
    renderLists(); poll();
  }
  function closePanel() { panelOpen = false; back.style.display = 'none'; panel.classList.remove('open'); addInput.blur(); }
  back.addEventListener('click', closePanel);

  function ready() {
    if (!configured) { toast('ONLINE NOT SET UP YET'); return false; }
    if (!me) { openProfile(true); return false; }
    return true;
  }

  // ---------- profile modal ----------
  function openProfile(setup) {
    if (!configured) { toast('ONLINE NOT SET UP YET'); return; }
    if (!setup && !me) setup = true;
    closePanel();
    modal.textContent = '';
    modal.style.display = 'flex';
    const card = el('div', 'cd-card');
    card.appendChild(el('div', 'cd-title', setup ? 'ENTER YOUR NAME' : 'PROFILE'));
    const name = el('input', 'cd-input'); name.maxLength = 12; name.placeholder = 'YOUR NAME';
    name.value = me ? me.name : ''; name.autocomplete = 'off'; name.spellcheck = false;
    card.appendChild(name);
    if (!setup && me) {
      const r = el('div', 'cd-row');
      r.appendChild(el('div', 'cd-uid', me.uid));
      r.appendChild(btn('COPY', '', () => copyText(me.uid)));
      card.appendChild(r);
    }
    let color = me ? me.color : (CDg().getColor ? CDg().getColor() : '#111111');
    const sw = el('div', 'cd-swatches');
    const hex = el('input', 'cd-input cd-hex'); hex.maxLength = 7; hex.value = color; hex.spellcheck = false;
    const pv = el('canvas', 'cd-preview'); pv.width = 20; pv.height = 32;
    const drawPv = () => { if (CDg().drawPreview) CDg().drawPreview(pv, color); };
    const taken = (c) => partnerColor() === c.toLowerCase();
    const pick = (c) => {
      if (taken(c)) { toast('COLOUR TAKEN'); return; }
      color = c; hex.value = c; drawPv();
      Array.prototype.forEach.call(sw.children, (b) => b.classList.toggle('sel', b.dataset.c.toLowerCase() === c.toLowerCase()));
    };
    COLORS.forEach((c) => {
      const b = el('button', 'cd-sw'); b.type = 'button'; b.dataset.c = c; b.style.background = c;
      b.addEventListener('click', () => { blip(); pick(c); });
      sw.appendChild(b);
    });
    hex.addEventListener('input', () => { if (HEX_RE.test(hex.value)) pick(hex.value.toUpperCase()); });
    const mid = el('div', 'cd-row');
    mid.appendChild(pv); mid.appendChild(sw);
    card.appendChild(mid);
    card.appendChild(hex);
    pick(color);
    const row = el('div', 'cd-row');
    const go = btn(setup ? 'START' : 'SAVE', 'cd-big', async () => {
      const n = validName(name.value);
      if (!n) { toast('NAME: 1-12 LETTERS/NUMBERS'); return; }
      go.disabled = true;
      try {
        if (!me) await createProfile(n, color); else await saveProfile(n, color);
        modal.style.display = 'none';
        toast(setup ? 'WELCOME ' + n + '!' : 'SAVED');
        refreshUidText(); poll();
      } catch (e) {
        if (!netBad) toast('TRY AGAIN');
      }
      go.disabled = false;
    });
    row.appendChild(go);
    if (!setup) row.appendChild(btn('CLOSE', '', () => { modal.style.display = 'none'; }));
    card.appendChild(row);
    modal.appendChild(card);
  }

  async function createProfile(name, color) {
    for (let i = 0; i < 6; i++) {
      const uid = genUid();
      try {
        await q(() => db.from('players').insert({ uid, name, color }));
        me = { uid, name, color };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(me));
        if (CDg().setColor) CDg().setColor(color);
        return;
      } catch (e) { if (e.code !== '23505') throw e; } // duplicate uid -> try another
    }
    throw new Error('uid');
  }
  async function saveProfile(name, color) {
    await q(() => db.from('players').update({ name, color }).eq('uid', me.uid));
    me.name = name; me.color = color;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(me));
    if (CDg().setColor) CDg().setColor(color);
    if (lobby) refreshLobby();
  }
  function refreshUidText() { uidText.textContent = me ? me.uid : '--'; }

  // ---------- friends ----------
  async function addFriend() {
    if (!ready()) return;
    const v = addInput.value.trim().toUpperCase();
    if (!UID_RE.test(v)) { toast('INVALID UID'); return; }
    if (v === me.uid) { toast("THAT'S YOU!"); return; }
    const ex = friends.find((f) => f.uid === v);
    if (ex) {
      if (ex.status === 'accepted') { toast('ALREADY FRIENDS'); return; }
      if (ex.incoming) { acceptFriend(ex); return; }
      toast('REQUEST ALREADY SENT'); return;
    }
    try {
      const p = await q(() => db.from('players').select('uid').eq('uid', v).maybeSingle());
      if (!p.data) { toast('PLAYER NOT FOUND'); return; }
      await q(() => db.from('friends').insert({ a: me.uid, b: v }));
      toast('REQUEST SENT'); addInput.value = '';
      refreshFriends();
    } catch (e) { if (e.code === '23505') toast('REQUEST ALREADY SENT'); }
  }
  async function acceptFriend(f) {
    try {
      await q(() => db.from('friends').update({ status: 'accepted' }).eq('a', f.uid).eq('b', me.uid));
      toast('FRIENDS WITH ' + f.name); refreshFriends();
    } catch (e) { /* toast handled */ }
  }
  async function declineFriend(f) {
    try {
      await q(() => db.from('friends').delete().eq('a', f.uid).eq('b', me.uid));
      refreshFriends();
    } catch (e) { /* ignore */ }
  }
  async function refreshFriends() {
    const r = await q(() => db.rpc('friend_list', { p_uid: me.uid }));
    friends = r.data || [];
    friends.forEach((f) => {
      if (f.status === 'pending' && f.incoming && !seenReq.has(f.uid)) { seenReq.add(f.uid); toast('FRIEND REQUEST: ' + f.name); }
    });
    renderLists();
  }

  // ---------- lobby ----------
  async function ensureHostLobby() {
    if (lobbyId && role === 'host') return;
    if (lobbyId && role === 'guest') throw new Error('guest');
    const ex = await q(() => db.from('lobbies').select('id').eq('host_uid', me.uid).limit(1));
    if (ex.data && ex.data.length) lobbyId = ex.data[0].id;
    else {
      const ins = await q(() => db.from('lobbies').insert({ host_uid: me.uid }).select('id').single());
      lobbyId = ins.data.id;
    }
    role = 'host';
    lobby = { host: { uid: me.uid, name: me.name, color: me.color }, guest: null };
  }
  async function sendInvite(f) {
    if (!f.online) { toast(f.name + ' IS OFFLINE'); return; }
    if (role === 'guest') { toast('ONLY HOST CAN INVITE'); return; }
    if (lobby && lobby.guest) { toast('LOBBY FULL'); return; }
    if (sentAt[f.uid] && Date.now() - sentAt[f.uid] < 60000) { toast('ALREADY INVITED'); return; }
    try {
      await ensureHostLobby();
      await q(() => db.from('invites').insert({ from_uid: me.uid, to_uid: f.uid, lobby_id: lobbyId }));
      sentAt[f.uid] = Date.now();
      toast('INVITE SENT TO ' + f.name);
      renderLists();
    } catch (e) { /* toast handled */ }
  }
  async function refreshLobby() {
    if (!lobbyId) {
      const g = await q(() => db.from('lobbies').select('id,host_uid,guest_uid').or('host_uid.eq.' + me.uid + ',guest_uid.eq.' + me.uid).limit(1));
      if (g.data && g.data.length) { lobbyId = g.data[0].id; role = g.data[0].host_uid === me.uid ? 'host' : 'guest'; } else { lobby = null; return; }
    }
    const r = await q(() => db.rpc('lobby_state', { p_id: lobbyId }));
    const d = r.data && r.data[0];
    if (!d) { if (role === 'guest') toast('LOBBY CLOSED'); resetLobby(); return; }
    if (role === 'guest' && d.guest_uid !== me.uid) { toast('YOU LEFT THE LOBBY'); resetLobby(); return; }
    const had = lobby && lobby.guest ? lobby.guest.uid : null;
    lobby = {
      host: { uid: d.host_uid, name: d.host_name, color: d.host_color },
      guest: d.guest_uid ? { uid: d.guest_uid, name: d.guest_name, color: d.guest_color } : null,
    };
    if (role === 'host') {
      if (lobby.guest && !had) { toast(lobby.guest.name + ' JOINED!'); if (CDg().inviteSound) CDg().inviteSound(); }
      if (!lobby.guest && had) toast('PARTNER LEFT');
    }
    // two players cannot share a colour: the guest shifts
    if (role === 'guest' && lobby.guest && lobby.host.color.toLowerCase() === lobby.guest.color.toLowerCase()) {
      const free = COLORS.find((c) => c.toLowerCase() !== lobby.host.color.toLowerCase());
      try { await saveProfile(me.name, free); toast('COLOUR CHANGED'); } catch (e) { /* ignore */ }
    }
    if (lobby.guest) openNet(); else closeNet();
    renderLists();
  }
  function resetLobby() { closeNet(); lobbyId = null; lobby = null; role = null; renderLists(); }
  async function leaveLobby() {
    if (!lobbyId) return;
    try {
      if (role === 'guest') await q(() => db.from('lobbies').update({ guest_uid: null }).eq('id', lobbyId).eq('guest_uid', me.uid));
      else await q(() => db.from('lobbies').delete().eq('id', lobbyId));
    } catch (e) { return; }
    resetLobby();
  }
  async function kickGuest() {
    if (role !== 'host' || !lobbyId) return;
    try { await q(() => db.from('lobbies').update({ guest_uid: null }).eq('id', lobbyId)); } catch (e) { return; }
    toast('PARTNER KICKED'); refreshLobby();
  }

  // ---------- invite popup (partner side) ----------
  let shownInvite = null;
  async function refreshInvites() {
    const r = await q(() => db.rpc('pending_invites', { p_uid: me.uid }));
    invites = r.data || [];
    updateInvitePopup();
    // answers to invites I sent
    const s = await q(() => db.from('invites').select('id,to_uid,status').eq('from_uid', me.uid).in('status', ['declined', 'expired']));
    if (s.data && s.data.length) {
      for (const i of s.data) {
        const f = friends.find((x) => x.uid === i.to_uid);
        toast((f ? f.name : 'PLAYER') + (i.status === 'declined' ? ' DECLINED' : ': INVITE EXPIRED'));
        delete sentAt[i.to_uid];
        db.from('invites').delete().eq('id', i.id).then(() => {}, () => {});
      }
    }
  }
  function hideInvite() { inviteLayer.style.display = 'none'; inviteLayer.textContent = ''; shownInvite = null; }
  function updateInvitePopup() {
    const home = CDg().scene && CDg().scene() === 'home';
    const cur = invites[0];
    if (!cur || !home || !me || (role === 'host' && lobby && lobby.guest) || (lobbyId && cur.lobby_id === lobbyId)) {
      if (shownInvite) hideInvite();
      return;
    }
    if (shownInvite && shownInvite.id === cur.id) return;
    hideInvite();
    shownInvite = cur;
    const card = el('div', 'cd-card cd-pulse');
    card.appendChild(el('div', 'cd-title', cur.from_name));
    card.appendChild(el('div', 'cd-title', 'INVITED YOU!'));
    const row = el('div', 'cd-row');
    row.appendChild(btn('JOIN', 'cd-big', () => joinInvite(cur)));
    row.appendChild(btn('DECLINE', '', () => declineInvite(cur)));
    card.appendChild(row);
    inviteLayer.appendChild(card);
    inviteLayer.style.display = 'flex';
    if (CDg().inviteSound) CDg().inviteSound();
  }
  async function joinInvite(inv) {
    hideInvite(); invites = invites.filter((i) => i.id !== inv.id);
    try {
      const r = await q(() => db.rpc('join_lobby', { p_uid: me.uid, p_lobby: inv.lobby_id, p_invite: inv.id }));
      if (r.data === 'OK') { lobbyId = inv.lobby_id; role = 'guest'; toast('JOINED ' + inv.from_name + '!'); await refreshLobby(); }
      else if (r.data === 'FULL') toast('LOBBY FULL');
      else if (r.data === 'BUSY') toast('LEAVE YOUR LOBBY FIRST');
      else toast('LOBBY CLOSED');
    } catch (e) { /* toast handled */ }
  }
  async function declineInvite(inv) {
    hideInvite(); invites = invites.filter((i) => i.id !== inv.id);
    try { await q(() => db.from('invites').update({ status: 'declined' }).eq('id', inv.id)); } catch (e) { /* ignore */ }
  }

  // ---------- render panel lists ----------
  function renderLists() {
    if (!panelOpen) return;
    const incoming = friends.filter((f) => f.status === 'pending' && f.incoming);
    const outgoing = friends.filter((f) => f.status === 'pending' && !f.incoming);
    const accepted = friends.filter((f) => f.status === 'accepted');

    reqBox.textContent = '';
    if (incoming.length || outgoing.length) {
      reqBox.appendChild(el('div', 'cd-small', 'REQUESTS'));
      incoming.forEach((f) => {
        const r = el('div', 'cd-row'); r.appendChild(dot(f.color)); r.appendChild(el('div', 'cd-name', f.name));
        r.appendChild(btn('OK', '', () => acceptFriend(f)));
        r.appendChild(btn('NO', '', () => declineFriend(f)));
        reqBox.appendChild(r);
      });
      outgoing.forEach((f) => {
        const r = el('div', 'cd-row'); r.appendChild(dot(f.color)); r.appendChild(el('div', 'cd-name', f.name));
        r.appendChild(el('div', 'cd-status', 'PENDING'));
        reqBox.appendChild(r);
      });
    }

    friendBox.textContent = '';
    friendBox.appendChild(el('div', 'cd-small', 'FRIENDS'));
    if (!accepted.length) friendBox.appendChild(el('div', 'cd-empty', 'NO FRIENDS YET - SHARE YOUR UID'));
    accepted.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    accepted.forEach((f) => {
      const r = el('div', 'cd-row'); r.appendChild(dot(f.color)); r.appendChild(el('div', 'cd-name', f.name));
      r.appendChild(el('div', 'cd-status ' + (f.online ? 'on' : ''), f.online ? 'ONLINE' : 'OFFLINE'));
      const full = role === 'guest' || (lobby && lobby.guest);
      const b = btn('INVITE', '', () => sendInvite(f));
      if (!f.online || full) b.disabled = true;
      r.appendChild(b);
      friendBox.appendChild(r);
    });

    lobbyBox.textContent = '';
    lobbyBox.appendChild(el('div', 'cd-small', 'LOBBY'));
    const host = lobby ? lobby.host : (me ? { name: me.name, color: me.color } : null);
    const guest = lobby ? lobby.guest : null;
    const s1 = el('div', 'cd-slot'); s1.appendChild(el('span', 'cd-tag', 'HOST'));
    if (host) { s1.appendChild(dot(host.color)); s1.appendChild(el('span', 'cd-name', host.name)); }
    const s2 = el('div', 'cd-slot'); s2.appendChild(el('span', 'cd-tag', 'PARTNER'));
    if (guest) { s2.appendChild(dot(guest.color)); s2.appendChild(el('span', 'cd-name', guest.name)); } else s2.appendChild(el('span', 'cd-status', 'EMPTY'));
    lobbyBox.appendChild(s1); lobbyBox.appendChild(s2);
    const acts = el('div', 'cd-row');
    if (role === 'host' && guest) {
      acts.appendChild(btn('START', 'cd-big', () => {
        if (!chReady) { toast('CONNECTING...'); return; }
        closePanel();
        if (window.CD && window.CD.tapOnlineStart) window.CD.tapOnlineStart();
      }));
      acts.appendChild(btn('KICK', '', kickGuest));
    } else if (role === 'guest') {
      acts.appendChild(el('div', 'cd-status', 'WAITING FOR HOST'));
      acts.appendChild(btn('LEAVE', '', leaveLobby));
    } else if (lobbyId) {
      acts.appendChild(btn('CLOSE LOBBY', '', leaveLobby));
    }
    lobbyBox.appendChild(acts);
    const one = btn('PLAY ON ONE PHONE', '', () => toast('COMING SOON'));
    lobbyBox.appendChild(one);
  }
  function dot(c) { const d = el('span', 'cd-dot'); d.style.background = HEX_RE.test(c) ? c : '#111'; return d; }

  // ---------- timers ----------
  let tickN = 0, polling = false;
  async function poll() {
    if (!db || !me || polling) return;
    polling = true;
    try {
      await refreshFriends();
      await Promise.all([refreshInvites(), refreshLobby()]);
    } catch (e) { /* q() already told the player */ }
    polling = false;
  }
  setInterval(() => {
    if (!db) return;
    // first launch: show the profile card once the home map is up
    if (!me && modal.style.display === 'none' && CDg().scene && CDg().scene() === 'home') openProfile(true);
    if (!me) return;
    tickN++;
    if (chReady && role === 'host' && window.CD && window.CD.scene() === 'home') window.CD.netSend({ t: 'ping', ts: Date.now() });
    if (tickN % 3 === 0) q(() => db.rpc('heartbeat', { p_uid: me.uid })).catch(() => {});
    if (tickN % (document.hidden ? 10 : 2) === 0) poll();
    // leaving the home map closes the panel and any invite popup
    if (CDg().scene && CDg().scene() !== 'home') { if (panelOpen) closePanel(); if (shownInvite) hideInvite(); }
  }, 1000);

  // returning player: make sure the profile still exists on the server
  if (db && me) {
    q(() => db.from('players').upsert({ uid: me.uid, name: me.name, color: me.color }, { onConflict: 'uid' }))
      .then(() => { if (CDg().setColor) CDg().setColor(me.color); refreshUidText(); poll(); }, () => {});
  }
  refreshUidText();

  window.CDOnline = {
    toggle() { if (panelOpen) closePanel(); else openPanel(); },
    openProfile() { openProfile(false); },
    partnerNames() { return lobby && lobby.guest ? [lobby.host.name, lobby.guest.name] : null; },
    role() { return role; },
    rtt() { return rtt(); },
    colors() { return lobby && lobby.guest ? [lobby.host.color, lobby.guest.color] : null; },
  };
})();

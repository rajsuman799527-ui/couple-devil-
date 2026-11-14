/* COUPLE DEVIL - feel.js (tuning file)
 * game.js loads this automatically. Change numbers here to adjust how the game feels,
 * no need to touch game.js. Upload it to the repo next to game.js.
 * IMPORTANT: online mode needs the SAME values on both phones (same deployed files).
 */
(function () {
  'use strict';
  const CD = window.CD;
  if (!CD || !CD.PH || !CD.FEEL) return;

  // ---- movement (60 physics frames per second) --------------------------------
  // RUN / JUMP / GRAV are NOT changed here on purpose: the levels are built around them.
  Object.assign(CD.PH, {
    ACC: 1.0,   // ground acceleration per frame. 1.0 = full speed in ~3 frames (old: 0.5 = ~6 frames)
    FRIC: 1.3,  // ground braking when you let go. 1.3 = stops in ~3 frames (old: 0.6 = ~5 frames)
  });
  Object.assign(CD.FEEL, {
    turn: 1.5,     // extra braking when you reverse direction. Higher = sharper turns. 0 = old icy feel
    airAcc: 0.8,   // air steering strength (1 = same as ground)
    airFric: 0.45, // air drag when no key is held (1 = same as ground, lower = floatier)
  });
  // Want it even snappier? Try ACC 1.6, FRIC 2.0, turn 2.5.
  // Want it more floaty/classic? Try ACC 0.6, FRIC 0.8, turn 0.5.

  // ---- online input delay -----------------------------------------------------
  // Online is lockstep: BOTH characters run ~delay frames behind your finger.
  // delay = ceil((ping/2 + netMargin) / 16.7) + netExtra   (never below netMin)
  // Lower numbers = more responsive, but the game freezes more if the network is jittery.
  Object.assign(CD.FEEL, {
    netMin: 5,      // minimum delay in frames (1 frame = 16.7 ms)
    netMargin: 30,  // safety margin in ms
    netExtra: 2,    // extra frames (needed because inputs are sent in small batches)
  });
})();

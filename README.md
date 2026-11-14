# Couple Devil

A pixel-art troll platformer for two. Runs in the browser, full-screen 16:9 landscape. No build step.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page shell, loads the pixel font |
| `style.css` | Full-screen canvas + "rotate your phone" screen |
| `game.js` | Engine: loop, physics, controls, home map, transitions, sound |
| `level1.js` ... `level10.js` | One file per level (added one by one) |

All files go in the **same folder** (no sub-folders). To add a level, just upload the next `levelN.js`.

## Controls

- Touch: LEFT, RIGHT and JUMP buttons (multitouch)
- Keyboard: Arrow keys or A / D to move, Space / W / Up to jump, P to pause, R to restart

## Publish on GitHub Pages

1. New repo `couple-devil` (Public)
2. Upload all files
3. Settings > Pages > Deploy from a branch > `main` / `(root)` > Save
4. Open `https://<username>.github.io/couple-devil/` on your phone in landscape

## Progress

- [x] Engine, home map, settings, pause, death/restart, transitions, sound
- [x] Level 1
- [ ] Levels 2 to 10
- [ ] Profile + UID, friends, lobby, invites, online co-op (needs a backend)
- [ ] Play on one phone (2 players)
- [ ] 

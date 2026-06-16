# Development notes

This file is a compact handoff for future go2town development. See the README for player-facing overview and `docs/ADMIN_BOOKMARKS.md` for the hidden bookmark workflow.

## Current architecture

- The app is static browser code served by `server.py` or any local HTTP server.
- Runtime entry point: `public/js/game.js`.
- The default world provider is `pano360` in `public/js/core/providers/pano360.js`.
- Pano graph data is generated into `public/js/data/comaruga.scenes.generated.js`; do not edit it by hand.
- Mission definitions are in `public/js/data/comaruga.missions.js`.
- Future room launch lives behind `public/js/core/subgames.js`.
- The OpenStreetMap context panel lives in `public/js/core/osmMap.js`; its transparent click layer maps a tap to lat/lng and asks the world provider to jump to the nearest playable pano.
- Hidden admin bookmarking lives in `public/js/core/admin.js`.

## Route and movement rules

The first-person route controls intentionally follow camera heading:

- `W` / `ArrowUp`: choose the safe adjacent pano closest to the current view heading.
- `S` / `ArrowDown`: choose the safe adjacent pano closest to the opposite heading.
- `A/D` and left/right arrows turn the camera.

Keep these invariants when editing `pano360.js`:

- Candidate moves must be from vetted safe links first.
- Do not jump across graph gaps to satisfy heading intent.
- If several safe links point almost the same way, keep the nearest one so movement does not skip captures.
- Hotspot rendering should show one visible route marker per angular branch, not stacked duplicates.
- Preserve the current view heading across scene hops unless the player explicitly turns.

The smoke test has assertions for view-relative movement; extend those assertions if movement rules change.

Current local fixture density:

- Dataset: `coma-ruga-google-street-view-expanded-continuous-chain-targeted-densified`
- Unique panos: **258** / side captures: **1,032**
- Playable route: **86** contiguous panos, segment `2`
- Playable route max hop: **53.5 m**; adjacent-route p90 is about **21 m** across the full densified chain
- Two non-playable provider coverage gaps remain above the 60 m continuity gate; keep them split rather than bridging them in runtime movement.

Movement timing in `public/js/config.js` is tuned for the densified route's ~20 m typical pano spacing. If the fixture is regenerated with much sparser data, revisit `CONFIG.move.refMeters`, `hopBaseMs`, and `fadeMs` together.

## OSM drop-pin teleport

`osmMap.js` deliberately keeps the iframe as the real OpenStreetMap export and places a transparent button over it. A click/tap is converted from screen coordinates to the current OSM bbox (`renderedBounds`), then calls `world.jumpToNearest(pos, { playableOnly: true })`.

Provider-side contract:

- `Pano360World.nearestScene(pos, { playableOnly })` returns the closest scene, preferring `scene.playable` captures when available.
- `Pano360World.jumpToScene(sceneId, { faceHeading })` stops active driving and loads that pano without inventing a synthetic route edge.
- `Pano360World.jumpToNearest(pos, ...)` is what the map overlay uses; the returned distance is only used for status text.

Keep drops snapped to playable panos by default. Do not let an OSM click bypass the continuity-vetted playable segment unless a future admin-only workflow explicitly requests non-playable captures.

## Mission grounding

Current missions use route checkpoints rather than generated named POIs. This avoids teaching or displaying hallucinated place names.

Rules of thumb:

- Use generic spoken mission copy when uncertain: "walk for ice cream", "walk for bread".
- Use the OSM corner map as context, not as an automatically trusted mission source.
- Only introduce a named business in spoken/player-facing content after manual verification.
- Keep learner UI icon/audio-first. Developer/admin panels may use text.

## Admin bookmarks to production data

Use admin mode (`q23r-` as the player name) to bookmark exact route spots. Exported bookmark JSON is a staging artifact, not production data by itself.

Productionization checklist:

1. Verify the bookmark's `sceneId` exists in `GENERATED.scenes`.
2. Verify the scene is still `playable`.
3. Decide whether the mission should pin the exported `target` or follow a `routeIndex`.
4. Add/update a mission in `public/js/data/comaruga.missions.js`.
5. If the bookmark has a room, register the `subgame` id in `public/js/core/subgames.js` when the room exists.
6. Re-run smoke tests.
7. Keep the exported JSON somewhere tracked only if it remains useful as fixture/source material.

## Regeneration commands

After changing Street View fixture data or route graph tuning:

```bash
python scripts/build_scenes.py --write --check
python scripts/osm_lookup.py
python scripts/validate_continuity.py
```

After changing JS behavior:

```bash
node --check public/js/game.js
node --check public/js/core/admin.js
node --check public/js/core/providers/pano360.js
node --check scripts/smoke.mjs
node --check scripts/shot.mjs
```

Browser smoke setup:

Use `server.py` instead of a plain static server; the smoke flow needs `/imagery/` fixture routing and `/api/tts`.

```bash
python server.py --port 8082 --host 127.0.0.1
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
  --user-data-dir=/tmp/go2town-chrome http://127.0.0.1:8082/
node scripts/smoke.mjs http://127.0.0.1:8082/ 9222
```

Optional screenshots:

```bash
node scripts/shot.mjs http://127.0.0.1:8082/ 9222
```

## Smoke coverage to preserve

`scripts/smoke.mjs` should keep checking:

- start gate hides after trusted click
- Pannellum world and route hotspots render
- OSM iframe/link point at `openstreetmap.org`
- OSM panel expands/collapses/restores
- OSM click/drop snaps to the nearest playable pano and updates the active scene
- learner name flow activates a mission HUD
- route movement is view-relative
- progress advances after walking
- `q23r-` opens admin mode
- admin mode hides HUD
- admin bookmark creation persists to localStorage
- admin export includes scene id, finite lat/lng, mission draft, and subgame metadata

## Files generated by test tooling

`scripts/shot.mjs` creates PNG screenshots in `scripts/`:

- `01-world.png`
- `01-map-expanded.png`
- `01-map-collapsed.png`
- `02-name.png`
- `03-mission.png`
- `04-walked.png`
- `05-admin-bookmark.png`

These are useful visual QA artifacts. Decide per commit whether they should be tracked or treated as temporary output.

## Windows/Git Bash notes

On this development machine, commands are commonly run from Git Bash. For Chrome, use an MSYS path like:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe"
```

If Windows tools such as `taskkill.exe` or `tasklist.exe` misread `/PID` or `/FI` as Git Bash paths, prefix with `MSYS_NO_PATHCONV=1`.

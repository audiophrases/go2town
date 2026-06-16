# Admin bookmarks

The hidden admin session is for scouting exact pano spots while playing the 360° route. Use it to create implementation notes for future walking missions and 2D mini-game room entrances.

## Entering admin mode

1. Start the game normally.
2. When Coco asks for the player name, type:

   ```text
   q23r-
   ```

3. The normal learner mission flow is skipped.
4. The learner HUD is hidden.
5. The **Admin bookmarks** panel appears in the top-left corner.

Code entry points:

- Sentinel check: `isAdminName()` in `public/js/core/admin.js`
- Name-form branch: `public/js/game.js`
- Admin panel markup: `public/index.html`
- Admin panel styles: `public/css/style.css`

## What to bookmark

Walk to the exact pano that should become either:

- a future mission destination
- a future 2D room entrance
- a point that needs human review before becoming player-facing content

For each bookmark, fill in:

- **label** — developer-facing name, e.g. `ice cream corner`, `bakery door candidate`
- **icon** — mission/HUD icon candidate
- **future room type** — `future-room`, `iceCream`, `bakery`, or `none`
- **notes** — short implementation note, such as what the player should do there

Then click **+ bookmark current spot**.

## Persistence

Bookmarks are written to browser localStorage:

```text
go2town.admin.bookmarks.v1
```

This means bookmarks survive refreshes in the same browser profile, but are not committed to the repo until you copy/download the JSON and use it in code or docs.

The panel re-reads localStorage when admin mode starts. This lets tests and tools clear or seed the store before entering `q23r-`.

## Export format

The panel's export textarea contains JSON like:

```json
{
  "generatedAt": "2026-06-15T00:00:00.000Z",
  "purpose": "go2town admin bookmarks for future mission destinations and 2D mini subgame rooms",
  "bookmarks": [
    {
      "id": "ice-cream-corner-01",
      "label": "ice cream corner",
      "icon": "🍦",
      "subgame": "iceCream",
      "notes": "candidate destination + future ordering room",
      "createdAt": "2026-06-15T00:00:00.000Z",
      "lat": 41.180979,
      "lng": 1.525802,
      "heading": 90,
      "sceneId": "KgmZNoIb7NvPeKO-A-Mf1Q",
      "routeIndex": 0,
      "routeSegment": 5,
      "segmentRouteIndex": 0,
      "playable": true,
      "view": {
        "yaw": 12.34,
        "pitch": 0,
        "hfov": 110
      },
      "osmUrl": "https://www.openstreetmap.org/?mlat=..."
    }
  ],
  "missionDraft": "{ ... }"
}
```

Fields to preserve when implementing a mission:

- `sceneId` — strongest anchor for the current generated route
- `lat` / `lng` — used by the mission arrival engine
- `icon` — learner HUD icon
- `subgame` — optional room id to launch on arrival
- `notes` — human intent for the future implementation

Fields that are useful but may become stale after route regeneration:

- `routeIndex`
- `routeSegment`
- `segmentRouteIndex`
- camera `view`

If `scripts/build_scenes.py --write` changes the generated route, verify bookmarked `sceneId` values still exist and remain `playable` before relying on them.

## Turning bookmarks into missions

Current missions live in:

```text
public/js/data/comaruga.missions.js
```

Recommended workflow:

1. Export the admin JSON.
2. Choose one bookmark.
3. Add an entry to `DEFS`.
4. Prefer a direct `target` from the bookmark if you want to pin a specific scene, or keep using `routeIndex` if the target should track the generated playable route.
5. Set `subgame` to a registered room id or `null`.
6. Keep player-facing spoken copy generic unless the place identity is verified.
7. Run the smoke test.

Example mission entry adapted from a bookmark:

```js
{
  id: "iceCreamWalk",
  icon: "🍦",
  target: { lat: 41.180979, lng: 1.525802, sceneId: "KgmZNoIb7NvPeKO-A-Mf1Q" },
  subgame: "iceCream",
  mission: () =>
    "Now, your first mission! Mmm, ice cream! Let's walk this way for ice cream. " +
    "Follow my arrow. Let's go!",
  arrival: (name) =>
    `Yes! You made it to my ice cream stop. Ice cream, please! Wonderful, ${name}!`,
}
```

If the room does not exist yet, leave `subgame` as a placeholder in the bookmark and only register it in `public/js/core/subgames.js` when an actual implementation exists.

## Verification expectations

After changing admin mode, missions, or subgame launch behavior, run:

```bash
node --check public/js/game.js
node --check public/js/core/admin.js
node --check scripts/smoke.mjs
```

Browser smoke setup:

```bash
python -m http.server 8082 --bind 127.0.0.1 --directory public
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
  --user-data-dir=/tmp/go2town-chrome http://127.0.0.1:8082/
node scripts/smoke.mjs http://127.0.0.1:8082/ 9222
```

The smoke test should continue to assert:

- `q23r-` opens the admin panel
- normal learner HUD is hidden in admin mode
- one bookmark can be created
- localStorage contains the bookmark
- export JSON includes a mission draft
- exported bookmark has a finite `lat` / `lng`
- exported bookmark has a `sceneId`
- exported bookmark preserves the selected future subgame metadata

`node scripts/shot.mjs http://127.0.0.1:8082/ 9222` captures `scripts/05-admin-bookmark.png`, which is useful for visual review of the panel.

## Pitfalls

- Do not expose `q23r-` to learners; it is a developer shortcut.
- Do not treat bookmarks as committed data until the JSON has been copied into mission data or a tracked fixture file.
- Do not rely on `routeIndex` alone after regenerating the pano graph; verify `sceneId` and continuity.
- Do not make named-business claims from bookmarks unless the place has been checked against a reliable source. Use the OSM panel for context and keep spoken copy generic when unsure.

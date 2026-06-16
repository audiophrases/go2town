# go2town 🐦 — Coma-ruga

An **immersive ESL game**. Learners acquire English by *listening*, *repeating*, and *doing* — never by reading instructions. You explore Coma-ruga in 360°, while **Coco**, a friendly seagull, speaks short natural English lines with Microsoft Edge neural TTS and gives small walking missions.

Phase One is a 360° walking tour through **Coma-ruga** (a beach town near Tarragona, Spain). Later phases will attach small 2D mini-game rooms to selected mission destinations.

Current learner flow:

> Coco: *"Hello! I am Coco… What is your name?"*  
> → learner types a name  
> → Coco gives icon/audio missions such as ice cream 🍦, pizza 🍕, pastry 🥐, and bread 🥖  
> → learner walks the vetted 360° route using the arrow/progress HUD  
> → Coco celebrates and starts the next mission

Important grounding note: mission targets are currently **vetted route checkpoints**, not authoritative generated business POIs. The spoken mission copy is intentionally generic ("walk for ice cream", "walk for bread") and the corner OpenStreetMap panel gives real-world context using OSM's own labels.

---

## Quick start

**Windows:** double-click **`go2town.bat`**. It installs the Python dependency on first run, starts the server, opens the game, then you press ▶.

Or from a terminal:

```bash
pip install -r requirements.txt
python server.py            # serves http://localhost:8000
```

The default `pano360` world runs from local fixtures, with no live API key needed at play time.

---

## Controls

Learner controls:

- ▶ starts the game and unlocks browser audio.
- Type a normal player name to start the learner flow.
- **W / ↑** walks toward the direction the camera is facing.
- **S / ↓** steps backward from the camera direction.
- **A / D** or **← / →** turns the camera.
- Mouse/touch drag looks around.
- 🔊 or Coco repeats the current instruction.
- The OpenStreetMap corner panel can collapse/expand and opens OSM in a new tab.
- Tap/click the OpenStreetMap panel to drop a pin: the game snaps you to the nearest playable pano/hotspot on the vetted route.

Hidden developer/admin flow:

- Type **`q23r-`** as the player name to open the admin bookmarking session.
- See [Admin bookmarking](#admin-bookmarking) and [`docs/ADMIN_BOOKMARKS.md`](docs/ADMIN_BOOKMARKS.md).

---

## The town: local 360° imagery

The default world is rendered with [Pannellum](https://pannellum.org/), vendored locally. It walks an ordered route of 360° scenes. Each Google Street View fixture pano is represented as four 90° side captures (N/E/S/W) mapped onto a cubemap; top/bottom are left empty.

Current fixture summary:

- Dataset folder: [`street-view-imagery/`](street-view-imagery/)
- Dataset: `coma-ruga-google-street-view-expanded-continuous-chain-targeted-densified`
- Captures: **1,032** JPG side captures
- Unique panos: **258**
- Generated scene file: [`public/js/data/comaruga.scenes.generated.js`](public/js/data/comaruga.scenes.generated.js)
- Current playable route: **86** contiguous panos in playable segment `2`
- Playable route max hop: **53.5 m**; most adjacent hops are now around **16–21 m**
- Continuity gate: validation fails if the playable segment has any hop over **60 m**

The current fixture was target-densified around the largest route gaps using the official Google Street View metadata/static APIs. Broad scraping is intentionally avoided; new captures are only added where they make walking continuity smoother.

Regenerate after imagery/graph changes:

```bash
python scripts/build_scenes.py --write --check
python scripts/osm_lookup.py
python scripts/validate_continuity.py
```

> ⚠️ **Terms note:** Google Maps Platform terms restrict storing/redistributing Street View imagery. This fixture is for local classroom/prototype testing. Do not publicly redistribute the Google images. For owned imagery, capture your own 360° photos — see [`docs/CAPTURE_GUIDE.md`](docs/CAPTURE_GUIDE.md).

Scenes with no cubemap or equirectangular photo fall back to generated placeholder panoramas, so the game remains playable while content is incomplete.

### Other world providers

Set `worldProvider` in [`public/js/config.js`](public/js/config.js):

| Value | Shows | Cost / notes |
| --- | --- | --- |
| `"pano360"` | Local 360° scene graph | Default; no key at runtime |
| `"google"` | Live Google Street View | Requires Maps JS API key with billing |
| `"demo"` | Painted beach backdrop | Zero setup fallback |

---

## How it works

| Piece | File | Job |
| --- | --- | --- |
| TTS + static server | [`server.py`](server.py) | Serves the game and voices Coco's lines on demand via `edge-tts`, cached by text hash. |
| Launcher | [`go2town.bat`](go2town.bat) | One-click install + run + open browser on Windows. |
| Config | [`public/js/config.js`](public/js/config.js) | World provider, voice, speech rate, movement tuning, debug toggle. |
| Town data | [`public/js/data/comaruga.js`](public/js/data/comaruga.js) | Town wrapper that imports generated scene data and mission-relevant locations. |
| Generated scenes | [`public/js/data/comaruga.scenes.generated.js`](public/js/data/comaruga.scenes.generated.js) | Auto-generated pano graph; do not edit by hand. |
| Missions | [`public/js/data/comaruga.missions.js`](public/js/data/comaruga.missions.js) + [`public/js/core/missions.js`](public/js/core/missions.js) | Data-driven mission definitions plus HUD/progress/arrival engine. |
| World | [`public/js/core/world.js`](public/js/core/world.js) + [`public/js/core/providers/`](public/js/core/providers/) | Swappable 360 / Google / demo providers behind one interface. |
| 360 provider | [`public/js/core/providers/pano360.js`](public/js/core/providers/pano360.js) | Pannellum cubemap scenes, hotspots, view-relative movement, route safety gates. |
| OSM map | [`public/js/core/osmMap.js`](public/js/core/osmMap.js) | Collapsible OpenStreetMap panel centered on player position; click/tap overlay converts map drops to nearest playable pano jumps. |
| Narrator | [`public/js/core/narrator.js`](public/js/core/narrator.js) | Coco identity, spoken lines, avatar/caption behavior. |
| Admin bookmarks | [`public/js/core/admin.js`](public/js/core/admin.js) | Hidden `q23r-` admin mode for saving route spots as future mission/subgame destinations. |
| Subgames | [`public/js/core/subgames.js`](public/js/core/subgames.js) | Registry + overlay launcher for future 2D rooms. |
| Glue | [`public/js/game.js`](public/js/game.js) | Start gate, name flow, admin entry, mission loop, subgame launch. |

---

## Admin bookmarking

Use admin mode when scouting destinations for future missions or 2D mini-game entrances.

1. Start the game.
2. When Coco asks for the learner name, type **`q23r-`**.
3. The learner HUD is hidden and the **Admin bookmarks** panel appears.
4. Walk to a spot, enter a label/icon/subgame type/notes, then click **+ bookmark current spot**.
5. Use **copy JSON** or **download JSON**.

Bookmarks persist in browser localStorage:

```text
go2town.admin.bookmarks.v1
```

Each exported bookmark records:

- stable generated id and human label
- icon and `subgame` (`future-room`, `iceCream`, `bakery`, or `none`)
- notes for implementation
- lat/lng and current `sceneId`
- route index/segment metadata
- camera view yaw/pitch/hfov
- OSM URL for checking the spot on a map

The export also includes a `missionDraft` string that can be adapted into [`public/js/data/comaruga.missions.js`](public/js/data/comaruga.missions.js). Full details: [`docs/ADMIN_BOOKMARKS.md`](docs/ADMIN_BOOKMARKS.md).

---

## Missions and future 2D rooms

Current missions live in [`public/js/data/comaruga.missions.js`](public/js/data/comaruga.missions.js). They deliberately target route indices from `GENERATED.playableRoute` so the target is reachable inside the vetted continuous segment.

To add a mission:

1. Scout the spot in admin mode and export the bookmark JSON.
2. Copy the `sceneId`, `lat`, `lng`, icon, and desired `subgame` from the bookmark.
3. Add or update an entry in `comaruga.missions.js`.
4. If the mission should launch a 2D room, register the room id in [`public/js/core/subgames.js`](public/js/core/subgames.js).
5. Keep spoken copy short and generic unless a place name has been verified.
6. Run smoke verification.

Subgame ids already used/planned:

- `iceCream` — future ice cream ordering room
- `bakery` — future bread/pastry room
- `future-room` — placeholder value from admin bookmarks
- `null` / `none` — walking mission only

---

## Development and verification

Recommended local smoke setup:

```bash
# terminal 1 — use server.py so /imagery/ fixtures and /api/tts are available
python server.py --port 8082 --host 127.0.0.1

# terminal 2 — Windows Git Bash path shown
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
  --user-data-dir=/tmp/go2town-chrome http://127.0.0.1:8082/

# terminal 3
node scripts/smoke.mjs http://127.0.0.1:8082/ 9222
node scripts/shot.mjs  http://127.0.0.1:8082/ 9222
```

Quick syntax checks:

```bash
node --check public/js/game.js
node --check public/js/core/admin.js
node --check scripts/smoke.mjs
node --check scripts/shot.mjs
```

The smoke test currently verifies:

- 360 world renders with Pannellum and hotspots
- OSM panel loads, expands, collapses, links to `openstreetmap.org`, and click-drops onto the nearest playable pano
- learner name flow reaches an active mission HUD
- movement is view-relative (`W` follows camera heading, `S` backs away)
- admin sentinel `q23r-` opens the hidden admin panel
- admin mode hides learner HUD
- bookmark creation writes finite lat/lng + scene id + subgame metadata
- admin export and localStorage persistence work

`shot.mjs` saves browser screenshots under `scripts/`, including `05-admin-bookmark.png` for the admin panel.

---

## Design principles

- **No written English for learners.** Developer/admin tools may contain text, but the learner flow uses sound, icons, arrows, and action.
- **Repetition is free.** The 🔊 button and Coco replay the latest instruction.
- **Comprehensible input.** Short concrete English, repeated keywords, visible context.
- **Do, don't translate.** Learners show understanding by walking to destinations and interacting with future rooms.
- **Grounded place claims.** Do not present generated POIs as fact. Use route checkpoints plus the OSM panel unless a place has been verified.

---

## Roadmap

- **Phase One ✅** — Coma-ruga intro, walking missions, local 360° route, OSM context panel, hidden admin bookmark workflow.
- **Phase Two** — 2D subgame rooms at selected bookmarked destinations: order ice cream, buy bread/pastry, etc.
- **Later** — more towns, repeat-after-me speaking practice, richer admin tools, and a train-station mission once coverage is solid.

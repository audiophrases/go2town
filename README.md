# go2town 🐦 — Coma-ruga

An **immersive ESL game**. You learn English the way a baby does: by *listening*,
*repeating*, and *doing* — never by reading. You explore a town in 360°, while
**Coco**, a friendly seagull, talks to you in clear, natural English (Microsoft
Edge neural TTS) and gives you little **missions**. Some shops and spots around
town will open into small 2D mini-games (later phases).

**Phase One** ships the town of **Coma-ruga** (a beach town near Tarragona,
Spain) and a little tour of its **real shops**:

> Coco: *"Hello! I am Coco… What is your name?"*
> → you type your name →
> Coco: *"Nice to meet you, **\<name\>**! … Let's get an ice cream! Find the
> ice cream shop!"*
> → you walk the 360° town to it → Coco celebrates → next: the bakery 🥖,
> the supermarket 🛒, the pharmacy 💊. 🎉

Mission targets are **real businesses** pulled from OpenStreetMap (the actual
*La Jijonenca* ice-cream shop, *Condis* supermarket, etc.), so the places exist
where you walk. The learner only ever **hears** English; the on-screen UI is
icons only (a destination icon, an arrow, a progress bar, a 🔊 "listen again"
button, and a 🚶 walk button).

---

## Quick start

**Windows:** just double-click **`go2town.bat`**. It installs the one dependency
on first run, starts the server, and opens the game. Press ▶.

Or from a terminal (any OS):

```bash
pip install -r requirements.txt
python server.py            # serves http://localhost:8000  → press ▶
```

The game runs **out of the box** with no API key — see below.

---

## The town: real 360° imagery (the default)

The world is rendered by [Pannellum](https://pannellum.org/) (open-source,
vendored locally — no key, no billing, works offline). It walks a graph of
360° **scenes**; each scene is shown as a cubemap you can look around in and
step between via on-the-ground walking hotspots.

**Currently wired to the Coma-ruga Google Street View fixtures** in
[`street-view-imagery/`](street-view-imagery/): 80 panos, each captured as four
90° views (N/E/S/W) that map directly onto cubemap faces (top/bottom show sky).
[`scripts/build_scenes.py`](scripts/build_scenes.py) reconstructs a walkable
graph from their coordinates and writes
[`comaruga.scenes.generated.js`](public/js/data/comaruga.scenes.generated.js).
Regenerate after changing the imagery or graph tuning:

```bash
python scripts/build_scenes.py --write
```

> ⚠️ **Terms note:** Google Maps Platform terms restrict storing/redistributing
> Street View imagery. This setup is fine for local classroom testing; don't
> publicly redistribute the images. To own the imagery outright, capture your
> own 360° photos — see [`docs/CAPTURE_GUIDE.md`](docs/CAPTURE_GUIDE.md) (drop
> equirectangular files in [`public/img/scenes/`](public/img/scenes/) and set a
> scene's `image`). Scenes with neither real imagery fall back to an
> auto-generated placeholder panorama, so the game always runs.

### Other world providers (optional)

Set `worldProvider` in [`public/js/config.js`](public/js/config.js):

| Value | Shows | Cost |
| --- | --- | --- |
| `"pano360"` *(default)* | The 360° scene graph (Street View fixtures / your own photos) | Free, offline, unlimited |
| `"google"` | Google Street View | Needs a Maps JS API key **with billing**; bills per panorama load (not ideal at class scale) |
| `"demo"` | A painted beach backdrop with walk buttons | Free, zero setup |

For Google, also paste a key into `googleMapsApiKey`. Note: Google's no-billing
"Maps Demo Key" is prototyping-only (throttled, watermarked, not for a real
class), so `pano360` remains the recommended path for 100 students.

---

## How it works

| Piece | File | Job |
| --- | --- | --- |
| TTS + static server | [`server.py`](server.py) | Serves the game and voices Coco's lines on demand via `edge-tts`, caching each unique line by hash (so `"Nice to meet you, Maria!"` can be spoken live). |
| Launcher | [`go2town.bat`](go2town.bat) | One-click install + run + open browser (Windows). |
| Config | [`public/js/config.js`](public/js/config.js) | World provider, voice, speech rate, gameplay tuning, debug toggle. |
| Town data | [`public/js/data/comaruga.js`](public/js/data/comaruga.js) | Start point, locations (subgame spots), and the 360° scene graph. |
| Narrator | [`public/js/core/narrator.js`](public/js/core/narrator.js) | **Coco** — her identity, all spoken lines, avatar animation. |
| Geo | [`public/js/core/geo.js`](public/js/core/geo.js) | Distance / bearing math. |
| World | [`public/js/core/world.js`](public/js/core/world.js) + [`providers/`](public/js/core/providers/) | Swappable providers (360 / Google / demo) behind one interface. |
| Missions | [`public/js/core/missions.js`](public/js/core/missions.js) | Generic engine: HUD arrow + progress, proximity nudges, arrival detection. |
| Subgames | [`public/js/core/subgames.js`](public/js/core/subgames.js) | Registry + overlay launcher for the future 2D "rooms" (stub for now). |
| Glue | [`public/js/game.js`](public/js/game.js) | The Phase One story flow. |

### Voices

Default is `en-US-AvaNeural` (very natural). Others are allow-listed in both
`config.js` and `server.py`: `en-US-EmmaNeural`, `en-US-JennyNeural`,
`en-US-AriaNeural`, `en-US-AnaNeural` (child), `en-US-GuyNeural`,
`en-GB-SoniaNeural`. Speech is slowed slightly (`rate: "-6%"`) to help beginners.

---

## Design principles (immersive / acquisition-first)

- **No written English.** Output is sound; UI is icons. Reading is never required.
- **Repetition is free.** The 🔊 button (and tapping Coco) replays any instruction.
- **Comprehensible input.** Short sentences, concrete nouns, key words repeated
  (*"the ice cream shop… one ice cream, please"*), meaning supported by the
  visible world.
- **Do, don't translate.** You demonstrate understanding by *acting* (walking to
  the shop), not by answering a quiz.

---

## Roadmap

- **Phase One ✅** — Coma-ruga + intro (name) + a tour of real shops
  (ice-cream 🍦 → bakery 🥖 → supermarket 🛒 → pharmacy 💊), in the free 360°
  world built from Street View imagery.
- **Phase Two** — 2D subgames inside each shop: order an ice cream 🍦, buy bread
  🥖, etc. Register them in `core/subgames.js` against the `subgame` id already
  set on each mission in [`data/comaruga.missions.js`](public/js/data/comaruga.missions.js).
- **Later** — more towns, "repeat after me" speaking practice, the train-station
  mission once coverage there is solid.

### Adding / editing missions

Missions are data: edit [`comaruga.missions.js`](public/js/data/comaruga.missions.js).
Each entry names a real OSM business (`match`), an `icon`, and Coco's spoken
`mission`/`arrival` lines; the target resolves to the nearest reachable pano
automatically. Re-run `scripts/build_scenes.py --write` and
`scripts/osm_lookup.py` whenever the imagery changes.

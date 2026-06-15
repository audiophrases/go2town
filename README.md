# go2town 🐦 — Coma-ruga

An **immersive ESL game**. You learn English the way a baby does: by *listening*,
*repeating*, and *doing* — never by reading. You explore a town in 360°, while
**Coco**, a friendly seagull, talks to you in clear, natural English (Microsoft
Edge neural TTS) and gives you little **missions**. Some shops and spots around
town will open into small 2D mini-games (later phases).

**Phase One** ships the town of **Coma-ruga** (a beach town near Tarragona,
Spain) and the first mission:

> Coco: *"Hello! I am Coco… What is your name?"*
> → you type your name →
> Coco: *"Nice to meet you, **\<name\>**! … Go to the **train station**!"*
> → you walk the town to the station → Coco celebrates. 🎉

The learner only ever **hears** English. The on-screen UI is icons only
(🚉 destination, an arrow, a progress bar, and a 🔊 "listen again" button).

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

## The town: 360° photos (free, the default)

The world is shown with your own **360° photos**, rendered by
[Pannellum](https://pannellum.org/) (open-source, vendored locally — no key, no
billing, works offline, scales to any number of students for **$0**).

Out of the box it generates **placeholder panoramas** so it's instantly
playable. To show the **real Coma-ruga**, capture one 360° photo per waypoint
and drop them in [`public/img/scenes/`](public/img/scenes/) — full walkthrough in
**[`docs/CAPTURE_GUIDE.md`](docs/CAPTURE_GUIDE.md)**. Because it's your own town,
the future shop mini-games can be the *real* bakery, ice-cream shop, and station.

### Other world providers (optional)

Set `worldProvider` in [`public/js/config.js`](public/js/config.js):

| Value | Shows | Cost |
| --- | --- | --- |
| `"pano360"` *(default)* | Your own 360° photos | Free, offline, unlimited |
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
  (*"the train station… the trains"*), meaning supported by the visible world.
- **Do, don't translate.** You demonstrate understanding by *acting* (walking to
  the station), not by answering a quiz.

---

## Roadmap

- **Phase One ✅** — Coma-ruga + intro (name) + mission #1 (train station), with
  the free 360° world.
- **Phase Two** — 2D subgames in buildings: buy a ticket 🚉, order bread 🥖,
  order an ice cream 🍦. Register them in `core/subgames.js`; spots are already
  scaffolded in `data/comaruga.js`.
- **Later** — more missions, "repeat after me" speaking practice, more towns.

To add the next mission, follow the hook at the end of
[`startTrainStationMission`](public/js/game.js).

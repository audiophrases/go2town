# Capturing the real Coma-ruga (360° photos)

The game ships with auto-generated placeholder panoramas so it's playable today.
To replace them with the **real town**, you capture one 360° photo per "scene"
(waypoint) and drop the files in [`public/img/scenes/`](../public/img/scenes/).
No API, no key, no cost — the photos are yours.

## 1. What to capture

Phase One needs the seafront→station chain defined in
[`public/js/data/comaruga.js`](../public/js/data/comaruga.js):

| Scene | Spot | Suggested file |
| --- | --- | --- |
| `start` | The seafront promenade (start point) | `start.jpg` |
| `wp1` … `wp4` | ~4 stops walking toward the station | `wp1.jpg` … `wp4.jpg` |
| `station` | The train station entrance | `station.jpg` |

You don't need continuous coverage — just these standing spots, ~150–250 m
apart, so the walking hotspots connect them.

## 2. How to shoot a 360° photo

Any of these produce an **equirectangular** image (a 2:1 panorama):

- **A 360° camera** (Ricoh Theta, Insta360, etc.) — easiest, one click.
- **A phone panorama app** that exports equirectangular / "photo sphere"
  (e.g. Google Street View app's photo-sphere mode, or apps like Panorama 360).
- Hold the phone level, spin slowly in place, keep the horizon centred.

Export as **JPG**, ideally ~4096×2048 or 8192×4096. Keep files under ~3 MB each
so they load fast for students.

## 3. Add them to the game

1. Save the files into [`public/img/scenes/`](../public/img/scenes/) using the
   names above.
2. In [`comaruga.js`](../public/js/data/comaruga.js), set each scene's `image`:

   ```js
   start:   { lat: 41.18745, lng: 1.52405, icon: "🏖️", image: "start.jpg",   links: ["wp1"] },
   ```

3. **Aim the HUD arrow** (optional but nice): set `northOffset` to the compass
   bearing (0=N, 90=E, 180=S, 270=W) that the **centre** of the photo faces.
   Use your phone compass while standing at the spot. If you omit it, the game
   assumes the photo centre faces the next waypoint.

   ```js
   wp2: { lat: ..., lng: ..., image: "wp2.jpg", northOffset: 235, links: ["wp1", "wp3"] },
   ```

That's it — refresh the game. The placeholders disappear and students walk the
real Coma-ruga.

## 4. Adding more places / missions

Add new scenes to the `scenes` map and link them with `links`. To branch off to
a shop for a future subgame, give that shop its own scene and point a `links`
entry at it. The mission/arrival logic measures the `lat`/`lng` you set, so keep
those accurate.

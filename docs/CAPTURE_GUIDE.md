# Capturing and adding 360° places

The game can run from either:

- the local Google Street View fixture in [`street-view-imagery/`](../street-view-imagery/) for prototype/classroom testing, or
- your own 360° photos in [`public/img/scenes/`](../public/img/scenes/) for imagery you can fully own and redistribute.

This guide is for adding owned photos and turning useful spots into missions or future 2D room entrances.

## 1. What to capture

A 360° scene is a standing spot. For a walkable route, capture spots often enough that learners can move naturally between them.

Recommended spacing:

- 10–30 m for dense Street-View-like walking
- up to ~60 m only where the path is visually obvious
- closer spacing near intersections, shop doors, and future mini-game entrances

For each destination candidate, capture or identify:

- exact lat/lng
- a stable scene id or filename
- the direction the camera/photo faces (`northOffset` if using equirectangular photos)
- an implementation note: mission destination, future 2D room, or review-only point

## 2. How to shoot a 360° photo

Any of these can produce an **equirectangular** 2:1 image:

- a 360° camera such as Ricoh Theta or Insta360
- a phone photo-sphere/panorama app that exports equirectangular images
- a careful phone panorama workflow, if it can export a 2:1 sphere

Shooting tips:

- Hold the camera level.
- Keep the horizon centered.
- Avoid standing too close to walls/doors unless that is the intended room entrance.
- Record the approximate compass direction of the photo center.
- Export JPG, ideally around 4096×2048 or 8192×4096.
- Keep files small enough for classroom devices; under ~3 MB per scene is a good target.

## 3. Add owned photos to the game

1. Save photos into [`public/img/scenes/`](../public/img/scenes/).
2. In scene data, set each scene's `image` field to the filename.
3. Set `northOffset` if the center of the photo does not face the next route point.
4. Link scenes with `links` if editing a hand-authored scene map.
5. Refresh the game over HTTP, not `file://`.

Example scene shape:

```js
start: {
  lat: 41.18745,
  lng: 1.52405,
  icon: "🏖️",
  image: "start.jpg",
  northOffset: 235,
  links: ["wp1"],
}
```

`northOffset` is the compass bearing represented by yaw 0 / the center of the photo:

- `0` = north
- `90` = east
- `180` = south
- `270` = west

If `northOffset` is omitted, `pano360` assumes the photo center faces the next waypoint.

## 4. Use admin bookmarks for mission/room planning

The easiest way to mark destinations while walking the route is the hidden admin session:

1. Start the game.
2. When Coco asks for a name, type `q23r-`.
3. Walk to the exact spot.
4. Enter a label, icon, room type, and notes.
5. Click **+ bookmark current spot**.
6. Copy or download the JSON export.

The bookmark records `lat`, `lng`, `sceneId`, route metadata, camera view, notes, and a draft mission snippet. See [`ADMIN_BOOKMARKS.md`](ADMIN_BOOKMARKS.md).

Use bookmarks to decide:

- which spots become walking mission destinations
- which spots should launch future 2D mini-game rooms
- which places need better imagery or manual POI verification

## 5. Adding more missions

Current mission data is in:

```text
public/js/data/comaruga.missions.js
```

When adding a mission:

- Prefer a bookmarked reachable pano over a generated POI guess.
- Keep spoken text generic unless the exact place has been verified.
- Preserve the icon/audio-first learner flow.
- Set `subgame` only when the destination should launch a room.
- Register implemented room ids in `public/js/core/subgames.js`.

## 6. Regenerate and verify

After changing the Google fixture graph or generated scenes:

```bash
python scripts/build_scenes.py --write --check
python scripts/osm_lookup.py
python scripts/validate_continuity.py
```

After changing game/admin behavior:

```bash
node --check public/js/game.js
node --check public/js/core/admin.js
node --check scripts/smoke.mjs
```

Run the browser smoke test before declaring a route or admin change done. It checks route rendering, movement, OSM panel behavior, learner flow, and admin bookmark export.

## 7. Terms and redistribution

Google Street View fixture images are governed by Google Maps Platform terms. Keep them for local testing unless the usage is legally cleared.

Owned 360° photos are the long-term path for redistribution, public demos, and classroom packs that should not depend on Google fixture terms.

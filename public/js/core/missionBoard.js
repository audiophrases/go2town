// ---------------------------------------------------------------------------
// missionBoard.js — the free-roam ("GTA") mission loop.
//
// No fixed order: every pin on the minimap is an open mission. The learner
// roams the real Street View town; when they walk within range of a pin that
// isn't done yet, Coco reacts (audio only), points are awarded, and the pin
// turns green. The in-world AR beacon + the map always point at the nearest
// thing still left to find, so there's a constant sense of "where next."
//
// The board owns no UI of its own — it drives the minimap (pins + progress),
// the world (AR waypoint), Coco (voice), and the score badge.
// ---------------------------------------------------------------------------

import { CONFIG } from "../config.js";
import { haversine } from "./geo.js";
import { coco } from "./narrator.js";
import { getMissionType } from "./missionTypes.js";

// Merge a raw spot with its type defaults so every spot has an icon + points.
function normaliseSpot(s) {
  const t = getMissionType(s.type);
  return {
    id: s.id,
    type: s.type || "generic",
    label: s.label || s.id,
    icon: s.icon || t.icon,
    points: Number.isFinite(s.points) ? s.points : t.points,
    lat: s.lat,
    lng: s.lng,
  };
}

class MissionBoard {
  constructor() {
    this.spots = [];
    this.world = null;
    this.minimap = null;
    this.score = null;
    this.getName = () => "friend";
    this._busy = false;
    this._unsub = null;
    this._finished = false;
    this._armed = new Set(); // spots the learner has been seen *outside* of
  }

  /** Light up the town: draw the pins and start watching the learner move. */
  start({ world, minimap, score, spots, getName }) {
    this.world = world;
    this.minimap = minimap;
    this.score = score;
    if (getName) this.getName = getName;
    this.spots = (spots || [])
      .map(normaliseSpot)
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

    minimap.setSpots(this.spots, { isDone: (id) => score.isDone(id) });

    // Tapping a pin on the map sets it as the active waypoint (AR arrow points
    // there) — like dropping a GTA waypoint. It does not teleport: you still walk.
    window.addEventListener("go2town:spot-select", (e) => this._setWaypoint(e.detail));

    this._unsub = world.onMove((p) => this._tick(p));
    this._pointNearest();
    if (world.position) this._tick({ ...world.position, heading: world.heading });
  }

  /** The closest mission still open from the current position (dev/testing aid). */
  nearestOpen() {
    if (!this.world?.position) return null;
    let best = null;
    let bestDist = Infinity;
    for (const s of this.spots) {
      if (this.score.isDone(s.id)) continue;
      const d = haversine(this.world.position, { lat: s.lat, lng: s.lng });
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  _setWaypoint(spot) {
    if (!spot || this.score.isDone(spot.id)) return;
    if (typeof this.world.setGoal === "function") {
      this.world.setGoal({ lat: spot.lat, lng: spot.lng, icon: spot.icon });
    }
  }

  // Aim the in-world AR beacon at the closest mission still open.
  _pointNearest() {
    if (!this.world?.position || typeof this.world.setGoal !== "function") return;
    let best = null;
    let bestDist = Infinity;
    for (const s of this.spots) {
      if (this.score.isDone(s.id)) continue;
      const d = haversine(this.world.position, { lat: s.lat, lng: s.lng });
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    this.world.setGoal(best ? { lat: best.lat, lng: best.lng, icon: best.icon } : null);
  }

  async _tick(p) {
    if (this._busy || !p) return;
    const radius = CONFIG.arrivalRadiusMeters ?? 45;
    for (const s of this.spots) {
      if (this.score.isDone(s.id)) continue;
      const dist = haversine(p, { lat: s.lat, lng: s.lng });
      if (dist > radius) {
        this._armed.add(s.id); // you've been outside — now arriving here counts
        continue;
      }
      // Inside the radius: only fire if you actually walked in (not spawned on it).
      if (!this._armed.has(s.id)) continue;
      await this._arrive(s);
      break; // one arrival per step
    }
  }

  async _arrive(spot) {
    this._busy = true;
    const name = this.getName();
    const type = getMissionType(spot.type);

    this.score.award(spot.id, spot.points);
    this.minimap.markDone(spot.id);
    if (typeof this.world.setGoal === "function") this.world.setGoal(null);

    // Coco's reaction is a remembered line, so the 🔊 button replays it.
    await coco.say(type.arrive(name, spot));

    this._pointNearest();
    await this._maybeFinish(name);
    this._busy = false;
  }

  async _maybeFinish(name) {
    if (this._finished) return;
    if (!this.spots.length || !this.spots.every((s) => this.score.isDone(s.id))) return;
    this._finished = true;
    await coco.say(
      `Wow, ${name}! You found every place in town — home, the shops, all of it. ` +
        `You really know your way around now. Nice work.`
    );
  }
}

export const missionBoard = new MissionBoard();

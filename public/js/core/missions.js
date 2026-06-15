// ---------------------------------------------------------------------------
// missions.js — a tiny mission engine.
//
// A mission points the learner at a place in town and watches them get there.
// It updates the icon-only HUD (destination icon, a pointing arrow, a progress
// bar) and fires audio "nudges" from Coco as the learner gets closer — never
// any written English.
//
// Mission definitions live in game.js (so they can speak Coco's lines); this
// file is the reusable machinery.
// ---------------------------------------------------------------------------

import { world } from "./world.js";
import { haversine, bearing } from "./geo.js";

class MissionEngine {
  constructor() {
    this.hud = null;
    this.active = null;
    this._unsub = null;
    this._resolve = null;
  }

  /** @param {{hudEl:HTMLElement, iconEl:HTMLElement, arrowEl:HTMLElement, fillEl:HTMLElement}} els */
  mountHud(els) {
    this.hud = els;
  }

  /**
   * Run a mission to completion.
   * @param {{icon:string, target:{lat:number,lng:number}, radius?:number,
   *          nudges?:Array<{atMeters:number, say:Function}>,
   *          onArrive?:Function}} mission
   */
  run(mission) {
    this.active = {
      ...mission,
      radius: mission.radius ?? 45,
      firedNudges: new Set(),
      initialDistance: null,
    };

    if (this.hud) {
      this.hud.iconEl.textContent = mission.icon;
      this.hud.hudEl.classList.add("active");
    }

    return new Promise((resolve) => {
      this._resolve = resolve;
      this._unsub = world.onMove((pos) => this._update(pos));
      // Prime with the current position immediately.
      if (world.position) this._update({ ...world.position, heading: world.heading });
    });
  }

  _update(pos) {
    const m = this.active;
    if (!m) return;

    const dist = haversine(pos, m.target);
    if (m.initialDistance == null) m.initialDistance = Math.max(dist, 1);

    // --- Arrow: where is the target relative to where I'm looking? ---
    const brg = bearing(pos, m.target);
    const relative = (brg - (pos.heading ?? 0) + 360) % 360;
    if (this.hud) {
      this.hud.arrowEl.style.transform = `rotate(${relative}deg)`;
      // --- Progress bar: how far along from the start? ---
      const progress = Math.min(1, Math.max(0, 1 - dist / m.initialDistance));
      this.hud.fillEl.style.width = `${Math.round(progress * 100)}%`;
      this.hud.hudEl.classList.toggle("near", dist <= m.radius * 3);
    }

    // Arrival wins over nudges: don't say "almost there!" on the same step we
    // arrive (waypoint hops can be large).
    if (dist <= m.radius) {
      this._complete();
      return;
    }

    // --- Audio nudges as distance crosses thresholds (closest first) ---
    if (m.nudges) {
      for (const nudge of [...m.nudges].sort((a, b) => a.atMeters - b.atMeters)) {
        if (dist <= nudge.atMeters && !m.firedNudges.has(nudge.atMeters)) {
          m.firedNudges.add(nudge.atMeters);
          nudge.say();
          break; // one nudge per move event
        }
      }
    }
  }

  /** Debug helper: jump straight to "arrived". */
  forceArrive() {
    this._complete();
  }

  async _complete() {
    const m = this.active;
    if (!m) return;
    this.active = null;
    if (this._unsub) this._unsub();
    this._unsub = null;
    if (this.hud) {
      this.hud.hudEl.classList.remove("active", "near");
      this.hud.fillEl.style.width = "100%";
    }
    if (m.onArrive) await m.onArrive();
    if (this._resolve) this._resolve({ completed: true });
  }
}

export const missions = new MissionEngine();

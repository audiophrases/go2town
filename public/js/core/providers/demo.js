// ---------------------------------------------------------------------------
// demo.js — a painted beach backdrop with two "walk" buttons.
//
// Zero setup: no key, no photos, works offline. Used two ways:
//   1. selectable via CONFIG.worldProvider = "demo"
//   2. as the in-place fallback when a richer provider can't load — other
//      providers call installDemoBackdrop(this) so the mission engine's
//      listeners stay attached to the same world instance.
// ---------------------------------------------------------------------------

import { WorldBase } from "../worldBase.js";
import { bearing, destination, haversine } from "../geo.js";

/** Turn any world instance into the painted demo. Returns {mode:"demo"}. */
export function installDemoBackdrop(world) {
  world.mode = "demo";
  world.container.classList.add("demo-world");
  world.container.innerHTML = `
    <div class="demo-scene" aria-hidden="true">
      <div class="demo-sky"></div>
      <div class="demo-sea"></div>
      <div class="demo-sand"></div>
      <div class="demo-note">🎨 Demo backdrop — add 360° photos for the real town</div>
    </div>
    <div class="demo-walk">
      <button class="demo-btn" data-dir="toward" title="walk toward">⬆️</button>
      <button class="demo-btn" data-dir="away" title="wander">↩️</button>
    </div>
  `;
  const target = world.town.locations.trainStation;
  world.heading = bearing(world.position, target);

  world.container.querySelectorAll(".demo-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      let brg = bearing(world.position, target);
      let stepM = 250;
      if (btn.dataset.dir === "away") brg = (brg + 130) % 360; // wander off course
      else stepM = Math.min(stepM, haversine(world.position, target)); // no overshoot
      world.position = destination(world.position, brg, stepM);
      world.heading = bearing(world.position, target); // arrow keeps pointing at goal
      world._emit();
    });
  });
  world._emit();
  return { mode: "demo" };
}

export class DemoWorld extends WorldBase {
  async init(opts) {
    await super.init(opts);
    return installDemoBackdrop(this);
  }
}

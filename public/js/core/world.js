// ---------------------------------------------------------------------------
// world.js — picks the world provider and exports the single `world` the rest
// of the game talks to. Swapping providers never touches missions, narrator,
// or the HUD.
//
//   CONFIG.worldProvider:
//     "pano360" (default) — your own 360° photos (free, offline)
//     "google"            — Google Street View (needs a billed key)
//     "demo"              — painted beach backdrop (zero setup)
// ---------------------------------------------------------------------------

import { CONFIG } from "../config.js";
import { Pano360World } from "./providers/pano360.js";
import { GoogleWorld } from "./providers/google.js";
import { DemoWorld } from "./providers/demo.js";

function makeWorld() {
  switch ((CONFIG.worldProvider || "pano360").toLowerCase()) {
    case "google":
      return new GoogleWorld();
    case "demo":
      return new DemoWorld();
    case "pano360":
    default:
      return new Pano360World();
  }
}

export const world = makeWorld();

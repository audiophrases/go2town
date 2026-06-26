// ---------------------------------------------------------------------------
// comaruga.spots.js — the town's mission pins for the free-roam map.
//
// Each spot is one marker on the minimap and one mission: walk up to it and
// Coco reacts (audio only — see core/missionTypes.js). A spot only needs WHERE
// it is and WHAT KIND it is; the spoken lines come from its `type`.
//
// These are the starter pins so the game is playable out of the box. The admin
// adds the real ten (school, home, the actual pizza place, …) by clicking the
// minimap in admin mode — those merge in on top of these at runtime, and the
// exported JSON gets baked back into this list.
// ---------------------------------------------------------------------------

import { TOWN } from "./comaruga.js";
import { POIS } from "./comaruga.pois.generated.js";
import { getMissionType } from "../core/missionTypes.js";

// Pull a real OpenStreetMap POI by name (so a default pin sits on a true place).
function poi(name) {
  return POIS.find((p) => p.name === name) || null;
}
const casaPepe = poi("Casa Pepe");        // a real seafront restaurant → "pizza"
const laJijonenca = poi("La Jijonenca");  // a real ice-cream parlour

const L = TOWN.locations;

// A spot: { id, type, lat, lng, icon?, label?, points? }. Missing icon/points
// fall back to the type's defaults.
const RAW = [
  // Home base: where the learner first opens their eyes (the seafront start).
  { id: "home", type: "home", lat: TOWN.start.lat, lng: TOWN.start.lng, label: "Home" },

  // Real places we already have coordinates for.
  casaPepe && { id: "pizza", type: "pizza", lat: casaPepe.lat, lng: casaPepe.lng, label: "Pizza place" },
  laJijonenca && { id: "icecream", type: "icecream", lat: laJijonenca.lat, lng: laJijonenca.lng, label: "Ice cream" },

  // From the town's known locations.
  L.bakery && { id: "bakery", type: "bakery", lat: L.bakery.lat, lng: L.bakery.lng, label: "Bakery" },
  L.market && { id: "store", type: "store", lat: L.market.lat, lng: L.market.lng, label: "Store" },
  L.beach && { id: "beach", type: "beach", lat: L.beach.lat, lng: L.beach.lng, label: "Beach" },
].filter(Boolean);

// Fill in each spot's icon/points from its mission type unless overridden.
export const DEFAULT_SPOTS = RAW.map((s) => {
  const t = getMissionType(s.type);
  return { icon: t.icon, points: t.points, ...s };
});

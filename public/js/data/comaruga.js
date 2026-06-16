// ---------------------------------------------------------------------------
// Coma-ruga (Comarruga) — a Mediterranean beach town in El Vendrell,
// Tarragona, Catalonia, Spain. This is the Phase One map.
//
// The 360° scene graph is built from real Google Street View captures by
// scripts/build_scenes.py (→ comaruga.scenes.generated.js). Each scene is a
// pano rendered as a cubemap from its four 90° side views. `icon` emoji feed
// the icon-only HUD (no written English).
// ---------------------------------------------------------------------------

import { GENERATED } from "./comaruga.scenes.generated.js";

// Map the generated graph into the scene shape the world provider expects:
// lon → lng, and keep `cube` true only when all four side-view images exist.
const scenes = {};
for (const [id, s] of Object.entries(GENERATED.scenes)) {
  scenes[id] = {
    lat: s.lat,
    lng: s.lon,
    routeIndex: s.routeIndex,
    routeSegment: s.routeSegment,
    segmentRouteIndex: s.segmentRouteIndex,
    playable: !!s.playable,
    links: s.links,
    cube: !!s.cube,
  };
}
const startNode = GENERATED.scenes[GENERATED.startScene];

export const TOWN = {
  id: "comaruga",
  name: "Coma-ruga", // shown to humans (devs), never to the learner as a "word to read"

  // Where the learner first opens their eyes: the seafront start pano.
  start: {
    lat: startNode.lat,
    lng: startNode.lon,
    heading: 0, // cubemap scenes are north-aligned
    pitch: 0,
  },

  // Points of interest. Each can host a 2D subgame in a later phase.
  // `subgame` is the id registered in core/subgames.js (null = none yet).
  locations: {
    trainStation: {
      id: "trainStation",
      icon: "🚉",
      label: "Train station", // dev label only
      // The reachable Street View pano closest to the real station.
      lat: GENERATED.stationLat,
      lng: GENERATED.stationLng,
      subgame: null, // Phase 2: buy-a-ticket minigame goes here
    },

    // --- Scaffolding for future missions / subgames (not used in Phase One) ---
    beach: {
      id: "beach",
      icon: "🏖️",
      label: "Beach",
      lat: 41.18680,
      lng: 1.52520,
      subgame: null,
    },
    bakery: {
      id: "bakery",
      icon: "🥖",
      label: "Bakery",
      lat: 41.18890,
      lng: 1.52180,
      subgame: null, // Phase 2: "order bread" minigame
    },
    iceCream: {
      id: "iceCream",
      icon: "🍦",
      label: "Ice-cream shop",
      lat: 41.18820,
      lng: 1.52330,
      subgame: null, // Phase 2: "order an ice cream" minigame
    },
    market: {
      id: "market",
      icon: "🛒",
      label: "Market",
      lat: 41.18960,
      lng: 1.52050,
      subgame: null,
    },
  },

  // ---- 360° scene graph (worldProvider: "pano360") ------------------------
  // Built from the Google Street View fixtures. Re-generate after changing the
  // imagery or graph tuning:  python scripts/build_scenes.py --write
  startScene: GENERATED.startScene,
  scenes,
};

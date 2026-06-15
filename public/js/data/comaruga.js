// ---------------------------------------------------------------------------
// Coma-ruga (Comarruga) — a Mediterranean beach town in El Vendrell,
// Tarragona, Catalonia, Spain. This is the Phase One map.
//
// Coordinates are approximate and snap to the nearest available Street View
// panorama at runtime, so they don't need to be pixel-perfect — they just need
// to land on a street with coverage.
//
// `icon` values are emoji used in the icon-only HUD (no written English).
// ---------------------------------------------------------------------------

export const TOWN = {
  id: "comaruga",
  name: "Coma-ruga", // shown to humans (devs), never to the learner as a "word to read"

  // Where the learner first opens their eyes: the seafront promenade.
  start: {
    lat: 41.18745,
    lng: 1.52405,
    heading: 210, // look down the promenade
    pitch: 0,
  },

  // Points of interest. Each can host a 2D subgame in a later phase.
  // `subgame` is the id registered in core/subgames.js (null = none yet).
  locations: {
    trainStation: {
      id: "trainStation",
      icon: "🚉",
      label: "Train station", // dev label only
      lat: 41.17365,
      lng: 1.50995,
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

  // ---- 360° tour graph (worldProvider: "pano360") -------------------------
  // Each scene is one spot you photographed. `links` are the neighbouring
  // scenes you can walk to (they become clickable ground hotspots). `image` is
  // a file in public/img/scenes/ (e.g. "start.jpg"); leave it null to use the
  // auto-generated placeholder panorama so the game is playable before you
  // capture anything. `lat`/`lng` is where the photo was taken — that's what
  // missions measure against.
  //
  // Optional per scene:
  //   icon        — emoji shown on the placeholder
  //   northOffset — compass bearing (0–360) that the photo's centre faces.
  //                 Set this for real photos so the HUD arrow points truly.
  //                 Omitted → the centre is assumed to face the next waypoint.
  //
  // This chain walks the seafront down to the train station.
  startScene: "start",
  scenes: {
    start:   { lat: 41.18745, lng: 1.52405, icon: "🏖️", image: null, links: ["wp1"] },
    wp1:     { lat: 41.18469, lng: 1.52123, icon: "🌴", image: null, links: ["start", "wp2"] },
    wp2:     { lat: 41.18193, lng: 1.51841, icon: "🚶", image: null, links: ["wp1", "wp3"] },
    wp3:     { lat: 41.17917, lng: 1.51559, icon: "🛣️", image: null, links: ["wp2", "wp4"] },
    wp4:     { lat: 41.17641, lng: 1.51277, icon: "🚦", image: null, links: ["wp3", "station"] },
    station: { lat: 41.17365, lng: 1.50995, icon: "🚉", image: null, links: ["wp4"] },
  },
};

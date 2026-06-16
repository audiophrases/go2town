// ---------------------------------------------------------------------------
// go2town configuration
//
// 1. Paste your Google Maps JavaScript API key below to enable real Street View.
//    Get one at: https://console.cloud.google.com/google/maps-apis
//    Enable "Maps JavaScript API". (Street View is included.)
//
//    No key yet? The game still runs in a "demo backdrop" mode so you can hear
//    Coco and play through the mission loop — you just won't see the real town.
//
// 2. Everything else has sensible defaults; tweak to taste.
// ---------------------------------------------------------------------------

export const CONFIG = {
  // ---- World provider ----------------------------------------------------
  // How the town is shown:
  //   "pano360" (default) — your own 360° photos, free & offline (Pannellum)
  //   "google"            — Google Street View (needs the billed key below)
  //   "demo"              — painted beach backdrop, zero setup
  worldProvider: "pano360",

  // ---- Google Maps (only used when worldProvider === "google") -----------
  googleMapsApiKey: "", // <-- PASTE YOUR KEY HERE

  // ---- Narrator voice (Coco the seagull) ---------------------------------
  // Allowed voices are mirrored on the server. Ava & Emma are the most natural.
  voice: "en-US-AvaNeural",
  // Slightly slower than default helps beginners catch every word.
  rate: "-6%",
  pitch: "+8Hz", // a touch brighter — friendlier, more "bird guide"

  // ---- Movement (↑/W moves where you look; ↓/S steps back; ←/→ or A/D steer) -----
  move: {
    hopBaseMs: 420, // time to cross a ~refMeters hop while holding (lower = faster)
    refMeters: 20, // typical distance between panos in the densified route
    hopMinMs: 260, // never hop faster than this (short links)
    hopMaxMs: 720, // never slower than this (long links)
    fadeMs: 240, // crossfade between panos — the "motion" feel
    turnDegPerSec: 80, // keyboard steer speed
  },

  // ---- OpenStreetMap corner map -----------------------------------------
  // Uses OSM's own embedded map labels instead of project-generated POI pins.
  osmMap: {
    collapsed: false,
    expanded: false,
    updateMinMeters: 12, // avoid reloading the iframe for tiny yaw-only changes
    updateMinMs: 1000,
  },

  // ---- Learning / gameplay ----------------------------------------------
  arrivalRadiusMeters: 45, // how close counts as "you made it"
  // Distance thresholds (m) at which Coco gives an encouraging nudge.
  proximityNudges: [400, 200, 100],

  // ---- Debug -------------------------------------------------------------
  // Shows a small dev panel with a "force arrival" button etc. Turn off for
  // a clean learner experience.
  debug: true,
};

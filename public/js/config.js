// ---------------------------------------------------------------------------
// go2town configuration
//
// 1. The default runtime uses live Google Street View from the Google Maps
//    JavaScript API. Keep the key outside the repo: server.py reads
//    GOOGLE_MAPS_API_KEY or the local Hermes secret file, then exposes it only
//    to the local browser at /api/maps-config.
//
// 2. Everything else has sensible defaults; tweak to taste.
// ---------------------------------------------------------------------------

export const CONFIG = {
  // ---- World provider ----------------------------------------------------
  // How the town is shown:
  //   "google" (default) — live Google Street View, with AR overlays synced on top
  //   "pano360"          — legacy local 360° fixtures (Pannellum)
  //   "demo"             — painted beach backdrop, zero setup
  worldProvider: "google",

  // ---- Google Maps (only used when worldProvider === "google") -----------
  // Leave this empty. server.py supplies the runtime key from GOOGLE_MAPS_API_KEY
  // or C:/Users/Admin/AppData/Local/hermes/secrets/google_maps_api_key.txt.
  googleMapsApiKey: "",

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
    portalVisibleMeters: 32, // show nearby admin-placed AR gates on adjacent panos
  },

  // ---- Vocabulary AR (core/learn.js) ------------------------------------
  // Tappable AR words floating in the live Street View. Tap one to hear it;
  // Coco runs a "find it" check after every few new words.
  learn: {
    arVisibleMeters: 70, // how close an AR word must be to appear & be tappable
    checkEveryWords: 3,  // run a comprehension check after this many new words
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

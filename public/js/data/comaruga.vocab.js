// ---------------------------------------------------------------------------
// comaruga.vocab.js — curated AR vocabulary objects for the start of the route.
//
// Each entry is a geo-anchored, tappable "thing" the learner sees floating in
// the live Street View. Tapping it makes Coco say its word — a form → meaning →
// action binding (word = sound, icon + real street = meaning, tap = action).
// The teach / find-it loop lives in core/learn.js.
//
// Coordinates are hand-placed in a ring ~18 m around the seafront start pano
// (lat 41.1795443, lng 1.525321) so that, whichever way the learner looks at
// the start, a few words are within reach. These are Level 1 words: concrete,
// picturable nouns whose emoji makes the meaning obvious without any English.
// ---------------------------------------------------------------------------

export const VOCAB = [
  { id: "tree",   icon: "🌳", word: "tree",   level: 1, lat: 41.1797060, lng: 1.5253210,
    say: { label: "A tree. A tree.",       attr: "A tall tree." } },
  { id: "car",    icon: "🚗", word: "car",    level: 1, lat: 41.1796252, lng: 1.5255070,
    say: { label: "A car. A car.",         attr: "A fast car." } },
  { id: "window", icon: "🪟", word: "window", level: 1, lat: 41.1794635, lng: 1.5255070,
    say: { label: "A window. A window.",   attr: "A big window." } },
  { id: "sea",    icon: "🌊", word: "sea",    level: 1, lat: 41.1793826, lng: 1.5253210,
    say: { label: "The sea. The sea.",     attr: "The blue sea." } },
  { id: "door",   icon: "🚪", word: "door",   level: 1, lat: 41.1794635, lng: 1.5251350,
    say: { label: "A door. A door.",       attr: "A red door." } },
  { id: "shop",   icon: "🏪", word: "shop",   level: 1, lat: 41.1796252, lng: 1.5251350,
    say: { label: "A shop. A shop.",       attr: "A small shop." } },
];

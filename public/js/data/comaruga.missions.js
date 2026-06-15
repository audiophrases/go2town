// ---------------------------------------------------------------------------
// Phase One missions — a little tour of real Coma-ruga businesses.
//
// Each mission points at a REAL shop/service from OpenStreetMap
// (comaruga.pois.generated.js). We aim at the pano *nearest* the business (the
// spot on the street outside it) so it's always reachable on foot, and Coco
// announces it in short, repetitive, concrete English — the key noun repeated,
// meaning carried by the place you're walking to. `subgame` is the future 2D
// "room" for that shop (stub for now).
// ---------------------------------------------------------------------------

import { POIS } from "./comaruga.pois.generated.js";
import { GENERATED } from "./comaruga.scenes.generated.js";

// Find a real POI by a substring of its name (case-insensitive).
function findPoi(nameIncludes) {
  const q = nameIncludes.toLowerCase();
  return POIS.find((p) => p.name.toLowerCase().includes(q));
}

// Target the pano nearest the business so arrival is guaranteed reachable.
function targetOf(poi) {
  const pano = GENERATED.scenes[poi.nearestPano];
  return pano ? { lat: pano.lat, lng: pano.lon } : { lat: poi.lat, lng: poi.lng };
}

// Ordered tour. `match` is looked up in the live POI data, so the missions keep
// working if the imagery (and coordinates) are regenerated.
const DEFS = [
  {
    id: "iceCream",
    icon: "🍦",
    match: "Jijonenca",
    subgame: "iceCream",
    mission: () =>
      "Now, your first mission! Mmm, I want an ice cream. Let's get an ice cream! " +
      "Find the ice cream shop. The ice cream shop! Follow my arrow. Let's go!",
    arrival: (name) =>
      `Yes! You found it! The ice cream shop! One ice cream, please. ` +
      `Mmm, so cold and sweet! Wonderful, ${name}!`,
  },
  {
    id: "bakery",
    icon: "🥖",
    match: "Forn de pa",
    subgame: "bakery",
    mission: () =>
      "Next mission! I am hungry. Let's buy some bread. Find the bakery! " +
      "The bakery makes warm bread. Follow my arrow!",
    arrival: (name) =>
      `The bakery! Can you smell the fresh bread? Mmm! One loaf, please. ` +
      `Great walking, ${name}!`,
  },
  {
    id: "supermarket",
    icon: "🛒",
    match: "Condis",
    subgame: null,
    mission: () =>
      "Let's go shopping! Find the supermarket. The big supermarket! " +
      "We need milk and apples. Follow my arrow!",
    arrival: (name) =>
      `The supermarket! So many things to buy. Milk, apples, bread! ` +
      `Excellent, ${name}!`,
  },
  {
    id: "pharmacy",
    icon: "💊",
    match: "Tobella",
    subgame: null,
    mission: () =>
      "Oh no, I have a little cough! Let's find the pharmacy. " +
      "The pharmacy, with the green cross! Follow my arrow.",
    arrival: (name) =>
      `The pharmacy! Some medicine, please. Thank you! I feel better. ` +
      `You are a great helper, ${name}!`,
  },
];

// Resolve each mission against the live POI data; drop any whose shop is missing.
export const MISSIONS = DEFS.map((d) => {
  const poi = findPoi(d.match);
  return poi ? { ...d, poi, target: targetOf(poi) } : null;
}).filter(Boolean);

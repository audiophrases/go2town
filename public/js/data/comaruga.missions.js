// ---------------------------------------------------------------------------
// Phase One missions — a short, continuous walk through Coma-ruga.
//
// Mission targets are route checkpoints from the vetted playable Street View
// chain, not generated shop/POI records.
// ---------------------------------------------------------------------------

import { GENERATED } from "./comaruga.scenes.generated.js";

function targetAtRouteIndex(routeIndex) {
  const sceneId = GENERATED.playableRoute[routeIndex];
  const pano = sceneId ? GENERATED.scenes[sceneId] : null;
  if (!pano || !pano.playable) return null;
  return { lat: pano.lat, lng: pano.lon, sceneId };
}

// Ordered eastbound checkpoints. The spoken copy is intentionally generic: it
// teaches useful words/icons without claiming a named POI exists at the target.
const DEFS = [
  {
    id: "iceCreamWalk",
    icon: "🍦",
    routeIndex: 20,
    subgame: "iceCream",
    mission: () =>
      "Now, your first mission! Mmm, ice cream! Let's walk this way for ice cream. " +
      "Follow my arrow. Let's go!",
    arrival: (name) =>
      `Yes! You made it to my ice cream stop. Ice cream, please! ` +
      `Mmm, so cold and sweet! Wonderful, ${name}!`,
  },
  {
    id: "pizzaWalk",
    icon: "🍕",
    routeIndex: 42,
    subgame: null,
    mission: () =>
      "Next mission! I smell pizza. Let's walk this way for pizza. " +
      "Hot pizza, round pizza. Follow my arrow!",
    arrival: (name) =>
      `Pizza stop! Hot pizza, please. Mmm, delicious! ` +
      `Great walking, ${name}!`,
  },
  {
    id: "pastryWalk",
    icon: "🥐",
    routeIndex: 70,
    subgame: "bakery",
    mission: () =>
      "Now let's walk for a pastry. A sweet pastry! " +
      "Maybe a croissant. Follow my arrow!",
    arrival: (name) =>
      `Pastry stop! A croissant, please. Crispy and sweet! ` +
      `Excellent, ${name}!`,
  },
  {
    id: "breadWalk",
    icon: "🥖",
    routeIndex: 84,
    subgame: "bakery",
    mission: () =>
      "One more food stop! Let's walk for bread. Warm bread. " +
      "Bread, bread, bread. Follow my arrow!",
    arrival: (name) =>
      `Bread stop! Can you smell the fresh bread? Mmm! One loaf, please. ` +
      `You are a great helper, ${name}!`,
  },
];

export const MISSIONS = DEFS.map((d) => {
  const target = targetAtRouteIndex(d.routeIndex);
  return target ? { ...d, target } : null;
}).filter(Boolean);

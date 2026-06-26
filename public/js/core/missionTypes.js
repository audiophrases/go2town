// ---------------------------------------------------------------------------
// missionTypes.js — the kinds of place a spot on the town map can be.
//
// In the free-roam ("GTA") model every pin on the minimap is a mission. A pin
// only stores *where* it is + *what kind* it is; the spoken English lives here,
// keyed by type. That way an admin can drop ten pins (home, school, pizza, …)
// without writing a single line of dialogue — Coco already knows what to say
// when the learner walks up.
//
// Hard rule of the whole game: the learner NEVER reads English. Every line
// below is spoken by Coco (TTS), short, concrete, and repetitive, and can be
// replayed with the 🔊 button. Icons — not words — are what the learner sees.
// ---------------------------------------------------------------------------

// Each type: a default emoji icon, the points it's worth, and `arrive(name)` —
// the line Coco speaks the moment the learner reaches the pin. Keep lines tight:
// greet → the key word a few times → a tiny win → praise with the name.
export const MISSION_TYPES = {
  home: {
    icon: "🏠",
    points: 8,
    arrive: (name) =>
      `Home! This is your home now. Open the door — come in. ` +
      `Home, sweet home. Welcome home, ${name}!`,
  },
  school: {
    icon: "🏫",
    points: 10,
    arrive: (name) =>
      `School! The big school. Books, a teacher, new friends. ` +
      `This is your school, ${name}. Time to learn!`,
  },
  store: {
    icon: "🏪",
    points: 8,
    arrive: (name) =>
      `The store! Let's buy something. Hello! This one, please. Thank you! ` +
      `Nice shopping, ${name}.`,
  },
  pizza: {
    icon: "🍕",
    points: 8,
    arrive: (name) =>
      `Pizza! Hot pizza, round pizza. One pizza, please. Mmm — so good! ` +
      `Great find, ${name}!`,
  },
  icecream: {
    icon: "🍦",
    points: 8,
    arrive: (name) =>
      `Ice cream! Cold and sweet. One ice cream, please. Mmm! ` +
      `Yum — well done, ${name}!`,
  },
  bakery: {
    icon: "🥖",
    points: 8,
    arrive: (name) =>
      `The bakery! Smell the warm bread. Fresh bread, please. Mmm! ` +
      `Lovely, ${name}.`,
  },
  beach: {
    icon: "🏖️",
    points: 6,
    arrive: (name) =>
      `The beach! Sand, sea, and sun. Listen to the waves. ` +
      `What a view, ${name}!`,
  },
  park: {
    icon: "🌳",
    points: 6,
    arrive: (name) =>
      `The park! Green trees, fresh air. A good place to rest. ` +
      `Nice walk, ${name}.`,
  },
  friend: {
    icon: "🧑",
    points: 12,
    arrive: (name) =>
      `Hey — a friend! Say hello. "Hi, nice to meet you!" ` +
      `New friends already, ${name}. Brilliant!`,
  },
  generic: {
    icon: "📍",
    points: 5,
    arrive: (name) =>
      `Here we are! A new place to know. Good exploring, ${name}!`,
  },
};

/** Look up a mission type, falling back to the generic one. */
export function getMissionType(type) {
  return MISSION_TYPES[type] || MISSION_TYPES.generic;
}

/** The list an admin chooses from when pinning a spot on the map. */
export function missionTypeOptions() {
  return Object.keys(MISSION_TYPES).filter((t) => t !== "generic");
}

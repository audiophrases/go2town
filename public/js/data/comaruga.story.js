// ---------------------------------------------------------------------------
// comaruga.story.js — "Sunset": the arrival storyline (teen audience).
//
// You arrive alone in Coma-ruga as an exchange student. Your friend Mar can't
// make the station and messages you to meet at the sea before sunset — ask
// locals if you get lost. AR elements are story/task nodes (a buzzing phone, a
// local to talk to), not vocabulary labels. Dialogue is AUDIO-ONLY: the learner
// taps an intent icon, hears the line in the player voice, and the character
// replies in their own voice. No written English anywhere.
//
// Voices are validated server-side (ALLOWED_VOICES in server.py). Each speaker
// gets a distinct voice so the learner can tell them apart by ear.
// ---------------------------------------------------------------------------

export const VOICES = {
  coco: "en-US-AvaNeural", // the guide / narrator (matured tone)
  friend: "en-US-JennyNeural", // Mar — the off-screen friend texting you
  local: "en-US-GuyNeural", // people you meet on the street
  learner: "en-US-EmmaNeural", // the player's own spoken choices (modelled output)
};

export const STORY = {
  arrival: {
    cocoIntro:
      "Okay — you made it to Coma-ruga. Long trip. Your phone is buzzing… you should check that.",
    phoneMessage:
      "Hey, it's Mar! I'm so sorry, I can't get to the station in time. " +
      "Meet me down by the sea before sunset, yeah? If you get lost, just ask someone — everyone's friendly here. You've got this!",
    cocoAfterPhone:
      "No ride, then. The sea it is. There's someone right over there — go on, ask them.",
    localDialogue: {
      npc: "Hey. You look a little lost. Need a hand?",
      prompt: "Your move — what do you say?",
      choices: [
        {
          id: "ask",
          icon: "🧭",
          aria: "ask the way",
          learnerLine: "Hi, excuse me — how do I get to the sea?",
          response:
            "The sea? Easy. Head straight this way and keep going — you'll smell it before you see it. Good luck!",
          result: "advance",
        },
        {
          id: "greet",
          icon: "👋",
          aria: "say hello",
          learnerLine: "Hi. I'm new here, just arrived today.",
          response: "Ah, welcome to Coma-ruga! First time? Ask me anything you need.",
          result: "stay",
        },
        {
          id: "again",
          icon: "🔁",
          aria: "ask them to repeat",
          result: "repeat",
        },
      ],
    },
    cocoHandoff: "Straight ahead, like she said. Follow the arrow — let's go find Mar.",
  },

  // AR story elements, geo-anchored a few metres in front of the start pano
  // (lat 41.1795443, lng 1.525321) so they're in view the moment you arrive.
  elements: {
    phone: { id: "phone", kind: "clue", icon: "📱", lat: 41.1796484, lng: 1.5252839 },
    local: { id: "local", kind: "character", icon: "🧑", lat: 41.1796571, lng: 1.5253611 },
  },
};

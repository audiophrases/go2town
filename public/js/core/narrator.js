// ---------------------------------------------------------------------------
// narrator.js — Coco, the friendly seagull guide of Coma-ruga.
//
// Coco is the single voice the learner hears. She never shows written English;
// she only speaks (via tts.js) and animates her avatar. All Phase One lines
// live here in SCRIPT so her "voice" stays in one place. Lines are functions of
// the learner's name where needed, so Coco can greet people personally.
//
// Immersive-learning notes baked into the wording:
//   - short sentences, concrete nouns, lots of repetition
//   - the key word of each line is repeated (e.g. "train station ... the trains")
//   - every instruction can be replayed with the 🔊 button (handled in the HUD)
// ---------------------------------------------------------------------------

import { speaker } from "./tts.js";
import { CONFIG } from "../config.js";

export const SCRIPT = {
  greeting: () =>
    "Hey — welcome to Coma-ruga. I'm Coco, I'll show you the ropes around here. " +
    "First things first: what should I call you?",

  welcome: (name) =>
    `${name}. Good to meet you, ${name}. ` +
    "Big day — new town, and you're on your own. Don't worry, I've got you. Let's get moving.",

  // Spoken once the map appears — sets up the free-roam ("go anywhere") loop.
  roamIntro: (name) =>
    `Look — here's our town map, down in the corner. ` +
    `See the little pins? Each one is a place to find: a shop, some food, your home. ` +
    `Walk to any pin you like, ${name}. Use your arrows to move. Off you go!`,

  // Spoken when the learner gets meaningfully closer to the target.
  nudgeCloser: () => "Yes! You are getting closer! Keep going!",
  nudgeClose: () => "Almost there! It is very close now!",

  // Spoken if the learner wanders the wrong way for a while.
  nudgeFar: () => "Hmm, this way is far. Follow my arrow!",

  // After every mission is done.
  allDone: (name) =>
    `Nice work, ${name}. You found your way across town and made it to the sea — and to Mar. ` +
    "Not bad for day one. See you out there.",

  replayHint: () => "Listen again.",

  // Vocabulary mini-game lines (core/learn.js). Word-specific copy lives in the
  // vocab data; these are the functional prompts Coco speaks around a tap.
  vocab: {
    ask: (word) => `Where is the ${word}? Tap the ${word}!`,
    found: (word) => `Yes! The ${word}! Well done!`,
    redirect: (tapped, word) => `Hmm, that is the ${tapped}. Find the ${word}!`,
  },
};

class Coco {
  constructor() {
    this.name = "Coco";
    this.avatarEl = null;
    this.captionEl = null;
    this._lastLine = null; // remembered so the 🔊 button can replay it
  }

  /** Hook up the DOM bits the narrator controls. */
  mount({ avatarEl, captionEl }) {
    this.avatarEl = avatarEl;
    this.captionEl = captionEl;
  }

  /**
   * Speak a line as Coco: animate the avatar, optionally show a dev caption,
   * and remember the line so it can be replayed.
   * @returns {Promise<void>} resolves when she finishes talking.
   */
  async say(text, { remember = true, interrupt = false } = {}) {
    if (remember) this._lastLine = text;
    this._setSpeaking(true);
    if (CONFIG.debug && this.captionEl) {
      this.captionEl.textContent = `🐦 ${text}`;
      this.captionEl.classList.add("show");
    }
    try {
      await speaker.speak(text, { interrupt });
    } finally {
      this._setSpeaking(false);
      if (CONFIG.debug && this.captionEl) this.captionEl.classList.remove("show");
    }
  }

  /** Repeat the most recent meaningful line (powers the 🔊 replay button). */
  async replayLast() {
    if (this._lastLine) await this.say(this._lastLine, { remember: false, interrupt: true });
  }

  _setSpeaking(on) {
    if (this.avatarEl) this.avatarEl.classList.toggle("speaking", on);
  }
}

export const coco = new Coco();

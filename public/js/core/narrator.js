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
    "Hello! Hello! I am Coco. I am a little seagull. " +
    "Welcome to my town! What is your name?",

  welcome: (name) =>
    `${name}! Nice to meet you, ${name}! ` +
    "Welcome to Coma-ruga, by the sea.",

  firstMission: () =>
    "Now, your first mission. Are you ready? " +
    "Go to the train station. The train station! " +
    "Look for the trains. Follow my arrow. Let's go!",

  // Spoken when the learner gets meaningfully closer to the target.
  nudgeCloser: () => "Yes! You are getting closer! Keep going!",
  nudgeClose: () => "Almost there! The train station is very close now!",

  // Spoken if the learner wanders the wrong way for a while.
  nudgeFar: () => "Hmm, this way is far. Follow my arrow. Find the trains!",

  arrival: (name) =>
    `You did it, ${name}! Hooray! This is the train station. ` +
    "Listen — the trains! Choo choo! Wonderful job!",

  replayHint: () => "Listen again.",
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

// ---------------------------------------------------------------------------
// learn.js — the "instinctive vocabulary" engine.
//
// Pedagogy: every AR object is a form → meaning → action triad. Tapping it
// (action) plays Coco's word (form) while the icon + real Street View show the
// referent (meaning). After a few new words are met, Coco runs a no-pressure
// "find it" comprehension check. Nothing is ever written in English; progress
// shows only as stars. Word data lives in data/comaruga.vocab.js.
//
// This module is decoupled from the world provider: the provider just renders
// tappable AR objects and emits a `go2town:ar` event on tap (mirroring
// `go2town:portal`); all teaching logic lives here.
// ---------------------------------------------------------------------------

import { coco, SCRIPT } from "./narrator.js";
import { CONFIG } from "../config.js";
import { VOCAB } from "../data/comaruga.vocab.js";

const STORE_KEY = "go2town.vocab.v1";

function loadKnown() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

class LearnEngine {
  constructor() {
    this.world = null;
    this.starsEl = null;
    this.objects = [];
    this.known = loadKnown(); // ids the learner has heard at least once
    this.stars = 0;
    this.check = null; // { word } while a find-it check is running
    this._sinceCheck = []; // words newly met since the last check
    this._wired = false;
  }

  start(world, { starsEl } = {}) {
    this.world = world;
    this.starsEl = starsEl || null;
    // Fresh copy so we can flip per-object `learned` flags for the glow.
    this.objects = VOCAB.map((v) => ({ ...v, learned: this.known.has(v.id) }));
    this.stars = this.known.size;
    this._renderStars();
    this._push();
    if (!this._wired) {
      window.addEventListener("go2town:ar", (e) => this._onTap(e.detail || {}));
      this._wired = true;
    }
  }

  _push() {
    if (this.world && typeof this.world.setArObjects === "function") {
      this.world.setArObjects(this.objects);
    }
  }

  _onTap(obj) {
    if (!obj || !obj.id) return;
    if (this.check) {
      this._answer(obj);
      return;
    }
    this._teach(obj);
  }

  _teach(obj) {
    const line = obj.say?.label || `${obj.word}. ${obj.word}.`;
    // remember:false → the 🔊 button still replays the mission line, not a word.
    coco.say(line, { remember: false, interrupt: true });
    if (this.known.has(obj.id)) return; // already met: replay only, no new star
    this.known.add(obj.id);
    this._persist();
    this._award();
    this._markLearned(obj.id);
    this._sinceCheck.push(obj.word);
    this._maybeCheck();
  }

  _maybeCheck() {
    const every = CONFIG.learn?.checkEveryWords ?? 3;
    if (this._sinceCheck.length < every) return;
    const word = this._sinceCheck[Math.floor(Math.random() * this._sinceCheck.length)];
    this._sinceCheck = [];
    this.check = { word };
    // Queue (don't interrupt) so the teaching line finishes before Coco asks.
    coco.say(SCRIPT.vocab.ask(word), { remember: false });
  }

  _answer(obj) {
    const target = this.check.word;
    if (obj.word === target) {
      this.check = null;
      coco.say(SCRIPT.vocab.found(target), { remember: false, interrupt: true });
      this._award();
    } else {
      // A wrong tap is still useful input: name what they tapped, then re-ask.
      coco.say(SCRIPT.vocab.redirect(obj.word, target), { remember: false, interrupt: true });
    }
  }

  _markLearned(id) {
    const o = this.objects.find((x) => x.id === id);
    if (o) o.learned = true;
    this._push();
  }

  _award() {
    this.stars += 1;
    this._renderStars();
  }

  _renderStars() {
    if (this.starsEl) this.starsEl.textContent = `⭐ ${this.stars}`;
  }

  _persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify([...this.known]));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }
}

export const learn = new LearnEngine();

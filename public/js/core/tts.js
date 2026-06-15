// ---------------------------------------------------------------------------
// tts.js — speak the narrator's lines out loud.
//
// Talks to the local /api/tts endpoint, which streams MP3 from edge-tts.
// The server caches by hash and sends immutable cache headers, so a repeated
// line plays instantly from the browser cache. We add a small queue so several
// lines play in order, and an `unlock()` step to satisfy browser autoplay
// policies (audio may only start after a user gesture).
// ---------------------------------------------------------------------------

import { CONFIG } from "../config.js";

class Speaker {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.queue = [];
    this.playing = false;
    this.unlocked = false;
    this._onWord = null; // optional: callback fired when a line starts
  }

  /** Call once from inside a real user gesture (e.g. the Start button). */
  async unlock() {
    if (this.unlocked) return;
    this.unlocked = true; // set first: this must never block the game flow
    try {
      // A silent play/pause primes the audio element so later programmatic
      // .play() calls are allowed. play() on an empty element can hang (e.g.
      // headless Chrome), so cap the wait — priming still happened either way.
      this.audio.muted = true;
      await Promise.race([
        this.audio.play().catch(() => {}),
        new Promise((r) => setTimeout(r, 400)),
      ]);
    } catch {
      /* ignore */
    }
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.audio.muted = false;
  }

  _url(text, opts) {
    const params = new URLSearchParams({
      text,
      voice: opts.voice ?? CONFIG.voice,
      rate: opts.rate ?? CONFIG.rate,
      pitch: opts.pitch ?? CONFIG.pitch,
    });
    return `/api/tts?${params.toString()}`;
  }

  /**
   * Speak a line. Returns a promise that resolves when it finishes playing.
   * @param {string} text
   * @param {{interrupt?:boolean, voice?:string, rate?:string, pitch?:string, onStart?:Function}} [opts]
   */
  speak(text, opts = {}) {
    if (opts.interrupt) this.stop();
    return new Promise((resolve) => {
      this.queue.push({ text, opts, resolve });
      this._drain();
    });
  }

  stop() {
    this.queue.forEach((item) => item.resolve());
    this.queue = [];
    this.audio.pause();
    this.audio.currentTime = 0;
    this.playing = false;
  }

  async _drain() {
    if (this.playing) return;
    const item = this.queue.shift();
    if (!item) return;
    this.playing = true;

    const { text, opts, resolve } = item;
    const done = () => {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.playing = false;
      resolve();
      this._drain(); // next in queue
    };

    this.audio.onended = done;
    this.audio.onerror = () => {
      console.warn("[tts] failed to play:", text);
      done();
    };

    try {
      if (opts.onStart) opts.onStart();
      this.audio.src = this._url(text, opts);
      await this.audio.play();
    } catch (err) {
      console.warn("[tts] play() rejected:", err);
      done();
    }
  }
}

export const speaker = new Speaker();

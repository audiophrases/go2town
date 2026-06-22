// ---------------------------------------------------------------------------
// story.js — the scenario / dialogue engine for the "Sunset" arrival storyline.
//
// AR elements are story nodes: a `clue` you inspect (the phone) and a
// `character` you talk to. Talking is audio-only and branching: a character
// speaks (their voice), the learner picks an intent ICON (no text), the chosen
// line is spoken in the player voice, the character replies, and the branch
// advances / loops / repeats. Comprehension is read from the choice, never
// from a written quiz.
//
// World coupling is minimal: the provider renders tappable AR objects from
// `world.setArObjects()` and emits `go2town:ar` on tap (same contract the
// vocab prototype used). Everything narrative lives here + in data/comaruga.story.js.
// ---------------------------------------------------------------------------

import { coco } from "./narrator.js";
import { speaker } from "./tts.js";
import { STORY, VOICES } from "../data/comaruga.story.js";

class Story {
  constructor() {
    this.world = null;
    this.starsEl = null;
    this.stars = 0;
    this.stage = "idle"; // observable scene state: idle→intro→phone→local→dialogue→done
  }

  start(world, { starsEl } = {}) {
    this.world = world;
    this.starsEl = starsEl || null;
    this._renderStars();
  }

  // A character/NPC line in a given voice (no Coco avatar animation).
  _npcSay(text, voice) {
    return speaker.speak(text, { voice, interrupt: false });
  }

  // The player's own spoken choice — modelled output in the learner voice.
  _learnerSay(text) {
    return speaker.speak(text, { voice: VOICES.learner, interrupt: false });
  }

  // Show AR elements and resolve with the one the learner taps.
  _awaitTap(elements) {
    if (this.world && typeof this.world.setArObjects === "function") {
      this.world.setArObjects(elements);
    }
    return new Promise((resolve) => {
      const handler = (e) => {
        window.removeEventListener("go2town:ar", handler);
        resolve(e.detail || {});
      };
      window.addEventListener("go2town:ar", handler);
    });
  }

  // Screen-anchored intent-icon choice bar. Resolves with the chosen option.
  _choose(choices) {
    return new Promise((resolve) => {
      const bar = document.createElement("div");
      bar.className = "story-choices";
      for (const c of choices) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "story-choice";
        btn.textContent = c.icon;
        btn.setAttribute("aria-label", c.aria || c.id);
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          bar.remove();
          resolve(c);
        });
        bar.appendChild(btn);
      }
      document.body.appendChild(bar);
    });
  }

  async _runDialogue(node) {
    await this._npcSay(node.npc, VOICES.local);
    // Loop until a choice advances the story (greet/repeat keep the chat open).
    // No wrong answers: every reply is just more comprehensible input.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (node.prompt) await coco.say(node.prompt, { remember: false });
      const choice = await this._choose(node.choices);
      if (choice.learnerLine) await this._learnerSay(choice.learnerLine);
      if (choice.response) await this._npcSay(choice.response, VOICES.local);
      if (choice.result === "advance") return choice;
      if (choice.result === "repeat") await this._npcSay(node.npc, VOICES.local);
      // "stay" (and "repeat") fall through and re-offer the choices.
    }
  }

  /** Run the opening arrival scene; resolves when the learner heads off to find Mar. */
  async runArrival() {
    const A = STORY.arrival;
    this.stage = "intro";
    await coco.say(A.cocoIntro, { remember: false });

    // Beat 0 — the phone clue sets the goal in Mar's own voice.
    this.stage = "phone";
    await this._awaitTap([STORY.elements.phone]);
    await this._npcSay(A.phoneMessage, VOICES.friend);
    this._award();
    await coco.say(A.cocoAfterPhone, { remember: false });

    // Beat 1 — ask a local the way (audio-only branching dialogue).
    this.stage = "local";
    await this._awaitTap([STORY.elements.local]);
    this.stage = "dialogue";
    await this._runDialogue(A.localDialogue);
    this._award();

    if (this.world && typeof this.world.setArObjects === "function") this.world.setArObjects([]);
    await coco.say(A.cocoHandoff, { remember: false });
    this.stage = "done";
  }

  _award() {
    this.stars += 1;
    this._renderStars();
  }

  _renderStars() {
    if (this.starsEl) this.starsEl.textContent = `⭐ ${this.stars}`;
  }
}

export const story = new Story();

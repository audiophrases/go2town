// ---------------------------------------------------------------------------
// game.js — Phase One bootstrap and story flow for Coma-ruga.
//
// Flow:
//   ▶ start  → unlock audio
//   Coco greets and asks the learner's name
//   learner types their name (the only text they ever type)
//   Coco welcomes them by name and gives mission #1: go to the train station
//   learner walks Street View → Coco nudges them closer → arrival celebration
// ---------------------------------------------------------------------------

import { CONFIG } from "./config.js";
import { TOWN } from "./data/comaruga.js";
import { speaker } from "./core/tts.js";
import { coco, SCRIPT } from "./core/narrator.js";
import { world } from "./core/world.js";
import { missions } from "./core/missions.js";
import { hasSubgame, launchSubgame } from "./core/subgames.js";

// ---- DOM ------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const dom = {
  startGate: el("start-gate"),
  startBtn: el("start-btn"),
  nameModal: el("name-modal"),
  nameForm: el("name-form"),
  nameInput: el("name-input"),
  coco: el("coco"),
  caption: el("caption"),
  hud: el("hud"),
  hudIcon: el("hud-icon"),
  hudArrow: el("hud-arrow"),
  hudFill: el("hud-fill"),
  replayBtn: el("replay-btn"),
  devPanel: el("dev-panel"),
  devArrive: el("dev-arrive"),
  world: el("world"),
};

let learnerName = localStorage.getItem("go2town.name") || "";

// ---- Wire up the persistent UI -------------------------------------------
coco.mount({ avatarEl: dom.coco, captionEl: dom.caption });
missions.mountHud({
  hudEl: dom.hud,
  iconEl: dom.hudIcon,
  arrowEl: dom.hudArrow,
  fillEl: dom.hudFill,
});

if (CONFIG.debug) {
  dom.devPanel.classList.remove("hidden");
  dom.devArrive.addEventListener("click", () => missions.forceArrive());
}

// 🔊 replay the current instruction; tapping Coco does the same.
dom.replayBtn.addEventListener("click", () => coco.replayLast());
dom.coco.addEventListener("click", () => coco.replayLast());

// ---- Start gate (also unlocks audio under autoplay policy) ----------------
dom.startBtn.addEventListener("click", async () => {
  await speaker.unlock();
  dom.startGate.classList.add("hidden");
  await world.init({ container: dom.world, town: TOWN });
  dom.coco.classList.remove("hidden");
  runIntro();
});

// ---- Story ----------------------------------------------------------------
async function runIntro() {
  await coco.say(SCRIPT.greeting());
  askName();
}

function askName() {
  dom.nameModal.classList.remove("hidden");
  dom.nameInput.value = learnerName;
  dom.nameInput.focus();
}

dom.nameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = dom.nameInput.value.trim() || "friend";
  learnerName = name;
  localStorage.setItem("go2town.name", name);
  dom.nameModal.classList.add("hidden");

  await coco.say(SCRIPT.welcome(name));
  await coco.say(SCRIPT.firstMission());
  startTrainStationMission(name);
});

// ---- Mission #1: go to the train station ----------------------------------
function startTrainStationMission(name) {
  const station = TOWN.locations.trainStation;

  // Turn the configured distance thresholds into spoken nudges:
  // the nearest threshold gets the "almost there" line, the rest "getting closer".
  const sorted = [...CONFIG.proximityNudges].sort((a, b) => a - b);
  // remember:false so the 🔊 button always replays the mission instruction,
  // not the most recent "getting closer" nudge.
  const nudges = sorted.map((meters, i) => ({
    atMeters: meters,
    say: () =>
      coco.say(i === 0 ? SCRIPT.nudgeClose() : SCRIPT.nudgeCloser(), {
        remember: false,
      }),
  }));

  missions
    .run({
      icon: station.icon,
      target: { lat: station.lat, lng: station.lng },
      radius: CONFIG.arrivalRadiusMeters,
      nudges,
      onArrive: async () => {
        await coco.say(SCRIPT.arrival(name));
        // If a 2D subgame is registered for this spot, play it. (Phase Two.)
        if (station.subgame && hasSubgame(station.subgame)) {
          await launchSubgame(station.subgame, { name, location: station });
        }
      },
    })
    .then(() => {
      // Phase One ends here. The hook for mission #2 lives at this point.
      console.info(`[game] ${name} completed mission #1 (train station).`);
    });
}

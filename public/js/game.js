// ---------------------------------------------------------------------------
// game.js — Phase One bootstrap and story flow for Coma-ruga.
//
// Flow:
//   ▶ start  → unlock audio
//   Coco greets and asks the learner's name
//   learner types their name (the only text they ever type)
//   Coco welcomes them, then a tour of vetted route checkpoints with icon-only
//   HUD targets, spoken nudges, and arrival celebrations
//   (+ subgame hook).
// ---------------------------------------------------------------------------

import { CONFIG } from "./config.js";
import { TOWN } from "./data/comaruga.js";
import { MISSIONS } from "./data/comaruga.missions.js";
import { speaker } from "./core/tts.js";
import { coco, SCRIPT } from "./core/narrator.js";
import { world } from "./core/world.js";
import { missions } from "./core/missions.js";
import { learn } from "./core/learn.js";
import { isAdminName, mountAdmin, readAdminPortals } from "./core/admin.js";
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
  learnStars: el("learn-stars"),
  adminPanel: el("admin-panel"),
  adminStatus: el("admin-status"),
  adminList: el("admin-list"),
  adminExport: el("admin-export"),
  adminLabel: el("admin-label"),
  adminIcon: el("admin-icon"),
  adminSubgame: el("admin-subgame"),
  adminNotes: el("admin-notes"),
  adminAdd: el("admin-add"),
  adminCopy: el("admin-copy"),
  adminDownload: el("admin-download"),
  adminClear: el("admin-clear"),
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
const admin = mountAdmin({
  panel: dom.adminPanel,
  status: dom.adminStatus,
  list: dom.adminList,
  exportBox: dom.adminExport,
  labelInput: dom.adminLabel,
  iconInput: dom.adminIcon,
  subgameSelect: dom.adminSubgame,
  notesInput: dom.adminNotes,
  addBtn: dom.adminAdd,
  copyBtn: dom.adminCopy,
  downloadBtn: dom.adminDownload,
  clearBtn: dom.adminClear,
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
  if (typeof world.setPortals === "function") world.setPortals(readAdminPortals());
  learn.start(world, { starsEl: dom.learnStars });
  dom.coco.classList.remove("hidden");

  window.addEventListener("go2town:portal", (event) => {
    const portal = event.detail || {};
    console.info("[portal] selected", portal);
    coco.say(`This gate will open the ${portal.label || "room"} soon!`, { remember: false });
  });

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
  if (isAdminName(name)) {
    dom.nameModal.classList.add("hidden");
    localStorage.removeItem("go2town.name");
    admin.start(world);
    return;
  }
  learnerName = name;
  localStorage.setItem("go2town.name", name);
  dom.nameModal.classList.add("hidden");

  await coco.say(SCRIPT.welcome(name));
  runMissions(name);
});

// Turn the configured distance thresholds into spoken nudges. remember:false so
// the 🔊 button always replays the mission instruction, not the latest nudge.
function buildNudges() {
  const sorted = [...CONFIG.proximityNudges].sort((a, b) => a - b);
  return sorted.map((meters, i) => ({
    atMeters: meters,
    say: () =>
      coco.say(i === 0 ? SCRIPT.nudgeClose() : SCRIPT.nudgeCloser(), { remember: false }),
  }));
}

// ---- The tour: walk to each route checkpoint in turn ------------------------
async function runMissions(name) {
  for (const m of MISSIONS) {
    // Give the world the mission target for HUD / arrival state, then announce it.
    // Route movement itself stays on the deterministic capture chain.
    if (typeof world.setGoal === "function") world.setGoal({ ...m.target, icon: m.icon, subgame: m.subgame });
    await coco.say(m.mission(name));

    await missions.run({
      icon: m.icon,
      target: m.target,
      radius: CONFIG.arrivalRadiusMeters,
      nudges: buildNudges(),
      onArrive: async () => {
        await coco.say(m.arrival(name));
        // Future: a 2D "room" for this stop. Stub returns immediately for now.
        if (m.subgame && hasSubgame(m.subgame)) {
          await launchSubgame(m.subgame, { name, mission: m });
        }
      },
    });
    console.info(`[game] ${name} reached "${m.id}".`);
  }
  await coco.say(SCRIPT.allDone(name));
}

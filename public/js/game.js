// ---------------------------------------------------------------------------
// game.js — bootstrap + free-roam ("GTA") flow for Coma-ruga.
//
// Flow:
//   ▶ start  → unlock audio, load live Street View + the corner minimap
//   Coco greets and asks the learner's name
//   learner types their name (the only text they ever type)
//   Coco welcomes them, then free-roam begins: the minimap shows every pinned
//   spot as an open mission. Walk up to any pin → Coco reacts (audio only),
//   points are awarded, the pin turns green. No written English, ever; the 🔊
//   button replays Coco's last line.
//
// Admin (name "q23r-"): the minimap becomes clickable to pin new spots.
// ---------------------------------------------------------------------------

import { CONFIG } from "./config.js";
import { TOWN } from "./data/comaruga.js";
import { DEFAULT_SPOTS } from "./data/comaruga.spots.js";
import { speaker } from "./core/tts.js";
import { coco, SCRIPT } from "./core/narrator.js";
import { world } from "./core/world.js";
import { minimap } from "./core/minimap.js";
import { score } from "./core/score.js";
import { missionBoard } from "./core/missionBoard.js";
import { isAdminName, mountAdmin, readAdminPortals, readAdminSpots } from "./core/admin.js";

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
  minimap: el("minimap"),
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
minimap.mount({ container: dom.minimap });
score.mount(dom.learnStars);
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
  // Fast-travel to the nearest open pin so its mission can be tested instantly.
  dom.devArrive.addEventListener("click", async () => {
    const spot = missionBoard.nearestOpen();
    if (spot && typeof world.jumpToNearest === "function") {
      await world.jumpToNearest({ lat: spot.lat, lng: spot.lng });
    }
  });
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
  // Ride the live Street View map with a GTA-style minimap (Google worlds only;
  // the demo / pano360 fallbacks have no map to bind to, so it stays hidden).
  minimap.bind(world);
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
    minimap.setAdminMode(true); // click the map to drop pins
    admin.start(world);
    return;
  }
  learnerName = name;
  localStorage.setItem("go2town.name", name);
  dom.nameModal.classList.add("hidden");

  await coco.say(SCRIPT.welcome(name));
  startFreeRoam(name);
});

// ---- Free-roam: every pin on the minimap is an open mission ----------------
function startFreeRoam(name) {
  // Default town pins, with any admin-placed pins merged on top (same id wins).
  const spots = mergeSpots(DEFAULT_SPOTS, readAdminSpots());
  missionBoard.start({
    world,
    minimap,
    score,
    spots,
    getName: () => learnerName || name,
  });
  coco.say(SCRIPT.roamIntro(name));
}

// Admin-placed spots override defaults sharing the same id; the rest append.
function mergeSpots(defaults, extra) {
  const byId = new Map(defaults.map((s) => [s.id, s]));
  for (const s of extra || []) byId.set(s.id, s);
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// pano360.js — the default world: your own 360° photos of the town.
//
// Free, offline, unlimited (no API, no key, no per-load billing). Renders an
// equirectangular "tour" with Pannellum: each scene is a spot you captured,
// linked by clickable ground hotspots you walk through — Street-View-like.
//
// Until you drop in real photos, every scene auto-generates a friendly
// placeholder panorama on a <canvas>, so the whole game is playable today.
//
// Bridge to the mission engine: each scene carries the lat/lng where the photo
// was taken. On a scene change we set world.position to that point and emit, so
// distance/arrival "just work" exactly like Street View. A light rAF loop reads
// the view yaw so the HUD arrow stays correct as the learner looks around.
// ---------------------------------------------------------------------------

import { WorldBase } from "../worldBase.js";
import { bearing, haversine } from "../geo.js";
import { CONFIG } from "../../config.js";
import { installDemoBackdrop } from "./demo.js";

function ensurePannellum() {
  if (window.pannellum) return Promise.resolve(window.pannellum);
  if (!document.querySelector("link[data-pnlm]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "vendor/pannellum/pannellum.css";
    link.dataset.pnlm = "1";
    document.head.appendChild(link);
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/pannellum/pannellum.js";
    s.async = true;
    s.onload = () =>
      window.pannellum ? resolve(window.pannellum) : reject(new Error("no pannellum"));
    s.onerror = () => reject(new Error("pannellum failed to load"));
    document.head.appendChild(s);
  });
}

// Build the six Pannellum cubemap faces from a Google Street View pano's four
// 90°-FOV side captures. Pannellum order is [front, right, back, left, up, down];
// Street View heading 0/90/180/270 = north/east/south/west = front/right/back/left.
// Top & bottom weren't captured, so "null" lets Pannellum show the background.
// (If left/right ever look mirrored, swap indices 1 and 3 here.)
const CUBE_HEADINGS = ["h000", "h090", "h180", "h270"];
function cubeFaces(panoId) {
  const base = `imagery/captures/google_${panoId}`;
  return [
    `${base}_${CUBE_HEADINGS[0]}/image.jpg`, // front  (N)
    `${base}_${CUBE_HEADINGS[1]}/image.jpg`, // right  (E)
    `${base}_${CUBE_HEADINGS[2]}/image.jpg`, // back   (S)
    `${base}_${CUBE_HEADINGS[3]}/image.jpg`, // left   (W)
    "null", // up    — not captured
    "null", // down  — not captured
  ];
}

// Paint a clearly-a-placeholder equirectangular panorama (beach bands + label).
function makePlaceholderPano(scene, idx, total) {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 1024;
  const g = c.getContext("2d");

  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#aee3f5");
  sky.addColorStop(1, "#e8f8ff");
  g.fillStyle = sky;
  g.fillRect(0, 0, 2048, 512);

  const sea = g.createLinearGradient(0, 512, 0, 580);
  sea.addColorStop(0, "#1ca7c4");
  sea.addColorStop(1, "#0e7490");
  g.fillStyle = sea;
  g.fillRect(0, 512, 2048, 68);

  const sand = g.createLinearGradient(0, 580, 0, 1024);
  sand.addColorStop(0, "#f6e3b4");
  sand.addColorStop(1, "#e9cf92");
  g.fillStyle = sand;
  g.fillRect(0, 580, 2048, 444);

  g.fillStyle = "#ffd24a"; // sun
  g.beginPath();
  g.arc(1024, 150, 70, 0, Math.PI * 2);
  g.fill();

  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#0b3a4a";
  g.font = "160px 'Segoe UI Emoji', 'Segoe UI', sans-serif";
  g.fillText(scene.icon || "📍", 1024, 360);
  g.font = "bold 60px 'Segoe UI', sans-serif";
  g.fillText(`${idx + 1} / ${total}`, 1024, 470);
  g.font = "120px 'Segoe UI Emoji', sans-serif";
  g.fillText("⬆️", 1024, 760); // a path marker on the sand

  return c.toDataURL("image/jpeg", 0.72);
}

export class Pano360World extends WorldBase {
  async init({ container, town }) {
    await super.init({ container, town });
    let pannellum;
    try {
      pannellum = await ensurePannellum();
    } catch (err) {
      console.warn("[world] Pannellum unavailable, using demo backdrop:", err);
      return installDemoBackdrop(this);
    }
    if (!town.scenes || !town.startScene) {
      console.warn("[world] No 360 scenes defined; using demo backdrop.");
      return installDemoBackdrop(this);
    }

    this.mode = "pano360";
    this.scenes = town.scenes;
    this._northOffsets = {};
    // The current "goal" the walk button + auto-facing aim at. Missions update
    // it via setGoal(); default to the configured station.
    this._goal = town.locations.trainStation;
    const ids = Object.keys(this.scenes);

    const builtScenes = {};
    ids.forEach((id, idx) => {
      const sc = this.scenes[id];
      const fwd = this._linkNearestTo(id, this._goal);
      // Cubemap scenes (Google Street View faces) are north-aligned: the front
      // face looks at compass heading 0, so yaw 0 == north (northOffset 0).
      // Placeholder/equirect scenes default to facing the next waypoint.
      const northOffset = sc.cube
        ? sc.northOffset ?? 0
        : sc.northOffset ?? (fwd ? bearing(sc, this.scenes[fwd]) : 0);
      this._northOffsets[id] = northOffset;

      const toYaw = (linkId) =>
        ((bearing(sc, this.scenes[linkId]) - northOffset + 540) % 360) - 180;

      // All links are walkable footsteps; the HUD arrow, auto-facing, and walk
      // button (all goal-aware) supply the direction, so no baked fwd/back.
      const hotSpots = (sc.links || []).map((linkId) => ({
        type: "scene",
        sceneId: linkId,
        yaw: toYaw(linkId),
        pitch: -22, // sits on the ground like footsteps
        cssClass: "go2-hs go2-hs-fwd",
      }));

      // Spawn each pano facing the goal so the way forward is dead-ahead.
      const initialYaw = fwd ? toYaw(fwd) : 0;
      const common = { northOffset, hfov: 110, yaw: initialYaw, pitch: 0, hotSpots };
      if (sc.cube) {
        builtScenes[id] = { type: "cubemap", cubeMap: cubeFaces(id), ...common };
      } else if (sc.image) {
        builtScenes[id] = {
          type: "equirectangular",
          panorama: `img/scenes/${sc.image}`,
          ...common,
        };
      } else {
        builtScenes[id] = {
          type: "equirectangular",
          panorama: makePlaceholderPano(sc, idx, ids.length),
          ...common,
        };
      }
    });

    this.viewer = pannellum.viewer(this.container, {
      default: {
        firstScene: town.startScene,
        autoLoad: true,
        showControls: false,
        compass: false,
        draggable: true,
        mouseZoom: true,
        sceneFadeDuration: CONFIG.move?.fadeMs ?? 300,
        hfov: 110,
      },
      scenes: builtScenes,
    });

    this._setScene(town.startScene);
    this.viewer.on("scenechange", (id) => this._setScene(id));
    this._initControls();

    // Keep heading live as the learner looks around (Pannellum has no yaw event).
    const tick = () => {
      if (!this.viewer) return;
      try {
        const yaw = this.viewer.getYaw();
        const heading = (this._currentNorthOffset + yaw + 360) % 360;
        if (Math.abs(((heading - this.heading + 540) % 360) - 180) > 1) {
          this.heading = heading;
          this._emit();
        }
      } catch {
        /* viewer not ready yet */
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);

    return { mode: "pano360" };
  }

  _setScene(id) {
    const sc = this.scenes[id];
    if (!sc) return;
    this._currentScene = id;
    this.position = { lat: sc.lat, lng: sc.lng };
    this._currentNorthOffset = this._northOffsets[id] ?? 0;
    // Heading is kept from the view (driving preserves it); the rAF loop syncs
    // it from the actual yaw on the next frame.
    this._emit();
  }

  /** The neighbour of `id` closest to a goal {lat,lng}. */
  _linkNearestTo(id, goal) {
    if (!goal) return null;
    let best = null;
    let bestDist = Infinity;
    for (const l of this.scenes[id]?.links || []) {
      const d = nearnessTo(this.scenes[l], goal);
      if (d < bestDist) {
        bestDist = d;
        best = l;
      }
    }
    return best;
  }

  /** Point the view (yaw) at the current goal in the current scene. */
  _faceView() {
    if (!this.viewer || !this._currentScene || !this._goal) return;
    const sc = this.scenes[this._currentScene];
    const yaw =
      ((bearing(sc, this._goal) - (this._northOffsets[this._currentScene] || 0) + 540) % 360) - 180;
    try {
      this.viewer.setYaw(yaw, false);
    } catch {
      /* viewer mid-transition */
    }
  }

  /** New mission target: turn the view to face it once (orientation assist). */
  setGoal(goal) {
    if (goal) this._goal = goal;
    this._faceView();
  }

  // ---- Hold-to-drive movement -------------------------------------------
  // Hold ↑/W (or the 🚶 button) to flow forward through panos in the direction
  // you're looking; ←/→ or A/D steer; ↓/S reverses. Mouse-drag still looks
  // around. Speed is distance-based (CONFIG.move) for a "driving" feel.

  _initControls() {
    const m = CONFIG.move || {};
    this._coneDeg = m.forwardConeDeg ?? 80;
    this._turnSpeed = m.turnDegPerSec ?? 80;
    this._move = 0; // -1 back, 0 stop, +1 forward
    this._turn = 0; // -1 left, +1 right
    this._driving = false;

    const typing = () => {
      const el = document.activeElement;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const KEY = {
      ArrowUp: "f", KeyW: "f", ArrowDown: "b", KeyS: "b",
      ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r",
    };

    this._onKey = (down) => (e) => {
      const a = KEY[e.code];
      if (!a || typing()) return; // never swallow keys while typing a name
      e.preventDefault();
      e.stopImmediatePropagation(); // override Pannellum's own arrow handling
      if (a === "f") this._setMove(down ? 1 : this._move === 1 ? 0 : this._move);
      else if (a === "b") this._setMove(down ? -1 : this._move === -1 ? 0 : this._move);
      else if (a === "l") this._turn = down ? -1 : this._turn === -1 ? 0 : this._turn;
      else if (a === "r") this._turn = down ? 1 : this._turn === 1 ? 0 : this._turn;
    };
    window.addEventListener("keydown", this._onKey(true), true);
    window.addEventListener("keyup", this._onKey(false), true);

    // Smooth steering loop (independent of the hop scheduler).
    let last = performance.now();
    const turnLoop = (ts) => {
      const dt = (ts - last) / 1000;
      last = ts;
      if (this._turn && this.viewer) {
        try {
          this.viewer.setYaw(this.viewer.getYaw() + this._turn * this._turnSpeed * dt, false);
        } catch {
          /* mid-transition */
        }
      }
      this._turnRaf = requestAnimationFrame(turnLoop);
    };
    this._turnRaf = requestAnimationFrame(turnLoop);
  }

  /** Start/stop driving forward — used by the on-screen 🚶 button (hold). */
  startWalk() { this._setMove(1); }
  stopWalk() { this._setMove(0); }

  _setMove(dir) {
    this._move = dir;
    if (dir !== 0 && !this._driving) {
      this._driving = true;
      this._driveTick();
    }
  }

  _driveTick() {
    if (this._move === 0) {
      this._driving = false;
      return;
    }
    const m = CONFIG.move || {};
    const next = this._directionalLink(this._move === 1 ? 0 : 180);
    let wait = 150; // nothing ahead — re-check soon (you may turn)
    if (next) {
      const dist = haversine(this.scenes[this._currentScene], this.scenes[next]) || (m.refMeters ?? 40);
      this._hopTo(next);
      const base = (m.hopBaseMs ?? 480) * (dist / (m.refMeters ?? 40));
      wait = Math.min(m.hopMaxMs ?? 850, Math.max(m.hopMinMs ?? 260, base));
    }
    this._driveTimer = setTimeout(() => this._driveTick(), wait);
  }

  /** The neighbouring pano nearest the direction `relDeg` from the current view. */
  _directionalLink(relDeg) {
    const cur = this.scenes[this._currentScene];
    if (!cur || !this.viewer) return null;
    let viewHeading;
    try {
      viewHeading = (this._currentNorthOffset + this.viewer.getYaw() + 360) % 360;
    } catch {
      return null;
    }
    const target = (viewHeading + relDeg) % 360;
    let best = null;
    let bestDiff = Infinity;
    for (const l of cur.links || []) {
      const diff = Math.abs(((bearing(cur, this.scenes[l]) - target + 540) % 360) - 180);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = l;
      }
    }
    return bestDiff <= this._coneDeg ? best : null;
  }

  /** Load a neighbour while preserving the current look direction (smooth drive). */
  _hopTo(next) {
    if (!this.viewer) return;
    try {
      const viewHeading = (this._currentNorthOffset + this.viewer.getYaw() + 360) % 360;
      const newYaw = ((viewHeading - (this._northOffsets[next] || 0) + 540) % 360) - 180;
      this.viewer.loadScene(next, this.viewer.getPitch(), newYaw, this.viewer.getHfov());
    } catch {
      /* mid-transition; the next tick retries */
    }
  }
}

// Cheap "which neighbour is closer to the goal" comparison (no need for exact
// metres here — only the ordering matters).
function nearnessTo(a, b) {
  const dLat = a.lat - b.lat;
  const dLng = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180);
  return dLat * dLat + dLng * dLng;
}

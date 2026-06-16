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
const normHeading = (deg) => ((deg % 360) + 360) % 360;
const signedAngleDelta = (from, to) => ((to - from + 540) % 360) - 180;
const angleDistance = (a, b) => Math.abs(signedAngleDelta(a, b));

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
    // The mission goal is only for HUD / arrival state. Movement follows the
    // fixture route order, not a best-guess neighbour toward the goal; otherwise
    // one key press can jump across town when the graph has nearby branches.
    this._goal = town.locations.trainStation;
    const ids = Object.keys(this.scenes).sort(
      (a, b) => (this.scenes[a].routeIndex ?? 0) - (this.scenes[b].routeIndex ?? 0)
    );

    const builtScenes = {};
    ids.forEach((id, idx) => {
      const sc = this.scenes[id];
      // Cubemap scenes (Google Street View faces) are north-aligned: the front
      // face looks at compass heading 0, so yaw 0 == north (northOffset 0).
      // Placeholder/equirect scenes default to facing the next route point.
      const next = this._routeNeighbor(id, 1);
      const northOffset = sc.cube
        ? sc.northOffset ?? 0
        : sc.northOffset ?? (next ? bearing(sc, this.scenes[next]) : 0);
      this._northOffsets[id] = northOffset;

      const toYaw = (linkId) =>
        ((bearing(sc, this.scenes[linkId]) - northOffset + 540) % 360) - 180;

      // Expose every safe nearby capture as the same neutral step marker. There
      // is no baked left/right/forward meaning: keyboard movement and clicks are
      // resolved by the real direction of the marker from the current view.
      const routeHotspot = (option) => {
        const linkId = option.sceneId;
        const faceHeading = option.heading;
        const targetYaw =
          ((faceHeading - (this.scenes[linkId].northOffset ?? 0) + 540) % 360) - 180;
        return {
          type: "scene",
          sceneId: linkId,
          targetPitch: 0,
          targetYaw,
          targetHfov: 110,
          yaw: toYaw(linkId),
          pitch: -22, // sits low in the panorama, like a ground direction marker
          cssClass: "go2-hs go2-hs-step",
        };
      };
      const hotSpots = this._visibleRouteOptions(id).map(routeHotspot);

      // Spawn each pano facing the route, not the mission as-the-crow-flies.
      const initialYaw = next ? toYaw(next) : 0;
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

  /** Previous / next pano in the same continuous segment, independent of look direction. */
  _routeNeighbor(id, dir) {
    const cur = this.scenes[id];
    if (!cur || cur.routeSegment == null) return null;
    const curIdx = cur.segmentRouteIndex ?? cur.routeIndex;
    if (curIdx == null) return null;
    const wantIdx = curIdx + dir;
    for (const [otherId, other] of Object.entries(this.scenes)) {
      if (otherId === id) continue;
      if (other.routeSegment !== cur.routeSegment) continue;
      if ((other.segmentRouteIndex ?? other.routeIndex) !== wantIdx) continue;
      // The generated active route is marked playable. If the current scene is
      // playable, never leave that vetted route; non-playable diagnostic segments
      // can still navigate only within themselves if loaded manually.
      if (cur.playable && !other.playable) continue;
      return otherId;
    }
    return null;
  }

  /** Current compass heading from the actual camera view, not from route markers. */
  _viewHeading() {
    if (!this.viewer) return normHeading(this.heading || 0);
    try {
      return normHeading((this._currentNorthOffset || 0) + this.viewer.getYaw());
    } catch {
      return normHeading(this.heading || 0);
    }
  }

  /** Safe reachable route panos from `id`, including crossroad-style branches. */
  _safeRouteLinks(id) {
    const cur = this.scenes[id];
    if (!cur) return [];
    const m = CONFIG.move || {};
    const maxStepMeters = m.maxSafeStepMeters ?? 60;
    const candidates = new Set(cur.links || []);
    // Fallback / guarantee: include direct route neighbours even if a generated
    // local-link list is missing or later tuned differently.
    const prev = this._routeNeighbor(id, -1);
    const next = this._routeNeighbor(id, 1);
    if (prev) candidates.add(prev);
    if (next) candidates.add(next);

    return [...candidates].filter((sceneId) => {
      const other = this.scenes[sceneId];
      if (!other || sceneId === id) return false;
      if (cur.routeSegment != null && other.routeSegment !== cur.routeSegment) return false;
      if (cur.playable && !other.playable) return false;
      const dist = haversine(cur, other);
      return !Number.isFinite(dist) || dist <= maxStepMeters;
    });
  }

  /** Adjacent safe panos with their real compass direction from the current pano. */
  _routeOptions(id) {
    const sc = this.scenes[id];
    if (!sc) return [];
    const curIdx = sc.segmentRouteIndex ?? sc.routeIndex ?? 0;
    return this._safeRouteLinks(id)
      .map((sceneId) => {
        const other = this.scenes[sceneId];
        const otherIdx = other.segmentRouteIndex ?? other.routeIndex ?? curIdx;
        return {
          sceneId,
          routeDir: Math.sign(otherIdx - curIdx),
          distance: haversine(sc, other),
          heading: normHeading(bearing(sc, other)),
        };
      })
      .sort((a, b) => a.distance - b.distance);
  }

  /** Keep one marker per visible branch so same-street skip links do not stack. */
  _visibleRouteOptions(id) {
    const branchAngleDeg = CONFIG.move?.branchMarkerAngleDeg ?? 12;
    const visible = [];
    for (const opt of this._routeOptions(id)) {
      if (!visible.some((kept) => angleDistance(kept.heading, opt.heading) <= branchAngleDeg)) {
        visible.push(opt);
      }
    }
    return visible;
  }

  /**
   * Pick the adjacent pano matching player intent.
   *
   * Forward (W/↑) goes toward the direction the camera is facing. Back (S/↓)
   * steps away from the view direction, like walking backwards in a first-person
   * game. At a crossroad, the same rule naturally chooses the safe linked pano
   * closest to the camera heading. The candidate set is continuity-gated first,
   * so this cannot reintroduce long gap jumps.
   */
  _routeNeighborForView(id, moveDir) {
    const options = this._routeOptions(id);
    if (!options.length) return null;
    const desiredHeading = normHeading(this._viewHeading() + (moveDir < 0 ? 180 : 0));
    options.sort((a, b) => {
      const angleA = angleDistance(a.heading, desiredHeading);
      const angleB = angleDistance(b.heading, desiredHeading);
      const byAngle = angleA - angleB;
      // Several generated links can point almost the same way along the same
      // street. Treat those as one branch and step to the nearest pano instead
      // of skipping over it; real crossroads still win by clear angle.
      if (Math.abs(byAngle) > 8) return byAngle;
      const byDistance = a.distance - b.distance;
      if (byDistance !== 0) return byDistance;
      // Stable tie-break: keep old route-order behavior if all else ties.
      return moveDir > 0 ? b.routeDir - a.routeDir : a.routeDir - b.routeDir;
    });
    return options[0].sceneId;
  }

  /** Compass heading to face when standing on `id` and continuing `dir`. */
  _routeHeading(id, dir) {
    const sc = this.scenes[id];
    if (!sc) return null;
    const next = this._routeNeighbor(id, dir);
    if (next) return bearing(sc, this.scenes[next]);
    const prev = this._routeNeighbor(id, -dir);
    if (prev) return bearing(this.scenes[prev], sc);
    return null;
  }

  /** New mission target: store for HUD / arrivals, but don't twist the route view. */
  setGoal(goal) {
    if (goal) this._goal = goal;
    this._emit();
  }

  /** Find the nearest pano scene to a map drop / mission target. */
  nearestScene(pos, { playableOnly = true } = {}) {
    if (!pos || !this.scenes) return null;
    const entries = Object.entries(this.scenes);
    const playableEntries = entries.filter(([, sc]) => sc.playable);
    const candidates = playableOnly && playableEntries.length ? playableEntries : entries;
    let best = null;
    for (const [sceneId, sc] of candidates) {
      if (!Number.isFinite(sc.lat) || !Number.isFinite(sc.lng)) continue;
      const distance = haversine(pos, sc);
      if (!best || distance < best.distance) best = { sceneId, scene: sc, distance };
    }
    return best;
  }

  /** Jump directly to a scene id. Used by the interactive OSM drop-pin overlay. */
  jumpToScene(sceneId, { faceHeading = null } = {}) {
    const sc = this.scenes?.[sceneId];
    if (!sc || !this.viewer) return null;
    this._setMove?.(0);
    if (sceneId === this._currentScene) {
      this.position = { lat: sc.lat, lng: sc.lng };
      this._emit();
    } else {
      this._hopTo(sceneId, { faceHeading });
    }
    return {
      sceneId,
      lat: sc.lat,
      lng: sc.lng,
      heading: this._viewHeading(),
      routeIndex: sc.routeIndex ?? null,
      routeSegment: sc.routeSegment ?? null,
      segmentRouteIndex: sc.segmentRouteIndex ?? null,
      playable: sc.playable ?? null,
    };
  }

  /** Snap an arbitrary lat/lng map click to the nearest playable pano. */
  jumpToNearest(pos, { playableOnly = true, faceHeading = null } = {}) {
    const best = this.nearestScene(pos, { playableOnly });
    if (!best) return null;
    const jumped = this.jumpToScene(best.sceneId, { faceHeading });
    return jumped ? { ...jumped, distance: best.distance, requested: { lat: pos.lat, lng: pos.lng } } : null;
  }

  // ---- Route movement ----------------------------------------------------
  // Hold ↑/W to step toward the direction the camera is facing; ↓/S steps back
  // from that facing direction. ←/→ or A/D steer the camera, and mouse-drag
  // still looks around. Hops are limited to vetted nearby captures in the same
  // playable segment, then ranked by view heading.

  _initControls() {
    const m = CONFIG.move || {};
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

  /** Start/stop route advance — kept for non-keyboard callers/tests. */
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
    const next = this._routeNeighborForView(this._currentScene, this._move);
    let wait = 150; // end of route — re-check soon in case direction changes
    if (next) {
      const dist = haversine(this.scenes[this._currentScene], this.scenes[next]) || (m.refMeters ?? 40);
      this._hopTo(next); // preserve the player's current look direction across the hop
      const base = (m.hopBaseMs ?? 480) * (dist / (m.refMeters ?? 40));
      wait = Math.min(m.hopMaxMs ?? 850, Math.max(m.hopMinMs ?? 260, base));
    }
    this._driveTimer = setTimeout(() => this._driveTick(), wait);
  }

  /** Load a route neighbour, optionally facing a compass heading after the hop. */
  _hopTo(next, { faceHeading = null } = {}) {
    if (!this.viewer) return;
    try {
      const viewHeading =
        faceHeading == null ? (this._currentNorthOffset + this.viewer.getYaw() + 360) % 360 : faceHeading;
      const newYaw = ((viewHeading - (this._northOffsets[next] || 0) + 540) % 360) - 180;
      this.viewer.loadScene(next, this.viewer.getPitch(), newYaw, this.viewer.getHfov());
    } catch {
      /* mid-transition; the next tick retries */
    }
  }
}

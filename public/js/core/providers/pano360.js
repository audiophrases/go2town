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
import { bearing } from "../geo.js";
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
    const goal = town.locations.trainStation;
    const ids = Object.keys(this.scenes);

    // Which neighbour of a scene leads toward the goal? (used to face the photo
    // "forward" and to flag the forward walking hotspot).
    const forwardLinkOf = (id) => {
      const links = this.scenes[id].links || [];
      let best = null;
      let bestDist = Infinity;
      for (const l of links) {
        const dist = nearnessTo(this.scenes[l], goal);
        if (dist < bestDist) {
          bestDist = dist;
          best = l;
        }
      }
      return best;
    };

    const builtScenes = {};
    ids.forEach((id, idx) => {
      const sc = this.scenes[id];
      const fwd = forwardLinkOf(id);
      const northOffset =
        sc.northOffset ?? (fwd ? bearing(sc, this.scenes[fwd]) : 0);
      this._northOffsets[id] = northOffset;

      const hotSpots = (sc.links || []).map((linkId) => {
        const brg = bearing(sc, this.scenes[linkId]);
        let yaw = ((brg - northOffset + 540) % 360) - 180; // -> (-180,180]
        return {
          type: "scene",
          sceneId: linkId,
          yaw,
          pitch: -22, // sits on the ground like footsteps
          cssClass: linkId === fwd ? "go2-hs go2-hs-fwd" : "go2-hs go2-hs-back",
        };
      });

      builtScenes[id] = {
        type: "equirectangular",
        panorama: sc.image
          ? `img/scenes/${sc.image}`
          : makePlaceholderPano(sc, idx, ids.length),
        northOffset,
        hfov: 110,
        yaw: 0,
        pitch: 0,
        hotSpots,
      };
    });

    this.viewer = pannellum.viewer(this.container, {
      default: {
        firstScene: town.startScene,
        autoLoad: true,
        showControls: false,
        compass: false,
        draggable: true,
        mouseZoom: true,
        sceneFadeDuration: 600,
        hfov: 110,
      },
      scenes: builtScenes,
    });

    this._setScene(town.startScene);
    this.viewer.on("scenechange", (id) => this._setScene(id));

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
    this.position = { lat: sc.lat, lng: sc.lng };
    this._currentNorthOffset = this._northOffsets[id] ?? 0;
    this.heading = this._currentNorthOffset; // looking forward by default
    this._emit();
  }
}

// Cheap "which neighbour is closer to the goal" comparison (no need for exact
// metres here — only the ordering matters).
function nearnessTo(a, b) {
  const dLat = a.lat - b.lat;
  const dLng = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180);
  return dLat * dLat + dLng * dLng;
}

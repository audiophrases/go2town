// ---------------------------------------------------------------------------
// google.js — live Google Street View provider.
//
// This is the default Go2Town world now: the real Google Maps Street View
// panorama is the base layer, and Go2Town renders its learner HUD, mission
// beacon, Coco, and admin portals as an augmented-reality DOM overlay
// synchronized to Street View position + POV. No local Street View image
// fixtures are used by this provider.
// ---------------------------------------------------------------------------

import { WorldBase } from "../worldBase.js";
import { CONFIG } from "../../config.js";
import { installDemoBackdrop } from "./demo.js";
import { bearing, haversine } from "../geo.js";

const normHeading = (deg) => ((Number(deg || 0) % 360) + 360) % 360;
const signedAngleDelta = (from, to) => ((to - from + 540) % 360) - 180;
const angleDistance = (a, b) => Math.abs(signedAngleDelta(a, b));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function getGoogleStatusOk(maps) {
  return maps.StreetViewStatus?.OK || "OK";
}

async function fetchRuntimeMapsConfig() {
  const staticKey = (CONFIG.googleMapsApiKey || "").trim();
  if (staticKey) return { googleMapsApiKey: staticKey, source: "config" };
  const res = await fetch("/api/maps-config", { cache: "no-store" });
  if (!res.ok) throw new Error(`maps config unavailable: HTTP ${res.status}`);
  return res.json();
}

async function resolveGoogleMapsApiKey() {
  const cfg = await fetchRuntimeMapsConfig();
  const key = String(cfg.googleMapsApiKey || "").trim();
  if (!key) throw new Error("Google Maps API key is missing");
  return key;
}

function loadGoogleMaps(key) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.StreetViewPanorama) return resolve(window.google.maps);
    const cbName = `__go2town_maps_ready_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    window[cbName] = () => {
      delete window[cbName];
      resolve(window.google.maps);
    };
    const s = document.createElement("script");
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&v=weekly&loading=async&callback=${cbName}`;
    s.async = true;
    s.onerror = () => {
      delete window[cbName];
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(s);
  });
}

function getPanorama(service, maps, request) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (data, status) => {
      if (settled) return;
      settled = true;
      if (status === getGoogleStatusOk(maps) && data) resolve(data);
      else reject(new Error(`Street View panorama unavailable: ${status || "NO_DATA"}`));
    };
    try {
      const maybePromise = service.getPanorama(request, (data, status) => finish(data, status));
      if (maybePromise?.then) {
        maybePromise
          .then((result) => finish(result?.data || result, result?.status || getGoogleStatusOk(maps)))
          .catch(reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

function portalHotspotId(portal) {
  return `go2-ar-portal-${String(portal.id || portal.label || "portal").replace(/[^a-z0-9_-]/gi, "-")}`;
}

export class GoogleWorld extends WorldBase {
  async init({ container, town }) {
    await super.init({ container, town });
    this.scenes = town.scenes || {};
    this._goal = null;
    this._portals = [];
    this._move = 0;
    this._turn = 0;
    this._driving = false;
    this._turnSpeed = CONFIG.move?.turnDegPerSec ?? 80;

    try {
      const key = await resolveGoogleMapsApiKey();
      await this._initStreetView(key);
      return { mode: "google" };
    } catch (err) {
      console.warn("[world] Live Google Street View unavailable, using demo mode:", err);
      return installDemoBackdrop(this);
    }
  }

  async _initStreetView(key) {
    this.maps = await loadGoogleMaps(key);
    this.svService = new this.maps.StreetViewService();
    const start = this.town.start;
    const startData = await getPanorama(this.svService, this.maps, {
      location: { lat: start.lat, lng: start.lng },
      radius: 140,
      source: this.maps.StreetViewSource?.OUTDOOR,
      preference: this.maps.StreetViewPreference?.NEAREST,
    }).catch(() => null);

    this.mode = "google";
    this.container.classList.add("go2-google-world");
    this.panorama = new this.maps.StreetViewPanorama(this.container, {
      pano: startData?.location?.pano,
      position: startData ? undefined : { lat: start.lat, lng: start.lng },
      pov: { heading: start.heading ?? 0, pitch: start.pitch ?? 0 },
      zoom: 0,
      addressControl: false,
      showRoadLabels: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      linksControl: false,
      panControl: false,
      zoomControl: false,
      enableCloseButton: false,
      clickToGo: true,
      scrollwheel: true,
      disableDefaultUI: true,
      keyboardShortcuts: false,
      visible: true,
    });

    // A small facade lets existing admin tooling read a view snapshot without
    // knowing whether the underlying viewer is Pannellum or Google Street View.
    this.viewer = {
      getYaw: () => normHeading(this.panorama.getPov().heading),
      getPitch: () => Number(this.panorama.getPov().pitch || 0),
      getHfov: () => 90 / Math.max(1, Math.pow(2, Number(this.panorama.getZoom?.() || 0))),
    };

    this._initArOverlay();
    this._syncFromPanorama(startData);
    this.panorama.addListener("position_changed", () => this._syncFromPanorama());
    this.panorama.addListener("pov_changed", () => this._syncPov());
    this.panorama.addListener("pano_changed", () => this._syncFromPanorama());
    this.panorama.addListener("links_changed", () => this._refreshArOverlay());
    this._initControls();
    this._refreshArOverlay();
  }

  _syncFromPanorama(data = null) {
    const p = data?.location?.latLng || this.panorama?.getPosition?.();
    if (p) this.position = { lat: p.lat(), lng: p.lng() };
    const pano = data?.location?.pano || this.panorama?.getPano?.();
    if (pano) this._currentScene = pano;
    this._syncPov(false);
    this._emit();
    this._refreshArOverlay();
  }

  _syncPov(emit = true) {
    if (!this.panorama) return;
    const pov = this.panorama.getPov();
    this.heading = normHeading(pov.heading || 0);
    if (emit) this._emit();
    this._refreshArOverlay();
  }

  _initArOverlay() {
    this._arLayer = document.createElement("div");
    this._arLayer.className = "go2-ar-layer";
    this._arLayer.setAttribute("aria-hidden", "true");

    this._targetEl = document.createElement("div");
    this._targetEl.className = "go2-ar-target hidden";
    this._targetEl.innerHTML = `<span class="go2-ar-icon">📍</span><span class="go2-ar-pulse"></span>`;

    this._portalLayer = document.createElement("div");
    this._portalLayer.className = "go2-ar-portals";

    this._arLayer.append(this._targetEl, this._portalLayer);
    document.body.appendChild(this._arLayer);
  }

  _projectBearingToScreen(target, { maxAngle = 92, y = 54 } = {}) {
    if (!this.position || !target) return null;
    const rel = signedAngleDelta(this.heading, bearing(this.position, target));
    const edge = Math.abs(rel) > maxAngle;
    const clamped = clamp(rel, -maxAngle, maxAngle);
    return {
      x: 50 + (clamped / maxAngle) * 45,
      y,
      rel,
      edge,
      distance: haversine(this.position, target),
    };
  }

  _refreshArOverlay() {
    if (!this._targetEl) return;

    if (this._goal && this.position) {
      const projected = this._projectBearingToScreen(this._goal, { y: 58 });
      if (projected) {
        this._targetEl.classList.remove("hidden");
        this._targetEl.classList.toggle("edge", projected.edge);
        this._targetEl.style.left = `${projected.x}%`;
        this._targetEl.style.top = `${projected.y}%`;
        this._targetEl.dataset.meters = `${Math.max(1, Math.round(projected.distance))}m`;
        this._targetEl.querySelector(".go2-ar-icon").textContent = this._goal.icon || "📍";
      }
    } else {
      this._targetEl.classList.add("hidden");
    }

    this._renderPortalOverlays();
  }

  _renderPortalOverlays() {
    if (!this._portalLayer || !this.position) return;
    this._portalLayer.innerHTML = "";
    const maxDistance = CONFIG.move?.portalVisibleMeters ?? 32;
    for (const portal of this._portals || []) {
      if (!Number.isFinite(portal.lat) || !Number.isFinite(portal.lng)) continue;
      const projected = this._projectBearingToScreen(portal, { maxAngle: 75, y: 60 });
      if (!projected || projected.distance > maxDistance) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.id = portalHotspotId(portal);
      button.className = "go2-ar-portal";
      button.style.left = `${projected.x}%`;
      button.style.top = `${projected.y}%`;
      const icon = document.createElement("span");
      icon.textContent = portal.icon || "🚪";
      const label = document.createElement("em");
      label.textContent = portal.label || "portal";
      button.dataset.icon = icon.textContent;
      button.title = label.textContent;
      button.append(icon, label);
      button.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("go2town:portal", { detail: portal }));
      });
      this._portalLayer.appendChild(button);
    }
  }

  setGoal(goal) {
    this._goal = goal || null;
    this._refreshArOverlay();
    this._emit();
  }

  setPortals(portals = []) {
    this._portals = Array.isArray(portals) ? portals.filter((p) => p && p.subgame !== "none") : [];
    this._refreshArOverlay();
  }

  _viewHeading() {
    return normHeading(this.panorama?.getPov?.().heading ?? this.heading ?? 0);
  }

  _links() {
    return (this.panorama?.getLinks?.() || []).filter((link) => link?.pano && Number.isFinite(link.heading));
  }

  _routeNeighborForView(_id = this._currentScene, moveDir = 1) {
    const links = this._links();
    if (!links.length) return null;
    const desiredHeading = normHeading(this._viewHeading() + (moveDir < 0 ? 180 : 0));
    return [...links].sort((a, b) => angleDistance(a.heading, desiredHeading) - angleDistance(b.heading, desiredHeading))[0];
  }

  _initControls() {
    const typing = () => {
      const el = document.activeElement;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const KEY = {
      ArrowUp: "f", KeyW: "f", ArrowDown: "b", KeyS: "b",
      ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r",
    };

    this._onKey = (down) => (e) => {
      const action = KEY[e.code];
      if (!action || typing()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (action === "f") this._setMove(down ? 1 : this._move === 1 ? 0 : this._move);
      else if (action === "b") this._setMove(down ? -1 : this._move === -1 ? 0 : this._move);
      else if (action === "l") this._turn = down ? -1 : this._turn === -1 ? 0 : this._turn;
      else if (action === "r") this._turn = down ? 1 : this._turn === 1 ? 0 : this._turn;
    };
    window.addEventListener("keydown", this._onKey(true), true);
    window.addEventListener("keyup", this._onKey(false), true);

    let last = performance.now();
    const turnLoop = (ts) => {
      const dt = (ts - last) / 1000;
      last = ts;
      if (this._turn && this.panorama) {
        const pov = this.panorama.getPov();
        this.panorama.setPov({ ...pov, heading: normHeading((pov.heading || 0) + this._turn * this._turnSpeed * dt) });
      }
      this._turnRaf = requestAnimationFrame(turnLoop);
    };
    this._turnRaf = requestAnimationFrame(turnLoop);
  }

  startWalk() { this._setMove(1); }
  stopWalk() { this._setMove(0); }

  _setMove(dir) {
    this._move = dir;
    if (dir !== 0 && !this._driving) {
      this._driving = true;
      this._driveTick();
    }
  }

  _stopDriving() {
    this._move = 0;
    this._driving = false;
    if (this._driveTimer) {
      clearTimeout(this._driveTimer);
      this._driveTimer = null;
    }
  }

  _driveTick() {
    if (this._move === 0) {
      this._driving = false;
      return;
    }
    const link = this._routeNeighborForView(this._currentScene, this._move);
    let wait = 180;
    if (link) {
      const pov = this.panorama.getPov();
      this.panorama.setPano(link.pano);
      this.panorama.setPov({ ...pov, heading: this._viewHeading() });
      wait = CONFIG.move?.hopBaseMs ?? 420;
    }
    this._driveTimer = setTimeout(() => this._driveTick(), wait);
  }

  async _nearestGooglePano(pos, radius = 120) {
    if (!this.svService || !pos) return null;
    const data = await getPanorama(this.svService, this.maps, {
      location: { lat: pos.lat, lng: pos.lng },
      radius,
      source: this.maps.StreetViewSource?.OUTDOOR,
      preference: this.maps.StreetViewPreference?.NEAREST,
    });
    const latLng = data.location?.latLng;
    return {
      data,
      sceneId: data.location?.pano || null,
      lat: latLng?.lat?.(),
      lng: latLng?.lng?.(),
      distance: latLng ? haversine(pos, { lat: latLng.lat(), lng: latLng.lng() }) : null,
    };
  }

  async jumpToNearest(pos, { faceHeading = null } = {}) {
    this._stopDriving();
    try {
      const nearest = await this._nearestGooglePano(pos, 160);
      if (!nearest?.sceneId) return null;
      this.panorama.setPano(nearest.sceneId);
      if (faceHeading != null) {
        this.panorama.setPov({ ...this.panorama.getPov(), heading: normHeading(faceHeading) });
      }
      this.position = { lat: nearest.lat, lng: nearest.lng };
      this._currentScene = nearest.sceneId;
      this._emit();
      this._refreshArOverlay();
      return {
        sceneId: nearest.sceneId,
        lat: nearest.lat,
        lng: nearest.lng,
        heading: this._viewHeading(),
        distance: nearest.distance,
        requested: { lat: pos.lat, lng: pos.lng },
        playable: true,
      };
    } catch (err) {
      console.warn("[world] No live Google pano near requested position:", err);
      return null;
    }
  }
}

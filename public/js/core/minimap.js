// ---------------------------------------------------------------------------
// minimap.js — the GTA-style town map in the corner.
//
// A small live Google Map pinned to the screen corner, locked to the learner's
// Street View position and facing. The player shows as a blue arrow that
// rotates with the view; the map recenters on every step so it always reads
// "you are here, this way is forward." Mission pins sit on it as icons and flip
// to green when completed — a wordless sense of progress.
//
// It binds straight to the GoogleWorld (which already loaded the Maps JS API),
// so there's no second script load and no extra key handling. Providers without
// Street View (demo / pano360) simply never bind, and the map stays hidden.
//
// No written English ever reaches the learner: a label-free map style hides all
// street/place names, so the map is pure icons + geometry.
// ---------------------------------------------------------------------------

import { CONFIG } from "../config.js";

const normHeading = (deg) => ((Number(deg || 0) % 360) + 360) % 360;

// Clean "game map" look: every text label off (the no-text rule), softened
// land/water so the icons pop. Roads stay as shapes for orientation.
const MAP_STYLE = [
  { elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#8ecae6" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f3efe3" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
];

class MiniMap {
  constructor() {
    this.container = null;
    this.maps = null;       // the google.maps namespace
    this.map = null;        // the google.maps.Map instance
    this.world = null;
    this.player = null;     // the rotating "you" arrow
    this._spotMarkers = new Map();
    this._pending = null;   // admin: the in-progress pin being placed
    this._adminClick = null;
  }

  /** Remember the on-screen container (called once at boot). */
  mount({ container }) {
    this.container = container;
  }

  /**
   * Bind to a live GoogleWorld and draw the map. Safe to call with any world:
   * returns false (and does nothing) if there's no Street View map to ride on.
   */
  bind(world) {
    if (!this.container || !world || !world.maps) return false;
    this.maps = world.maps;
    this.world = world;
    const start = world.position || world.town?.start || { lat: 0, lng: 0 };

    this.map = new this.maps.Map(this.container, {
      center: { lat: start.lat, lng: start.lng },
      zoom: CONFIG.minimap?.zoom ?? 18,
      disableDefaultUI: true,
      gestureHandling: "none",   // play mode: the map follows you, you don't drag it
      keyboardShortcuts: false,
      clickableIcons: false,
      styles: MAP_STYLE,
      backgroundColor: "#f3efe3",
    });

    this.player = new this.maps.Marker({
      position: { lat: start.lat, lng: start.lng },
      map: this.map,
      zIndex: 9999,
      icon: this._playerIcon(world.heading),
    });

    world.onMove((p) => this._follow(p));
    this._follow({ lat: start.lat, lng: start.lng, heading: world.heading });
    this.container.classList.add("ready");
    return true;
  }

  _playerIcon(heading) {
    return {
      path: this.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 5.5,
      rotation: normHeading(heading),
      fillColor: "#2b7cff",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
    };
  }

  // Keep the arrow under the learner and the map centered on them.
  _follow(p) {
    if (!this.map || !p) return;
    const pos = { lat: p.lat, lng: p.lng };
    this.player.setPosition(pos);
    this.player.setIcon(this._playerIcon(p.heading));
    if (CONFIG.minimap?.followPlayer !== false) this.map.setCenter(pos);
  }

  /** Draw all mission pins. `isDone(id)` decides which already glow green. */
  setSpots(spots = [], { isDone } = {}) {
    if (!this.map) return;
    for (const m of this._spotMarkers.values()) m.setMap(null);
    this._spotMarkers.clear();
    for (const s of spots) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
      const done = isDone ? !!isDone(s.id) : false;
      const marker = new this.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: this.map,
        title: s.label || s.id,
        label: { text: s.icon || "📍", fontSize: "18px" },
        icon: this._spotIcon(done),
        zIndex: done ? 10 : 20,
      });
      marker.addListener("click", () => {
        window.dispatchEvent(new CustomEvent("go2town:spot-select", { detail: s }));
      });
      this._spotMarkers.set(s.id, marker);
    }
  }

  _spotIcon(done) {
    return {
      path: this.maps.SymbolPath.CIRCLE,
      scale: 13,
      fillColor: "#fffdf7",
      fillOpacity: 0.96,
      strokeColor: done ? "#2ecc71" : "#ff5a5f",
      strokeWeight: 3,
    };
  }

  /** Flip a pin to its completed (green) state. */
  markDone(id) {
    const marker = this._spotMarkers.get(id);
    if (!marker) return;
    marker.setIcon(this._spotIcon(true));
    marker.setZIndex(10);
  }

  // ---- Admin: click-to-pin -------------------------------------------------

  /** Turn the map into a draggable, clickable surface for placing pins. */
  setAdminMode(on) {
    if (!this.map) return;
    this.map.setOptions({
      gestureHandling: on ? "greedy" : "none",
      zoomControl: !!on,
      disableDefaultUI: !on,
    });
    this.container.classList.toggle("admin", !!on);
    if (on && !this._adminClick) {
      this._adminClick = this.map.addListener("click", (e) => this._dropPending(e.latLng));
    }
  }

  // Place / move the pending pin and announce its coordinates to the admin panel.
  _dropPending(latLng) {
    const detail = { lat: latLng.lat(), lng: latLng.lng() };
    if (!this._pending) {
      this._pending = new this.maps.Marker({
        map: this.map,
        position: latLng,
        draggable: true,
        icon: {
          path: this.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: "#ffb300",
          fillOpacity: 1,
          strokeColor: "#7a4d00",
          strokeWeight: 3,
        },
        zIndex: 99999,
      });
      this._pending.addListener("dragend", (ev) =>
        window.dispatchEvent(
          new CustomEvent("go2town:minimap-pin", { detail: { lat: ev.latLng.lat(), lng: ev.latLng.lng() } })
        )
      );
    } else {
      this._pending.setPosition(latLng);
    }
    window.dispatchEvent(new CustomEvent("go2town:minimap-pin", { detail }));
  }

  /** Remove the pending pin (after it's been saved as a real spot). */
  clearPending() {
    if (this._pending) {
      this._pending.setMap(null);
      this._pending = null;
    }
  }
}

export const minimap = new MiniMap();

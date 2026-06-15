// ---------------------------------------------------------------------------
// google.js — Google Street View provider (optional).
//
// Needs a Maps JavaScript API key with billing enabled. Best imagery, but it
// bills per panorama load at scale, so it's not the default for a 100-student
// class — see the README. Falls back to DemoWorld if the key is missing or the
// API fails to load.
// ---------------------------------------------------------------------------

import { WorldBase } from "../worldBase.js";
import { CONFIG } from "../../config.js";
import { installDemoBackdrop } from "./demo.js";

function loadGoogleMaps(key) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google.maps);
    const cbName = "__go2town_maps_ready__";
    window[cbName] = () => resolve(window.google.maps);
    const s = document.createElement("script");
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&v=weekly&loading=async&callback=${cbName}`;
    s.async = true;
    s.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(s);
  });
}

export class GoogleWorld extends WorldBase {
  async init({ container, town }) {
    await super.init({ container, town });
    const key = (CONFIG.googleMapsApiKey || "").trim();
    if (!key) {
      console.warn("[world] No Google Maps key; using demo backdrop.");
      return installDemoBackdrop(this);
    }
    try {
      await this._initStreetView(key);
      return { mode: "streetview" };
    } catch (err) {
      console.warn("[world] Street View unavailable, using demo mode:", err);
      return installDemoBackdrop(this);
    }
  }

  async _initStreetView(key) {
    const maps = await loadGoogleMaps(key);
    const start = this.town.start;
    const svService = new maps.StreetViewService();
    const { data } = await svService
      .getPanorama({ location: { lat: start.lat, lng: start.lng }, radius: 120 })
      .catch(() => ({ data: null }));

    this.mode = "streetview";
    this.panorama = new maps.StreetViewPanorama(this.container, {
      pano: data?.location?.pano,
      position: data ? undefined : { lat: start.lat, lng: start.lng },
      pov: { heading: start.heading ?? 0, pitch: start.pitch ?? 0 },
      zoom: 0,
      addressControl: false,
      showRoadLabels: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      linksControl: true,
      panControl: true,
      zoomControl: false,
      enableCloseButton: false,
    });

    const syncPosition = () => {
      const p = this.panorama.getPosition();
      if (p) {
        this.position = { lat: p.lat(), lng: p.lng() };
        this._emit();
      }
    };
    const syncPov = () => {
      this.heading = this.panorama.getPov().heading;
      this._emit();
    };
    this.panorama.addListener("position_changed", syncPosition);
    this.panorama.addListener("pov_changed", syncPov);
    syncPosition();
  }
}

// ---------------------------------------------------------------------------
// worldBase.js — common machinery every "world" provider shares.
//
// A provider is whatever shows the town and reports where the learner is:
//   - Pano360World  (default): your own 360° photos, via Pannellum — free
//   - GoogleWorld            : Google Street View — needs a billed key
//   - DemoWorld              : a painted beach backdrop — zero setup fallback
//
// Whatever the source, a provider keeps {position:{lat,lng}, heading} current
// and calls _emit() so the mission engine can measure distance + bearing.
// ---------------------------------------------------------------------------

export class WorldBase {
  constructor() {
    this.mode = "base";
    this.container = null;
    this.town = null;
    this.position = null; // {lat, lng}
    this.heading = 0; // compass degrees the learner is looking
    this._listeners = new Set();
  }

  /** Subscribe to movement. cb({lat,lng,heading}). Returns an unsubscribe fn. */
  onMove(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _emit() {
    if (!this.position) return;
    const snapshot = { ...this.position, heading: this.heading };
    this._listeners.forEach((cb) => cb(snapshot));
  }

  /** Providers override this. Should resolve once the world is on screen. */
  async init({ container, town }) {
    this.container = container;
    this.town = town;
    this.position = { lat: town.start.lat, lng: town.start.lng };
    this.heading = town.start.heading ?? 0;
  }
}

// ---------------------------------------------------------------------------
// geo.js — small spherical-geometry helpers shared by every world provider
// and the mission engine. Distances in metres, bearings in compass degrees.
// ---------------------------------------------------------------------------

const R = 6371000; // earth radius, metres
export const toRad = (d) => (d * Math.PI) / 180;
export const toDeg = (r) => (r * 180) / Math.PI;

/** Great-circle distance in metres between two {lat,lng} points. */
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Compass bearing in degrees (0=N, 90=E) from point a to point b. */
export function bearing(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached by travelling `meters` along `bearingDeg` from `from`. */
export function destination(from, bearingDeg, meters) {
  const brg = toRad(bearingDeg);
  const dLat = (meters * Math.cos(brg)) / R;
  const dLng = (meters * Math.sin(brg)) / (R * Math.cos(toRad(from.lat)));
  return { lat: from.lat + toDeg(dLat), lng: from.lng + toDeg(dLng) };
}

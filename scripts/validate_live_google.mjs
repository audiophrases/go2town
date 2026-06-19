#!/usr/bin/env node
// Static regression checks for the live Google Street View AR mode.
// This intentionally avoids printing or requiring the actual API key.
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fail = (msg) => {
  console.error(`live-google validation failed: ${msg}`);
  process.exit(1);
};
const expect = (cond, msg) => { if (!cond) fail(msg); };

const config = read('public/js/config.js');
const google = read('public/js/core/providers/google.js');
const server = read('server.py');
const html = read('public/index.html');
const css = read('public/css/style.css');

expect(/worldProvider:\s*"google"/.test(config), 'CONFIG.worldProvider should default to live Google Street View');
expect(/googleMapsApiKey:\s*""/.test(config), 'CONFIG.googleMapsApiKey must stay empty; no committed keys');
expect(!/AIza[0-9A-Za-z_-]{20,}/.test(config + google + server + html + css), 'source files must not contain a Google API key literal');

expect(/GOOGLE_MAPS_KEY_FILE/.test(server), 'server should know the external Google key-file path');
expect(/\/api\/maps-config/.test(server), 'server should expose /api/maps-config for local runtime key injection');
expect(/read_google_maps_api_key/.test(server), 'server should read the API key from env or external key file');

expect(/fetch\("\/api\/maps-config"/.test(google), 'Google provider should fetch the local runtime maps config');
expect(/StreetViewPanorama/.test(google), 'Google provider should render real Street View panoramas');
expect(/StreetViewService/.test(google), 'Google provider should query real Street View metadata/links');
expect(/go2-ar-layer/.test(google), 'Google provider should create an AR overlay layer');
expect(/go2-ar-target/.test(google), 'Google provider should render a synced mission target marker');
expect(/setGoal\(goal\)/.test(google), 'Google provider should implement setGoal for mission overlay sync');
expect(/jumpToNearest\(pos/.test(google), 'Google provider should support nearest-pano snapping in live mode');
expect(/setPortals\(portals/.test(google), 'Google provider should support admin AR portals in live mode');
expect(!/innerHTML\s*=\s*`?<span>/.test(google), 'Google AR portals must not render user/admin labels through innerHTML');
expect(/textContent\s*=\s*portal\.label/.test(google), 'Google AR portal labels should be assigned as textContent');
expect(/_stopDriving\(\)/.test(google) && /jumpToNearest[\s\S]*this\._stopDriving\(\)/.test(google), 'nearest-pano jumps should stop active Google movement first');
expect(/_routeNeighborForView/.test(google), 'Google provider should support view-relative W/S movement through Google links');
expect(!/cubeFaces|street-view-imagery|\/imagery\/captures/.test(google), 'Google provider must not depend on local scraped/static imagery');

expect(/id="world"/.test(html), 'world container should remain the Street View base layer');
expect(/go2-ar-layer/.test(css), 'CSS should style the Google AR overlay layer');
expect(/go2-ar-target/.test(css), 'CSS should style the mission beacon');
expect(/go2-ar-portal/.test(css), 'CSS should style admin AR portals');

console.log('live-google validation ok');

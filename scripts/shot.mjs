// Capture screenshots + hotspot geometry through the game flow (CDP, no deps).
// Usage: node scripts/shot.mjs <baseUrl> <cdpPort>
import { setTimeout as sleep } from "node:timers/promises";
import { writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:8090/";
const PORT = process.argv[3] || "9230";
const CDP = `http://127.0.0.1:${PORT}`;

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${CDP}/json`)).json();
      const p = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error("no page target");
}

let id = 0;
const pending = new Map();
const send = (ws, method, params = {}) => {
  const n = ++id;
  ws.send(JSON.stringify({ id: n, method, params }));
  return new Promise((r) => pending.set(n, r));
};

async function main() {
  const t = await pageTarget();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
    }
  };
  const evalJs = (expression, userGesture = false) =>
    send(ws, "Runtime.evaluate", { expression, returnByValue: true, userGesture, awaitPromise: true })
      .then((r) => r?.result?.value);
  const shot = async (name) => {
    const r = await send(ws, "Page.captureScreenshot", { format: "png" });
    writeFileSync(`scripts/${name}.png`, Buffer.from(r.data, "base64"));
    console.log("saved", name + ".png");
  };
  const pollUntil = async (expr, ms, step = 400) => {
    const t0 = Date.now();
    let v;
    do { v = await evalJs(expr); if (v) return v; await sleep(step); } while (Date.now() - t0 < ms);
    return v;
  };

  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");
  await send(ws, "Page.navigate", { url: BASE });
  await sleep(3000);

  await evalJs(`document.getElementById('start-btn').click(); true`, true);
  await pollUntil(`document.querySelectorAll('.go2-hs').length`, 15000);
  await sleep(1500);
  await shot("01-world");

  // Geometry + computed style of every hotspot (is it visible & on-screen?)
  const geo = await evalJs(`JSON.stringify({
    viewport: [innerWidth, innerHeight],
    hotspots: [...document.querySelectorAll('.go2-hs')].map(h => {
      const r = h.getBoundingClientRect(); const cs = getComputedStyle(h);
      return { cls: h.className, x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
        afterContent: getComputedStyle(h, '::after').content };
    })
  })`);
  console.log("GEO:", geo);

  // Submit name → mission HUD
  await pollUntil(`!document.getElementById('name-modal').classList.contains('hidden')`, 18000);
  await shot("02-name");
  await evalJs(`(()=>{const i=document.getElementById('name-input');i.value='Maria';
    document.getElementById('name-form').requestSubmit();return true})()`, true);
  await pollUntil(`document.getElementById('hud').classList.contains('active')`, 25000);
  await sleep(800);
  await shot("03-mission");

  // Is the forward hotspot now on-screen, and is the walk button visible?
  const geo2 = await evalJs(`JSON.stringify({
    walkBtnVisible: !document.getElementById('walk-btn').classList.contains('hidden'),
    fwd: [...document.querySelectorAll('.go2-hs-fwd')].map(h=>{
      const r=h.getBoundingClientRect(); const cs=getComputedStyle(h);
      return {x:Math.round(r.x),y:Math.round(r.y),onScreen:(r.x>=0&&r.x<innerWidth&&r.y>=0&&r.y<innerHeight),vis:cs.visibility};
    }),
  })`);
  console.log("GEO2:", geo2);

  // Click the walk button and confirm we moved (progress advances).
  const fillBefore = await evalJs(`document.getElementById('hud-fill').style.width`);
  await evalJs(`document.getElementById('walk-btn').click(); true`, true);
  await sleep(3000);
  const fillAfter = await evalJs(`document.getElementById('hud-fill').style.width`);
  console.log("walk button: fill", fillBefore, "->", fillAfter);
  await shot("04-walked");

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(2); });

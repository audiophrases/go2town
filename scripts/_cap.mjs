// throwaway: capture console/exceptions + whether the start gate hides on click
import { setTimeout as sleep } from "node:timers/promises";
const BASE = process.argv[2] || "http://127.0.0.1:8092/";
const CDP = `http://127.0.0.1:${process.argv[3] || "9223"}`;
const logs = [];

const list = await (await fetch(`${CDP}/json`)).json();
let page = list.find((t) => t.type === "page");
if (!page) {
  page = await (await fetch(`${CDP}/json/new?about:blank`)).json();
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const send = (m, p = {}) => { const n = ++id; ws.send(JSON.stringify({ id: n, method: m, params: p })); return new Promise((r) => pending.set(n, r)); };
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") {
    const e = m.params.exceptionDetails;
    logs.push("EXCEPTION: " + (e.exception?.description || e.text));
  }
  if (m.method === "Runtime.consoleAPICalled") {
    const t = m.params.type;
    if (t === "error" || t === "warning") logs.push(`console.${t}: ` + m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  }
  if (m.method === "Log.entryAdded") {
    const e = m.params.entry;
    if (e.level === "error") logs.push(`[${e.source}] ${e.text}${e.url ? " @ " + e.url : ""}`);
  }
};
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Page.navigate", { url: BASE });
await sleep(3500);
const evalJs = (expression, userGesture = false) =>
  send("Runtime.evaluate", { expression, returnByValue: true, userGesture, awaitPromise: true }).then((r) => r?.result?.value);

const pre = await evalJs(`JSON.stringify({
  startBtn: !!document.getElementById('start-btn'),
  hasStartGate: !!document.getElementById('start-gate'),
})`);
await evalJs(`document.getElementById('start-btn').click(); true`, true);
await sleep(2500);
const post = await evalJs(`JSON.stringify({
  startGateHidden: document.getElementById('start-gate').classList.contains('hidden'),
  worldMode: (window.__world && window.__world.mode) || 'n/a',
})`);
console.log("pre  :", pre);
console.log("post :", post);
console.log("logs :");
for (const l of logs) console.log("   -", l);
ws.close();
process.exit(0);

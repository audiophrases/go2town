// ---------------------------------------------------------------------------
// subgames.js — registry for the little 2D "rooms" inside buildings.
//
// Phase One ships the plumbing only. Later phases register one subgame per
// business (order bread at the 🥖 bakery, buy a ticket at the 🚉 station, etc.).
// A subgame is just a factory that takes a host element + context and returns
// a promise that resolves when the learner finishes the room.
//
// Example (future):
//   registerSubgame("buyTicket", async (host, ctx) => {
//     // draw a ticket machine, let the learner pick a destination by listening
//     // to Coco, resolve when correct.
//     return { completed: true };
//   });
// ---------------------------------------------------------------------------

const registry = new Map();

/** @param {string} id @param {(host:HTMLElement, ctx:object)=>Promise<object>} factory */
export function registerSubgame(id, factory) {
  registry.set(id, factory);
}

export function hasSubgame(id) {
  return registry.has(id);
}

/**
 * Open a subgame in a full-screen overlay. Resolves with the subgame's result,
 * or { completed:false, reason:"not-implemented" } if nothing is registered yet.
 */
export async function launchSubgame(id, ctx = {}) {
  const factory = registry.get(id);
  if (!factory) {
    console.info(`[subgames] "${id}" not implemented yet (Phase One stub).`);
    return { completed: false, reason: "not-implemented" };
  }

  const overlay = document.createElement("div");
  overlay.className = "subgame-overlay";
  const host = document.createElement("div");
  host.className = "subgame-host";
  overlay.appendChild(host);
  document.body.appendChild(overlay);

  try {
    return await factory(host, ctx);
  } finally {
    overlay.remove();
  }
}

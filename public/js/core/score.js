// ---------------------------------------------------------------------------
// score.js — points and progress for the free-roam game.
//
// One small responsibility: remember how many points the learner has and which
// spots they've already completed, survive a page reload, and paint the points
// badge (icon-only, no English — just "⭐ 12"). Awarding is idempotent: a spot
// can only pay out once.
// ---------------------------------------------------------------------------

const STORE_KEY = "go2town.score.v1";

class Score {
  constructor() {
    this.el = null;
    this.points = 0;
    this.done = new Set(); // spot ids already completed
  }

  /** Hook up the badge element and restore any saved progress. */
  mount(el) {
    this.el = el || null;
    this._load();
    this._render();
  }

  isDone(id) {
    return this.done.has(id);
  }

  /**
   * Award a spot's points once. Returns true the first time, false if the spot
   * was already completed (so callers can tell a fresh win from a re-visit).
   */
  award(id, points = 0) {
    if (this.done.has(id)) return false;
    this.done.add(id);
    this.points += Number(points) || 0;
    this._save();
    this._render();
    return true;
  }

  total() {
    return this.points;
  }

  reset() {
    this.points = 0;
    this.done.clear();
    this._save();
    this._render();
  }

  _load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      this.points = Number(saved.points) || 0;
      this.done = new Set(Array.isArray(saved.done) ? saved.done : []);
    } catch {
      this.points = 0;
      this.done = new Set();
    }
  }

  _save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ points: this.points, done: [...this.done] }));
    } catch {
      /* storage full / unavailable — progress just won't persist */
    }
  }

  _render() {
    if (this.el) this.el.textContent = `⭐ ${this.points}`;
  }
}

export const score = new Score();

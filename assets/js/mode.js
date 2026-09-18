/* ============================================================
   MODE — the two parallel flows: "practice" (fresh practice
   questions) and "pyq" (actual past-year GATE questions).

   Deliberately localStorage-based, not URL-based: every page
   (index/subject/builder/test/results/history/achievements)
   reads MODE.get() once and loads the matching data/state for
   that mode, so no page needs a ?mode= param threaded through
   every link. Switching modes (via the rail toggle) writes the
   new mode then does a hard navigation, so a page is never left
   half-rendered in the old mode.

   Loaded before state.js and db.js in every page — state.js
   reads MODE.get() at module-init time to namespace its
   localStorage keys.
   ============================================================ */

const MODE = (() => {
  const KEY = "pe:mode";
  const VALID = ["practice", "pyq"];

  function get() {
    const m = localStorage.getItem(KEY);
    return VALID.includes(m) ? m : "practice";
  }

  function set(m) {
    localStorage.setItem(KEY, VALID.includes(m) ? m : "practice");
  }

  function other() {
    return get() === "pyq" ? "practice" : "pyq";
  }

  function label(m) {
    m = m || get();
    return m === "pyq" ? "PYQ" : "Practice";
  }

  function fullLabel(m) {
    m = m || get();
    return m === "pyq" ? "Previous Year Questions" : "Practice Questions";
  }

  function dataBase() {
    return `data/${get()}/`;
  }

  return { get, set, other, label, fullLabel, dataBase, VALID };
})();

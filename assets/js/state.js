/* ============================================================
   STATE — localStorage-backed persistence.

   Keys are namespaced under "pe:<mode>:" — Practice and PYQ are
   two parallel flows with their own bookmarks, history, mastery,
   points, streak and achievements, so progress in one never
   bleeds into the other. Read once at module-init time (each
   page load fixes its mode via mode.js), so this whole module
   is one mode's view of storage for the lifetime of the page.

   This is the LOCAL backend. supabase-sync.js adds an optional
   Supabase backend behind the same function names, mirroring
   BOTH modes' keys to one synced record.
   ============================================================ */

const STATE = (() => {
  const NS = "pe:" + MODE.get() + ":";

  const K_BOOKMARKS = NS + "bookmarks";       // { "slug|id": true }
  const K_HISTORY   = NS + "history";         // [ {id, title, ts, total, correct, wrong, skipped, timed, items:[...]} ]
  const K_SEEN      = NS + "seen";            // { "slug|id": {status:'correct'|'incorrect'|'skipped', ts} }
  const K_DRAFT     = NS + "activeTest";      // in-progress test session (survives reload, session-local, never synced)
  const K_POINTS    = NS + "points";          // number
  const K_STREAK    = NS + "streak";          // { current, longest, lastActiveDate: "YYYY-MM-DD" }
  const K_SUBJECT_STATS = NS + "subjectStats"; // { slug: {attempted, correct} }
  const K_TYPE_STATS    = NS + "typeStats";    // { MCQ|MSQ|NAT: {attempted, correct} }
  const K_TOTALS         = NS + "totals";      // { attempted, correct }
  const K_ACHIEVEMENTS   = NS + "achievements"; // { id: unlockedAtTs }

  const POINTS_BY_DIFFICULTY = { easy: 5, medium: 10, hard: 20, unknown: 8 };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      if (window.SYNC && window.SYNC.isSyncedKey(key)) window.SYNC.schedulePush();
    } catch (e) {}
  }

  // ---------- bookmarks ----------
  function refKey(subjectSlug, id) { return subjectSlug + "|" + id; }

  function isBookmarked(subjectSlug, id) {
    return !!read(K_BOOKMARKS, {})[refKey(subjectSlug, id)];
  }
  function toggleBookmark(subjectSlug, id) {
    const b = read(K_BOOKMARKS, {});
    const k = refKey(subjectSlug, id);
    if (b[k]) delete b[k]; else b[k] = true;
    write(K_BOOKMARKS, b);
    return !!b[k];
  }
  function getBookmarkRefs() {
    return Object.keys(read(K_BOOKMARKS, {})).map(k => {
      const [s, id] = k.split("|");
      return { s, id };
    });
  }
  function bookmarkCount() { return Object.keys(read(K_BOOKMARKS, {})).length; }

  // ---------- per-question outcome (progress bars, mastery, points) ----------
  // status: 'correct' | 'incorrect' | 'skipped'. type/difficulty optional but
  // needed to keep subject/type stats and points accurate — test.js always
  // passes them.
  function recordOutcome(subjectSlug, id, status, meta) {
    meta = meta || {};
    const s = read(K_SEEN, {});
    s[refKey(subjectSlug, id)] = { status, ts: Date.now() };
    write(K_SEEN, s);

    if (status === "skipped") return 0; // skipped questions don't touch stats/points

    const totals = read(K_TOTALS, { attempted: 0, correct: 0 });
    totals.attempted += 1;
    if (status === "correct") totals.correct += 1;
    write(K_TOTALS, totals);

    const subjStats = read(K_SUBJECT_STATS, {});
    const ss = subjStats[subjectSlug] || { attempted: 0, correct: 0 };
    ss.attempted += 1;
    if (status === "correct") ss.correct += 1;
    subjStats[subjectSlug] = ss;
    write(K_SUBJECT_STATS, subjStats);

    if (meta.type) {
      const typeStats = read(K_TYPE_STATS, {});
      const ts = typeStats[meta.type] || { attempted: 0, correct: 0 };
      ts.attempted += 1;
      if (status === "correct") ts.correct += 1;
      typeStats[meta.type] = ts;
      write(K_TYPE_STATS, typeStats);
    }

    let earned = 0;
    if (status === "correct") {
      earned = POINTS_BY_DIFFICULTY[meta.difficulty] || POINTS_BY_DIFFICULTY.unknown;
      write(K_POINTS, read(K_POINTS, 0) + earned);
    }
    return earned;
  }
  function getSeenMap() { return read(K_SEEN, {}); }
  function getTotals() { return read(K_TOTALS, { attempted: 0, correct: 0 }); }
  function getSubjectStats() { return read(K_SUBJECT_STATS, {}); }
  function getTypeStats() { return read(K_TYPE_STATS, {}); }
  function getPoints() { return read(K_POINTS, 0); }

  // ---------- streak: one tick per calendar day a test is completed ----------
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function touchStreak() {
    const streak = read(K_STREAK, { current: 0, longest: 0, lastActiveDate: null });
    const today = todayStr();
    if (streak.lastActiveDate === today) return streak; // already counted today

    if (streak.lastActiveDate) {
      const prev = new Date(streak.lastActiveDate + "T00:00:00");
      const diffDays = Math.round((new Date(today + "T00:00:00") - prev) / 86400000);
      streak.current = diffDays === 1 ? streak.current + 1 : 1;
    } else {
      streak.current = 1;
    }
    streak.longest = Math.max(streak.longest, streak.current);
    streak.lastActiveDate = today;
    write(K_STREAK, streak);
    return streak;
  }
  function getStreak() { return read(K_STREAK, { current: 0, longest: 0, lastActiveDate: null }); }

  // ---------- achievements ----------
  function getUnlockedAchievements() { return read(K_ACHIEVEMENTS, {}); }
  function unlockAchievements(ids) {
    const unlocked = read(K_ACHIEVEMENTS, {});
    const ts = Date.now();
    const newlyUnlocked = [];
    ids.forEach(id => {
      if (!unlocked[id]) { unlocked[id] = ts; newlyUnlocked.push(id); }
    });
    if (newlyUnlocked.length) write(K_ACHIEVEMENTS, unlocked);
    return newlyUnlocked;
  }

  // ---------- test history ----------
  function saveResult(result) {
    const h = read(K_HISTORY, []);
    h.unshift(result);
    if (h.length > 200) h.length = 200;
    write(K_HISTORY, h);
  }
  function getHistory() { return read(K_HISTORY, []); }
  function getResult(id) { return read(K_HISTORY, []).find(r => r.id === id); }
  function clearHistory() { write(K_HISTORY, []); }

  // ---------- active/in-progress test (survives reload, one at a time, local-only) ----------
  function saveDraft(draft) { write(K_DRAFT, draft); }
  function getDraft() { return read(K_DRAFT, null); }
  function clearDraft() { localStorage.removeItem(K_DRAFT); }

  return {
    isBookmarked, toggleBookmark, getBookmarkRefs, bookmarkCount,
    recordOutcome, getSeenMap, getTotals, getSubjectStats, getTypeStats, getPoints,
    touchStreak, getStreak,
    getUnlockedAchievements, unlockAchievements,
    saveResult, getHistory, getResult, clearHistory,
    saveDraft, getDraft, clearDraft,
  };
})();

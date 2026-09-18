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

  // Full-bank tests (esp. Practice, which has ~2x PYQ's question count) can
  // produce history entries over 1MB each. Keep full per-question detail
  // only for the most recent MAX_DETAILED entries; older ones fall back to
  // score/summary only. Keeps storage bounded even after hundreds of tests.
  const MAX_DETAILED_HISTORY = 60;
  const MAX_HISTORY_TOTAL = 200;

  // Hard budget for the serialized history blob. Practice has ~2x PYQ's
  // question bank, so full-subject Practice tests (600-900 questions) produce
  // history entries an order of magnitude bigger than any PYQ test — 60 of
  // those blew past the ~5MB localStorage quota, which is why Practice
  // submissions were silently failing to persist while PYQ ones were fine.
  // Detail is now dropped oldest-first until the blob fits this budget,
  // BEFORE we ever hand it to localStorage.
  const HISTORY_BYTE_BUDGET = 2_000_000;

  // Belt-and-braces: the just-finished result is also parked in
  // sessionStorage (separate quota, survives the navigation to results.html)
  // so a full-storage or sync race can never lose the result the user is
  // about to look at. results.js reads this if history lookup misses.
  const SS_LAST_RESULT = "pe:lastResult";

  function stashLastResult(result) {
    try { sessionStorage.setItem(SS_LAST_RESULT, JSON.stringify(result)); } catch (e) {
      try {
        sessionStorage.setItem(SS_LAST_RESULT, JSON.stringify({ ...result, items: [], itemsTrimmed: true }));
      } catch (e2) { /* nothing more we can do */ }
    }
  }
  function getStashedResult(id) {
    try {
      const raw = sessionStorage.getItem(SS_LAST_RESULT);
      if (!raw) return null;
      const r = JSON.parse(raw);
      return (!id || r.id === id) ? r : null;
    } catch (e) { return null; }
  }

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
      return true;
    } catch (e) {
      console.warn("STATE: write failed for", key, e);
      if (window.UI) UI.toast("Couldn't save — your browser's storage for this site is full.");
      return false;
    }
  }

  // History gets a dedicated, resilient writer: a single large result (a
  // full-bank test) can push storage over quota. Rather than losing the
  // just-finished test silently, progressively shrink OLDER entries (detail
  // first, then drop them outright) until the write fits — the newest
  // result is only ever sacrificed as an absolute last resort.
  function writeHistorySafely(list) {
    try {
      localStorage.setItem(K_HISTORY, JSON.stringify(list));
      if (window.SYNC && window.SYNC.isSyncedKey(K_HISTORY)) window.SYNC.schedulePush();
      return true;
    } catch (e) {
      let working = list.slice();
      let trimmedDetail = false;

      // Pass 1: strip per-question "items" from the oldest entries first
      // (newest, working[0], kept detailed as long as possible).
      for (let i = working.length - 1; i >= 1; i--) {
        if (working[i].items && working[i].items.length) {
          working[i] = { ...working[i], items: [], itemsTrimmed: true };
          trimmedDetail = true;
          try {
            localStorage.setItem(K_HISTORY, JSON.stringify(working));
            if (window.UI) UI.toast("Storage was nearly full — older test reviews were trimmed to summaries only.");
            return true;
          } catch (e2) { /* keep trimming */ }
        }
      }

      // Pass 2: still doesn't fit — drop oldest entries outright.
      while (working.length > 1) {
        working.pop();
        try {
          localStorage.setItem(K_HISTORY, JSON.stringify(working));
          if (window.UI) UI.toast("Storage was full — some older test history was removed to make room.");
          return true;
        } catch (e3) { /* keep dropping */ }
      }

      // Pass 3: even one (now detail-stripped) entry doesn't fit.
      if (working.length === 1 && working[0].items && working[0].items.length) {
        working[0] = { ...working[0], items: [], itemsTrimmed: true };
        try {
          localStorage.setItem(K_HISTORY, JSON.stringify(working));
          if (window.UI) UI.toast("Storage was full — saved this result's score only, not the per-question review.");
          return true;
        } catch (e4) { /* fall through to failure */ }
      }

      console.warn("STATE: could not persist history even after trimming.", e);
      if (window.UI) UI.toast("Couldn't save this result — storage for this site is completely full.");
      return false;
    }
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
    stashLastResult(result);

    const h = read(K_HISTORY, []);
    h.unshift(result);
    if (h.length > MAX_HISTORY_TOTAL) h.length = MAX_HISTORY_TOTAL;
    // Proactively cap detail on anything past the recent window, so history
    // doesn't creep back up to quota-exceeded territory between big tests.
    for (let i = MAX_DETAILED_HISTORY; i < h.length; i++) {
      if (h[i].items && h[i].items.length) h[i] = { ...h[i], items: [], itemsTrimmed: true };
    }
    // Then enforce the byte budget, dropping per-question detail oldest-first.
    // The newest entry (h[0], the one just submitted) keeps its detail unless
    // it alone blows the budget.
    for (let i = h.length - 1; i >= 1 && JSON.stringify(h).length > HISTORY_BYTE_BUDGET; i--) {
      if (h[i].items && h[i].items.length) h[i] = { ...h[i], items: [], itemsTrimmed: true };
    }
    if (JSON.stringify(h).length > HISTORY_BYTE_BUDGET && h[0].items && h[0].items.length) {
      h[0] = { ...h[0], items: [], itemsTrimmed: true };
    }
    return writeHistorySafely(h);
  }
  function getHistory() { return read(K_HISTORY, []); }
  function getResult(id) {
    const found = read(K_HISTORY, []).find(r => r.id === id);
    if (found) return found;
    // Not in history: either the write failed (storage full) or a sync pull
    // landed between saving and navigating. Recover from the session stash
    // and put it back into history so it shows up in the history page too.
    const stashed = getStashedResult(id);
    if (stashed) {
      const h = read(K_HISTORY, []);
      if (!h.some(r => r.id === stashed.id)) {
        h.unshift(stashed);
        if (h.length > MAX_HISTORY_TOTAL) h.length = MAX_HISTORY_TOTAL;
        writeHistorySafely(h);
      }
      return stashed;
    }
    return undefined;
  }
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
    saveResult, getHistory, getResult, clearHistory, getStashedResult,
    saveDraft, getDraft, clearDraft,
  };
})();

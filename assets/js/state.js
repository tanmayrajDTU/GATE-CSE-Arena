/* ============================================================
   STATE — localStorage-backed persistence.
   Keys are namespaced under "gpq:" (GATE PYQ).

   Optionally mirrored to Supabase by sync.js via a mutation hook:
   every write that should be synced calls onMutate(...) so this
   module stays framework-agnostic (works fine standalone if
   Supabase isn't configured — sync.js just never installs a hook).
   ============================================================ */

const STATE = (() => {
  const K_BOOKMARKS = "gpq:bookmarks";       // { "slug|id": true }
  const K_HISTORY = "gpq:history";           // [ {id, title, ts, total, correct, wrong, skipped, timed, items:[...]} ]
  const K_SEEN = "gpq:seen";                 // { "slug|id": {status: 'correct'|'incorrect'|'skipped', ts} }
  const K_DRAFT = "gpq:activeTest";          // in-progress test session (local-only, never synced)

  let onMutate = null;
  function setMutationHook(fn) { onMutate = fn; }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // ---------- bookmarks ----------
  function refKey(subjectSlug, id) { return subjectSlug + "|" + id; }

  function isBookmarked(subjectSlug, id) {
    const b = read(K_BOOKMARKS, {});
    return !!b[refKey(subjectSlug, id)];
  }
  function toggleBookmark(subjectSlug, id) {
    const b = read(K_BOOKMARKS, {});
    const k = refKey(subjectSlug, id);
    if (b[k]) delete b[k]; else b[k] = true;
    write(K_BOOKMARKS, b);
    const active = !!b[k];
    if (onMutate) onMutate({ type: "bookmark", slug: subjectSlug, id, active });
    return active;
  }
  function getBookmarkRefs() {
    const b = read(K_BOOKMARKS, {});
    return Object.keys(b).map(k => {
      const [s, id] = k.split("|");
      return { s, id };
    });
  }
  function bookmarkCount() { return Object.keys(read(K_BOOKMARKS, {})).length; }
  function mergeBookmarks(refs) {
    // union — adds remote bookmarks locally, never removes (removal is explicit via toggle)
    const b = read(K_BOOKMARKS, {});
    refs.forEach(r => { b[refKey(r.s, r.id)] = true; });
    write(K_BOOKMARKS, b);
  }

  // ---------- per-question outcome (for subject progress rings / difficulty mastery) ----------
  function recordOutcome(subjectSlug, id, status) {
    const s = read(K_SEEN, {});
    const ts = Date.now();
    s[refKey(subjectSlug, id)] = { status, ts };
    write(K_SEEN, s);
    if (onMutate) onMutate({ type: "outcome", slug: subjectSlug, id, status, ts });
  }
  function getSeenMap() { return read(K_SEEN, {}); }
  function subjectProgress(subjectSlug, allIds) {
    const seen = read(K_SEEN, {});
    let attempted = 0, correct = 0;
    allIds.forEach(id => {
      const rec = seen[refKey(subjectSlug, id)];
      if (rec) { attempted++; if (rec.status === "correct") correct++; }
    });
    return { attempted, correct, total: allIds.length };
  }
  function mergeSeen(entries) {
    // entries: [{slug, id, status, ts}] — newer ts wins per question
    const s = read(K_SEEN, {});
    entries.forEach(e => {
      const k = refKey(e.slug, e.id);
      if (!s[k] || e.ts > s[k].ts) s[k] = { status: e.status, ts: e.ts };
    });
    write(K_SEEN, s);
  }

  // ---------- test history ----------
  function saveResult(result) {
    const h = read(K_HISTORY, []);
    h.unshift(result);
    if (h.length > 200) h.length = 200;
    write(K_HISTORY, h);
    if (onMutate) onMutate({ type: "result", result });
  }
  function getHistory() { return read(K_HISTORY, []); }
  function getResult(id) { return read(K_HISTORY, []).find(r => r.id === id); }
  function clearHistory() { write(K_HISTORY, []); }
  function mergeHistory(remoteResults) {
    const h = read(K_HISTORY, []);
    const ids = new Set(h.map(r => r.id));
    remoteResults.forEach(r => { if (!ids.has(r.id)) { h.push(r); ids.add(r.id); } });
    h.sort((a, b) => b.ts - a.ts);
    if (h.length > 200) h.length = 200;
    write(K_HISTORY, h);
  }

  // ---------- active/in-progress test (survives reload, one at a time, local-only) ----------
  function saveDraft(draft) { write(K_DRAFT, draft); }
  function getDraft() { return read(K_DRAFT, null); }
  function clearDraft() { localStorage.removeItem(K_DRAFT); }

  return {
    setMutationHook,
    isBookmarked, toggleBookmark, getBookmarkRefs, bookmarkCount, mergeBookmarks,
    recordOutcome, getSeenMap, subjectProgress, mergeSeen,
    saveResult, getHistory, getResult, clearHistory, mergeHistory,
    saveDraft, getDraft, clearDraft,
  };
})();

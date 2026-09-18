/* ============================================================
   DB — loads manifest / global index / per-subject question files
   for the CURRENT MODE (see mode.js), with in-memory caching so
   repeat navigation is instant.
   ============================================================ */

const DB = (() => {
  let cachedMode = null;
  let manifestPromise = null;
  let indexPromise = null;
  const subjectPromises = new Map();

  function base() {
    return MODE.dataBase();
  }

  // If the mode changed since our caches were built (shouldn't happen
  // mid-page, but cheap to guard), drop them.
  function resetIfModeChanged() {
    const m = MODE.get();
    if (m !== cachedMode) {
      cachedMode = m;
      manifestPromise = null;
      indexPromise = null;
      subjectPromises.clear();
    }
  }

  // PYQ questions don't ship a precomputed "difficulty" field the way
  // practice questions do — derive it from avgSuccessRate so every page
  // that reads q.difficulty works unmodified for both modes.
  function normalizeDifficulty(q) {
    if (!q.difficulty) {
      const sr = q.avgSuccessRate;
      q.difficulty = typeof sr === "number"
        ? (sr >= 70 ? "easy" : sr >= 40 ? "medium" : "hard")
        : "unknown";
    }
    return q;
  }

  async function getManifest() {
    resetIfModeChanged();
    if (!manifestPromise) {
      manifestPromise = fetch(base() + "manifest.json").then(r => r.json());
    }
    return manifestPromise;
  }

  async function getIndex() {
    resetIfModeChanged();
    if (!indexPromise) {
      indexPromise = fetch(base() + "index.json").then(r => r.json());
    }
    return indexPromise;
  }

  async function getSubject(slug) {
    resetIfModeChanged();
    if (!subjectPromises.has(slug)) {
      subjectPromises.set(slug, fetch(base() + `questions/${slug}.json`)
        .then(r => r.json())
        .then(list => list.map(normalizeDifficulty)));
    }
    return subjectPromises.get(slug);
  }

  async function getSubjects(slugs) {
    const uniq = [...new Set(slugs)];
    const lists = await Promise.all(uniq.map(getSubject));
    const map = new Map();
    lists.forEach(list => list.forEach(q => map.set(`${q.subject}__${q.id}`, q)));
    return map;
  }

  // Resolve a list of {s: subjectSlug, id} refs into full question objects,
  // loading only the subject files actually needed, preserving ref order.
  async function resolveRefs(refs) {
    const slugs = [...new Set(refs.map(r => r.s))];
    await Promise.all(slugs.map(getSubject));
    const bySlugId = new Map();
    for (const slug of slugs) {
      const list = await getSubject(slug);
      for (const q of list) bySlugId.set(slug + "|" + q.id, q);
    }
    return refs.map(r => bySlugId.get(r.s + "|" + r.id)).filter(Boolean);
  }

  return { getManifest, getIndex, getSubject, getSubjects, resolveRefs };
})();

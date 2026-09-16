/* ============================================================
   DB — loads manifest / global index / per-subject question files,
   with in-memory caching so repeat navigation is instant.
   ============================================================ */

const DB = (() => {
  let manifestPromise = null;
  let indexPromise = null;
  const subjectPromises = new Map();

  function base() {
    // works whether the site is opened at root or a subpath
    return "data/";
  }

  async function getManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(base() + "manifest.json").then(r => r.json());
    }
    return manifestPromise;
  }

  async function getIndex() {
    if (!indexPromise) {
      indexPromise = fetch(base() + "index.json").then(r => r.json());
    }
    return indexPromise;
  }

  async function getSubject(slug) {
    if (!subjectPromises.has(slug)) {
      subjectPromises.set(slug, fetch(base() + `questions/${slug}.json`).then(r => r.json()));
    }
    return subjectPromises.get(slug);
  }

  async function getSubjects(slugs) {
    const uniq = [...new Set(slugs)];
    const lists = await Promise.all(uniq.map(getSubject));
    const map = new Map();
    lists.forEach(list => list.forEach(q => map.set(`${q.subject}__${q.id}`, q)));
    return map; // keyed loosely; callers usually key by id directly, see below
  }

  // Resolve a list of {s: subjectSlug, id} refs into full question objects,
  // loading only the subject files actually needed.
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

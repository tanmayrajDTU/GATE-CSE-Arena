/* ============================================================
   SYNC — optional Supabase sync, gated by one fixed email.

   Deliberately NOT using Supabase Auth: this is a personal,
   single-user tool. "Linking" just means the person typed the one
   recognized email into the settings page alongside a Supabase
   project URL + anon key. If the email matches exactly, local
   durable state is mirrored to a single-row table in that Supabase
   project and pulled back down on load. Anything else (wrong/blank
   email, or no config saved) runs entirely on localStorage — the
   app never requires Supabase.

   Mirrors BOTH modes (Practice and PYQ) in one record: each is a
   separate localStorage namespace ("pe:practice:*" / "pe:pyq:*"),
   and both are included in the synced JSON blob, so switching
   modes on a second device still finds its own progress.

   Security note (documented, not hidden): because there's no real
   auth, this relies on the Supabase anon key + table being reachable
   only by you. Don't reuse this pattern for a multi-user product.
   ============================================================ */

const SYNC = (() => {
  const SYNC_EMAIL = "tanmayraj1705@gmail.com";

  const CFG_URL   = "pe:sb:url";
  const CFG_KEY   = "pe:sb:key";
  const CFG_EMAIL = "pe:sb:email";

  // Durable per-mode keys mirrored to Supabase, for every mode —
  // not just the one active on this page — so a save in one mode
  // doesn't clobber the other mode's data in the synced blob.
  // Deliberately excludes "activeTest" (in-progress draft — session-
  // local) and "pe-theme" / "pe:sb:*" / "pe:mode" (pure UI/config).
  const SYNCED_SUFFIXES = [
    "bookmarks", "seen", "history", "points",
    "streak", "subjectStats", "typeStats", "achievements",
  ];
  const SYNC_KEYS = MODE.VALID.flatMap(m => SYNCED_SUFFIXES.map(suf => `pe:${m}:${suf}`));

  const LIB_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

  let client = null;
  let readyPromise = null;
  let pushTimer = null;
  let lastError = null;

  function isSyncedKey(key) { return SYNC_KEYS.indexOf(key) !== -1; }

  function getConfig() {
    return {
      url: localStorage.getItem(CFG_URL) || "",
      key: localStorage.getItem(CFG_KEY) || "",
      email: localStorage.getItem(CFG_EMAIL) || "",
    };
  }

  function isLinked() {
    const c = getConfig();
    return c.email === SYNC_EMAIL && !!c.url && !!c.key;
  }

  function setConfig(url, key, email) {
    localStorage.setItem(CFG_URL, (url || "").trim());
    localStorage.setItem(CFG_KEY, (key || "").trim());
    if ((email || "").trim().toLowerCase() === SYNC_EMAIL) {
      localStorage.setItem(CFG_EMAIL, SYNC_EMAIL);
    } else {
      localStorage.removeItem(CFG_EMAIL);
    }
    client = null;
    readyPromise = null;
    lastError = null;
  }

  function unlink() {
    localStorage.removeItem(CFG_EMAIL);
    localStorage.removeItem(CFG_URL);
    localStorage.removeItem(CFG_KEY);
    client = null;
    readyPromise = null;
    lastError = null;
  }

  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = LIB_URL;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load the Supabase library (offline, or the CDN is blocked)."));
      document.head.appendChild(s);
    });
  }

  function getClient() {
    if (client) return client;
    const c = getConfig();
    if (!c.url || !c.key || !window.supabase) return null;
    client = window.supabase.createClient(c.url, c.key);
    return client;
  }

  // Keep the pushed payload small. Per-question "items" arrays dominate the
  // blob — a single full-subject Practice test carries hundreds of them — and
  // an oversized upsert fails, which used to leave the remote row stale while
  // the next pull overwrote the good local data. Scores and summaries always
  // go up; detailed reviews stay local past the most recent few.
  const PUSH_DETAILED_HISTORY = 5;
  const PUSH_BYTE_BUDGET = 1_200_000;

  function slimHistory(list, keepDetailed) {
    if (!Array.isArray(list)) return list;
    return list.map((r, i) =>
      (i < keepDetailed || !r || !r.items || !r.items.length)
        ? r
        : { ...r, items: [], itemsTrimmed: true });
  }

  function collectLocalState() {
    const state = {};
    SYNC_KEYS.forEach(k => {
      const raw = localStorage.getItem(k);
      if (raw !== null) {
        try { state[k] = JSON.parse(raw); } catch (e) { /* skip corrupt value */ }
      }
    });

    const historyKeys = SYNC_KEYS.filter(k => k.endsWith(":history"));
    historyKeys.forEach(k => { state[k] = slimHistory(state[k], PUSH_DETAILED_HISTORY); });
    if (JSON.stringify(state).length > PUSH_BYTE_BUDGET) {
      historyKeys.forEach(k => { state[k] = slimHistory(state[k], 0); });
    }
    return state;
  }

  // Remote state is MERGED into local, never blindly overwritten.
  //
  // The old behaviour (straight overwrite) lost any local change that hadn't
  // been pushed yet — and pushes are debounced by 900ms, so a test submitted
  // and immediately followed by navigation to results.html was still sitting
  // unpushed when results.html pulled the stale remote row over the top of it.
  // The result then vanished from both the results page and history.
  function mergeKey(key, remoteVal, localVal) {
    if (localVal === undefined || localVal === null) return remoteVal;
    if (remoteVal === undefined || remoteVal === null) return localVal;
    const suffix = key.split(":")[2];

    if (suffix === "history") {
      const a = Array.isArray(localVal) ? localVal : [];
      const b = Array.isArray(remoteVal) ? remoteVal : [];
      const seen = new Set();
      const out = [];
      // Local first, so a local entry that still has per-question detail wins
      // over a trimmed copy of the same result from another device.
      [...a, ...b].forEach(r => {
        if (!r || !r.id || seen.has(r.id)) return;
        seen.add(r.id);
        out.push(r);
      });
      out.sort((x, y) => (y.ts || 0) - (x.ts || 0));
      return out.slice(0, 200);
    }

    if (suffix === "bookmarks" || suffix === "achievements") {
      return { ...remoteVal, ...localVal }; // union; local wins on conflict
    }

    if (suffix === "seen") {
      const out = { ...remoteVal };
      Object.keys(localVal).forEach(k => {
        const l = localVal[k], r = out[k];
        out[k] = (!r || (l && (l.ts || 0) >= (r.ts || 0))) ? l : r;
      });
      return out;
    }

    if (suffix === "points") {
      return Math.max(Number(localVal) || 0, Number(remoteVal) || 0);
    }

    if (suffix === "streak") {
      const l = localVal || {}, r = remoteVal || {};
      const newer = (l.lastActiveDate || "") >= (r.lastActiveDate || "") ? l : r;
      return { ...newer, longest: Math.max(l.longest || 0, r.longest || 0) };
    }

    if (suffix === "subjectStats" || suffix === "typeStats" || suffix === "totals") {
      if (suffix === "totals") {
        return {
          attempted: Math.max(localVal.attempted || 0, remoteVal.attempted || 0),
          correct: Math.max(localVal.correct || 0, remoteVal.correct || 0),
        };
      }
      const out = { ...remoteVal };
      Object.keys(localVal).forEach(k => {
        const l = localVal[k] || {}, r = out[k] || {};
        out[k] = {
          attempted: Math.max(l.attempted || 0, r.attempted || 0),
          correct: Math.max(l.correct || 0, r.correct || 0),
        };
      });
      return out;
    }

    return remoteVal;
  }

  function applyRemoteState(remote) {
    if (!remote || typeof remote !== "object") return false;
    let localWasAhead = false;
    SYNC_KEYS.forEach(k => {
      if (remote[k] === undefined) {
        if (localStorage.getItem(k) !== null) localWasAhead = true;
        return;
      }
      let localVal;
      const raw = localStorage.getItem(k);
      if (raw !== null) { try { localVal = JSON.parse(raw); } catch (e) { localVal = undefined; } }
      const merged = mergeKey(k, remote[k], localVal);
      const mergedStr = JSON.stringify(merged);
      if (mergedStr !== JSON.stringify(remote[k])) localWasAhead = true;
      try { localStorage.setItem(k, mergedStr); } catch (e) { /* quota — keep local */ }
    });
    return localWasAhead;
  }

  async function pushNow() {
    const c = getClient();
    if (!c) return { ok: false, reason: "not-linked" };
    try {
      const state = collectLocalState();
      const { error } = await c.from("pe_state").upsert(
        { user_email: SYNC_EMAIL, state, updated_at: new Date().toISOString() },
        { onConflict: "user_email" }
      );
      if (error) throw error;
      lastError = null;
      return { ok: true };
    } catch (err) {
      lastError = err;
      console.warn("Supabase push failed:", err);
      return { ok: false, reason: "error", error: err };
    }
  }

  // Reads the row back from Supabase as-is (no localStorage writes) and
  // summarizes it, so the settings page can show "here's what's actually
  // sitting in your project" without anyone needing to open the Supabase
  // dashboard to sanity-check that sync really worked.
  async function fetchRemoteSummary() {
    const c = getClient();
    if (!c) return { ok: false, reason: "not-linked" };
    try {
      const { data, error } = await c.from("pe_state").select("state, updated_at").eq("user_email", SYNC_EMAIL).maybeSingle();
      if (error) throw error;
      if (!data) return { ok: true, exists: false };
      const state = data.state || {};
      const counts = {};
      MODE.VALID.forEach(m => {
        const hist = state[`pe:${m}:history`];
        counts[m] = Array.isArray(hist) ? hist.length : 0;
      });
      return { ok: true, exists: true, updatedAt: data.updated_at, counts };
    } catch (err) {
      lastError = err;
      return { ok: false, reason: "error", error: err };
    }
  }

  function schedulePush() {
    if (!isLinked()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 900);
  }

  // On first link: pull an existing remote row if one exists (so a second
  // device picks up your real data), otherwise seed the remote row from
  // whatever is already sitting in local storage on this device.
  async function pullOrSeed() {
    const c = getClient();
    if (!c) return { ok: false, reason: "not-linked" };
    try {
      const { data, error } = await c.from("pe_state").select("state, updated_at").eq("user_email", SYNC_EMAIL).maybeSingle();
      if (error) throw error;
      if (data && data.state) {
        const localWasAhead = applyRemoteState(data.state);
        // If local had anything the remote row didn't, push the merged state
        // straight back so the two converge instead of fighting each other.
        if (localWasAhead) await pushNow();
        return { ok: true, action: "pulled" };
      }
      await pushNow();
      return { ok: true, action: "seeded" };
    } catch (err) {
      lastError = err;
      console.warn("Supabase pull failed:", err);
      return { ok: false, reason: "error", error: err };
    }
  }

  // Call at the top of every page script before any STATE reads.
  // Resolves immediately (no network) unless linked.
  function ready() {
    if (readyPromise) return readyPromise;
    if (!isLinked()) { readyPromise = Promise.resolve({ ok: true, action: "local-only" }); return readyPromise; }
    readyPromise = loadLib().then(pullOrSeed).catch(err => {
      lastError = err;
      console.warn("Supabase init failed:", err);
      return { ok: false, reason: "error", error: err };
    });
    return readyPromise;
  }

  function getLastError() { return lastError; }

  return {
    SYNC_EMAIL, isSyncedKey, isLinked, getConfig, setConfig, unlink,
    ready, schedulePush, pushNow, fetchRemoteSummary, getLastError,
  };
})();

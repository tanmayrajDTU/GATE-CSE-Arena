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

  function collectLocalState() {
    const state = {};
    SYNC_KEYS.forEach(k => {
      const raw = localStorage.getItem(k);
      if (raw !== null) {
        try { state[k] = JSON.parse(raw); } catch (e) { /* skip corrupt value */ }
      }
    });
    return state;
  }

  function applyRemoteState(remote) {
    if (!remote || typeof remote !== "object") return;
    SYNC_KEYS.forEach(k => {
      if (remote[k] !== undefined) localStorage.setItem(k, JSON.stringify(remote[k]));
    });
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
        applyRemoteState(data.state);
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
    ready, schedulePush, pushNow, getLastError,
  };
})();

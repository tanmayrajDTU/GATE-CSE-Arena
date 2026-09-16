/* ============================================================
   SYNC — thin Supabase layer on top of STATE.

   Design: localStorage (via STATE) stays the source of truth for
   instant, offline-friendly reads/writes. When a user is signed
   in, every mutation is also pushed to Supabase (fire-and-forget),
   and on sign-in / page load we pull remote data and merge it into
   localStorage. If Supabase isn't configured (config.js still has
   placeholder values) everything silently no-ops and the site
   behaves exactly like the local-only version.
   ============================================================ */

const SYNC = (() => {
  let client = null;
  let currentUser = null;
  let hookInstalled = false;
  const widgetMounts = new Set();

  function isConfigured() {
    return !!(window.CONFIG && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY
      && CONFIG.SUPABASE_URL !== "YOUR_SUPABASE_URL"
      && CONFIG.SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY");
  }

  function getClient() {
    if (!client && window.supabase && isConfigured()) {
      client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }
    return client;
  }

  function getUser() { return currentUser; }

  // ---------- push (local -> remote), best-effort, never blocks the UI ----------
  async function pushBookmark(slug, id, active) {
    const c = getClient();
    if (!c || !currentUser) return;
    try {
      if (active) {
        await c.from("bookmarks").upsert({ user_id: currentUser.id, subject: slug, question_id: String(id) });
      } else {
        await c.from("bookmarks").delete().match({ user_id: currentUser.id, subject: slug, question_id: String(id) });
      }
    } catch (e) { console.warn("sync: pushBookmark failed", e); }
  }

  async function pushOutcome(slug, id, status, ts) {
    const c = getClient();
    if (!c || !currentUser) return;
    try {
      await c.from("question_outcomes").upsert({
        user_id: currentUser.id, subject: slug, question_id: String(id),
        status, updated_at: new Date(ts).toISOString(),
      });
    } catch (e) { console.warn("sync: pushOutcome failed", e); }
  }

  async function pushResult(result) {
    const c = getClient();
    if (!c || !currentUser) return;
    try {
      await c.from("test_results").upsert({
        id: result.id, user_id: currentUser.id, title: result.title, ts: result.ts,
        timed: !!result.timed, total_seconds: result.totalSeconds, time_taken_seconds: result.timeTakenSeconds,
        auto_submitted: !!result.autoSubmitted, total: result.total, correct: result.correct,
        wrong: result.wrong, skipped: result.skipped, items: result.items,
      });
    } catch (e) { console.warn("sync: pushResult failed", e); }
  }

  async function pushAllLocal() {
    const c = getClient();
    if (!c || !currentUser) return;
    try {
      const bms = STATE.getBookmarkRefs();
      if (bms.length) {
        await c.from("bookmarks").upsert(bms.map(b => ({ user_id: currentUser.id, subject: b.s, question_id: String(b.id) })));
      }
      const seen = STATE.getSeenMap();
      const seenRows = Object.entries(seen).map(([k, v]) => {
        const i = k.indexOf("|");
        return { user_id: currentUser.id, subject: k.slice(0, i), question_id: k.slice(i + 1), status: v.status, updated_at: new Date(v.ts).toISOString() };
      });
      if (seenRows.length) await c.from("question_outcomes").upsert(seenRows);

      const hist = STATE.getHistory();
      if (hist.length) {
        await c.from("test_results").upsert(hist.map(r => ({
          id: r.id, user_id: currentUser.id, title: r.title, ts: r.ts, timed: !!r.timed,
          total_seconds: r.totalSeconds, time_taken_seconds: r.timeTakenSeconds, auto_submitted: !!r.autoSubmitted,
          total: r.total, correct: r.correct, wrong: r.wrong, skipped: r.skipped, items: r.items,
        })));
      }
    } catch (e) { console.warn("sync: pushAllLocal failed", e); }
  }

  // ---------- pull (remote -> local merge) ----------
  async function pullAndMerge() {
    const c = getClient();
    if (!c || !currentUser) return;
    try {
      const [bmRes, outRes, resRes] = await Promise.all([
        c.from("bookmarks").select("subject,question_id").eq("user_id", currentUser.id),
        c.from("question_outcomes").select("subject,question_id,status,updated_at").eq("user_id", currentUser.id),
        c.from("test_results").select("*").eq("user_id", currentUser.id).order("ts", { ascending: false }).limit(200),
      ]);
      if (bmRes.data) STATE.mergeBookmarks(bmRes.data.map(b => ({ s: b.subject, id: b.question_id })));
      if (outRes.data) STATE.mergeSeen(outRes.data.map(o => ({
        slug: o.subject, id: o.question_id, status: o.status, ts: new Date(o.updated_at).getTime(),
      })));
      if (resRes.data) STATE.mergeHistory(resRes.data.map(r => ({
        id: r.id, title: r.title, ts: Number(r.ts), timed: r.timed, totalSeconds: r.total_seconds,
        timeTakenSeconds: r.time_taken_seconds, autoSubmitted: r.auto_submitted, total: r.total,
        correct: r.correct, wrong: r.wrong, skipped: r.skipped, items: r.items,
      })));
    } catch (e) { console.warn("sync: pullAndMerge failed", e); }
  }

  function installHook() {
    if (hookInstalled) return;
    hookInstalled = true;
    STATE.setMutationHook(evt => {
      if (!currentUser) return;
      if (evt.type === "bookmark") pushBookmark(evt.slug, evt.id, evt.active);
      else if (evt.type === "outcome") pushOutcome(evt.slug, evt.id, evt.status, evt.ts);
      else if (evt.type === "result") pushResult(evt.result);
    });
  }

  function refreshWidgets() {
    widgetMounts.forEach(id => renderAccountWidget(id));
  }

  async function init() {
    const c = getClient();
    installHook();
    if (!c) return; // not configured — everything else is a silent no-op
    try {
      const { data } = await c.auth.getSession();
      currentUser = data?.session?.user || null;
      if (currentUser) await pullAndMerge();
    } catch (e) { console.warn("sync: init getSession failed", e); }

    c.auth.onAuthStateChange(async (event, session) => {
      const wasSignedIn = !!currentUser;
      currentUser = session?.user || null;
      if (event === "SIGNED_IN" && !wasSignedIn) {
        await pullAndMerge();
        await pushAllLocal();
        if (window.UI) UI.toast(`Synced — signed in as ${currentUser.email}`);
        refreshWidgets();
      } else if (event === "SIGNED_OUT") {
        if (window.UI) UI.toast("Signed out — using local data only");
        refreshWidgets();
      }
    });
  }

  async function signUpWithPassword(email, password) {
    const c = getClient();
    if (!c) return { error: new Error("not configured") };
    return c.auth.signUp({ email, password });
  }
  async function signInWithPassword(email, password) {
    const c = getClient();
    if (!c) return { error: new Error("not configured") };
    return c.auth.signInWithPassword({ email, password });
  }
  async function signOut() {
    const c = getClient();
    if (c) await c.auth.signOut();
  }

  function renderAccountWidget(containerId) {
    widgetMounts.add(containerId);
    const mount = document.getElementById(containerId);
    if (!mount) return;

    if (!isConfigured()) {
      mount.innerHTML = `<div class="account-widget"><div class="account-status">Cloud sync not configured yet.</div></div>`;
      return;
    }
    if (currentUser) {
      mount.innerHTML = `
        <div class="account-widget synced">
          <div class="account-status">✓ Synced as<br><strong>${UI.esc(currentUser.email)}</strong></div>
          <button class="btn ghost small block" id="sync-signout-btn">Sign out</button>
        </div>`;
      const btn = document.getElementById("sync-signout-btn");
      if (btn) btn.addEventListener("click", signOut);
      return;
    }

    let mode = "signin"; // or "signup"

    function paint() {
      mount.innerHTML = `
        <div class="account-widget">
          <div class="account-status">Sync progress across devices</div>
          <div class="chip-row" style="margin:8px 0;">
            <label class="chip small ${mode === "signin" ? "active" : ""}" data-mode="signin">Sign in</label>
            <label class="chip small ${mode === "signup" ? "active" : ""}" data-mode="signup">Create account</label>
          </div>
          <input type="email" id="sync-email-input" class="mono" placeholder="you@email.com" autocomplete="email" style="margin-bottom:6px;">
          <input type="password" id="sync-password-input" class="mono" placeholder="password" autocomplete="${mode === "signin" ? "current-password" : "new-password"}">
          <button class="btn accent small block" id="sync-submit-btn" style="margin-top:8px;">${mode === "signin" ? "Sign in" : "Create account"}</button>
          <div class="account-note" id="sync-note"></div>
        </div>`;

      mount.querySelectorAll("[data-mode]").forEach(chip => {
        chip.addEventListener("click", () => { mode = chip.dataset.mode; paint(); });
      });

      const emailInput = document.getElementById("sync-email-input");
      const passInput = document.getElementById("sync-password-input");
      const btn = document.getElementById("sync-submit-btn");
      const note = document.getElementById("sync-note");

      btn.addEventListener("click", async () => {
        const email = (emailInput.value || "").trim();
        const password = passInput.value || "";
        if (!email || !password) { note.textContent = "Enter an email and password."; return; }
        if (mode === "signup" && password.length < 6) { note.textContent = "Password needs at least 6 characters."; return; }

        btn.disabled = true;
        btn.textContent = mode === "signin" ? "Signing in…" : "Creating…";
        const { data, error } = mode === "signin"
          ? await signInWithPassword(email, password)
          : await signUpWithPassword(email, password);
        btn.disabled = false;
        btn.textContent = mode === "signin" ? "Sign in" : "Create account";

        if (error) {
          note.textContent = error.message || "Something went wrong — try again.";
        } else if (mode === "signup" && data && !data.session) {
          // email confirmation is required by the Supabase project's auth settings
          note.textContent = "Account created — check your email to confirm, then sign in.";
        } else {
          note.textContent = "";
          // onAuthStateChange (SIGNED_IN) handles the pull/merge/push and re-render
        }
      });
    }

    paint();
  }

  return { init, isConfigured, getUser, signUpWithPassword, signInWithPassword, signOut, renderAccountWidget };
})();

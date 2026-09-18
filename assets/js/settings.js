(async function () {
  UI.initMobileBar();
  await SYNC.ready();
  await UI.renderRail("__settings");

  const main = document.getElementById("page-main");

  function render() {
    const cfg = SYNC.getConfig();
    const linked = SYNC.isLinked();
    const err = SYNC.getLastError();

    main.innerHTML = `
      <div style="margin-bottom:22px;">
        <div class="page-kicker">SETTINGS</div>
        <h1 class="page-title">Sync</h1>
        <p class="page-sub">By default everything lives only in this browser's local storage. If you paste in a Supabase project below and the email matches, your bookmarks, history, points, streak and achievements sync to that project and back — no account or password, just this one recognized email.</p>
      </div>

      <div class="panel" style="padding:22px; margin-bottom:20px; max-width:560px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px;">
          <span style="width:10px; height:10px; border-radius:50%; background:${linked ? 'var(--dial)' : 'var(--ink-faint)'}; flex-shrink:0;"></span>
          <strong style="font-size:0.9rem;">${linked ? "Synced to Supabase" : "Local-only"}</strong>
        </div>

        <label class="field-label" for="cfg-url">Supabase project URL</label>
        <input type="text" id="cfg-url" placeholder="https://xxxx.supabase.co" value="${UI.esc(cfg.url)}" style="width:100%; margin-bottom:14px;">

        <label class="field-label" for="cfg-key">Supabase anon key</label>
        <input type="text" id="cfg-key" placeholder="eyJhbGciOi..." value="${UI.esc(cfg.key)}" style="width:100%; margin-bottom:14px;">

        <label class="field-label" for="cfg-email">Email</label>
        <input type="text" id="cfg-email" placeholder="you@example.com" value="${UI.esc(cfg.email)}" style="width:100%; margin-bottom:6px;">
        <p style="font-size:0.78rem; color:var(--ink-faint); margin:0 0 18px;">Only one recognized email enables sync. Anything else — including a blank field — just saves the project details and stays local-only.</p>

        ${err ? `<div style="font-size:0.82rem; color:var(--incorrect); margin-bottom:14px;">Last sync error: ${UI.esc(err.message || String(err))}</div>` : ""}

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn--primary" id="save-btn">Save</button>
          ${linked ? `<button class="btn" id="sync-now-btn">Sync now</button><button class="btn btn--ghost" id="unlink-btn">Unlink</button>` : ""}
        </div>
      </div>

      <div class="panel" style="padding:18px 22px; max-width:560px; font-size:0.82rem; color:var(--ink-soft);">
        <strong style="display:block; margin-bottom:8px; color:var(--ink);">One-time setup on the Supabase side</strong>
        <p style="margin:0 0 10px;">Create a table and let the anon key read/write it — no auth, so keep the project's anon key private to you:</p>
        <pre style="background:var(--panel-inset); border:1px solid var(--border); border-radius:var(--radius-s); padding:12px 14px; overflow-x:auto; font-family:var(--font-mono); font-size:0.76rem; white-space:pre;">create table pe_state (
  user_email text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table pe_state enable row level security;
create policy "anon read/write" on pe_state
  for all using (true) with check (true);</pre>
      </div>
    `;

    document.getElementById("save-btn").addEventListener("click", () => {
      const url = document.getElementById("cfg-url").value;
      const key = document.getElementById("cfg-key").value;
      const email = document.getElementById("cfg-email").value;
      SYNC.setConfig(url, key, email);
      const nowLinked = SYNC.isLinked();
      UI.toast(nowLinked ? "Saved — linking to Supabase…" : "Saved — running local-only");
      if (nowLinked) {
        SYNC.ready().then(() => { UI.toast("Synced"); render(); });
      } else {
        render();
      }
    });

    const syncBtn = document.getElementById("sync-now-btn");
    if (syncBtn) syncBtn.addEventListener("click", async () => {
      syncBtn.disabled = true;
      const res = await SYNC.pushNow();
      UI.toast(res.ok ? "Synced" : "Sync failed — check the error below");
      syncBtn.disabled = false;
      render();
    });

    const unlinkBtn = document.getElementById("unlink-btn");
    if (unlinkBtn) unlinkBtn.addEventListener("click", () => {
      if (window.confirm("Unlink from Supabase? Your data stays on this device and in the cloud, they just won't sync anymore.")) {
        SYNC.unlink();
        UI.toast("Unlinked");
        render();
      }
    });
  }

  render();
})();

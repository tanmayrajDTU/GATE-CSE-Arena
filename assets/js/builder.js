(async function () {
  UI.initMobileBar();
  await SYNC.ready();
  await UI.renderRail(UI.qs("bookmarks") ? "__bookmarks" : "__custom");

  const [manifest, index] = await Promise.all([DB.getManifest(), DB.getIndex()]);
  const bookmarkKeys = new Set(STATE.getBookmarkRefs().map(r => r.s + "|" + r.id));

  const state = {
    subjects: new Set(manifest.subjects.map(s => s.slug)),
    type: "all",
    difficulty: "all",
    yearFrom: "all",
    yearTo: "all",
    bookmarksOnly: !!UI.qs("bookmarks"),
    limit: null,
  };
  const hasYears = !!(manifest.years && manifest.years.length);

  const main = document.getElementById("page-main");
  main.innerHTML = `
    <div style="margin-bottom:22px;">
      <div class="page-kicker">${MODE.get() === "pyq" ? "PYQ TEST BUILDER" : "TEST BUILDER"}</div>
      <h1 class="page-title">${state.bookmarksOnly ? "Bookmarked questions" : "Build a custom test"}</h1>
      <p class="page-sub">Mix subjects, difficulty${hasYears ? ", year" : ""} and question type into one set. ${state.bookmarksOnly ? "Starting from your bookmarks." : ""}</p>
    </div>

    <div class="panel" style="padding:22px; margin-bottom:20px;">
      <label class="field-label">Subjects</label>
      <div class="chip-row" id="subject-chips" style="margin-bottom:22px;"></div>

      <div style="display:flex; gap:28px; flex-wrap:wrap; margin-bottom:22px;">
        <div>
          <label class="field-label">Type</label>
          <div class="chip-row" id="type-chips">
            ${["all", "MCQ", "MSQ", "NAT"].map(t => `<label class="chip ${t === 'all' ? 'active' : ''}" data-val="${t}">${t === "all" ? "All" : t}</label>`).join("")}
          </div>
        </div>
        <div>
          <label class="field-label">Difficulty</label>
          <div class="chip-row" id="diff-chips">
            ${["all", "easy", "medium", "hard", "unknown"].map(d => `<label class="chip ${d === 'all' ? 'active' : ''}" data-val="${d}">${d === "all" ? "All" : UI.difficultyLabel(d)}</label>`).join("")}
          </div>
        </div>
        ${hasYears ? `
        <div>
          <label class="field-label">Year from</label>
          <select id="year-from" style="width:110px;"></select>
        </div>
        <div>
          <label class="field-label">Year to</label>
          <select id="year-to" style="width:110px;"></select>
        </div>` : ""}
      </div>

      <div style="display:flex; gap:28px; flex-wrap:wrap; align-items:flex-end;">
        <div>
          <label class="field-label">Bookmarked only</label>
          <label class="chip ${state.bookmarksOnly ? 'active' : ''}" id="bookmarks-chip">
            <input type="checkbox" id="bookmarks-only" ${state.bookmarksOnly ? "checked" : ""}> Only bookmarked questions
          </label>
        </div>
        <div>
          <label class="field-label">Limit (optional)</label>
          <input type="number" id="limit-input" placeholder="All matching" min="1" style="width:140px;">
        </div>
      </div>
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
      <div style="font-size:14px; color:var(--ink-soft);"><span class="mono-readout" id="match-total" style="font-size:1.2rem; color:var(--ink);">0</span> questions match</div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn--ghost" id="reset-btn">Reset filters</button>
        <button class="btn btn--primary" id="build-btn">Build test</button>
      </div>
    </div>
  `;

  const subjChips = document.getElementById("subject-chips");
  subjChips.innerHTML = manifest.subjects.map(s => `
    <label class="chip active" data-slug="${s.slug}"><input type="checkbox" checked>${UI.esc(s.name)} <span class="tag">${s.count}</span></label>
  `).join("");
  subjChips.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", e => {
      e.preventDefault();
      const slug = chip.dataset.slug;
      const input = chip.querySelector("input");
      if (state.subjects.has(slug)) { state.subjects.delete(slug); input.checked = false; chip.classList.remove("active"); }
      else { state.subjects.add(slug); input.checked = true; chip.classList.add("active"); }
      recompute();
    });
  });

  document.querySelectorAll("#type-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#type-chips .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.type = chip.dataset.val;
      recompute();
    });
  });
  document.querySelectorAll("#diff-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#diff-chips .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.difficulty = chip.dataset.val;
      recompute();
    });
  });

  const bmOnly = document.getElementById("bookmarks-only");
  bmOnly.addEventListener("change", () => {
    state.bookmarksOnly = bmOnly.checked;
    document.getElementById("bookmarks-chip").classList.toggle("active", bmOnly.checked);
    recompute();
  });

  document.getElementById("limit-input").addEventListener("input", e => {
    state.limit = e.target.value ? Number(e.target.value) : null;
  });

  if (hasYears) {
    const yf = document.getElementById("year-from"), yt = document.getElementById("year-to");
    const yearsAsc = manifest.years.slice().sort((a, b) => a - b);
    const yOpts = ["<option value=\"all\">Any</option>"].concat(yearsAsc.map(y => `<option value="${y}">${y}</option>`)).join("");
    yf.innerHTML = yOpts; yt.innerHTML = yOpts;
    yf.addEventListener("change", () => { state.yearFrom = yf.value; recompute(); });
    yt.addEventListener("change", () => { state.yearTo = yt.value; recompute(); });
  }

  function matches() {
    return index.filter(q => {
      if (!state.subjects.has(q.s)) return false;
      if (state.type !== "all" && q.t !== state.type) return false;
      if (state.difficulty !== "all" && q.d !== state.difficulty) return false;
      if (hasYears && state.yearFrom !== "all" && q.y && q.y < Number(state.yearFrom)) return false;
      if (hasYears && state.yearTo !== "all" && q.y && q.y > Number(state.yearTo)) return false;
      if (state.bookmarksOnly && !bookmarkKeys.has(q.s + "|" + q.id)) return false;
      return true;
    });
  }

  function recompute() {
    const m = matches();
    document.getElementById("match-total").textContent = m.length.toLocaleString();
    return m;
  }

  document.getElementById("reset-btn").addEventListener("click", () => location.reload());

  document.getElementById("build-btn").addEventListener("click", () => {
    let m = matches();
    if (!m.length) { UI.toast("No questions match these filters."); return; }
    if (state.limit && state.limit < m.length) {
      const pool = m.slice();
      const picked = [];
      while (picked.length < state.limit && pool.length) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
      }
      m = picked;
    }
    const refs = m.map(q => ({ s: q.s, id: q.id }));
    const label = state.bookmarksOnly ? "Bookmarked set" : "Custom set";
    LAUNCHER.open(refs, `${label} — ${refs.length} question${refs.length === 1 ? "" : "s"}`);
  });

  recompute();
})();

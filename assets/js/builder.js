(async function () {
  UI.initMobileBar();
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

  // subject chips
  const subjChips = document.getElementById("subject-chips");
  subjChips.innerHTML = manifest.subjects.map(s => `
    <label class="chip active" data-slug="${s.slug}"><input type="checkbox" checked>${UI.esc(s.name)} <span class="mono subtle">${s.count}</span></label>
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

  // year selects
  const yf = document.getElementById("year-from"), yt = document.getElementById("year-to");
  const yearsAsc = manifest.years.slice().sort((a, b) => a - b);
  const yOpts = ["<option value=\"all\">Any</option>"].concat(yearsAsc.map(y => `<option value="${y}">${y}</option>`)).join("");
  yf.innerHTML = yOpts; yt.innerHTML = yOpts;
  yf.addEventListener("change", () => { state.yearFrom = yf.value; recompute(); });
  yt.addEventListener("change", () => { state.yearTo = yt.value; recompute(); });

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
  bmOnly.checked = state.bookmarksOnly;
  if (state.bookmarksOnly) document.getElementById("bookmarks-chip").classList.add("active");
  bmOnly.addEventListener("change", () => {
    state.bookmarksOnly = bmOnly.checked;
    document.getElementById("bookmarks-chip").classList.toggle("active", bmOnly.checked);
    recompute();
  });

  document.getElementById("limit-input").addEventListener("input", e => {
    state.limit = e.target.value ? Number(e.target.value) : null;
  });

  function matches() {
    return index.filter(q => {
      if (!state.subjects.has(q.s)) return false;
      if (state.type !== "all" && q.t !== state.type) return false;
      if (state.difficulty !== "all" && q.d !== state.difficulty) return false;
      if (state.yearFrom !== "all" && q.y && q.y < Number(state.yearFrom)) return false;
      if (state.yearTo !== "all" && q.y && q.y > Number(state.yearTo)) return false;
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
      // random sample without replacement
      const pool = m.slice();
      const picked = [];
      while (picked.length < state.limit && pool.length) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
      }
      m = picked.sort((a, b) => (a.y || 0) - (b.y || 0));
    }
    const refs = m.map(q => ({ s: q.s, id: q.id }));
    const label = state.bookmarksOnly ? "Bookmarked set" : "Custom set";
    LAUNCHER.open(refs, `${label} — ${refs.length} question${refs.length === 1 ? "" : "s"}`);
  });

  recompute();
})();

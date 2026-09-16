(async function () {
  UI.initMobileBar();
  await UI.renderRail(null);

  const manifest = await DB.getManifest();

  // stat strip
  const strip = document.getElementById("stat-strip");
  strip.innerHTML = `
    <div class="stat-cell"><div class="stat-num mono">${manifest.totalQuestions.toLocaleString()}</div><div class="stat-label">Total questions</div></div>
    <div class="stat-cell"><div class="stat-num mono">${manifest.subjects.length}</div><div class="stat-label">Subjects</div></div>
    <div class="stat-cell"><div class="stat-num mono">${manifest.years[0]}–${manifest.years[manifest.years.length - 1]}</div><div class="stat-label">Year span</div></div>
    <div class="stat-cell"><div class="stat-num mono">${STATE.bookmarkCount()}</div><div class="stat-label">Bookmarked</div></div>
  `;
  document.getElementById("bm-count-text").textContent = STATE.bookmarkCount();

  // continue card
  const draft = STATE.getDraft();
  if (draft && draft.refs && draft.refs.length) {
    const answeredCount = Object.keys(draft.answers || {}).length;
    const card = document.getElementById("continue-card");
    card.style.display = "block";
    card.innerHTML = `
      <div class="panel panel-pad" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; border-color:var(--accent);">
        <div>
          <div style="font-weight:600; margin-bottom:3px;">Resume: ${UI.esc(draft.title)}</div>
          <div class="subtle" style="font-size:13px;">${answeredCount} of ${draft.refs.length} answered${draft.timed ? " · timed" : ""}</div>
        </div>
        <a class="btn accent" href="test.html?resume=1">Resume test</a>
      </div>
    `;
  }

  // subject grid
  const grid = document.getElementById("subject-grid");
  grid.innerHTML = manifest.subjects.map((s, i) => {
    const allIds = null; // progress computed lazily below is expensive; use lightweight per-subject cached count instead
    return `
    <a class="subject-card" href="subject.html?s=${s.slug}">
      <div class="idx">${String(i + 1).padStart(2, "0")} / SUBJECT</div>
      <div class="title">${UI.esc(s.name)}</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <span class="tag">${s.types.MCQ || 0} MCQ</span>
        ${s.types.MSQ ? `<span class="tag">${s.types.MSQ} MSQ</span>` : ""}
        ${s.types.NAT ? `<span class="tag">${s.types.NAT} NAT</span>` : ""}
      </div>
      <div class="bar" data-slug="${s.slug}" data-total="${s.count}"><i style="width:0%"></i></div>
      <div class="foot"><span>${s.topics.length} topics</span><span>${s.count} questions</span></div>
    </a>`;
  }).join("");

  // fill progress bars from local seen-state (cheap: only touches localStorage + ids already in manifest? we need ids —
  // to avoid loading every subject file just for the homepage, approximate using the seen map's own keys)
  const seen = STATE.getSeenMap();
  const perSubjectSeen = {};
  Object.keys(seen).forEach(k => {
    const slug = k.split("|")[0];
    perSubjectSeen[slug] = (perSubjectSeen[slug] || 0) + 1;
  });
  document.querySelectorAll(".bar[data-slug]").forEach(bar => {
    const slug = bar.dataset.slug;
    const total = Number(bar.dataset.total);
    const attempted = perSubjectSeen[slug] || 0;
    const pct = total ? Math.min(100, Math.round((attempted / total) * 100)) : 0;
    bar.querySelector("i").style.width = pct + "%";
  });
})();

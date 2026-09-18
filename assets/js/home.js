(async function () {
  UI.initMobileBar();
  await SYNC.ready();
  await UI.renderRail(null);

  const manifest = await DB.getManifest();
  const totals = STATE.getTotals();
  const mode = MODE.get();
  const isPyq = mode === "pyq";

  document.getElementById("page-kicker").textContent = isPyq ? "PYQ OVERVIEW" : "OVERVIEW";
  document.getElementById("page-title-text").textContent = isPyq
    ? "Previous Year Questions, subject by subject"
    : "Practice questions, drilled properly";
  document.getElementById("page-sub-text").textContent = isPyq
    ? `${manifest.totalQuestions.toLocaleString()} actual GATE questions across 14 subjects` +
      (manifest.years && manifest.years.length ? `, spanning ${manifest.years[0]}–${manifest.years[manifest.years.length - 1]}` : "") +
      " — filter by year, browse by topic, and drill the exact questions GATE has asked."
    : `${manifest.totalQuestions.toLocaleString()} questions across 14 GATE CSE subjects — MCQ, MSQ and NAT — each with a full solution and per-option feedback explaining why every choice is right or wrong.`;

  const strip = document.getElementById("stat-strip");
  const yearSpan = (manifest.years && manifest.years.length)
    ? `<div class="stat-cell"><div class="stat-num">${manifest.years[0]}–${manifest.years[manifest.years.length - 1]}</div><div class="stat-label">Year span</div></div>`
    : "";
  strip.innerHTML = `
    <div class="stat-cell"><div class="stat-num">${manifest.totalQuestions.toLocaleString()}</div><div class="stat-label">Total questions</div></div>
    <div class="stat-cell"><div class="stat-num">${totals.attempted.toLocaleString()}</div><div class="stat-label">You've attempted</div></div>
    <div class="stat-cell"><div class="stat-num">${totals.attempted ? Math.round((totals.correct / totals.attempted) * 100) : 0}%</div><div class="stat-label">Your accuracy</div></div>
    ${yearSpan}
    <div class="stat-cell"><div class="stat-num" style="color:var(--dial)">${STATE.bookmarkCount()}</div><div class="stat-label">Bookmarked</div></div>
  `;

  const draft = STATE.getDraft();
  if (draft && draft.refs && draft.refs.length) {
    const answeredCount = Object.keys(draft.answers || {}).length;
    const card = document.getElementById("continue-card");
    card.style.display = "block";
    card.innerHTML = `
      <div class="panel" style="padding:18px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; border-color:var(--signal);">
        <div>
          <div style="font-weight:600; margin-bottom:3px;">Resume: ${UI.esc(draft.title)}</div>
          <div style="font-size:13px; color:var(--ink-faint);">${answeredCount} of ${draft.refs.length} answered${draft.timed ? " · timed" : ""}</div>
        </div>
        <a class="btn btn--primary" href="test.html">Resume test</a>
      </div>
    `;
  }

  const grid = document.getElementById("subject-grid");
  grid.innerHTML = manifest.subjects.map((s, i) => `
    <a class="subject-card" href="subject.html?s=${s.slug}">
      <div class="idx">${String(i + 1).padStart(2, "0")} / SUBJECT</div>
      <div class="title">${UI.esc(s.name)}</div>
      <div class="tags">
        <span class="tag">${s.types.MCQ || 0} MCQ</span>
        ${s.types.MSQ ? `<span class="tag">${s.types.MSQ} MSQ</span>` : ""}
        ${s.types.NAT ? `<span class="tag">${s.types.NAT} NAT</span>` : ""}
      </div>
      <div class="bar" data-slug="${s.slug}" data-total="${s.count}"><i style="width:0%"></i></div>
      <div class="foot"><span>${s.topics.length} topics</span><span>${s.count} questions</span></div>
    </a>`).join("");

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

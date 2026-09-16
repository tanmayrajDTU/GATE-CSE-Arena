(async function () {
  UI.initMobileBar();
  const slug = UI.qs("s");
  if (!slug) { location.href = "index.html"; return; }

  await UI.renderRail(slug);

  const [manifest, questions] = await Promise.all([DB.getManifest(), DB.getSubject(slug)]);
  const meta = manifest.subjects.find(s => s.slug === slug);
  if (!meta) { document.getElementById("page-main").innerHTML = `<div class="empty-state">Subject not found.</div>`; return; }

  const state = { type: "all", difficulty: "all", year: "all", topics: new Set() };

  const main = document.getElementById("page-main");
  main.innerHTML = `
    <div style="margin-bottom:22px;">
      <div class="subtle mono" style="font-size:12px; margin-bottom:6px;">SUBJECT</div>
      <h1 class="display-title" style="font-size:28px;">${UI.esc(meta.name)}</h1>
    </div>

    <div class="stat-strip" style="margin-bottom:24px;">
      <div class="stat-cell"><div class="stat-num mono">${meta.count}</div><div class="stat-label">Total questions</div></div>
      <div class="stat-cell"><div class="stat-num mono">${meta.types.MCQ || 0}</div><div class="stat-label">MCQ</div></div>
      <div class="stat-cell"><div class="stat-num mono">${meta.types.MSQ || 0}</div><div class="stat-label">MSQ</div></div>
      <div class="stat-cell"><div class="stat-num mono">${meta.types.NAT || 0}</div><div class="stat-label">NAT</div></div>
      <div class="stat-cell"><div class="stat-num mono">${meta.topics.length}</div><div class="stat-label">Topics</div></div>
    </div>

    <div class="panel panel-pad" style="margin-bottom:22px; display:flex; gap:26px; flex-wrap:wrap;">
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
      <div>
        <label class="field-label">Year</label>
        <select id="year-select"></select>
      </div>
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
      <div>
        <button class="btn ghost small" id="select-all-btn">Select all topics</button>
        <button class="btn ghost small" id="clear-sel-btn">Clear</button>
      </div>
      <div style="display:flex; gap:10px;">
        <span class="subtle" id="match-count" style="align-self:center; font-size:13px;"></span>
        <button class="btn accent" id="start-selected-btn">Start selected topics</button>
        <button class="btn ghost" id="start-all-btn">Start full subject</button>
      </div>
    </div>

    <div class="panel" style="overflow-x:auto;">
      <table class="topic-table" id="topic-table">
        <thead><tr>
          <th class="row-check"></th><th>Topic</th><th>Subtopics</th><th>Questions</th><th>Difficulty mix</th>
        </tr></thead>
        <tbody id="topic-tbody"></tbody>
      </table>
    </div>
  `;

  // year options
  const years = [...new Set(questions.map(q => q.year).filter(Boolean))].sort((a, b) => b - a);
  const yearSel = document.getElementById("year-select");
  yearSel.innerHTML = `<option value="all">All years</option>` + years.map(y => `<option value="${y}">${y}</option>`).join("");

  function filteredQuestions() {
    return questions.filter(q => {
      if (state.type !== "all" && q.type !== state.type) return false;
      if (state.difficulty !== "all" && UI.difficultyOf(q.avgSuccessRate) !== state.difficulty) return false;
      if (state.year !== "all" && String(q.year) !== state.year) return false;
      return true;
    });
  }

  function renderTable() {
    const pool = filteredQuestions();
    const byTopic = new Map();
    pool.forEach(q => {
      const key = q.topic || "Uncategorized";
      if (!byTopic.has(key)) byTopic.set(key, []);
      byTopic.get(key).push(q);
    });
    const rows = [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length);

    const tbody = document.getElementById("topic-tbody");
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--ink-faint); padding:30px;">No questions match these filters.</td></tr>`;
    } else {
      tbody.innerHTML = rows.map(([topic, qs]) => {
        const subtopics = [...new Set(qs.map(q => q.subtopic).filter(Boolean))];
        const diffCounts = { easy: 0, medium: 0, hard: 0, unknown: 0 };
        qs.forEach(q => diffCounts[UI.difficultyOf(q.avgSuccessRate)]++);
        const checked = state.topics.has(topic) ? "checked" : "";
        return `
        <tr data-topic="${UI.esc(topic)}">
          <td class="row-check"><input type="checkbox" class="topic-check" data-topic="${UI.esc(topic)}" ${checked}></td>
          <td>${UI.esc(topic)}</td>
          <td class="subtle" style="font-size:12.5px; max-width:280px;">${subtopics.slice(0, 3).map(UI.esc).join(" · ")}${subtopics.length > 3 ? " …" : ""}</td>
          <td class="mono">${qs.length}</td>
          <td>
            ${diffCounts.easy ? `<span class="tag good" style="margin-right:4px;">${diffCounts.easy} easy</span>` : ""}
            ${diffCounts.medium ? `<span class="tag medium" style="margin-right:4px;">${diffCounts.medium} med</span>` : ""}
            ${diffCounts.hard ? `<span class="tag hard" style="margin-right:4px;">${diffCounts.hard} hard</span>` : ""}
            ${diffCounts.unknown ? `<span class="tag unknown">${diffCounts.unknown} unrated</span>` : ""}
          </td>
        </tr>`;
      }).join("");
    }

    document.querySelectorAll(".topic-check").forEach(cb => {
      cb.addEventListener("change", () => {
        if (cb.checked) state.topics.add(cb.dataset.topic); else state.topics.delete(cb.dataset.topic);
        updateMatchCount();
      });
    });
    updateMatchCount();
  }

  function updateMatchCount() {
    const pool = filteredQuestions();
    const selectedPool = state.topics.size ? pool.filter(q => state.topics.has(q.topic || "Uncategorized")) : [];
    document.getElementById("match-count").textContent = state.topics.size
      ? `${selectedPool.length} selected`
      : `${pool.length} total in view`;
  }

  document.querySelectorAll("#type-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#type-chips .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.type = chip.dataset.val;
      renderTable();
    });
  });
  document.querySelectorAll("#diff-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#diff-chips .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.difficulty = chip.dataset.val;
      renderTable();
    });
  });
  yearSel.addEventListener("change", () => { state.year = yearSel.value; renderTable(); });

  document.getElementById("select-all-btn").addEventListener("click", () => {
    filteredQuestions().forEach(q => state.topics.add(q.topic || "Uncategorized"));
    renderTable();
  });
  document.getElementById("clear-sel-btn").addEventListener("click", () => {
    state.topics.clear();
    renderTable();
  });

  document.getElementById("start-selected-btn").addEventListener("click", () => {
    const pool = filteredQuestions().filter(q => state.topics.has(q.topic || "Uncategorized"));
    if (!state.topics.size) { UI.toast("Select at least one topic first."); return; }
    const refs = pool.map(q => ({ s: slug, id: q.id }));
    LAUNCHER.open(refs, `${meta.name} — ${state.topics.size} topic${state.topics.size === 1 ? "" : "s"}`);
  });
  document.getElementById("start-all-btn").addEventListener("click", () => {
    const pool = filteredQuestions();
    const refs = pool.map(q => ({ s: slug, id: q.id }));
    LAUNCHER.open(refs, `${meta.name} — full subject`);
  });

  renderTable();
})();

/* ============================================================
   BROWSE — read-only question browser for the CURRENT MODE
   (practice or PYQ, see mode.js). Lists questions with filters
   and lets you reveal the correct answer, per-option feedback
   and the full solution inline, without starting a test.

   Purely additive: reads the same data/ files and the same
   STATE bookmarks as the rest of the app, writes nothing except
   bookmark toggles (which already sync everywhere).
   ============================================================ */

(async function () {
  UI.initMobileBar();
  await SYNC.ready();
  await UI.renderRail("__browse");

  const main = document.getElementById("page-main");
  const PAGE_SIZE = 15;

  const [manifest, index] = await Promise.all([DB.getManifest(), DB.getIndex()]);
  const subjectName = {};
  manifest.subjects.forEach(s => { subjectName[s.slug] = s.name; });

  const hasYears = index.some(r => r.y);
  const years = [...new Set(index.map(r => r.y).filter(Boolean))].sort((a, b) => b - a);

  const state = {
    subject: UI.qs("s") || "all",
    topic: "all",
    type: "all",
    difficulty: "all",
    year: "all",
    bookmarked: false,
    q: "",
    page: 1,
    revealAll: false,
  };

  // full-text search needs the actual question bodies, which only exist in the
  // per-subject files — so it is enabled once a single subject is picked.
  let textIndex = null;       // Map id -> lowercase searchable text
  let textIndexSubject = null;

  main.innerHTML = `
    <div style="margin-bottom:22px;">
      <div class="page-kicker">BROWSE &amp; REVEAL — ${MODE.label()}</div>
      <h1 class="page-title">Browse questions, reveal answers</h1>
      <p class="page-sub">Every ${MODE.fullLabel().toLowerCase()} question in one place. Filter down, then reveal the correct answer, why each option is right or wrong, and the full solution — no test required.</p>
    </div>

    <div class="panel browse-toolbar">
      <div>
        <label class="field-label" for="b-subject">Subject</label>
        <select id="b-subject" class="browse-input">
          <option value="all">All subjects</option>
          ${manifest.subjects.map(s => `<option value="${s.slug}">${UI.esc(s.name)}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="field-label" for="b-topic">Topic</label>
        <select id="b-topic" class="browse-input"><option value="all">All topics</option></select>
      </div>
      ${hasYears ? `
      <div>
        <label class="field-label" for="b-year">Year</label>
        <select id="b-year" class="browse-input">
          <option value="all">All years</option>
          ${years.map(y => `<option value="${y}">${y}</option>`).join("")}
        </select>
      </div>` : ""}
      <div>
        <label class="field-label" for="b-search">Search</label>
        <input id="b-search" class="browse-input" type="search" placeholder="Question number, topic…" autocomplete="off">
      </div>
      <div>
        <label class="field-label">Type</label>
        <div class="chip-row" id="b-type">
          ${["all", "MCQ", "MSQ", "NAT"].map(t => `<label class="chip ${t === "all" ? "active" : ""}" data-val="${t}">${t === "all" ? "All" : t}</label>`).join("")}
        </div>
      </div>
      <div>
        <label class="field-label">Difficulty</label>
        <div class="chip-row" id="b-diff">
          ${["all", "easy", "medium", "hard", "unknown"].map(d => `<label class="chip ${d === "all" ? "active" : ""}" data-val="${d}">${d === "all" ? "All" : UI.difficultyLabel(d)}</label>`).join("")}
        </div>
      </div>
      <div>
        <label class="field-label">Saved</label>
        <div class="chip-row" id="b-bm">
          <label class="chip active" data-val="off">All questions</label>
          <label class="chip" data-val="on">Bookmarked only</label>
        </div>
      </div>
    </div>

    <div class="browse-bar">
      <span style="font-size:13px; color:var(--ink-faint);" id="b-count"></span>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn--ghost" id="b-reveal-all">Reveal all on this page</button>
        <button class="btn btn--ghost" id="b-reset">Reset filters</button>
        <button class="btn btn--primary" id="b-practice">Practice these</button>
      </div>
    </div>

    <div id="b-list"></div>
    <div class="browse-pager" id="b-pager"></div>
  `;

  const $ = id => document.getElementById(id);

  // ---------- filtering ----------

  function topicsForSubject() {
    const pool = state.subject === "all" ? index : index.filter(r => r.s === state.subject);
    return [...new Set(pool.map(r => r.tp).filter(Boolean))].sort();
  }

  function renderTopicSelect() {
    const sel = $("b-topic");
    const topics = topicsForSubject();
    sel.innerHTML = `<option value="all">All topics</option>` +
      topics.map(t => `<option value="${UI.esc(t)}">${UI.esc(t)}</option>`).join("");
    sel.value = topics.includes(state.topic) ? state.topic : "all";
    state.topic = sel.value;
  }

  function bookmarkSet() {
    return new Set(STATE.getBookmarkRefs().map(r => r.s + "|" + r.id));
  }

  function filtered() {
    const bm = state.bookmarked ? bookmarkSet() : null;
    const q = state.q.trim().toLowerCase();
    return index.filter(r => {
      if (state.subject !== "all" && r.s !== state.subject) return false;
      if (state.topic !== "all" && r.tp !== state.topic) return false;
      if (state.type !== "all" && r.t !== state.type) return false;
      if (state.difficulty !== "all" && (r.d || "unknown") !== state.difficulty) return false;
      if (hasYears && state.year !== "all" && String(r.y) !== state.year) return false;
      if (bm && !bm.has(r.s + "|" + r.id)) return false;
      if (q) {
        if (textIndex && textIndexSubject === state.subject) {
          const hay = textIndex.get(r.id);
          if (hay) return hay.includes(q);
        }
        const meta = `${r.tp || ""} ${r.st || ""} ${r.n || ""} ${subjectName[r.s] || ""}`.toLowerCase();
        if (!meta.includes(q)) return false;
      }
      return true;
    });
  }

  // When a single subject is selected we can afford to load its question file
  // and search the real question text.
  async function ensureTextIndex() {
    if (state.subject === "all") { textIndex = null; textIndexSubject = null; return; }
    if (textIndexSubject === state.subject) return;
    const list = await DB.getSubject(state.subject);
    const map = new Map();
    list.forEach(qq => {
      const opts = (qq.options || []).map(o => o.html).join(" ");
      map.set(qq.id, `${qq.title || ""} ${qq.text || ""} ${opts} ${qq.topic || ""} ${qq.subtopic || ""} ${qq.number || ""}`
        .replace(/<[^>]*>/g, " ").toLowerCase());
    });
    textIndex = map;
    textIndexSubject = state.subject;
  }

  // ---------- rendering ----------

  function answerText(q) {
    if (q.type === "NAT") {
      const a = q.correctAnswer || {};
      return a.min === a.max ? `${a.min}` : `${a.min} to ${a.max}`;
    }
    const ids = q.type === "MSQ" ? (q.correctAnswer || []) : [q.correctAnswer];
    const letters = ids.map(id => {
      const i = (q.options || []).findIndex(o => o.id === id);
      return i >= 0 ? String.fromCharCode(65 + i) : "?";
    });
    return "Option " + letters.join(", ");
  }

  function optionsHtml(q, revealed) {
    if (q.type === "NAT") {
      return `<div class="reading" style="margin-top:12px; color:var(--ink-faint); font-size:0.88rem;">Numerical answer type — enter a value.</div>`;
    }
    const correctSet = new Set(q.type === "MSQ" ? (q.correctAnswer || []) : [q.correctAnswer]);
    return `
      <div class="opt-list" style="margin-top:14px;">
        ${(q.options || []).map((opt, oi) => `
          <div class="opt-row ${revealed && correctSet.has(opt.id) ? "fb-correct" : ""}">
            <div class="opt-mark">${String.fromCharCode(65 + oi)}</div>
            <div class="opt-body reading">${opt.html}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function answerBlock(q) {
    const fb = (q.optionFeedback || []).filter(f => f.html);
    return `
      <div class="browse-answer">
        <div class="answer-pill">✓ Answer: ${UI.esc(answerText(q))}</div>
        ${fb.length ? `
          <div class="solution-block">
            <div class="cap">Why each option</div>
            ${fb.map(f => {
              const i = (q.options || []).findIndex(o => o.id === f.id);
              const letter = i >= 0 ? String.fromCharCode(65 + i) : "•";
              return `<div class="reading" style="margin-bottom:8px;">
                <strong style="color:${f.correct ? "var(--correct)" : "var(--incorrect)"};">${letter}.</strong> ${f.html}
              </div>`;
            }).join("")}
          </div>` : ""}
        ${q.solution ? `<div class="solution-block"><div class="cap">Solution</div><div class="reading">${q.solution}</div></div>` : ""}
        ${!q.solution && !fb.length ? `<div class="solution-block"><div class="reading" style="color:var(--ink-faint);">No written explanation is available for this question.</div></div>` : ""}
      </div>
    `;
  }

  function cardHtml(q, n, slug) {
    const bmOn = STATE.isBookmarked(slug, q.id);
    return `
      <div class="panel browse-card" data-id="${UI.esc(q.id)}">
        <div class="q-head">
          <div class="q-meta">
            <span class="tag mono">#${n}</span>
            <span class="tag">${UI.esc(q.type)}</span>
            <span class="gauge gauge--${q.difficulty}">${UI.difficultyLabel(q.difficulty)}</span>
            <span class="tag">${UI.esc(q.subject)}</span>
            ${q.topic ? `<span class="tag">${UI.esc(q.topic)}</span>` : ""}
            ${UI.examYear(q) ? `<span class="tag mono">${UI.esc(UI.examYear(q))}</span>` : ""}
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn--ghost" data-bm="${UI.esc(q.id)}" style="padding:6px 12px; font-size:0.8rem;">${bmOn ? "★ Saved" : "☆ Save"}</button>
            <button class="btn" data-reveal="${UI.esc(q.id)}" style="padding:6px 14px; font-size:0.8rem;">Reveal answer</button>
          </div>
        </div>
        <div class="reading" style="margin-top:12px;">${q.text}</div>
        <div data-opts="${UI.esc(q.id)}">${optionsHtml(q, false)}</div>
        <div data-answer="${UI.esc(q.id)}" hidden></div>
      </div>
    `;
  }

  let currentRows = [];
  let currentQuestions = [];

  async function render() {
    const list = $("b-list");
    list.innerHTML = `<div class="empty-state">Loading…</div>`;

    currentRows = filtered();
    const totalPages = Math.max(1, Math.ceil(currentRows.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const slice = currentRows.slice(start, start + PAGE_SIZE);

    $("b-count").textContent = currentRows.length
      ? `${currentRows.length.toLocaleString()} question${currentRows.length === 1 ? "" : "s"} · showing ${start + 1}–${start + slice.length}`
      : "No questions match these filters";

    if (!slice.length) {
      list.innerHTML = `<div class="empty-state">Nothing matches these filters. Try widening them or <a href="#" id="b-reset-inline">reset</a>.</div>`;
      $("b-pager").innerHTML = "";
      const r = document.getElementById("b-reset-inline");
      if (r) r.addEventListener("click", e => { e.preventDefault(); resetFilters(); });
      return;
    }

    currentQuestions = await DB.resolveRefs(slice.map(r => ({ s: r.s, id: r.id })));
    const slugById = new Map(slice.map(r => [r.id, r.s]));
    list.innerHTML = currentQuestions.map((q, i) => cardHtml(q, start + i + 1, slugById.get(q.id))).join("");
    UI.renderMath(list);

    if (state.revealAll) currentQuestions.forEach(q => reveal(q.id, true));

    $("b-pager").innerHTML = `
      <button class="btn btn--ghost" id="b-prev" ${state.page === 1 ? "disabled" : ""}>← Previous</button>
      <span style="font-size:0.85rem; color:var(--ink-faint);">Page ${state.page} of ${totalPages}</span>
      <button class="btn btn--ghost" id="b-next" ${state.page === totalPages ? "disabled" : ""}>Next →</button>
    `;
    $("b-prev").addEventListener("click", () => { state.page--; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    $("b-next").addEventListener("click", () => { state.page++; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  function reveal(id, on) {
    const q = currentQuestions.find(x => x.id === id);
    if (!q) return;
    const box = document.querySelector(`[data-answer="${CSS.escape(id)}"]`);
    const opts = document.querySelector(`[data-opts="${CSS.escape(id)}"]`);
    const btn = document.querySelector(`[data-reveal="${CSS.escape(id)}"]`);
    if (!box) return;
    if (on) {
      if (!box.innerHTML) { box.innerHTML = answerBlock(q); UI.renderMath(box); }
      box.hidden = false;
      opts.innerHTML = optionsHtml(q, true);
      UI.renderMath(opts);
      if (btn) btn.textContent = "Hide answer";
    } else {
      box.hidden = true;
      opts.innerHTML = optionsHtml(q, false);
      UI.renderMath(opts);
      if (btn) btn.textContent = "Reveal answer";
    }
  }

  function resetFilters() {
    state.subject = "all"; state.topic = "all"; state.type = "all";
    state.difficulty = "all"; state.year = "all"; state.bookmarked = false;
    state.q = ""; state.page = 1; state.revealAll = false;
    $("b-subject").value = "all";
    if (hasYears) $("b-year").value = "all";
    $("b-search").value = "";
    document.querySelectorAll("#b-type .chip").forEach(c => c.classList.toggle("active", c.dataset.val === "all"));
    document.querySelectorAll("#b-diff .chip").forEach(c => c.classList.toggle("active", c.dataset.val === "all"));
    document.querySelectorAll("#b-bm .chip").forEach(c => c.classList.toggle("active", c.dataset.val === "off"));
    $("b-reveal-all").textContent = "Reveal all on this page";
    renderTopicSelect();
    render();
  }

  // ---------- events ----------

  document.addEventListener("click", e => {
    const rv = e.target.closest("[data-reveal]");
    if (rv) {
      const id = rv.dataset.reveal;
      const box = document.querySelector(`[data-answer="${CSS.escape(id)}"]`);
      reveal(id, box.hidden);
      return;
    }
    const bm = e.target.closest("[data-bm]");
    if (bm) {
      const id = bm.dataset.bm;
      const q = currentQuestions.find(x => x.id === id);
      if (!q) return;
      const slug = (currentRows.find(r => r.id === id) || {}).s;
      const on = STATE.toggleBookmark(slug, id);
      bm.textContent = on ? "★ Saved" : "☆ Save";
      UI.toast(on ? "Bookmarked" : "Removed from bookmarks");
      UI.renderRail("__browse");
      if (state.bookmarked && !on) render();
    }
  });

  $("b-subject").addEventListener("change", async e => {
    state.subject = e.target.value;
    state.page = 1;
    renderTopicSelect();
    if (state.q) await ensureTextIndex();
    render();
  });

  $("b-topic").addEventListener("change", e => { state.topic = e.target.value; state.page = 1; render(); });
  if (hasYears) $("b-year").addEventListener("change", e => { state.year = e.target.value; state.page = 1; render(); });

  let searchTimer = null;
  $("b-search").addEventListener("input", e => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(async () => {
      state.q = v;
      state.page = 1;
      if (v.trim()) await ensureTextIndex();
      render();
    }, 220);
  });

  function chipGroup(groupId, apply) {
    document.querySelectorAll(`#${groupId} .chip`).forEach(chip => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(`#${groupId} .chip`).forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        apply(chip.dataset.val);
        state.page = 1;
        render();
      });
    });
  }
  chipGroup("b-type", v => { state.type = v; });
  chipGroup("b-diff", v => { state.difficulty = v; });
  chipGroup("b-bm", v => { state.bookmarked = v === "on"; });

  $("b-reveal-all").addEventListener("click", () => {
    state.revealAll = !state.revealAll;
    currentQuestions.forEach(q => reveal(q.id, state.revealAll));
    $("b-reveal-all").textContent = state.revealAll ? "Hide all on this page" : "Reveal all on this page";
  });

  $("b-reset").addEventListener("click", resetFilters);

  $("b-practice").addEventListener("click", () => {
    const refs = currentRows.slice(0, 200).map(r => ({ s: r.s, id: r.id }));
    if (!refs.length) { UI.toast("No questions match these filters."); return; }
    LAUNCHER.open(refs, `Browse selection — ${MODE.label()}`);
  });

  if (state.subject !== "all") $("b-subject").value = state.subject;
  renderTopicSelect();
  render();
})();

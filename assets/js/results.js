(async function () {
  UI.initMobileBar();
  await UI.renderRail("__history");

  const id = UI.qs("id");
  const result = id ? STATE.getResult(id) : null;
  const main = document.getElementById("page-main");
  if (!result) {
    main.innerHTML = `<div class="empty-state">Result not found. <a href="history.html">View history</a>.</div>`;
    return;
  }

  const refs = result.items.map(it => ({ s: it.subject, id: it.id }));
  const questions = await DB.resolveRefs(refs);
  const qById = new Map(questions.map(q => [q.id, q]));

  const accuracy = result.total ? Math.round((result.correct / (result.correct + result.wrong || 1)) * 100) : 0;
  const attempted = result.correct + result.wrong;

  main.innerHTML = `
    <div style="margin-bottom:20px;">
      <div class="subtle mono" style="font-size:12px; margin-bottom:6px;">RESULT</div>
      <h1 class="display-title" style="font-size:26px;">${UI.esc(result.title)}</h1>
      <p class="subtle" style="font-size:13px; margin-top:4px;">${new Date(result.ts).toLocaleString()} ${result.autoSubmitted ? "· auto-submitted on time-up" : ""}</p>
    </div>

    <div class="score-hero">
      <div>
        <div class="score-ring-num">${accuracy}%</div>
        <div class="stat-label">accuracy on attempted</div>
      </div>
      <div style="display:flex; gap:22px; flex-wrap:wrap;">
        <div><div class="stat-num mono" style="color:var(--good);">${result.correct}</div><div class="stat-label">Correct</div></div>
        <div><div class="stat-num mono" style="color:var(--bad);">${result.wrong}</div><div class="stat-label">Incorrect</div></div>
        <div><div class="stat-num mono" style="color:var(--ink-faint);">${result.skipped}</div><div class="stat-label">Skipped</div></div>
        <div><div class="stat-num mono">${UI.fmtTime(result.timeTakenSeconds)}</div><div class="stat-label">Time taken</div></div>
      </div>
      <div style="margin-left:auto; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn ghost" id="retry-wrong-btn">Retry incorrect + skipped</button>
        <a class="btn ghost" href="index.html">Home</a>
      </div>
    </div>

    <div class="chip-row" id="filter-chips" style="margin-bottom:18px;">
      <label class="chip active" data-val="all">All (${result.total})</label>
      <label class="chip" data-val="incorrect">Incorrect (${result.wrong})</label>
      <label class="chip" data-val="skipped">Skipped (${result.skipped})</label>
      <label class="chip" data-val="flagged">Flagged (${result.items.filter(i => i.flagged).length})</label>
    </div>

    <div id="review-list"></div>
  `;

  function letter(i) { return String.fromCharCode(65 + i); }

  function renderList(filter) {
    const items = result.items.filter(it => {
      if (filter === "incorrect") return it.answered && !it.isCorrect;
      if (filter === "skipped") return !it.answered;
      if (filter === "flagged") return it.flagged;
      return true;
    });
    const list = document.getElementById("review-list");
    if (!items.length) {
      list.innerHTML = `<div class="empty-state">Nothing in this view.</div>`;
      return;
    }
    list.innerHTML = items.map((it, n) => {
      const q = qById.get(it.id);
      if (!q) return "";
      const cls = !it.answered ? "skipped" : (it.isCorrect ? "correct" : "incorrect");
      let bodyHtml = "";
      if (q.type === "NAT") {
        bodyHtml = `
          <div class="q-body q-text">${q.text}</div>
          <div style="display:flex; gap:18px; font-size:14px; margin-top:6px;">
            <div>Your answer: <strong class="mono">${it.selected ?? "—"}</strong></div>
            <div>Accepted range: <strong class="mono">${q.correctAnswer.min}–${q.correctAnswer.max}</strong></div>
          </div>
        `;
      } else {
        const selSet = new Set(Array.isArray(it.selected) ? it.selected : (it.selected !== null && it.selected !== undefined ? [it.selected] : []));
        const corrSet = new Set(Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]);
        bodyHtml = `
          <div class="q-body q-text">${q.text}</div>
          <div class="opt-list ${q.type === 'MSQ' ? 'msq' : 'mcq'}">
            ${q.options.map((opt, i) => {
              let rowCls = "";
              if (corrSet.has(opt.id)) rowCls = "correct";
              else if (selSet.has(opt.id)) rowCls = "incorrect";
              const mark = corrSet.has(opt.id) ? "✓" : (selSet.has(opt.id) ? "✕" : letter(i));
              return `<div class="opt-row ${rowCls}"><div class="opt-mark">${mark}</div><div class="opt-body q-body">${opt.html}</div></div>`;
            }).join("")}
          </div>
        `;
      }
      return `
        <div class="review-item ${cls}">
          <div class="review-head">
            <div class="q-meta">
              <span class="q-number">#${n + 1}</span>
              <span class="tag">${q.type}</span>
              <span class="tag">${UI.esc(q.subject)}</span>
              ${q.topic ? `<span class="tag">${UI.esc(q.topic)}</span>` : ""}
              ${q.year ? `<span class="tag mono">${q.year}</span>` : ""}
              <span class="tag ${cls === 'correct' ? 'good' : cls === 'incorrect' ? 'hard' : 'unknown'}">${cls}</span>
            </div>
            <button class="bookmark-btn ${STATE.isBookmarked(it.subject, it.id) ? 'active' : ''}" data-id="${it.id}" data-slug="${it.subject}">★</button>
          </div>
          ${bodyHtml}
          <div class="solution-box">
            <div class="label">SOLUTION</div>
            <div class="q-body">${q.solution || "<em>No written solution provided.</em>"}</div>
          </div>
        </div>
      `;
    }).join("");
    UI.renderMath(list);
    list.querySelectorAll(".bookmark-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const active = STATE.toggleBookmark(btn.dataset.slug, btn.dataset.id);
        btn.classList.toggle("active", active);
      });
    });
  }

  document.querySelectorAll("#filter-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#filter-chips .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderList(chip.dataset.val);
    });
  });

  document.getElementById("retry-wrong-btn").addEventListener("click", () => {
    const retryRefs = result.items.filter(it => !it.answered || !it.isCorrect).map(it => ({ s: it.subject, id: it.id }));
    if (!retryRefs.length) { UI.toast("Nothing to retry — all correct!"); return; }
    LAUNCHER.open(retryRefs, `Retry — ${result.title}`);
  });

  renderList("all");
})();

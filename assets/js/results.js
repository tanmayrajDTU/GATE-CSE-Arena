(async function () {
  UI.initMobileBar();
  await SYNC.ready();
  await UI.renderRail(null);

  const id = UI.qs("id");
  const result = id ? STATE.getResult(id) : null;
  const main = document.getElementById("page-main");
  if (!result) {
    main.innerHTML = `<div class="empty-state">Result not found. <a href="history.html">View history</a>.</div>`;
    return;
  }

  const refs = result.items.map(it => ({ s: it.subject, id: it.id }));
  const questions = await DB.resolveRefs(refs);
  const qById = {};
  questions.forEach(q => { qById[q.id] = q; });

  const accuracy = result.total ? Math.round((result.correct / (result.correct + result.wrong || 1)) * 100) : 0;

  // per-topic breakdown, for the richer retry-by-topic flow
  const byTopic = new Map();
  result.items.forEach(it => {
    const key = it.topic || "Uncategorized";
    if (!byTopic.has(key)) byTopic.set(key, { correct: 0, wrong: 0, skipped: 0, items: [] });
    const t = byTopic.get(key);
    t.items.push(it);
    if (!it.answered) t.skipped++; else if (it.isCorrect) t.correct++; else t.wrong++;
  });
  const topicRows = [...byTopic.entries()].sort((a, b) => b[1].items.length - a[1].items.length);

  const hasBanner = (result.pointsEarned > 0) || (result.newAchievements && result.newAchievements.length);

  main.innerHTML = `
    <div style="margin-bottom:22px;">
      <div class="page-kicker">RESULT</div>
      <h1 class="page-title">${UI.esc(result.title)}</h1>
      <p class="page-sub">
        ${new Date(result.ts).toLocaleString()}
        ${result.timed ? ` · timed, ${UI.fmtTime(result.timeTakenSeconds)} used of ${UI.fmtTime(result.totalSeconds)}` : ` · untimed, ${UI.fmtTime(result.timeTakenSeconds)} elapsed`}
        ${result.autoSubmitted ? " · auto-submitted (time up)" : ""}
      </p>
    </div>

    ${hasBanner ? `
      <div class="panel" style="padding:18px 22px; margin-bottom:22px; border-color:var(--dial); background:var(--dial-wash); display:flex; align-items:center; gap:18px; flex-wrap:wrap;">
        ${result.pointsEarned > 0 ? `<div><span class="mono-readout" style="font-size:1.3rem; color:var(--dial);">+${result.pointsEarned}</span> <span style="color:var(--ink-soft); font-size:0.85rem;">points</span></div>` : ""}
        ${result.streakAfter > 1 ? `<div style="color:var(--dial); font-size:0.9rem;">🔥 ${result.streakAfter}-day streak</div>` : ""}
        ${(result.newAchievements || []).map(a => `
          <div style="display:flex; align-items:center; gap:10px; background:var(--panel); border:1px solid var(--dial); border-radius:999px; padding:6px 14px 6px 8px;">
            <span style="font-size:1.5rem; line-height:1;">${a.icon}</span>
            <span style="font-size:0.82rem; color:var(--ink);">Unlocked: <strong>${UI.esc(a.name)}</strong></span>
          </div>
        `).join("")}
      </div>
    ` : ""}

    <div class="score-hero">
      <div class="score-cell"><div class="score-num">${result.total}</div><div class="score-label">Total</div></div>
      <div class="score-cell correct"><div class="score-num">${result.correct}</div><div class="score-label">Correct</div></div>
      <div class="score-cell wrong"><div class="score-num">${result.wrong}</div><div class="score-label">Incorrect</div></div>
      <div class="score-cell skipped"><div class="score-num">${result.skipped}</div><div class="score-label">Skipped</div></div>
      <div class="score-cell"><div class="score-num">${accuracy}%</div><div class="score-label">Accuracy</div></div>
    </div>

    <div style="display:flex; gap:10px; margin-bottom:22px; flex-wrap:wrap;">
      ${result.itemsTrimmed ? "" : `<button class="btn btn--primary" id="retry-wrong-btn">Retry incorrect &amp; skipped</button>`}
      <a class="btn" href="history.html">Back to history</a>
      <a class="btn btn--ghost" href="achievements.html">View achievements</a>
    </div>

    ${!result.itemsTrimmed && topicRows.length > 1 ? `
      <div class="panel" style="padding:18px 20px; margin-bottom:24px; overflow-x:auto;">
        <div style="font-size:0.85rem; font-weight:600; margin-bottom:12px;">By topic</div>
        <table class="topic-table">
          <thead><tr><th>Topic</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th></th></tr></thead>
          <tbody>
            ${topicRows.map(([topic, t]) => `
              <tr>
                <td>${UI.esc(topic)}</td>
                <td style="color:var(--correct);">${t.correct}</td>
                <td style="color:var(--incorrect);">${t.wrong}</td>
                <td style="color:var(--ink-faint);">${t.skipped}</td>
                <td style="text-align:right;">
                  ${(t.wrong + t.skipped) > 0 ? `<button class="btn btn--ghost" data-retry-topic="${UI.esc(topic)}" style="padding:6px 12px; font-size:0.8rem;">Retry misses</button>` : `<span class="tag" style="color:var(--correct); border-color:var(--correct);">All correct</span>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : ""}

    ${result.itemsTrimmed ? `
      <div class="panel" style="padding:14px 18px; margin-bottom:22px; border-color:var(--border-strong); color:var(--ink-faint); font-size:0.85rem;">
        The per-question review for this older result was trimmed to save space (your score above is still accurate).
      </div>
    ` : `
    <div class="chip-row" id="review-filter" style="margin-bottom:16px;">
      <label class="chip active" data-val="all">All (${result.total})</label>
      <label class="chip" data-val="wrong">Incorrect (${result.wrong})</label>
      <label class="chip" data-val="skipped">Skipped (${result.skipped})</label>
      <label class="chip" data-val="correct">Correct (${result.correct})</label>
    </div>

    <div id="review-list"></div>
    `}
  `;

  if (!result.itemsTrimmed) {

  document.getElementById("retry-wrong-btn").addEventListener("click", () => {
    const weak = result.items.filter(it => !it.isCorrect).map(it => ({ s: it.subject, id: it.id }));
    if (!weak.length) { UI.toast("Nothing to retry — everything was correct."); return; }
    LAUNCHER.open(weak, `Retry — ${result.title}`);
  });

  document.querySelectorAll("[data-retry-topic]").forEach(btn => {
    btn.addEventListener("click", () => {
      const topic = btn.dataset.retryTopic;
      const t = byTopic.get(topic);
      const weak = t.items.filter(it => !it.isCorrect).map(it => ({ s: it.subject, id: it.id }));
      LAUNCHER.open(weak, `Retry — ${topic}`);
    });
  });

  document.querySelectorAll("#review-filter .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#review-filter .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const val = chip.dataset.val;
      document.querySelectorAll("#review-list .review-item").forEach(el => {
        el.style.display = (val === "all" || el.dataset.verdict === val) ? "" : "none";
      });
    });
  });

  const list = document.getElementById("review-list");
  list.innerHTML = result.items.map((it, i) => {
    const q = qById[it.id];
    if (!q) return "";
    const verdictClass = !it.answered ? "is-skipped" : it.isCorrect ? "is-correct" : "is-incorrect";
    const verdictData = !it.answered ? "skipped" : it.isCorrect ? "correct" : "wrong";
    const verdictText = !it.answered ? "Skipped" : it.isCorrect ? "Correct" : "Incorrect";
    const verdictColor = !it.answered ? "var(--neutral)" : it.isCorrect ? "var(--correct)" : "var(--incorrect)";

    let bodyHtml;
    if (q.type === "NAT") {
      bodyHtml = `
        <div class="reading" style="margin:10px 0;">
          <p>Your answer: <strong>${it.selected ?? "—"}</strong> &nbsp;·&nbsp; Correct range: <strong>${q.correctAnswer.min} to ${q.correctAnswer.max}</strong></p>
        </div>
      `;
    } else {
      const correctSet = new Set(q.type === "MSQ" ? q.correctAnswer : [q.correctAnswer]);
      const selectedSet = new Set(q.type === "MSQ" ? (it.selected || []) : (it.selected !== null && it.selected !== undefined ? [it.selected] : []));
      const fbById = {};
      (q.optionFeedback || []).forEach(fb => { fbById[fb.id] = fb; });
      bodyHtml = `
        <div class="opt-list" style="margin-top:14px;">
          ${q.options.map((opt, oi) => {
            const isCorrectOpt = correctSet.has(opt.id);
            const isSelectedOpt = selectedSet.has(opt.id);
            let cls = "";
            if (isCorrectOpt) cls = "fb-correct";
            else if (isSelectedOpt) cls = "fb-incorrect";
            const fb = fbById[opt.id];
            return `
              <div class="opt-row ${cls}">
                <div class="opt-mark">${isSelectedOpt ? "✓" : String.fromCharCode(65 + oi)}</div>
                <div class="opt-body reading">${opt.html}</div>
              </div>
              ${fb ? `<div class="opt-feedback reading">${fb.html}</div>` : ""}
            `;
          }).join("")}
        </div>
      `;
    }

    return `
      <div class="panel review-item ${verdictClass}" data-verdict="${verdictData}">
        <div class="q-meta" style="margin-bottom:10px;">
          <span class="tag">Q ${i + 1}</span>
          <span class="tag">${q.type}</span>
          <span class="gauge gauge--${q.difficulty}">${UI.difficultyLabel(q.difficulty)}</span>
          <span class="tag">${UI.esc(q.subject)}</span>
          <span class="tag">${UI.esc(q.topic)}</span>
          ${UI.examYear(q) ? `<span class="tag mono">${UI.esc(UI.examYear(q))}</span>` : ""}
        </div>
        <div class="verdict" style="color:${verdictColor}">${verdictText}</div>
        <div class="reading">${q.text}</div>
        ${bodyHtml}
        ${q.solution ? `<div class="solution-block"><div class="cap">Solution</div><div class="reading">${q.solution}</div></div>` : ""}
      </div>
    `;
  }).join("");

  UI.renderMath(list);
  } // end if (!result.itemsTrimmed)
})();

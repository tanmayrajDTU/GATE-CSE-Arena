(async function () {
  await SYNC.ready();
  const draft = STATE.getDraft();
  const shell = document.getElementById("exam-shell");
  if (!draft || !draft.refs || !draft.refs.length) {
    shell.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No active test. <a href="index.html">Go home</a>.</div>`;
    return;
  }

  const questions = await DB.resolveRefs(draft.refs);
  const slugById = {};
  draft.refs.forEach(r => { slugById[r.id] = r.s; });

  let timerHandle = null;
  let submitting = false;

  function letter(i) { return String.fromCharCode(65 + i); }
  function answerFor(q) { return draft.answers[q.id]; }
  function isAnswered(q) {
    const a = answerFor(q);
    if (a === undefined || a === null) return false;
    if (Array.isArray(a)) return a.length > 0;
    if (typeof a === "string") return a.trim() !== "";
    return true;
  }
  function statusFor(q) {
    const visited = !!draft.visited[q.id];
    const answered = isAnswered(q);
    const flagged = !!draft.flags[q.id];
    if (flagged && answered) return "answered-review";
    if (flagged) return "review";
    if (answered) return "answered";
    if (visited) return "not-answered";
    return "not-visited";
  }
  function persist() {
    if (submitting) return; // never resurrect the draft after the test has been submitted
    STATE.saveDraft(draft);
  }

  function buildShell() {
    shell.innerHTML = `
      <div class="exam-topbar">
        <div class="exam-title">${UI.esc(draft.title)}<span class="sub">${questions.length} questions</span></div>
        <div style="display:flex; align-items:center; gap:14px;">
          ${draft.timed ? `<div class="exam-timer" id="timer-display" data-time="--:--" aria-hidden="true"></div>` : `<span class="tag">Untimed</span>`}
          <button class="btn btn--primary" id="submit-btn">Submit test</button>
        </div>
      </div>
      <div class="visually-hidden" id="timer-live" role="status" aria-live="polite"></div>
      <div class="panel exam-main" id="exam-main"></div>
      <div class="exam-side">
        <div class="panel side-legend" aria-hidden="true">
          <div class="legend-item"><span class="legend-swatch" style="background:var(--correct);"></span>Answered</div>
          <div class="legend-item"><span class="legend-swatch" style="background:var(--incorrect-wash); border:1px solid var(--incorrect);"></span>Not answered</div>
          <div class="legend-item"><span class="legend-swatch" style="background:var(--panel-raised); border:1px solid var(--border-strong);"></span>Not visited</div>
          <div class="legend-item"><span class="legend-swatch" style="background:var(--marked);"></span>Marked for review</div>
        </div>
        <div class="panel palette-grid" id="palette-grid" role="group" aria-label="Question palette"></div>
      </div>
    `;
    document.getElementById("submit-btn").addEventListener("click", confirmSubmit);
  }

  function renderMain() {
    const idx = draft.currentIndex;
    const q = questions[idx];
    const flagged = !!draft.flags[q.id];
    const bookmarked = STATE.isBookmarked(slugById[q.id], q.id);

    let bodyHtml = "";
    if (q.type === "NAT") {
      const val = answerFor(q) ?? "";
      bodyHtml = `
        <div class="q-body reading">${q.text}</div>
        <input type="text" inputmode="decimal" class="nat-input mono-readout" id="nat-input" placeholder="Enter numeric answer" value="${UI.esc(val)}">
      `;
    } else {
      const isMsq = q.type === "MSQ";
      const selected = answerFor(q);
      const selectedSet = new Set(isMsq ? (selected || []) : (selected !== undefined && selected !== null ? [selected] : []));
      const inputType = isMsq ? "checkbox" : "radio";
      bodyHtml = `
        <div class="q-body reading">${q.text}</div>
        <div class="opt-list ${isMsq ? 'msq' : 'mcq'}" id="opt-list" role="${isMsq ? 'group' : 'radiogroup'}" aria-label="Answer options">
          ${q.options.map((opt, i) => `
            <label class="opt-row ${selectedSet.has(opt.id) ? 'selected' : ''}" data-opt="${opt.id}">
              <input type="${inputType}" name="opt-input" class="visually-hidden opt-input" value="${opt.id}" ${selectedSet.has(opt.id) ? 'checked' : ''}>
              <span class="opt-mark" aria-hidden="true">${selectedSet.has(opt.id) ? '✓' : letter(i)}</span>
              <span class="opt-body reading">${opt.html}</span>
            </label>
          `).join("")}
        </div>
      `;
    }

    document.getElementById("exam-main").innerHTML = `
      <div class="q-header">
        <div class="q-meta">
          <span class="q-number">Q ${idx + 1} / ${questions.length}</span>
          <span class="tag">${q.type}</span>
          <span class="gauge gauge--${q.difficulty}">${UI.difficultyLabel(q.difficulty)}</span>
          <span class="tag">${UI.esc(q.topic)}</span>
          ${UI.examYear(q) ? `<span class="tag mono">${UI.esc(UI.examYear(q))}</span>` : ""}
        </div>
        <button class="bookmark-btn ${bookmarked ? 'active' : ''}" id="bookmark-btn" title="Bookmark for later" aria-pressed="${bookmarked}" aria-label="Bookmark this question">★</button>
      </div>
      <div id="q-content">${bodyHtml}</div>
      <div class="exam-actions">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn--ghost" id="prev-btn" ${idx === 0 ? "disabled" : ""}>Previous</button>
          <button class="flag-btn ${flagged ? 'active' : ''}" id="flag-btn" aria-pressed="${flagged}">${flagged ? "✓ Marked for review" : "Mark for review"}</button>
          <button class="btn btn--ghost" id="clear-btn">Clear response</button>
        </div>
        <button class="btn btn--primary" id="next-btn">${idx === questions.length - 1 ? "Finish" : "Save & Next"}</button>
      </div>
    `;

    UI.renderMath(document.getElementById("q-content"));

    document.getElementById("bookmark-btn").addEventListener("click", () => {
      const active = STATE.toggleBookmark(slugById[q.id], q.id);
      const btn = document.getElementById("bookmark-btn");
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
      UI.toast(active ? "Bookmarked" : "Bookmark removed");
    });

    if (q.type === "NAT") {
      document.getElementById("nat-input").addEventListener("input", e => {
        draft.answers[q.id] = e.target.value;
        draft.visited[q.id] = true;
        persist();
        renderPalette();
      });
    } else {
      document.querySelectorAll("#opt-list .opt-input").forEach((input, i) => {
        input.addEventListener("change", () => {
          const optId = Number(input.value);
          if (q.type === "MSQ") {
            const cur = new Set(draft.answers[q.id] || []);
            if (input.checked) cur.add(optId); else cur.delete(optId);
            draft.answers[q.id] = [...cur];
          } else {
            draft.answers[q.id] = optId;
          }
          draft.visited[q.id] = true;
          persist();
          // update visuals in place (no full re-render) so keyboard focus stays put
          document.querySelectorAll("#opt-list .opt-row").forEach((row, ri) => {
            const checked = row.querySelector(".opt-input").checked;
            row.classList.toggle("selected", checked);
            row.querySelector(".opt-mark").textContent = checked ? "✓" : letter(ri);
          });
          renderPalette();
        });
      });
    }

    document.getElementById("flag-btn").addEventListener("click", () => {
      draft.flags[q.id] = !draft.flags[q.id];
      draft.visited[q.id] = true;
      persist();
      renderMain();
      renderPalette();
    });
    document.getElementById("clear-btn").addEventListener("click", () => {
      delete draft.answers[q.id];
      persist();
      renderMain();
      renderPalette();
    });
    document.getElementById("prev-btn").addEventListener("click", () => goTo(idx - 1));
    document.getElementById("next-btn").addEventListener("click", () => {
      if (idx === questions.length - 1) { confirmSubmit(); return; }
      goTo(idx + 1);
    });

    draft.visited[q.id] = true;
    persist();
  }

  function goTo(i) {
    if (i < 0 || i >= questions.length) return;
    draft.currentIndex = i;
    persist();
    renderMain();
    renderPalette();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  const STATUS_LABEL = {
    "answered": "answered", "not-answered": "not answered",
    "not-visited": "not visited", "review": "marked for review",
    "answered-review": "answered, marked for review",
  };
  function renderPalette() {
    const grid = document.getElementById("palette-grid");
    grid.innerHTML = questions.map((q, i) => {
      const st = statusFor(q);
      const cur = i === draft.currentIndex;
      return `<button type="button" class="palette-cell ${st} ${cur ? 'current' : ''}" data-i="${i}"
        aria-label="Question ${i + 1}, ${STATUS_LABEL[st]}" ${cur ? 'aria-current="true"' : ''}>${i + 1}</button>`;
    }).join("");
    grid.querySelectorAll(".palette-cell").forEach(cell => {
      cell.addEventListener("click", () => goTo(Number(cell.dataset.i)));
    });
  }

  function startTimer() {
    if (!draft.timed) return;
    updateTimerDisplay();
    timerHandle = setInterval(() => {
      draft.remainingSeconds -= 1;
      if (draft.remainingSeconds <= 0) {
        draft.remainingSeconds = 0;
        updateTimerDisplay();
        clearInterval(timerHandle);
        finishTest(true);
        return;
      }
      updateTimerDisplay();
      if (draft.remainingSeconds % 5 === 0) persist();
    }, 1000);
  }
  function updateTimerDisplay() {
    const el = document.getElementById("timer-display");
    if (!el) return;
    el.dataset.time = UI.fmtTime(draft.remainingSeconds);
    el.classList.toggle("low", draft.remainingSeconds <= 60);
    const fraction = draft.totalSeconds ? Math.max(0, draft.remainingSeconds / draft.totalSeconds) : 0;
    el.style.setProperty("--tpct", (fraction * 360).toFixed(1) + "deg");

    // Sparing live-region updates so screen readers aren't spammed every second:
    // announce each full minute, then every 10s in the final minute.
    const live = document.getElementById("timer-live");
    if (!live) return;
    const s = draft.remainingSeconds;
    const shouldAnnounce = (s <= 60 && s % 10 === 0) || (s > 60 && s % 60 === 0);
    if (shouldAnnounce) live.textContent = `${UI.fmtTime(s)} remaining`;
  }

  function confirmSubmit() {
    const unanswered = questions.filter(q => !isAnswered(q)).length;
    const msg = unanswered
      ? `${unanswered} question${unanswered === 1 ? "" : "s"} still unanswered. Submit anyway?`
      : "Submit this test?";
    if (window.confirm(msg)) finishTest(false);
  }

  // Flush any pending sync push before leaving the page — the normal push is
  // debounced ~900ms, which the navigation to results.html used to cancel,
  // leaving the freshly-saved result unsynced (and then overwritten by the
  // next pull). Capped so a slow/offline network never blocks the user.
  async function flushSync() {
    try {
      if (!window.SYNC || !SYNC.isLinked()) return;
      await Promise.race([
        SYNC.pushNow(),
        new Promise(res => setTimeout(res, 2500)),
      ]);
    } catch (e) { /* sync is best-effort; the result is already saved locally */ }
  }

  async function finishTest(auto) {
    if (submitting) return;
    submitting = true;
    window.removeEventListener("beforeunload", persist);
    if (timerHandle) clearInterval(timerHandle);

    let correct = 0, wrong = 0, skipped = 0, pointsEarned = 0;
    const items = questions.map(q => {
      const a = answerFor(q);
      const answered = isAnswered(q);
      let isCorrect = false;
      if (answered) {
        if (q.type === "MCQ") isCorrect = a === q.correctAnswer;
        else if (q.type === "MSQ") {
          const sa = [...(a || [])].sort().join(",");
          const sc = [...(q.correctAnswer || [])].sort().join(",");
          isCorrect = sa === sc;
        } else if (q.type === "NAT") {
          const v = parseFloat(a);
          isCorrect = !isNaN(v) && v >= q.correctAnswer.min - 1e-9 && v <= q.correctAnswer.max + 1e-9;
        }
      }
      if (!answered) skipped++; else if (isCorrect) correct++; else wrong++;

      pointsEarned += STATE.recordOutcome(
        slugById[q.id], q.id,
        answered ? (isCorrect ? "correct" : "incorrect") : "skipped",
        { type: q.type, difficulty: q.difficulty }
      );

      return {
        id: q.id, subject: slugById[q.id], subjectName: q.subject, type: q.type,
        topic: q.topic, difficulty: q.difficulty,
        selected: a ?? null, correctAnswer: q.correctAnswer, isCorrect, answered,
        flagged: !!draft.flags[q.id],
      };
    });

    const streak = STATE.touchStreak();
    // Never let achievement evaluation take the whole submission down with it.
    let newAchievements = [];
    try {
      newAchievements = ACHIEVEMENTS.evaluateAndUnlock().map(a => ({ id: a.id, name: a.name, desc: a.desc, icon: a.icon }));
    } catch (e) { console.warn("Achievement evaluation failed:", e); }

    const timeTakenSeconds = draft.timed
      ? draft.totalSeconds - draft.remainingSeconds
      : Math.round((Date.now() - draft.startedAt) / 1000);

    const result = {
      id: "r" + Date.now() + Math.random().toString(36).slice(2, 7),
      title: draft.title,
      ts: Date.now(),
      timed: draft.timed,
      totalSeconds: draft.totalSeconds,
      timeTakenSeconds,
      autoSubmitted: auto,
      total: questions.length,
      correct, wrong, skipped,
      pointsEarned,
      streakAfter: streak.current,
      newAchievements,
      items,
    };
    const saved = STATE.saveResult(result);
    STATE.clearDraft();
    if (!saved) {
      // saveResult always parks a copy in sessionStorage, so the results page
      // can still render this attempt even if history couldn't be persisted.
      UI.toast("Storage is full — showing this result, but history may not keep it.");
    }
    await flushSync();
    location.href = "results.html?id=" + result.id;
  }

  buildShell();
  renderMain();
  renderPalette();
  startTimer();

  window.addEventListener("beforeunload", persist);
})();

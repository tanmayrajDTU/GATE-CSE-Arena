(async function () {
  if (window.SYNC) await SYNC.init();

  const draft = STATE.getDraft();
  const shell = document.getElementById("exam-shell");
  if (!draft || !draft.refs || !draft.refs.length) {
    shell.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No active test. <a href="index.html">Go home</a>.</div>`;
    return;
  }

  const questions = await DB.resolveRefs(draft.refs);
  // subject slug aligned by ref order; build id -> slug map (refs order == questions order from resolveRefs)
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

  function persist() { STATE.saveDraft(draft); }

  function buildShell() {
    shell.innerHTML = `
      <div class="exam-topbar">
        <div class="exam-title">${UI.esc(draft.title)}<span class="sub">${questions.length} questions</span></div>
        <div style="display:flex; align-items:center; gap:14px;">
          ${draft.timed ? `<div class="timer mono" id="timer-display">--:--</div>` : `<span class="tag">Untimed</span>`}
          <button class="btn accent" id="submit-btn">Submit test</button>
        </div>
      </div>
      <div class="exam-main" id="exam-main"></div>
      <div class="exam-side">
        <div class="side-legend">
          <div class="legend-item"><span class="legend-swatch" style="background:var(--good);"></span>Answered</div>
          <div class="legend-item"><span class="legend-swatch" style="background:var(--bad-wash); border:1px solid var(--bad);"></span>Not answered</div>
          <div class="legend-item"><span class="legend-swatch" style="background:var(--paper-raised); border:1px solid var(--line-strong);"></span>Not visited</div>
          <div class="legend-item"><span class="legend-swatch" style="background:var(--review);"></span>Marked for review</div>
        </div>
        <div class="palette-grid" id="palette-grid"></div>
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
        <div class="q-body q-text">${q.text}</div>
        <input type="text" inputmode="decimal" class="nat-input mono" id="nat-input" placeholder="Enter numeric answer" value="${UI.esc(val)}">
      `;
    } else {
      const isMsq = q.type === "MSQ";
      const selected = answerFor(q);
      const selectedSet = new Set(isMsq ? (selected || []) : (selected !== undefined && selected !== null ? [selected] : []));
      bodyHtml = `
        <div class="q-body q-text">${q.text}</div>
        <div class="opt-list ${isMsq ? 'msq' : 'mcq'}" id="opt-list">
          ${q.options.map((opt, i) => `
            <div class="opt-row ${selectedSet.has(opt.id) ? 'selected' : ''}" data-opt="${opt.id}">
              <div class="opt-mark">${selectedSet.has(opt.id) ? '✓' : letter(i)}</div>
              <div class="opt-body q-body">${opt.html}</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    document.getElementById("exam-main").innerHTML = `
      <div class="q-header">
        <div class="q-meta">
          <span class="q-number">Q ${idx + 1} / ${questions.length}</span>
          <span class="tag">${q.type}</span>
          <span class="tag">${UI.esc(q.subject)}</span>
          ${q.topic ? `<span class="tag">${UI.esc(q.topic)}</span>` : ""}
          ${q.year ? `<span class="tag mono">${q.year}</span>` : ""}
        </div>
        <button class="bookmark-btn ${bookmarked ? 'active' : ''}" id="bookmark-btn" title="Bookmark for later">★</button>
      </div>
      <div id="q-content">${bodyHtml}</div>
      <div class="exam-actions">
        <div style="display:flex; gap:10px;">
          <button class="btn ghost" id="prev-btn" ${idx === 0 ? "disabled" : ""}>Previous</button>
          <button class="flag-btn ${flagged ? 'active' : ''}" id="flag-btn">${flagged ? "✓ Marked for review" : "Mark for review"}</button>
          <button class="btn ghost" id="clear-btn">Clear response</button>
        </div>
        <button class="btn accent" id="next-btn">${idx === questions.length - 1 ? "Finish" : "Save & Next"}</button>
      </div>
    `;

    UI.renderMath(document.getElementById("q-content"));

    document.getElementById("bookmark-btn").addEventListener("click", () => {
      const active = STATE.toggleBookmark(slugById[q.id], q.id);
      document.getElementById("bookmark-btn").classList.toggle("active", active);
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
      document.querySelectorAll("#opt-list .opt-row").forEach(row => {
        row.addEventListener("click", () => {
          const optId = Number(row.dataset.opt);
          if (q.type === "MSQ") {
            const cur = new Set(draft.answers[q.id] || []);
            if (cur.has(optId)) cur.delete(optId); else cur.add(optId);
            draft.answers[q.id] = [...cur];
          } else {
            draft.answers[q.id] = optId;
          }
          draft.visited[q.id] = true;
          persist();
          renderMain();
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

  function renderPalette() {
    const grid = document.getElementById("palette-grid");
    grid.innerHTML = questions.map((q, i) => {
      const st = statusFor(q);
      const cur = i === draft.currentIndex ? "current" : "";
      return `<div class="palette-cell ${st} ${cur}" data-i="${i}">${i + 1}</div>`;
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
    el.textContent = UI.fmtTime(draft.remainingSeconds);
    el.classList.toggle("low", draft.remainingSeconds <= 60);
  }

  function confirmSubmit() {
    const unanswered = questions.filter(q => !isAnswered(q)).length;
    const msg = unanswered
      ? `${unanswered} question${unanswered === 1 ? "" : "s"} still unanswered. Submit anyway?`
      : "Submit this test?";
    if (window.confirm(msg)) finishTest(false);
  }

  function finishTest(auto) {
    if (submitting) return;
    submitting = true;
    if (timerHandle) clearInterval(timerHandle);

    let correct = 0, wrong = 0, skipped = 0;
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

      STATE.recordOutcome(slugById[q.id], q.id, answered ? (isCorrect ? "correct" : "incorrect") : "skipped");

      return {
        id: q.id, subject: slugById[q.id], subjectName: q.subject, type: q.type,
        selected: a ?? null, correctAnswer: q.correctAnswer, isCorrect, answered,
        flagged: !!draft.flags[q.id],
      };
    });

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
      items,
    };
    STATE.saveResult(result);
    STATE.clearDraft();
    location.href = "results.html?id=" + result.id;
  }

  buildShell();
  renderMain();
  renderPalette();
  startTimer();

  window.addEventListener("beforeunload", () => { if (!submitting) persist(); });
})();

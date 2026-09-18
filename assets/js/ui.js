/* ============================================================
   UI — small shared helpers used across pages.
   ============================================================ */

const UI = (() => {
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function renderMath(container) {
    if (window.renderMathInElement) {
      try {
        renderMathInElement(container, {
          delimiters: [
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true },
            { left: "$$", right: "$$", display: true },
          ],
          throwOnError: false,
        });
      } catch (e) { /* noop */ }
    }
  }

  let toastTimer = null;
  function toast(msg) {
    let el = document.getElementById("__toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "__toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function fmtTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = n => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function difficultyOf(avgSuccessRate) {
    if (avgSuccessRate === null || avgSuccessRate === undefined) return "unknown";
    if (avgSuccessRate >= 70) return "easy";
    if (avgSuccessRate >= 40) return "medium";
    return "hard";
  }
  function difficultyLabel(d) {
    return { easy: "Easy", medium: "Medium", hard: "Hard", unknown: "Unrated" }[d] || "Unrated";
  }

  // PYQ questions carry exam + year (e.g. "GATE 1996"); practice questions
  // carry neither. Returns null when there's nothing worth showing.
  function examYear(q) {
    if (q.exam && q.year) return `${q.exam} ${q.year}`;
    if (q.year) return String(q.year);
    if (q.exam) return q.exam;
    return null;
  }

  async function renderRail(activeSlug) {
    const mount = document.getElementById("rail-mount");
    if (!mount) return;
    const manifest = await DB.getManifest();
    const bmCount = STATE.bookmarkCount();
    const points = STATE.getPoints();
    const streak = STATE.getStreak();
    const path = location.pathname;
    const curMode = MODE.get();
    let html = `
      <a class="rail-brand" href="index.html">
        <span class="mark"><span>P</span></span>
        <span class="name">Practice Engine<small>GATE CSE</small></span>
      </a>
      <div class="theme-toggle" id="mode-toggle" style="width:100%; justify-content:center; margin-bottom:14px;">
        <button data-mode-btn="practice" aria-pressed="${curMode === 'practice'}">Practice</button>
        <button data-mode-btn="pyq" aria-pressed="${curMode === 'pyq'}">PYQ</button>
      </div>
      <div class="rail-dial-strip">
        <div class="rail-dial"><span class="v">${points.toLocaleString()}</span><span class="l">points</span></div>
        <div class="rail-dial"><span class="v">${streak.current > 0 ? "🔥 " + streak.current : "0"}</span><span class="l">day streak</span></div>
      </div>
      <a class="rail-link ${!activeSlug && (path.endsWith('index.html') || path === '/' || path.endsWith('/site/')) ? 'active' : ''}" href="index.html">Overview</a>
      <a class="rail-link ${activeSlug === '__custom' ? 'active' : ''}" href="builder.html">Build a test</a>
      <a class="rail-link ${activeSlug === '__bookmarks' ? 'active' : ''}" href="builder.html?bookmarks=1">
        <span>Bookmarked</span><span class="count">${bmCount}</span>
      </a>
      <a class="rail-link ${activeSlug === '__history' ? 'active' : ''}" href="history.html">History</a>
      <a class="rail-link ${activeSlug === '__achievements' ? 'active' : ''}" href="achievements.html">Achievements</a>
      <a class="rail-link ${activeSlug === '__settings' ? 'active' : ''}" href="settings.html">
        <span>Sync</span>
        <span class="sync-dot ${window.SYNC && SYNC.isLinked() ? 'is-linked' : ''}" aria-hidden="true"></span>
      </a>
      <div class="rail-section-label">SUBJECTS</div>
    `;
    manifest.subjects.forEach(s => {
      html += `<a class="rail-link ${s.slug === activeSlug ? 'active' : ''}" href="subject.html?s=${s.slug}">
        <span>${esc(s.name)}</span><span class="count">${s.count}</span>
      </a>`;
    });
    html += `<div class="rail-foot"><div class="theme-toggle" style="width:100%; justify-content:center;">
      <button data-theme-btn="dark" aria-pressed="true">Dark</button>
      <button data-theme-btn="light" aria-pressed="false">Light</button>
    </div></div>`;
    mount.innerHTML = html;
    const topbarLabel = document.getElementById("topbar-label");
    if (topbarLabel) topbarLabel.textContent = "Practice Engine — " + MODE.label();
    if (window.Theme) Theme.init();
    mount.querySelectorAll("[data-mode-btn]").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.modeBtn;
        if (target === MODE.get()) return;
        MODE.set(target);
        location.href = "index.html";
      });
    });
  }

  function initMobileBar() {
    const btn = document.getElementById("mobile-toggle");
    const rail = document.querySelector(".rail");
    if (btn && rail) {
      btn.addEventListener("click", () => {
        const open = rail.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
      });
      document.addEventListener("click", e => {
        if (rail.classList.contains("open") && !rail.contains(e.target) && e.target !== btn) {
          rail.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
        }
      });
      document.addEventListener("keydown", e => {
        if (e.key === "Escape" && rail.classList.contains("open")) {
          rail.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
          btn.focus();
        }
      });
    }
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  return { esc, renderMath, toast, fmtTime, difficultyOf, difficultyLabel, examYear, renderRail, initMobileBar, qs };
})();

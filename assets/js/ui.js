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

  const SUBJECT_ICON_LETTER = slug => (slug || "?").replace(/[^a-z]/gi, "")[0]?.toUpperCase() || "?";

  async function renderRail(activeSlug) {
    const mount = document.getElementById("rail-mount");
    if (!mount) return;
    if (window.SYNC) await SYNC.init();
    const manifest = await DB.getManifest();
    const bmCount = STATE.bookmarkCount();
    let html = `
      <a class="rail-brand" href="index.html">
        <span class="mark">GATE·CSE</span>
        <span class="name">PYQ Console</span>
      </a>
      <a class="rail-link ${!activeSlug && location.pathname.endsWith('index.html') || location.pathname === '/' ? 'active' : ''}" href="index.html">Overview</a>
      <a class="rail-link ${activeSlug === '__custom' ? 'active' : ''}" href="builder.html">Build a test</a>
      <a class="rail-link ${activeSlug === '__bookmarks' ? 'active' : ''}" href="builder.html?bookmarks=1">
        <span>Bookmarked</span><span class="count">${bmCount}</span>
      </a>
      <a class="rail-link ${activeSlug === '__history' ? 'active' : ''}" href="history.html">History</a>
      <div class="rail-section-label">SUBJECTS</div>
    `;
    manifest.subjects.forEach(s => {
      html += `<a class="rail-link ${s.slug === activeSlug ? 'active' : ''}" href="subject.html?s=${s.slug}">
        <span>${esc(s.name)}</span><span class="count">${s.count}</span>
      </a>`;
    });
    html += `<div class="rail-account" id="account-widget"></div>`;
    mount.innerHTML = html;
    if (window.SYNC) SYNC.renderAccountWidget("account-widget");
  }

  function initMobileBar() {
    const btn = document.getElementById("mobile-toggle");
    const rail = document.querySelector(".rail");
    if (btn && rail) {
      btn.addEventListener("click", () => rail.classList.toggle("open"));
    }
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  return { esc, renderMath, toast, fmtTime, difficultyOf, difficultyLabel, renderRail, initMobileBar, qs };
})();

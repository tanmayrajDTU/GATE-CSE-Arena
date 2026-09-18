(async function () {
  UI.initMobileBar();
  await SYNC.ready();
  await UI.renderRail("__history");

  const main = document.getElementById("page-main");
  const history = STATE.getHistory();

  main.innerHTML = `
    <div style="margin-bottom:22px; display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:12px;">
      <div>
        <div class="page-kicker">HISTORY</div>
        <h1 class="page-title">Past attempts</h1>
      </div>
      <button class="btn btn--ghost" id="clear-history-btn" style="${history.length ? '' : 'display:none;'}">Clear history</button>
    </div>
    <div id="history-list"></div>
  `;

  document.getElementById("clear-history-btn").addEventListener("click", () => {
    if (window.confirm("Clear all test history? This can't be undone.")) {
      STATE.clearHistory();
      render();
      UI.toast("History cleared");
    }
  });

  function render() {
    const h = STATE.getHistory();
    const list = document.getElementById("history-list");
    document.getElementById("clear-history-btn").style.display = h.length ? "" : "none";
    if (!h.length) {
      list.innerHTML = `<div class="empty-state">No attempts yet. <a href="builder.html">Build a test</a> to get started.</div>`;
      return;
    }
    list.innerHTML = h.map(r => {
      const accuracy = (r.correct + r.wrong) ? Math.round((r.correct / (r.correct + r.wrong)) * 100) : 0;
      return `
        <a class="panel" href="results.html?id=${r.id}" style="display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 20px; margin-bottom:10px; text-decoration:none; color:var(--ink); flex-wrap:wrap;">
          <div>
            <div style="font-weight:600; margin-bottom:3px;">${UI.esc(r.title)}</div>
            <div style="font-size:12.5px; color:var(--ink-faint);">${new Date(r.ts).toLocaleString()}${r.timed ? " · timed" : ""}</div>
          </div>
          <div style="display:flex; gap:16px; align-items:center;">
            <span class="tag" style="color:var(--correct); border-color:var(--correct);">${r.correct} correct</span>
            <span class="tag" style="color:var(--incorrect); border-color:var(--incorrect);">${r.wrong} wrong</span>
            <span class="mono-readout" style="font-size:1.1rem;">${accuracy}%</span>
          </div>
        </a>
      `;
    }).join("");
  }

  render();
})();

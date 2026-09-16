(async function () {
  UI.initMobileBar();
  await UI.renderRail("__history");

  const history = STATE.getHistory();
  const main = document.getElementById("page-main");

  if (!history.length) {
    main.innerHTML = `
      <div style="margin-bottom:20px;">
        <div class="subtle mono" style="font-size:12px; margin-bottom:6px;">HISTORY</div>
        <h1 class="display-title" style="font-size:26px;">Past attempts</h1>
      </div>
      <div class="empty-state">No tests taken yet. <a href="builder.html">Build one</a> to get started.</div>
    `;
    return;
  }

  main.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
      <div>
        <div class="subtle mono" style="font-size:12px; margin-bottom:6px;">HISTORY</div>
        <h1 class="display-title" style="font-size:26px;">Past attempts</h1>
      </div>
      <button class="btn ghost small" id="clear-history-btn">Clear history</button>
    </div>
    <div id="hist-list"></div>
  `;

  document.getElementById("hist-list").innerHTML = history.map(r => {
    const attempted = r.correct + r.wrong;
    const acc = attempted ? Math.round((r.correct / attempted) * 100) : 0;
    return `
      <a class="panel panel-pad" href="results.html?id=${r.id}" style="display:flex; align-items:center; justify-content:space-between; gap:16px; text-decoration:none; color:inherit; margin-bottom:10px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:600; margin-bottom:3px;">${UI.esc(r.title)}</div>
          <div class="subtle" style="font-size:12.5px;">${new Date(r.ts).toLocaleString()} · ${r.total} questions ${r.timed ? "· timed" : "· untimed"}</div>
        </div>
        <div style="display:flex; gap:18px; align-items:center;">
          <span class="tag good">${r.correct} correct</span>
          <span class="tag hard">${r.wrong} wrong</span>
          <span class="tag unknown">${r.skipped} skipped</span>
          <span class="stat-num mono" style="font-size:20px;">${acc}%</span>
        </div>
      </a>
    `;
  }).join("");

  document.getElementById("clear-history-btn").addEventListener("click", () => {
    if (window.confirm("Clear all test history? This can't be undone.")) {
      STATE.clearHistory();
      location.reload();
    }
  });
})();

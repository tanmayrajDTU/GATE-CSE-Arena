(async function () {
  UI.initMobileBar();
  await SYNC.ready();
  await UI.renderRail("__achievements");

  const main = document.getElementById("page-main");
  const statuses = ACHIEVEMENTS.unlockedStatus();
  const unlockedCount = statuses.filter(a => a.unlocked).length;

  const byCategory = new Map();
  statuses.forEach(a => {
    if (!byCategory.has(a.category)) byCategory.set(a.category, []);
    byCategory.get(a.category).push(a);
  });

  main.innerHTML = `
    <div style="margin-bottom:22px;">
      <div class="page-kicker">ACHIEVEMENTS</div>
      <h1 class="page-title">${unlockedCount} of ${statuses.length} unlocked</h1>
      <p class="page-sub">Earned by answering questions, keeping a streak going, and posting strong accuracy. Points and streaks build as you complete tests.</p>
    </div>
    ${[...byCategory.entries()].map(([cat, items]) => `
      <div style="margin-bottom:28px;">
        <h2 style="font-size:0.85rem; font-weight:600; color:var(--ink-faint); margin:0 0 12px;">${UI.esc(cat).toUpperCase()}</h2>
        <div class="achv-grid">
          ${items.map(a => `
            <div class="panel achv-card ${a.unlocked ? 'is-unlocked' : ''}">
              <div class="achv-icon">${a.icon}</div>
              <div class="achv-name">${UI.esc(a.name)}</div>
              <div class="achv-desc">${UI.esc(a.desc)}</div>
              ${a.unlocked ? `<div class="achv-date">Unlocked ${new Date(a.unlockedAt).toLocaleDateString()}</div>` : `<div class="achv-locked">Locked</div>`}
            </div>
          `).join("")}
        </div>
      </div>
    `).join("")}
  `;
})();

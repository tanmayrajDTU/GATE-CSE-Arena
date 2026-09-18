/* ============================================================
   LAUNCHER — confirmation overlay shown right before starting any
   test (from subject page, builder, or bookmarks). Picks timed/
   untimed + duration + question order, writes the draft, navigates
   to test.html.
   ============================================================ */

const LAUNCHER = (() => {
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function open(refs, title) {
    if (!refs.length) { UI.toast("No questions match that selection."); return; }

    let overlay = document.getElementById("launch-overlay");
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.id = "launch-overlay";
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="panel overlay-card">
        <h3>${UI.esc(title)}</h3>
        <p class="lede">${refs.length} question${refs.length === 1 ? "" : "s"} in this set.</p>

        <div style="margin-bottom:16px;">
          <label class="field-label">Mode</label>
          <div class="chip-row">
            <label class="chip active" data-mode="untimed"><input type="radio" name="mode" value="untimed" checked>Untimed practice</label>
            <label class="chip" data-mode="timed"><input type="radio" name="mode" value="timed">Timed test</label>
          </div>
        </div>

        <div id="timed-opts" style="display:none; margin-bottom:16px;">
          <label class="field-label">Total duration (minutes)</label>
          <input type="number" id="minutes-input" min="1" max="600" value="${Math.max(5, Math.round(refs.length * 1.2))}" style="width:120px;">
        </div>

        <div style="margin-bottom:22px;">
          <label class="field-label">Question order</label>
          <div class="chip-row">
            <label class="chip active" data-order="sequential"><input type="radio" name="order" value="sequential" checked>As listed</label>
            <label class="chip" data-order="shuffled"><input type="radio" name="order" value="shuffled">Shuffled</label>
          </div>
        </div>

        <div class="overlay-actions">
          <button class="btn btn--ghost" id="launch-cancel">Cancel</button>
          <button class="btn btn--primary" id="launch-start">Start</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const group = chip.dataset.mode ? "[data-mode]" : "[data-order]";
        overlay.querySelectorAll(group).forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        chip.querySelector("input").checked = true;
        if (chip.dataset.mode) {
          document.getElementById("timed-opts").style.display = chip.dataset.mode === "timed" ? "block" : "none";
        }
      });
    });

    overlay.querySelector("#launch-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#launch-start").addEventListener("click", () => {
      const mode = overlay.querySelector("input[name=mode]:checked").value;
      const order = overlay.querySelector("input[name=order]:checked").value;
      const minutes = Number(document.getElementById("minutes-input").value) || 30;
      const finalRefs = order === "shuffled" ? shuffle(refs) : refs;

      const draft = {
        title,
        refs: finalRefs,
        timed: mode === "timed",
        totalSeconds: mode === "timed" ? minutes * 60 : null,
        remainingSeconds: mode === "timed" ? minutes * 60 : null,
        answers: {},
        flags: {},
        visited: {},
        currentIndex: 0,
        startedAt: Date.now(),
      };
      STATE.saveDraft(draft);
      overlay.remove();
      location.href = "test.html";
    });
  }

  return { open };
})();

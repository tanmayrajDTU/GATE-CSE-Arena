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

        <div style="margin-bottom:16px;">
          <label class="field-label" for="count-input">Number of questions</label>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <input type="number" id="count-input" min="1" max="${refs.length}" value="${refs.length}" style="width:120px;">
            <span style="font-size:0.8rem; color:var(--ink-faint);">of ${refs.length} available</span>
            <button class="btn btn--ghost" id="count-all" type="button" style="padding:5px 12px; font-size:0.78rem;">All</button>
          </div>
          <div class="chip-row" id="pick-row" style="margin-top:10px; display:none;">
            <label class="chip active" data-pick="random"><input type="radio" name="pick" value="random" checked>Random sample</label>
            <label class="chip" data-pick="first"><input type="radio" name="pick" value="first">First in list</label>
          </div>
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
        const group = chip.dataset.mode ? "[data-mode]" : chip.dataset.pick ? "[data-pick]" : "[data-order]";
        overlay.querySelectorAll(group).forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        chip.querySelector("input").checked = true;
        if (chip.dataset.mode) {
          document.getElementById("timed-opts").style.display = chip.dataset.mode === "timed" ? "block" : "none";
        }
      });
    });

    // Question-count limit: show the sampling choice only when it actually
    // limits the set, and keep the suggested timed duration in step with it.
    const countInput = overlay.querySelector("#count-input");
    const pickRow = overlay.querySelector("#pick-row");
    const minutesInput = overlay.querySelector("#minutes-input");

    function clampedCount() {
      let n = parseInt(countInput.value, 10);
      if (!Number.isFinite(n) || n < 1) n = refs.length;
      return Math.min(Math.max(1, n), refs.length);
    }
    function syncCount() {
      const n = clampedCount();
      pickRow.style.display = n < refs.length ? "flex" : "none";
      if (minutesInput && !minutesInput.dataset.touched) {
        minutesInput.value = Math.max(5, Math.round(n * 1.2));
      }
    }
    countInput.addEventListener("input", syncCount);
    countInput.addEventListener("change", () => { countInput.value = clampedCount(); syncCount(); });
    overlay.querySelector("#count-all").addEventListener("click", () => {
      countInput.value = refs.length;
      syncCount();
    });
    if (minutesInput) minutesInput.addEventListener("input", () => { minutesInput.dataset.touched = "1"; });
    syncCount();

    overlay.querySelector("#launch-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#launch-start").addEventListener("click", () => {
      const mode = overlay.querySelector("input[name=mode]:checked").value;
      const order = overlay.querySelector("input[name=order]:checked").value;
      const minutes = Number(document.getElementById("minutes-input").value) || 30;

      // Apply the limit first (random sample or first N), then the display
      // order, so "random sample" and "as listed" can be combined.
      const count = clampedCount();
      const pickEl = overlay.querySelector("input[name=pick]:checked");
      const pick = pickEl ? pickEl.value : "random";
      let limited = refs;
      if (count < refs.length) {
        limited = pick === "first" ? refs.slice(0, count) : shuffle(refs).slice(0, count);
        if (pick === "random") {
          // keep the caller's original ordering within the sample
          const keep = new Set(limited.map(r => r.s + "|" + r.id));
          limited = refs.filter(r => keep.has(r.s + "|" + r.id));
        }
      }
      const finalRefs = order === "shuffled" ? shuffle(limited) : limited;

      const draft = {
        title: count < refs.length ? `${title} (${count} of ${refs.length})` : title,
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

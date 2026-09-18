/* ============================================================
   Theme switch — dark (default) / light.
   Storage key: "pe-theme" — deliberately namespaced ("pe" =
   Practice Engine) so it never collides with the notes site or
   the PYQ console's own theme keys. Each page also inlines a
   tiny synchronous snippet in <head> (see partials/theme-init.html)
   that reads this same key and sets data-theme BEFORE first paint,
   so there is no light-flash on load.
   ============================================================ */
const Theme = (() => {
  const KEY = "pe-theme";

  function get() {
    return localStorage.getItem(KEY) || "dark";
  }

  function set(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem(KEY, mode);
    document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeBtn === mode));
    });
  }

  function init() {
    set(get());
    document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
      btn.addEventListener("click", () => set(btn.dataset.themeBtn));
    });
  }

  return { get, set, init };
})();

document.addEventListener("DOMContentLoaded", Theme.init);

(function () {
  const key = "g2m.submissionDetail.theme";
  const allowed = new Set(["blue", "green", "sand"]);

  function applyTheme(theme) {
    const nextTheme = allowed.has(theme) ? theme : "blue";
    document.documentElement.setAttribute("data-g2m-theme", nextTheme);
    document.querySelectorAll("[data-theme-switcher]").forEach((select) => {
      select.value = nextTheme;
      select.closest("[data-theme-current]")?.setAttribute("data-theme-current", nextTheme);
    });
  }

  function loadTheme() {
    try {
      return localStorage.getItem(key) || "blue";
    } catch (error) {
      return "blue";
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(key, theme);
    } catch (error) {
      // The page remains usable when localStorage is unavailable.
    }
  }

  applyTheme(loadTheme());

  document.addEventListener("change", (event) => {
    if (!event.target.matches("[data-theme-switcher]")) {
      return;
    }
    applyTheme(event.target.value);
    saveTheme(event.target.value);
  });

  window.G2MSubmissionTheme = { applyTheme, loadTheme };
}());

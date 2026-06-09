(function () {
  const workspace = document.getElementById("kobo-workspace");
  if (!workspace) {
    return;
  }

  const buttons = Array.from(document.querySelectorAll("[data-kobo-section-target]"));
  const sections = Array.from(document.querySelectorAll("[data-kobo-section]"));

  function activate(sectionName) {
    sections.forEach((section) => {
      const active = section.dataset.koboSection === sectionName;
      section.classList.toggle("is-active", active);
      section.hidden = !active;
    });
    buttons.forEach((button) => {
      const active = button.dataset.koboSectionTarget === sectionName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => activate(button.dataset.koboSectionTarget));
  });

  activate(workspace.dataset.initialSection || "config");
}());

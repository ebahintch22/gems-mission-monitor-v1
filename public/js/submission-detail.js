(function () {
  const root = document.querySelector("[data-submission-detail]");
  if (!root) {
    return;
  }

  const links = Array.from(document.querySelectorAll("[data-section-link]"));
  const sections = Array.from(document.querySelectorAll("[data-section-id]"));
  const mobileNav = document.querySelector("[data-mobile-section-nav]");
  const sidebarToggle = document.querySelector("[data-sidebar-toggle]");

  document.querySelector("[data-print-submission]")?.addEventListener("click", () => window.print());

  sidebarToggle?.addEventListener("click", () => {
    const collapsed = root.classList.toggle("is-sidebar-collapsed");
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  });

  mobileNav?.addEventListener("change", () => {
    document.getElementById(mobileNav.value)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelectorAll("[data-repeat-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      button.closest(".submission-repeat-card")?.classList.toggle("is-open", !expanded);
    });
  });

  document.querySelectorAll(".submission-repeat-card").forEach((card, index) => {
    if (index === 0) {
      card.classList.add("is-open");
      card.querySelector("[data-repeat-toggle]")?.setAttribute("aria-expanded", "true");
    }
  });

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (visible) {
        activateSection(visible.target.dataset.sectionId);
      }
    }, { rootMargin: "-120px 0px -55% 0px", threshold: [0.1, 0.25, 0.5] })
    : null;

  sections.forEach((section) => observer?.observe(section));
  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.querySelector(link.getAttribute("href"));
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      activateSection(link.dataset.sectionLink);
      history.replaceState(null, "", link.getAttribute("href"));
    });
  });

  document.querySelectorAll("[data-media-large]").forEach((button) => {
    button.addEventListener("click", () => openMediaModal(button.dataset.mediaLarge, button.dataset.mediaCaption));
  });
  document.querySelector("[data-media-close]")?.addEventListener("click", closeMediaModal);
  document.querySelector("[data-media-modal]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-media-modal]")) {
      closeMediaModal();
    }
  });

  function activateSection(sectionId) {
    links.forEach((link) => link.classList.toggle("is-active", link.dataset.sectionLink === sectionId));
    if (mobileNav && `section-${sectionId}` !== mobileNav.value) {
      mobileNav.value = `section-${sectionId}`;
    }
  }

  function openMediaModal(url, caption) {
    const modal = document.querySelector("[data-media-modal]");
    if (!modal || !url) {
      return;
    }
    const image = modal.querySelector("img");
    const label = modal.querySelector("figcaption");
    image.src = url;
    image.alt = caption || "Media";
    label.textContent = caption || "";
    modal.hidden = false;
    modal.querySelector("button")?.focus();
  }

  function closeMediaModal() {
    const modal = document.querySelector("[data-media-modal]");
    if (!modal) {
      return;
    }
    modal.hidden = true;
    modal.querySelector("img").src = "";
  }
}());

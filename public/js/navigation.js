(function () {
  const menus = document.querySelectorAll(".nav-menu");
  const siteHeader = document.querySelector(".site-header");
  const siteNav = document.getElementById("site-nav");
  const siteNavToggle = document.getElementById("site-nav-toggle");
  const displaySizeOptions = document.querySelectorAll("[data-display-size-value]");
  const displaySizeStorageKey = "g2m_display_size";
  const supportedDisplaySizes = ["small", "medium", "large"];

  function closeSiteNav() {
    if (!siteHeader || !siteNavToggle) {
      return;
    }
    siteHeader.classList.remove("is-nav-open");
    siteNavToggle.setAttribute("aria-expanded", "false");
    siteNavToggle.setAttribute("aria-label", siteNavToggle.dataset.labelOpen || "");
  }

  function closeMenu(menu) {
    const trigger = menu.querySelector(".nav-menu-trigger");
    menu.classList.remove("is-open");
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
    }
  }

  function closeOtherMenus(currentMenu) {
    menus.forEach(function (menu) {
      if (menu !== currentMenu) {
        closeMenu(menu);
      }
    });
  }

  menus.forEach(function (menu) {
    const trigger = menu.querySelector(".nav-menu-trigger");
    const panel = menu.querySelector(".nav-menu-panel");

    if (!trigger || !panel) {
      return;
    }

    trigger.addEventListener("click", function () {
      const isOpen = menu.classList.toggle("is-open");
      trigger.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) {
        closeOtherMenus(menu);
      }
    });

    panel.addEventListener("click", function (event) {
      if (event.target.closest("a") || event.target.closest("button")) {
        closeMenu(menu);
      }
    });
  });

  function normalizeDisplaySize(size) {
    return supportedDisplaySizes.includes(size) ? size : "medium";
  }

  function applyDisplaySize(size, persist) {
    const displaySize = normalizeDisplaySize(size);
    document.documentElement.setAttribute("data-display-size", displaySize);

    displaySizeOptions.forEach(function (option) {
      const isActive = option.dataset.displaySizeValue === displaySize;
      option.classList.toggle("is-active", isActive);
      option.setAttribute("aria-pressed", String(isActive));
    });

    if (persist) {
      try {
        localStorage.setItem(displaySizeStorageKey, displaySize);
      } catch (error) {
        // Storage may be unavailable in private or constrained browser contexts.
      }
    }
  }

  if (displaySizeOptions.length) {
    let storedDisplaySize = "medium";
    try {
      storedDisplaySize = localStorage.getItem(displaySizeStorageKey);
    } catch (error) {
      storedDisplaySize = "medium";
    }

    applyDisplaySize(storedDisplaySize, false);

    displaySizeOptions.forEach(function (option) {
      option.addEventListener("click", function () {
        applyDisplaySize(option.dataset.displaySizeValue, true);
      });
    });
  }

  document.addEventListener("click", function (event) {
    menus.forEach(function (menu) {
      if (!menu.contains(event.target)) {
        closeMenu(menu);
      }
    });
    if (siteHeader && !siteHeader.contains(event.target)) {
      closeSiteNav();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      menus.forEach(closeMenu);
      closeSiteNav();
    }
  });

  if (siteHeader && siteNav && siteNavToggle) {
    siteNavToggle.addEventListener("click", function () {
      const isOpen = siteHeader.classList.toggle("is-nav-open");
      siteNavToggle.setAttribute("aria-expanded", String(isOpen));
      siteNavToggle.setAttribute(
        "aria-label",
        isOpen
          ? siteNavToggle.dataset.labelClose || ""
          : siteNavToggle.dataset.labelOpen || ""
      );
    });

    siteNav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        closeSiteNav();
      }
    });
  }
}());

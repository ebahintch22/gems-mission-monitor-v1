(function () {
  const menus = document.querySelectorAll(".nav-menu");
  const siteHeader = document.querySelector(".site-header");
  const siteNav = document.getElementById("site-nav");
  const siteNavToggle = document.getElementById("site-nav-toggle");

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
      if (event.target.closest("a")) {
        closeMenu(menu);
      }
    });
  });

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

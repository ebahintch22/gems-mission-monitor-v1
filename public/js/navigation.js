(function () {
  const menus = document.querySelectorAll(".nav-menu");

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
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      menus.forEach(closeMenu);
    }
  });
}());

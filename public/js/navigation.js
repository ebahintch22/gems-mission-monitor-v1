(function () {
  const menus = document.querySelectorAll(".nav-menu");
  const siteHeader = document.querySelector(".site-header");
  const siteNav = document.getElementById("site-nav");
  const siteNavToggle = document.getElementById("site-nav-toggle");
  const displaySizeOptions = document.querySelectorAll("[data-display-size-value]");
  const displaySizeStorageKey = "g2m_display_size";
  const supportedDisplaySizes = ["small", "medium", "large"];
  const personalizationOpenButtons = document.querySelectorAll("[data-personalization-open]");
  const personalizationModal = document.getElementById("personalization-modal");
  const personalizationCloseButtons = document.querySelectorAll("[data-personalization-close]");
  const siteSearchOpen = document.getElementById("site-search-open");
  const siteSearchModal = document.getElementById("site-search-modal");
  const siteSearchInput = document.getElementById("site-search-input");
  const siteSearchResults = document.getElementById("site-search-results");
  const siteSearchCloseButtons = document.querySelectorAll("[data-site-search-close]");
  let siteSearchTimer = null;
  let siteSearchAbortController = null;

  function siteSearchMessage(key, fallback) {
    return siteSearchModal?.dataset?.[key] || fallback;
  }

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

  function openPersonalization() {
    if (!personalizationModal) {
      return;
    }
    personalizationModal.classList.add("is-open");
    personalizationModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-personalization-open");
    menus.forEach(closeMenu);
    closeSiteNav();
  }

  function closePersonalization() {
    if (!personalizationModal) {
      return;
    }
    personalizationModal.classList.remove("is-open");
    personalizationModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-personalization-open");
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
      closePersonalization();
      closeSiteSearch();
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

  personalizationOpenButtons.forEach(function (button) {
    button.addEventListener("click", openPersonalization);
  });

  personalizationCloseButtons.forEach(function (button) {
    button.addEventListener("click", closePersonalization);
  });

  function openSiteSearch() {
    if (!siteSearchModal || !siteSearchInput) {
      return;
    }
    siteSearchModal.classList.add("is-open");
    siteSearchModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-site-search-open");
    window.setTimeout(function () {
      siteSearchInput.focus();
    }, 0);
  }

  function closeSiteSearch() {
    if (!siteSearchModal) {
      return;
    }
    siteSearchModal.classList.remove("is-open");
    siteSearchModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-site-search-open");
    clearSiteSearchRequest();
  }

  function clearSiteSearchRequest() {
    window.clearTimeout(siteSearchTimer);
    siteSearchTimer = null;
    if (siteSearchAbortController) {
      siteSearchAbortController.abort();
      siteSearchAbortController = null;
    }
  }

  function renderSiteSearchMessage(message, className) {
    if (!siteSearchResults) {
      return;
    }
    siteSearchResults.innerHTML = "";
    const item = document.createElement("p");
    item.className = className || "site-search-empty";
    item.textContent = message;
    siteSearchResults.append(item);
  }

  function renderSiteSearchResults(results) {
    if (!siteSearchResults) {
      return;
    }
    siteSearchResults.innerHTML = "";
    if (!results.length) {
      renderSiteSearchMessage(siteSearchMessage("messageEmpty", "Aucun site trouvé."));
      return;
    }
    results.forEach(function (site) {
      const link = document.createElement("a");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      link.className = "site-search-result";
      link.href = site.url || `/cartographie?submission_id=${encodeURIComponent(site.id)}`;
      link.setAttribute("role", "option");
      title.textContent = site.nom_officiel || `Site #${site.id}`;
      meta.textContent = [site.ville, site.sous_prefecture, site.region, site.type_infrastructure]
        .filter(Boolean)
        .join(" · ");
      link.append(title);
      if (meta.textContent) {
        link.append(meta);
      }
      link.addEventListener("click", closeSiteSearch);
      siteSearchResults.append(link);
    });
  }

  function scheduleSiteSearch() {
    if (!siteSearchInput || !siteSearchModal) {
      return;
    }
    clearSiteSearchRequest();
    const query = siteSearchInput.value.trim();
    if (query.length < 2) {
      renderSiteSearchMessage(siteSearchMessage("messageMinLength", "Saisissez au moins 2 caractères."));
      return;
    }
    renderSiteSearchMessage(siteSearchMessage("messageLoading", "Recherche..."), "site-search-loading");
    siteSearchTimer = window.setTimeout(function () {
      siteSearchAbortController = new AbortController();
      const limit = siteSearchModal.dataset.resultLimit || "10";
      fetch(`/api/sites/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`, {
        signal: siteSearchAbortController.signal,
        headers: { "Accept": "application/json" }
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("search_failed");
          }
          return response.json();
        })
        .then(function (payload) {
          renderSiteSearchResults(Array.isArray(payload.results) ? payload.results : []);
        })
        .catch(function (error) {
          if (error.name !== "AbortError") {
            renderSiteSearchMessage(siteSearchMessage("messageError", "La recherche est momentanément indisponible."));
          }
        });
    }, 600);
  }

  if (siteSearchOpen && siteSearchModal && siteSearchInput && siteSearchResults) {
    siteSearchOpen.addEventListener("click", function () {
      openSiteSearch();
      renderSiteSearchMessage(siteSearchMessage("messageMinLength", "Saisissez au moins 2 caractères."));
    });
    siteSearchCloseButtons.forEach(function (button) {
      button.addEventListener("click", closeSiteSearch);
    });
    siteSearchInput.addEventListener("input", scheduleSiteSearch);
  }
}());

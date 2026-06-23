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
  const siteSearchCoordinateSuggestion = document.getElementById("site-search-coordinate-suggestion");
  const siteSearchResults = document.getElementById("site-search-results");
  const siteSearchCloseButtons = document.querySelectorAll("[data-site-search-close]");
  let siteSearchTimer = null;
  let siteSearchAbortController = null;
  let siteSearchCoordinateCandidate = null;
  const coteDIvoireBounds = {
    west: -8.7,
    east: -2.4,
    south: 4.0,
    north: 11.6
  };

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
    hideCoordinateSuggestion();
  }

  function hideCoordinateSuggestion() {
    siteSearchCoordinateCandidate = null;
    if (siteSearchCoordinateSuggestion) {
      siteSearchCoordinateSuggestion.hidden = true;
      siteSearchCoordinateSuggestion.innerHTML = "";
    }
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

  function renderCoordinateSuggestion(candidate) {
    if (!siteSearchCoordinateSuggestion) {
      return;
    }
    const isPermuted = Boolean(candidate.permuted);
    const label = `${formatSearchCoordinate(candidate.lat)}, ${formatSearchCoordinate(candidate.lng)}`;
    const title = siteSearchMessage("messageCoordinateTitle", "Coordonnées détectées");
    const body = siteSearchMessage(
      isPermuted ? "messageCoordinatePermuted" : "messageCoordinateBody",
      isPermuted
        ? "Les coordonnées ont été permutées pour rester en Côte d'Ivoire."
        : "Centrer la carte sur ce point ?"
    );
    const confirm = siteSearchMessage("messageCoordinateConfirm", "Centrer la carte");
    siteSearchCoordinateCandidate = candidate;
    siteSearchCoordinateSuggestion.hidden = false;
    siteSearchCoordinateSuggestion.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)} ${escapeHtml(label)}</p>
      <button class="button button-primary" type="button" data-site-search-coordinate-confirm>${escapeHtml(confirm)}</button>
    `;
    const confirmButton = siteSearchCoordinateSuggestion.querySelector("[data-site-search-coordinate-confirm]");
    if (confirmButton) {
      confirmButton.addEventListener("click", function () {
        if (!siteSearchCoordinateCandidate) {
          return;
        }
        window.dispatchEvent(new CustomEvent("g2m:site-search-center-map", {
          detail: {
            latitude: siteSearchCoordinateCandidate.lat,
            longitude: siteSearchCoordinateCandidate.lng,
            zoom: 16
          }
        }));
        closeSiteSearch();
      });
    }
  }

  function renderSiteSearchResults(results) {
    if (!siteSearchResults) {
      return;
    }
    hideCoordinateSuggestion();
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
    const coordinateCandidate = parseSearchCoordinateCandidate(query);
    if (coordinateCandidate) {
      clearSiteSearchRequest();
      renderCoordinateSuggestion(coordinateCandidate);
      if (siteSearchResults) {
        siteSearchResults.innerHTML = "";
      }
      return;
    }
    if (query.length < 2) {
      hideCoordinateSuggestion();
      renderSiteSearchMessage(siteSearchMessage("messageMinLength", "Saisissez au moins 2 caractères."));
      return;
    }
    hideCoordinateSuggestion();
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  if (siteSearchOpen && siteSearchModal && siteSearchInput && siteSearchResults) {
    siteSearchOpen.addEventListener("click", function () {
      openSiteSearch();
      hideCoordinateSuggestion();
      renderSiteSearchMessage(siteSearchMessage("messageMinLength", "Saisissez au moins 2 caractères."));
    });
    siteSearchCloseButtons.forEach(function (button) {
      button.addEventListener("click", closeSiteSearch);
    });
    siteSearchInput.addEventListener("input", scheduleSiteSearch);
  }

  function parseSearchCoordinateCandidate(query) {
    const normalized = String(query || "")
      .replace(/[°º]/g, " ")
      .replace(/[;|/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) {
      return null;
    }
    const matches = normalized.match(/[+-]?\d+(?:[.,]\d+)?/g);
    if (!matches || matches.length < 2) {
      return null;
    }
    const first = parseCoordinateNumber(matches[0]);
    const second = parseCoordinateNumber(matches[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      return null;
    }
    const original = { lat: first, lng: second };
    const swapped = { lat: second, lng: first };
    const originalInside = isInsideCoteDIvoire(original.lat, original.lng);
    const swappedInside = isInsideCoteDIvoire(swapped.lat, swapped.lng);
    if (!originalInside && !swappedInside) {
      return null;
    }
    if (originalInside && !swappedInside) {
      return { ...original, permuted: false };
    }
    if (!originalInside && swappedInside) {
      return { ...swapped, permuted: true };
    }
    return chooseCoordinateOrder(original, swapped, query);
  }

  function chooseCoordinateOrder(original, swapped, query) {
    const scoreOriginal = coordinateOrderScore(original.lat, original.lng, query);
    const scoreSwapped = coordinateOrderScore(swapped.lat, swapped.lng, query);
    if (scoreSwapped > scoreOriginal) {
      return { ...swapped, permuted: true };
    }
    return { ...original, permuted: false };
  }

  function coordinateOrderScore(lat, lng, query) {
    let score = 0;
    if (Math.abs(lat) <= 12 && Math.abs(lng) <= 12) {
      score += 1;
    }
    if (lat >= coteDIvoireBounds.south && lat <= coteDIvoireBounds.north) {
      score += 1;
    }
    if (lng >= coteDIvoireBounds.west && lng <= coteDIvoireBounds.east) {
      score += 1;
    }
    return score;
  }

  function isInsideCoteDIvoire(lat, lng) {
    return lat >= coteDIvoireBounds.south
      && lat <= coteDIvoireBounds.north
      && lng >= coteDIvoireBounds.west
      && lng <= coteDIvoireBounds.east;
  }

  function formatSearchCoordinate(value) {
    return Number(value).toFixed(6).replace(/\.?0+$/, "");
  }

  function parseCoordinateNumber(text) {
    return Number(String(text).replace(",", "."));
  }
}());

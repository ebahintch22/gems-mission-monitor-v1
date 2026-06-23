(function () {
  const app = document.getElementById("sites-planning-app");
  const layerHost = document.getElementById("sites-planning-layer-host");
  const layerTemplate = document.getElementById("sites-planning-layer-template");
  if (!app || !layerHost || !layerTemplate || !window.LayerBoxManager) {
    return;
  }

  const layerBoxManager = new LayerBoxManager(layerHost, {
    rootId: "sites-planning-root",
    rootTitle: "Explorateur des sites a visiter",
    rootRender(host) {
      host.append(layerTemplate.content.cloneNode(true));
    }
  });

  const statusInputs = Array.from(layerHost.querySelectorAll('input[name="planning_status"]'));
  const orderSelect = layerHost.querySelector("#sites-planning-order");
  const importButton = document.getElementById("sites-planning-import");
  const feedback = layerHost.querySelector("#sites-planning-feedback");
  const treeContainer = layerHost.querySelector("#sites-planning-tree");
  const tableContainer = layerHost.querySelector("#sites-planning-table");
  const selectionNode = layerHost.querySelector("#sites-planning-selection");
  const totalNode = layerHost.querySelector("#sites-planning-total");
  const rateNode = layerHost.querySelector("#sites-planning-rate");
  const doneNode = layerHost.querySelector("#sites-planning-done");
  const missingNode = layerHost.querySelector("#sites-planning-missing");
  const explorer = layerHost.querySelector("#sites-planning-explorer");
  const paneResizer = layerHost.querySelector("#sites-planning-pane-resizer");
  let exportButton = null;
  const statusLabels = {
    planned: app.dataset.statusPlanned || "planned",
    ongoing: app.dataset.statusOngoing || "ongoing",
    done: app.dataset.statusDone || "done"
  };
  const georeferencingAbandonReasonLabels = {
    SITE_INTROUVABLE_SUR_BASEMAP: "Site introuvable sur basemap",
    IMAGERIE_INSUFFISANTE: "Imagerie insuffisante",
    COUVERTURE_BASEMAP_ABSENTE: "Couverture basemap absente",
    SITE_MASQUE_OU_OBSTRUE: "Site masque ou obstrue",
    CONTOUR_NON_DISCERNABLE: "Contour non discernable",
    SITE_CONFONDU_AVEC_ENVIRONNEMENT: "Site confondu avec l'environnement",
    LOCALISATION_INITIALE_TROP_INCERTAINE: "Localisation initiale trop incertaine"
  };
  let allSites = [];
  let currentSelection = null;
  let selectedSite = null;

  function selectedStatuses() {
    return statusInputs
      .filter((input) => input.checked)
      .map((input) => input.value);
  }

  function statusQuery() {
    const statuses = selectedStatuses();
    return statuses.length ? `?status=${encodeURIComponent(statuses.join(","))}` : "?status=__none__";
  }

  function hierarchyOrder() {
    if (orderSelect?.value === "ministere-region-localite") {
      return ["ministere", "region", "localite"];
    }
    return ["region", "ministere", "localite"];
  }

  function setFeedback(message, className) {
    if (!feedback) {
      return;
    }
    feedback.textContent = message || "";
    feedback.className = `sites-planning-feedback ${className || ""}`.trim();
  }

  function renderMessage(message) {
    treeContainer.innerHTML = "";
    tableContainer.innerHTML = "";
    const treeMessage = document.createElement("p");
    const tableMessage = document.createElement("p");
    treeMessage.className = "sites-planning-empty";
    tableMessage.className = "sites-planning-empty";
    treeMessage.textContent = message;
    tableMessage.textContent = message;
    treeContainer.append(treeMessage);
    tableContainer.append(tableMessage);
  }

  function loadPlanning(options = {}) {
    renderMessage(app.dataset.labelLoading || "Chargement...");
    setFeedback("");
    if (options.keepSelection !== true) {
      currentSelection = null;
    }
    const query = statusQuery();
    Promise.all([
      fetch(`/api/sites${query}`, { headers: { "Accept": "application/json" } }).then(ensureJson),
      fetch(`/api/sites/stats${query}`, { headers: { "Accept": "application/json" } }).then(ensureJson)
    ])
      .then(([sitesPayload, stats]) => {
        allSites = Array.isArray(sitesPayload.sites) ? sitesPayload.sites : [];
        selectedSite = selectedSite
          ? allSites.find((site) => site.id === selectedSite.id) || null
          : null;
        renderStats(stats);
        renderTree();
        renderCurrentTable();
        updateExportCommand();
      })
      .catch(() => {
        allSites = [];
        currentSelection = null;
        selectedSite = null;
        renderMessage(app.dataset.labelEmpty || "Aucune donnee.");
        updateExportCommand();
      });
  }

  function ensureJson(response) {
    if (!response.ok) {
      throw new Error("request_failed");
    }
    return response.json();
  }

  function renderStats(stats) {
    const schedule = Array.isArray(stats.schedule) ? stats.schedule : [];
    const missing = schedule.filter((site) => site.schedule_gap_days === null).length;
    totalNode.textContent = String(stats.total || 0);
    rateNode.textContent = `${Number(stats.execution_rate || 0).toLocaleString("fr-FR")}%`;
    doneNode.textContent = String(stats.done || 0);
    missingNode.textContent = String(missing);
  }

  function renderTree() {
    treeContainer.innerHTML = "";
    if (!allSites.length) {
      const empty = document.createElement("p");
      empty.className = "sites-planning-empty";
      empty.textContent = app.dataset.labelEmpty || "Aucun site.";
      treeContainer.append(empty);
      return;
    }

    const allButton = document.createElement("button");
    allButton.className = `sites-planning-tree-all ${currentSelection ? "" : "is-active"}`.trim();
    allButton.type = "button";
    allButton.innerHTML = `<span>Tous les sites</span><strong>${allSites.length}</strong>`;
    allButton.addEventListener("click", function () {
      currentSelection = null;
      renderTree();
      renderCurrentTable();
    });
    treeContainer.append(allButton);

    const root = buildTree(allSites, hierarchyOrder());
    root.children.forEach((node) => {
      treeContainer.append(renderTreeNode(node, 1));
    });
  }

  function buildTree(sites, order) {
    const root = { key: "root", label: "root", count: sites.length, children: [], sites: [], criteria: [] };
    sites.forEach((site) => {
      let current = root;
      order.forEach((field) => {
        const label = site[field] || "Non renseigne";
        let child = current.children.find((candidate) => candidate.field === field && candidate.label === label);
        if (!child) {
          child = {
            key: `${current.key}|${field}:${label}`,
            label,
            field,
            count: 0,
            children: [],
            sites: [],
            criteria: current.criteria.concat({ field, value: label })
          };
          current.children.push(child);
          current.children.sort((left, right) => left.label.localeCompare(right.label, "fr", { sensitivity: "base" }));
        }
        child.count += 1;
        current = child;
      });
      current.sites.push(site);
    });
    return root;
  }

  function renderTreeNode(node, level) {
    const details = document.createElement("details");
    details.className = `sites-planning-node sites-planning-node-level-${level}`;
    details.open = level < 2 || isNodeSelected(node);
    details.classList.toggle("is-active", isNodeSelected(node));
    const summary = document.createElement("summary");
    const title = document.createElement("span");
    const count = document.createElement("strong");
    title.textContent = node.label;
    count.textContent = String(node.count);
    summary.append(title, count);
    summary.addEventListener("click", function () {
      currentSelection = {
        label: node.label,
        criteria: node.criteria
      };
      window.setTimeout(function () {
        renderTree();
        renderCurrentTable();
      }, 0);
    });
    details.append(summary);

    node.children.forEach((child) => {
      details.append(renderTreeNode(child, level + 1));
    });
    return details;
  }

  function isNodeSelected(node) {
    if (!currentSelection) {
      return false;
    }
    return serializeCriteria(currentSelection.criteria) === serializeCriteria(node.criteria);
  }

  function serializeCriteria(criteria) {
    return (criteria || []).map((entry) => `${entry.field}:${entry.value}`).join("|");
  }

  function filteredSitesForSelection() {
    if (!currentSelection?.criteria?.length) {
      return allSites;
    }
    return allSites.filter((site) => currentSelection.criteria.every((entry) => {
      const value = site[entry.field] || "Non renseigne";
      return value === entry.value;
    }));
  }

  function renderCurrentTable() {
    const sites = filteredSitesForSelection();
    if (selectionNode) {
      selectionNode.textContent = currentSelection?.criteria?.length
        ? currentSelection.criteria.map((entry) => entry.value).join(" / ")
        : "Tous les sites";
    }
    renderTable(sites);
  }

  function renderTable(sites) {
    tableContainer.innerHTML = "";
    ensureExportCommand();
    updateExportCommand();
    if (!sites.length) {
      const empty = document.createElement("p");
      empty.className = "sites-planning-empty";
      empty.textContent = app.dataset.labelEmpty || "Aucun site.";
      tableContainer.append(empty);
      return;
    }
    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>Code</th>
          <th>Site</th>
          <th>REGION</th>
          <th>MINISTERE</th>
          <th>LOCALITE</th>
          <th>Statut</th>
          <th>Georef.</th>
          <th>Motif d'abandon</th>
          <th>Date prevue</th>
          <th>Date reelle</th>
          <th>Ecart</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const body = table.querySelector("tbody");
    sites.forEach((site) => {
      const row = document.createElement("tr");
      const gapLabel = site.actual_visit_date ? "" : "non renseigne";
      row.tabIndex = 0;
      row.classList.toggle("is-selected-planning-site", site.id === selectedSite?.id);
      row.classList.toggle("has-georeferencing-abandoned", isGeoreferencingAbandoned(site));
      row.addEventListener("click", function () {
        selectSiteForExport(site);
      });
      row.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectSiteForExport(site);
        }
      });
      row.innerHTML = `
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td><span class="sites-planning-status sites-planning-status-${site.statut}"></span></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      `;
      const cells = row.querySelectorAll("td");
      cells[0].textContent = site.code || "";
      cells[1].textContent = site.site_name || "";
      cells[2].textContent = site.region || "";
      cells[3].textContent = site.ministere || "";
      cells[4].textContent = site.localite || "";
      cells[5].querySelector("span").textContent = statusLabels[site.statut] || site.statut || "";
      cells[6].textContent = isGeoreferencingAbandoned(site) ? "Impossible" : "";
      cells[7].textContent = georeferencingAbandonReasonLabel(site);
      cells[8].textContent = formatDate(site.planned_visit_date);
      cells[9].textContent = formatDate(site.actual_visit_date) || "non renseigne";
      cells[10].textContent = site.schedule_gap_label || gapLabel || "non renseigne";
      body.append(row);
    });
    tableContainer.append(table);
  }

  function ensureExportCommand() {
    if (exportButton || !selectionNode?.parentElement) {
      return;
    }
    exportButton = document.createElement("button");
    exportButton.className = "button";
    exportButton.type = "button";
    exportButton.id = "sites-planning-export-geojson";
    exportButton.innerHTML = '<i class="fa-solid fa-file-export" aria-hidden="true"></i><span>Exporter GeoJSON</span>';
    exportButton.addEventListener("click", exportSelectedSiteGeoJson);
    selectionNode.parentElement.append(exportButton);
  }

  function selectSiteForExport(site) {
    selectedSite = site;
    renderCurrentTable();
    updateExportCommand();
  }

  function updateExportCommand() {
    if (!exportButton) {
      return;
    }
    const hasBuildings = planningBuildingCount(selectedSite) > 0;
    exportButton.disabled = !selectedSite || !hasBuildings;
    exportButton.title = !selectedSite
      ? "Selectionnez un site."
      : hasBuildings
      ? "Exporter le contour du site et les emprises batiments."
      : "Export impossible : aucune emprise de batiment importee pour ce site.";
  }

  function planningBuildingCount(site) {
    return Array.isArray(site?.emprise_bat_osm?.features) ? site.emprise_bat_osm.features.length : 0;
  }

  function exportSelectedSiteGeoJson() {
    if (!selectedSite) {
      setFeedback("Selectionnez un site a exporter.", "is-error");
      return;
    }
    if (planningBuildingCount(selectedSite) <= 0) {
      setFeedback("Export impossible : aucune emprise de batiment importee pour ce site.", "is-error");
      updateExportCommand();
      return;
    }
    fetch(`/api/sites/${encodeURIComponent(selectedSite.id)}/buildings/plan`, {
      headers: { "Accept": "application/json" }
    })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (!ok || !payload.ok) {
          throw new Error(payload.error || "sites_planning_export_failed");
        }
        const geojson = buildSelectedSiteExportGeoJson(payload);
        if (!geojson.features.some((feature) => feature.properties?.feature_role === "building_extent")) {
          throw new Error("missing_building_extents");
        }
        downloadGeoJson(geojson, selectedSiteExportFilename(payload.site || selectedSite));
        setFeedback("Export GeoJSON genere.", "is-success");
      })
      .catch((error) => {
        const message = error.message === "missing_building_extents"
          ? "Export impossible : aucune emprise de batiment importee pour ce site."
          : "Export GeoJSON impossible.";
        setFeedback(message, "is-error");
      });
  }

  function buildSelectedSiteExportGeoJson(payload) {
    const site = payload.site || selectedSite;
    const buildings = payload.buildings?.type === "FeatureCollection"
      ? payload.buildings.features || []
      : selectedSite.emprise_bat_osm?.features || [];
    const features = [];
    if (site?.polygon_geo?.type === "Polygon") {
      features.push({
        type: "Feature",
        properties: siteExportProperties(site, "site_contour"),
        geometry: site.polygon_geo
      });
    }
    buildings.forEach((feature, index) => {
      if (!feature?.geometry) {
        return;
      }
      features.push({
        type: "Feature",
        properties: {
          ...(feature.properties || {}),
          ...siteExportProperties(site, "building_extent"),
          building_export_index: index + 1
        },
        geometry: feature.geometry
      });
    });
    return {
      type: "FeatureCollection",
      name: selectedSiteExportName(site),
      features
    };
  }

  function siteExportProperties(site, role) {
    return {
      feature_role: role,
      site_id: site?.id || selectedSite.id,
      site_code: site?.code || selectedSite.code || "",
      site_name: site?.site_name || selectedSite.site_name || "",
      region: site?.region || selectedSite.region || "",
      ministere: site?.ministere || selectedSite.ministere || "",
      localite: site?.localite || selectedSite.localite || ""
    };
  }

  function selectedSiteExportName(site) {
    return `site_${slugify([site?.code, site?.site_name].filter(Boolean).join("_") || site?.id || "selection")}`;
  }

  function selectedSiteExportFilename(site) {
    return `${selectedSiteExportName(site)}_contour_batiments.geojson`;
  }

  function downloadGeoJson(geojson, filename) {
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      || "site";
  }

  function isGeoreferencingAbandoned(site) {
    return site?.georeferencing_status === "abandoned";
  }

  function georeferencingAbandonReasonLabel(site) {
    return site?.georeferencing_abandon_reason_label
      || georeferencingAbandonReasonLabels[site?.georeferencing_abandon_reason]
      || "";
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }
    const parts = String(value).split("-");
    if (parts.length !== 3) {
      return value;
    }
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function importPlanning() {
    if (!importButton) {
      return;
    }
    importButton.disabled = true;
    setFeedback(app.dataset.labelLoading || "Chargement...", "is-loading");
    fetch("/api/sites/import", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ file_path: app.dataset.defaultCsvPath || "" })
    })
      .then(ensureJson)
      .then((payload) => {
        const imported = payload.result?.imported || 0;
        const message = (app.dataset.labelImportSuccess || "Import termine : __COUNT__ sites pris en compte.")
          .replace("__COUNT__", String(imported));
        setFeedback(message, "is-success");
        loadPlanning();
      })
      .catch(() => {
        setFeedback(app.dataset.labelImportError || "Import impossible.", "is-error");
      })
      .finally(() => {
        importButton.disabled = false;
      });
  }

  function setupPaneResize() {
    if (!explorer || !paneResizer) {
      return;
    }
    paneResizer.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      paneResizer.setPointerCapture(event.pointerId);
      explorer.classList.add("is-resizing");
      const onMove = function (moveEvent) {
        const rect = explorer.getBoundingClientRect();
        const minLeft = 220;
        const minRight = 320;
        const requestedWidth = moveEvent.clientX - rect.left;
        const maxLeft = Math.max(minLeft, rect.width - minRight);
        const nextWidth = Math.min(Math.max(requestedWidth, minLeft), maxLeft);
        explorer.style.setProperty("--sites-tree-width", `${Math.round(nextWidth)}px`);
      };
      const onUp = function (upEvent) {
        explorer.classList.remove("is-resizing");
        paneResizer.releasePointerCapture(upEvent.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  statusInputs.forEach((input) => {
    input.addEventListener("change", function () {
      loadPlanning();
    });
  });
  orderSelect?.addEventListener("change", function () {
    loadPlanning();
  });
  importButton?.addEventListener("click", importPlanning);
  setupPaneResize();
  loadPlanning();
}());

(function () {
  const points = JSON.parse(document.getElementById("sig-points-data").textContent);
  const regions = JSON.parse(document.getElementById("sig-regions-data").textContent);
  const siteCategoryIcons = JSON.parse(document.getElementById("sig-site-category-icons-data").textContent);
  const i18nPayload = JSON.parse(document.getElementById("sig-i18n-data").textContent);
  const messages = i18nPayload.messages || {};
  const filterLabels = i18nPayload.filters || {};
  const locale = i18nPayload.locale || "fr";
  function t(key) {
    return messages[key] || key;
  }
  const workspace = document.getElementById("sig-workspace");
  const resizer = document.getElementById("sig-resizer");
  const toolsToggle = document.getElementById("sig-tools-toggle");
  const toolsClose = document.getElementById("sig-tools-close");
  const toolsPanel = document.getElementById("sig-tools");
  const rootContent = document.getElementById("sig-pal-root-content");
  const mapLegend = document.getElementById("sig-map-legend");
  const mapLegendToggle = document.getElementById("sig-map-legend-toggle");
  const mapLegendItems = document.getElementById("sig-map-legend-items");
  const loadingOverlay = document.getElementById("sig-loading-overlay");
  const map = L.map("sig-map", { maxZoom: 20 }).setView([7.54, -5.55], 6);
  map.createPane("territoryPane");
  map.getPane("territoryPane").style.zIndex = 410;
  map.createPane("collectionPointsPane");
  map.getPane("collectionPointsPane").style.zIndex = 450;
  const clusterToggle = document.getElementById("sig-cluster-toggle");
  const collectionLayer = L.layerGroup().addTo(map);
  const clusteredMarkersLayer = L.markerClusterGroup({
    chunkedLoading: true,
    disableClusteringAtZoom: 14,
    maxClusterRadius: 42,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true
  });
  const plainMarkersLayer = L.layerGroup();
  let clusteringEnabled = true;
  let activeMarkersLayer = clusteredMarkersLayer;
  collectionLayer.addLayer(activeMarkersLayer);
  const colors = {
    validee: "#16856f",
    a_verifier: "#d38b13",
    rejetee: "#b84545"
  };
  const markerColorHex = {
    red: "#d63e2a",
    pink: "#ff89b5",
    blue: "#2a81cb",
    cadetblue: "#436978",
    purple: "#9c2bcb",
    green: "#3ca642",
    darkblue: "#1f4e79",
    orange: "#f69730",
    darkgreen: "#2f6b3f",
    gray: "#777777"
  };
  const extraMarkerColorMap = {
    cadetblue: "blue",
    darkblue: "blue",
    darkgreen: "green",
    gray: "black"
  };
  const siteCategoryIndex = (siteCategoryIcons.categories || []).reduce(function (index, category) {
    index[category.name] = category;
    return index;
  }, {});
  const baseLayers = {
    [t("layerHumanitarian")]: L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors, Humanitarian OpenStreetMap Team"
    }),
    [t("layerRoad")]: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors"
    }),
    [t("layerOpenTopo")]: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "&copy; OpenTopoMap, données &copy; OpenStreetMap contributors"
    }),
    [t("layerPositron")]: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
      subdomains: "abcd",
      maxZoom: 19
    }),
    [t("layerEsriGray")]: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri, DeLorme, NAVTEQ",
      maxZoom: 16
    }),
    [t("layerGoogle")]: L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: "&copy; Google Maps",
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      maxZoom: 20
    }),
    [t("layerEsriSatellite")]: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19
    })
  };

  baseLayers[t("layerRoad")].addTo(map);

  function showLoading(message) {
    if (!loadingOverlay) {
      return;
    }
    const label = loadingOverlay.querySelector("span");
    if (label && message) {
      label.textContent = message;
    }
    loadingOverlay.classList.add("is-active");
    loadingOverlay.setAttribute("aria-busy", "true");
  }

  function hideLoading() {
    if (!loadingOverlay) {
      return;
    }
    loadingOverlay.classList.remove("is-active");
    loadingOverlay.setAttribute("aria-busy", "false");
  }

  const territoryLayer = L.geoJSON(regions, {
    pane: "territoryPane",
    style: {
      color: "#b84545",
      fillColor: "#f4d6d6",
      fillOpacity: 0.23,
      weight: 1
    },
    onEachFeature: function (feature, layer) {
      layer.bindTooltip(feature.properties.nom_region);
    }
  }).addTo(map);

  const layerControl = L.control.layers(baseLayers, {
    [t("layerCollectionPoints")]: collectionLayer,
    [t("layerRegionalBoundaries")]: territoryLayer
  }, {
    collapsed: false,
    position: "topright"
  }).addTo(map);
  const mapControlContainer = layerControl.getContainer();
  const mapControlToggle = document.createElement("button");
  const mapControlToggleIcon = document.createElement("i");
  const mapControlToggleLabel = document.createElement("span");

  mapControlContainer.classList.add("map-control-container", "is-collapsed");
  mapControlToggle.className = "map-control-toggle";
  mapControlToggle.type = "button";
  mapControlToggle.setAttribute("aria-expanded", "false");
  mapControlToggle.setAttribute("aria-label", t("layersExpand"));
  mapControlToggleIcon.className = "fa-solid fa-chevron-down";
  mapControlToggleIcon.setAttribute("aria-hidden", "true");
  mapControlToggleLabel.textContent = t("layersTitle");
  mapControlToggle.append(mapControlToggleIcon, mapControlToggleLabel);
  mapControlContainer.prepend(mapControlToggle);
  L.DomEvent.disableClickPropagation(mapControlContainer);
  L.DomEvent.disableScrollPropagation(mapControlContainer);

  mapControlToggle.addEventListener("click", function () {
    const isCollapsed = mapControlContainer.classList.toggle("is-collapsed");
    mapControlToggle.setAttribute("aria-expanded", String(!isCollapsed));
    mapControlToggle.setAttribute(
      "aria-label",
      isCollapsed ? t("layersExpand") : t("layersCollapse")
    );
    mapControlToggleIcon.className = isCollapsed
      ? "fa-solid fa-chevron-down"
      : "fa-solid fa-chevron-up";
  });

  const layerBoxManager = new LayerBoxManager(toolsPanel, {
    rootId: "root",
    rootTitle: t("palRootTitle"),
    rootRender: function (container) {
      container.append(rootContent);
    }
  });

  layerBoxManager.on("activate", function (event) {
    workspace.classList.toggle("is-pal-detail-open", event.id !== "root");
  });

  const table = new Tabulator("#sig-table", {
    data: [],
    height: 270,
    layout: "fitColumns",
    placeholder: t("tableEmpty"),
    columns: [
      { title: t("tableAgent"), field: "code_agent", minWidth: 80 },
      { title: t("tableTeam"), field: "nom_equipe", minWidth: 115 },
      { title: t("tableSubpref"), field: "nom_sous_prefecture", minWidth: 115 },
      { title: t("status"), field: "statut_validation", minWidth: 95 }
    ]
  });

  table.on("rowClick", function (event, row) {
    const point = row.getData();
    flyToSubmission(point);
    showSiteIdentification(point);
  });

  function flyToSubmission(point) {
    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    map.flyTo([latitude, longitude], Math.max(map.getZoom(), 15), {
      animate: true,
      duration: 0.9
    });
    map.invalidateSize();
  }

  function popupContent(point) {
    const content = document.createElement("div");
    const heading = document.createElement("strong");
    const agent = document.createElement("div");
    const locality = document.createElement("div");
    const date = document.createElement("div");
    const status = document.createElement("div");

    heading.textContent = point.display_submission_id || point.source_submission_id;
    agent.textContent = `${point.code_agent || t("unlinkedAgent")} - ${point.nom_equipe || t("noTeam")}`;
    locality.textContent = [
      point.nom_sous_prefecture,
      point.nom_departement,
      point.nom_region
    ].filter(Boolean).join(", ");
    date.textContent = new Date(point.submitted_at).toLocaleString(locale);
    status.textContent = t("validationPrefix").replace("{{status}}", statusLabel(point.statut_validation));
    content.append(heading, agent, locality, date, status);
    return content;
  }

  function rawData(point) {
    if (!point.raw_data_json) {
      return {};
    }
    try {
      return JSON.parse(point.raw_data_json);
    } catch (error) {
      return {};
    }
  }

  function rawValue(raw, path) {
    if (Object.prototype.hasOwnProperty.call(raw, path)) {
      return raw[path];
    }
    return String(path).split(".").reduce(function (current, part) {
      if (current === null || current === undefined) {
        return undefined;
      }
      return current[part];
    }, raw);
  }

  function normalizeCategory(value) {
    return String(value || "").trim().toLowerCase();
  }

  function categoryForPoint(point) {
    const raw = rawData(point);
    const sousType = normalizeCategory(rawValue(raw, "modB.sous_type") || rawValue(raw, "modB/sous_type"));
    if (sousType && siteCategoryIndex[sousType]) {
      return siteCategoryIndex[sousType];
    }

    const secteur = normalizeCategory(rawValue(raw, "modB.type_infra") || rawValue(raw, "modB/type_infra"));
    const fallbackName = siteCategoryIcons.sectorFallbacks?.[secteur];
    if (fallbackName && siteCategoryIndex[fallbackName]) {
      return siteCategoryIndex[fallbackName];
    }

    return siteCategoryIcons.fallback;
  }

  function extraMarkerIcon(category) {
    if (!L.ExtraMarkers) {
      return null;
    }

    return L.ExtraMarkers.icon({
      icon: category.icon || siteCategoryIcons.fallback.icon,
      markerColor: extraMarkerColorMap[category.markerColor] || category.markerColor || siteCategoryIcons.fallback.markerColor,
      prefix: "fa",
      shape: "circle"
    });
  }

  function createSiteMarker(point) {
    const category = categoryForPoint(point);
    const markerIcon = extraMarkerIcon(category);

    if (markerIcon) {
      return L.marker([point.latitude, point.longitude], {
        icon: markerIcon,
        pane: "collectionPointsPane",
        title: category.label
      });
    }

    return L.circleMarker([point.latitude, point.longitude], {
      pane: "collectionPointsPane",
      color: markerColorHex[category.markerColor] || markerColorHex.gray,
      fillColor: markerColorHex[category.markerColor] || markerColorHex.gray,
      fillOpacity: 0.82,
      radius: 6,
      weight: 1
    });
  }

  function renderCategoryLegend() {
    const sectors = {};
    (siteCategoryIcons.categories || []).forEach(function (category) {
      const secteur = category.secteur || "autres";
      if (!sectors[secteur]) {
        sectors[secteur] = [];
      }
      sectors[secteur].push(category);
    });

    mapLegendItems.replaceChildren();
    Object.keys(sectors).forEach(function (secteur) {
      const group = document.createElement("section");
      const heading = document.createElement("h3");
      const list = document.createElement("div");

      group.className = "sig-map-legend-group";
      heading.textContent = siteCategoryIcons.sectorLabels?.[secteur] || secteur;
      list.className = "sig-map-legend-list";

      sectors[secteur].forEach(function (category) {
        const item = document.createElement("span");
        const swatch = document.createElement("span");
        const icon = document.createElement("i");
        const label = document.createElement("span");

        item.className = "sig-map-legend-item";
        swatch.className = "sig-map-legend-symbol";
        swatch.style.backgroundColor = markerColorHex[category.markerColor] || markerColorHex.gray;
        icon.className = `fa-solid ${category.icon}`;
        icon.setAttribute("aria-hidden", "true");
        label.textContent = category.label;
        swatch.append(icon);
        item.append(swatch, label);
        list.append(item);
      });

      group.append(heading, list);
      mapLegendItems.append(group);
    });
  }

  function valueOrDash(value) {
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    return String(value);
  }

  function statusLabel(status) {
    return {
      validee: t("statusValidee"),
      a_verifier: t("statusAVerifier"),
      rejetee: t("statusRejetee")
    }[status] || valueOrDash(status);
  }

  function addSection(container, title, rows) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    const list = document.createElement("dl");

    section.className = "site-identification-section";
    heading.textContent = title;
    list.className = "site-identification-list";
    rows.forEach(function (row) {
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = row[0];
      description.textContent = valueOrDash(row[1]);
      list.append(term, description);
    });
    section.append(heading, list);
    container.append(section);
  }

  function showSiteIdentification(point) {
    const raw = rawData(point);
    const modA = raw.modA || {};
    const modB = raw.modB || {};
    const modC = raw.modC || {};
    const modD = raw.modD || {};
    const modE = raw.modE || {};
    const modN = raw.modN || {};
    const submissionDisplayId = point.display_submission_id || point.source_submission_id;
    const siteName = modB.nom_officiel || submissionDisplayId;
    const latitude = Number(point.latitude).toFixed(6);
    const longitude = Number(point.longitude).toFixed(6);

    layerBoxManager.renderToLayer("site-detail", function (container) {
      const wrapper = document.createElement("section");
      const subtitle = document.createElement("p");
      const status = document.createElement("div");
      const body = document.createElement("div");

      wrapper.className = "site-identification is-open";
      wrapper.id = "site-identification";
      wrapper.setAttribute("aria-label", t("siteAria"));
      subtitle.className = "muted";
      subtitle.id = "site-identification-subtitle";
      subtitle.textContent = [
        modA.id_entite,
        point.nom_sous_prefecture,
        point.nom_region
      ].filter(Boolean).join(" - ");
      status.className = `site-identification-status status-${point.statut_validation}`;
      status.id = "site-identification-status";
      status.textContent = statusLabel(point.statut_validation);
      body.className = "site-identification-body";
      body.id = "site-identification-body";

      wrapper.append(subtitle, status, body);
      addDetailAction(body, point.id);
      addSection(body, t("identification"), [
        [t("sheetId"), modA.fiche_id || submissionDisplayId],
        [t("entityId"), modA.id_entite],
        [t("officialName"), modB.nom_officiel],
        [t("ministry"), modB.ministere],
        [t("type"), modB.type_infra],
        [t("status"), modB.statut_fonct],
        [t("condition"), modA.conditions]
      ]);
      addSection(body, t("location"), [
        [t("region"), modB.region || point.nom_region],
        [t("department"), modB.departement || point.nom_departement],
        [t("subpref"), modB.sous_prefecture || point.nom_sous_prefecture],
        [t("commune"), modB.commune],
        [t("environment"), modB.milieu],
        [t("latitude"), latitude],
        [t("longitude"), longitude],
        [t("precision"), `${valueOrDash(point.precision_m)} m`]
      ]);
      addSection(body, t("collection"), [
        [t("mission"), point.mission_name],
        [t("team"), point.nom_equipe],
        [t("agent"), point.code_agent],
        [t("submittedAt"), new Date(point.submitted_at).toLocaleString(locale)],
        [t("anomalies"), point.anomaly_count]
      ]);
      addSection(body, t("characteristics"), [
        [t("buildings"), modC.nb_batiments],
        [t("staff"), modC.personnel],
        [t("targetPublic"), modC.utilisateurs_cible],
        [t("electricity"), modD.electricite],
        [t("powerSource"), modD.source_elec],
        [t("availability"), modD.dispo_jour],
        [t("operators"), modE.operateurs],
        [t("orangeQuality"), modE.orange_qual],
        [t("mobileSpeed"), modE.debit_mob_desc],
        [t("observations"), modN.observations]
      ]);
      container.append(wrapper);
    }, {
      activate: true,
      title: siteName
    });
  }

  function addDetailAction(container, submissionId) {
    const actions = document.createElement("div");
    const link = document.createElement("a");

    actions.className = "site-identification-actions";
    link.className = "button button-primary";
    link.href = `/soumissions/${submissionId}/report`;
    link.textContent = t("detailLink");
    actions.append(link);
    container.append(actions);
  }

  function setToolsOpen(open) {
    workspace.classList.toggle("is-tools-open", open);
    toolsToggle.setAttribute("aria-expanded", String(open));
    toolsToggle.setAttribute(
      "aria-label",
      open ? t("toolsHide") : t("toolsShow")
    );
    window.setTimeout(function () {
      map.invalidateSize();
    }, 320);
  }

  function filters() {
    return {
      mission: document.getElementById("sig-mission-filter").value,
      equipe: document.getElementById("sig-equipe-filter").value,
      agent: document.getElementById("sig-agent-filter").value,
      validation: document.getElementById("sig-validation-filter").value,
      from: document.getElementById("sig-date-from").value,
      to: document.getElementById("sig-date-to").value
    };
  }

  function isVisible(point, criteria) {
    const day = point.submitted_at.slice(0, 10);
    return (!criteria.mission || String(point.mission_id) === criteria.mission)
      && (!criteria.equipe || String(point.equipe_id) === criteria.equipe)
      && (!criteria.agent || String(point.agent_id) === criteria.agent)
      && (!criteria.validation || point.statut_validation === criteria.validation)
      && (!criteria.from || day >= criteria.from)
      && (!criteria.to || day <= criteria.to);
  }

  function updateMetrics(visiblePoints) {
    const count = { validee: 0, a_verifier: 0, rejetee: 0 };
    visiblePoints.forEach(function (point) {
      count[point.statut_validation] += 1;
    });
    document.getElementById("sig-visible-total").textContent = visiblePoints.length;
    document.getElementById("sig-count-valid").textContent = count.validee;
    document.getElementById("sig-count-check").textContent = count.a_verifier;
    document.getElementById("sig-count-rejected").textContent = count.rejetee;
  }

  function fitToVisiblePoints(visiblePoints) {
    if (!visiblePoints.length) {
      return;
    }

    if (visiblePoints.length === 1) {
      map.setView([visiblePoints[0].latitude, visiblePoints[0].longitude], 13);
      return;
    }

    const bounds = L.latLngBounds(visiblePoints.map(function (point) {
      return [point.latitude, point.longitude];
    }));
    map.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 13
    });
  }

  function renderPoints(reframeMap) {
    const visiblePoints = points.filter(function (point) {
      return isVisible(point, filters());
    });

    clusteredMarkersLayer.clearLayers();
    plainMarkersLayer.clearLayers();
    visiblePoints.forEach(function (point) {
      const clusteredMarker = createSiteMarker(point).bindPopup(popupContent(point));
      const plainMarker = createSiteMarker(point).bindPopup(popupContent(point));
      clusteredMarker.on("click", function () {
        showSiteIdentification(point);
      });
      plainMarker.on("click", function () {
        showSiteIdentification(point);
      });
      clusteredMarker.addTo(clusteredMarkersLayer);
      plainMarker.addTo(plainMarkersLayer);
    });

    table.setData(visiblePoints);
    updateMetrics(visiblePoints);
    if (reframeMap) {
      fitToVisiblePoints(visiblePoints);
    }
  }

  function resetSelect(select, label) {
    select.replaceChildren(new Option(label, ""));
    select.value = "";
  }

  function setMissionScopedFilters(options) {
    const equipeSelect = document.getElementById("sig-equipe-filter");
    const agentSelect = document.getElementById("sig-agent-filter");
    resetSelect(equipeSelect, filterLabels.allTeams || t("team"));
    resetSelect(agentSelect, filterLabels.allAgents || t("agent"));

    (options.equipes || []).forEach(function (equipe) {
      equipeSelect.add(new Option(equipe.nom_equipe, String(equipe.id)));
    });
    (options.agents || []).forEach(function (agent) {
      const name = [agent.code_agent, [agent.prenoms, agent.nom].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" - ");
      agentSelect.add(new Option(name, String(agent.id)));
    });

    const enabled = Boolean(document.getElementById("sig-mission-filter").value);
    equipeSelect.disabled = !enabled;
    agentSelect.disabled = !enabled;
  }

  async function loadMissionScopedFilters(missionId) {
    showLoading();
    if (!missionId) {
      setMissionScopedFilters({ equipes: [], agents: [] });
      renderPoints(true);
      hideLoading();
      return;
    }

    try {
      const response = await fetch(`/cartographie/options?mission_id=${encodeURIComponent(missionId)}`, {
        headers: { Accept: "application/json" }
      });
      setMissionScopedFilters(response.ok ? await response.json() : { equipes: [], agents: [] });
      renderPoints(true);
    } finally {
      hideLoading();
    }
  }

  function setClustering(enabled) {
    clusteringEnabled = enabled;
    collectionLayer.removeLayer(activeMarkersLayer);
    activeMarkersLayer = clusteringEnabled ? clusteredMarkersLayer : plainMarkersLayer;
    collectionLayer.addLayer(activeMarkersLayer);
    clusterToggle.setAttribute("aria-pressed", String(clusteringEnabled));
    clusterToggle.classList.toggle("is-active", clusteringEnabled);
    clusterToggle.title = clusteringEnabled
      ? t("clusterDisable")
      : t("clusterEnable");
  }

  document.getElementById("sig-filters").addEventListener("change", function (event) {
    if (event.target.id === "sig-mission-filter") {
      loadMissionScopedFilters(event.target.value);
      return;
    }
    renderPoints(true);
  });
  document.getElementById("sig-reset-filters").addEventListener("click", function () {
    document.getElementById("sig-filters").reset();
    setMissionScopedFilters({ equipes: [], agents: [] });
    renderPoints(true);
  });
  clusterToggle.addEventListener("click", function () {
    setClustering(!clusteringEnabled);
  });
  toolsToggle.addEventListener("click", function () {
    setToolsOpen(!workspace.classList.contains("is-tools-open"));
  });
  toolsClose.addEventListener("click", function () {
    setToolsOpen(false);
  });
  mapLegendToggle.addEventListener("click", function () {
    const isCollapsed = mapLegend.classList.toggle("is-collapsed");
    mapLegendToggle.setAttribute("aria-expanded", String(!isCollapsed));
    mapLegendToggle.setAttribute(
      "aria-label",
      isCollapsed ? t("legendExpand") : t("legendCollapse")
    );
  });

  let resizing = false;

  function setToolWidth(pointerX) {
    const rect = workspace.getBoundingClientRect();
    const separatorWidth = resizer.offsetWidth;
    const minimumToolsWidth = Math.min(285, rect.width / 2);
    const maximumToolsWidth = (rect.width * (2 / 3)) - separatorWidth;
    const width = Math.max(minimumToolsWidth, Math.min(pointerX - rect.left, maximumToolsWidth));
    workspace.style.setProperty("--sig-tools-width", `${width}px`);
    map.invalidateSize();
  }

  resizer.addEventListener("pointerdown", function (event) {
    if (window.matchMedia("(max-width: 800px)").matches) {
      return;
    }
    resizing = true;
    workspace.classList.add("is-resizing");
    resizer.setPointerCapture(event.pointerId);
    setToolWidth(event.clientX);
  });

  resizer.addEventListener("pointermove", function (event) {
    if (resizing) {
      setToolWidth(event.clientX);
    }
  });

  resizer.addEventListener("pointerup", function (event) {
    resizing = false;
    workspace.classList.remove("is-resizing");
    resizer.releasePointerCapture(event.pointerId);
  });

  resizer.addEventListener("pointercancel", function () {
    resizing = false;
    workspace.classList.remove("is-resizing");
  });

  resizer.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const currentWidth = document.getElementById("sig-tools").getBoundingClientRect().width;
    const increment = event.key === "ArrowRight" ? 20 : -20;
    setToolWidth(workspace.getBoundingClientRect().left + currentWidth + increment);
    event.preventDefault();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      setToolsOpen(false);
    }
  });

  showLoading();
  window.requestAnimationFrame(function () {
    try {
      if (territoryLayer.getBounds().isValid()) {
        map.fitBounds(territoryLayer.getBounds(), { padding: [12, 12] });
      }
      renderCategoryLegend();
      setMissionScopedFilters({ equipes: [], agents: [] });
      renderPoints(false);
    } finally {
      hideLoading();
    }
  });
}());

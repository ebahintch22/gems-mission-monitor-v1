(function () {
  const points = JSON.parse(document.getElementById("sig-points-data").textContent);
  const regions = JSON.parse(document.getElementById("sig-regions-data").textContent);
  const workspace = document.getElementById("sig-workspace");
  const resizer = document.getElementById("sig-resizer");
  const toolsToggle = document.getElementById("sig-tools-toggle");
  const toolsClose = document.getElementById("sig-tools-close");
  const mapLegend = document.getElementById("sig-map-legend");
  const mapLegendToggle = document.getElementById("sig-map-legend-toggle");
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
  const baseLayers = {
    "Couche Humanitaire": L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors, Humanitarian OpenStreetMap Team"
    }),
    "Couche Routière": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors"
    }),
    "OSM Open Topo": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "&copy; OpenTopoMap, données &copy; OpenStreetMap contributors"
    }),
    "Carto Positron (Grayscale)": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
      subdomains: "abcd",
      maxZoom: 19
    }),
    "Esri Gray (WLGB)": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri, DeLorme, NAVTEQ",
      maxZoom: 16
    }),
    "Couche Google Maps": L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      attribution: "&copy; Google Maps",
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      maxZoom: 20
    }),
    "Couche ESRI (Satellite)": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19
    })
  };

  baseLayers["Couche Routière"].addTo(map);

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
    "Points de collecte": collectionLayer,
    "Limites régionales": territoryLayer
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
  mapControlToggle.setAttribute("aria-label", "Deplier les controles de carte");
  mapControlToggleIcon.className = "fa-solid fa-chevron-down";
  mapControlToggleIcon.setAttribute("aria-hidden", "true");
  mapControlToggleLabel.textContent = "Couches";
  mapControlToggle.append(mapControlToggleIcon, mapControlToggleLabel);
  mapControlContainer.prepend(mapControlToggle);
  L.DomEvent.disableClickPropagation(mapControlContainer);
  L.DomEvent.disableScrollPropagation(mapControlContainer);

  mapControlToggle.addEventListener("click", function () {
    const isCollapsed = mapControlContainer.classList.toggle("is-collapsed");
    mapControlToggle.setAttribute("aria-expanded", String(!isCollapsed));
    mapControlToggle.setAttribute(
      "aria-label",
      isCollapsed ? "Deplier les controles de carte" : "Replier les controles de carte"
    );
    mapControlToggleIcon.className = isCollapsed
      ? "fa-solid fa-chevron-down"
      : "fa-solid fa-chevron-up";
  });

  const siteIdentification = document.getElementById("site-identification");
  const siteIdentificationTitle = document.getElementById("site-identification-title");
  const siteIdentificationSubtitle = document.getElementById("site-identification-subtitle");
  const siteIdentificationStatus = document.getElementById("site-identification-status");
  const siteIdentificationBody = document.getElementById("site-identification-body");
  const siteIdentificationClose = document.getElementById("site-identification-close");

  const table = new Tabulator("#sig-table", {
    data: [],
    height: 270,
    layout: "fitColumns",
    placeholder: "Aucune soumission pour ces criteres",
    columns: [
      { title: "Agent", field: "code_agent", minWidth: 80 },
      { title: "Equipe", field: "nom_equipe", minWidth: 115 },
      { title: "Sous-pref.", field: "nom_sous_prefecture", minWidth: 115 },
      { title: "Statut", field: "statut_validation", minWidth: 95 }
    ],
    rowClick: function (event, row) {
      showSiteIdentification(row.getData());
    }
  });

  function popupContent(point) {
    const content = document.createElement("div");
    const heading = document.createElement("strong");
    const agent = document.createElement("div");
    const locality = document.createElement("div");
    const date = document.createElement("div");
    const status = document.createElement("div");

    heading.textContent = point.source_submission_id;
    agent.textContent = `${point.code_agent || "Agent non rattache"} - ${point.nom_equipe || "Sans equipe"}`;
    locality.textContent = [
      point.nom_sous_prefecture,
      point.nom_departement,
      point.nom_region
    ].filter(Boolean).join(", ");
    date.textContent = new Date(point.submitted_at).toLocaleString("fr-FR");
    status.textContent = `Validation : ${point.statut_validation.replace("_", " ")}`;
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

  function valueOrDash(value) {
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    return String(value);
  }

  function statusLabel(status) {
    return {
      validee: "Validee",
      a_verifier: "A verifier",
      rejetee: "Rejetee"
    }[status] || valueOrDash(status);
  }

  function addSection(title, rows) {
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
    siteIdentificationBody.append(section);
  }

  function showSiteIdentification(point) {
    const raw = rawData(point);
    const modA = raw.modA || {};
    const modB = raw.modB || {};
    const modC = raw.modC || {};
    const modD = raw.modD || {};
    const modE = raw.modE || {};
    const modN = raw.modN || {};
    const siteName = modB.nom_officiel || point.source_submission_id;
    const latitude = Number(point.latitude).toFixed(6);
    const longitude = Number(point.longitude).toFixed(6);

    siteIdentificationTitle.textContent = siteName;
    siteIdentificationSubtitle.textContent = [
      modA.id_entite,
      point.nom_sous_prefecture,
      point.nom_region
    ].filter(Boolean).join(" - ");
    siteIdentificationStatus.className = `site-identification-status status-${point.statut_validation}`;
    siteIdentificationStatus.textContent = statusLabel(point.statut_validation);
    siteIdentificationBody.replaceChildren();

    addSection("Identification", [
      ["ID fiche", modA.fiche_id || point.source_submission_id],
      ["ID entite", modA.id_entite],
      ["Nom officiel", modB.nom_officiel],
      ["Ministere", modB.ministere],
      ["Type", modB.type_infra],
      ["Statut", modB.statut_fonct],
      ["Condition", modA.conditions]
    ]);
    addSection("Localisation", [
      ["Region", modB.region || point.nom_region],
      ["Departement", modB.departement || point.nom_departement],
      ["Sous-pref.", modB.sous_prefecture || point.nom_sous_prefecture],
      ["Commune", modB.commune],
      ["Milieu", modB.milieu],
      ["Latitude", latitude],
      ["Longitude", longitude],
      ["Precision", `${valueOrDash(point.precision_m)} m`]
    ]);
    addSection("Collecte", [
      ["Mission", point.mission_name],
      ["Equipe", point.nom_equipe],
      ["Agent", point.code_agent],
      ["Soumis le", new Date(point.submitted_at).toLocaleString("fr-FR")],
      ["Anomalies", point.anomaly_count]
    ]);
    addSection("Caracteristiques", [
      ["Batiments", modC.nb_batiments],
      ["Personnel", modC.personnel],
      ["Public cible", modC.utilisateurs_cible],
      ["Electricite", modD.electricite],
      ["Source elec.", modD.source_elec],
      ["Disponibilite", modD.dispo_jour],
      ["Operateurs", modE.operateurs],
      ["Qualite Orange", modE.orange_qual],
      ["Debit mobile", modE.debit_mob_desc],
      ["Observations", modN.observations]
    ]);

    siteIdentification.classList.add("is-open");
    siteIdentification.setAttribute("aria-hidden", "false");
  }

  function hideSiteIdentification() {
    siteIdentification.classList.remove("is-open");
    siteIdentification.setAttribute("aria-hidden", "true");
  }

  function setToolsOpen(open) {
    workspace.classList.toggle("is-tools-open", open);
    toolsToggle.setAttribute("aria-expanded", String(open));
    toolsToggle.setAttribute(
      "aria-label",
      open ? "Masquer les outils cartographiques" : "Afficher les outils cartographiques"
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
      const markerOptions = {
        pane: "collectionPointsPane",
        color: colors[point.statut_validation],
        fillColor: colors[point.statut_validation],
        fillOpacity: 0.8,
        radius: 5,
        weight: 1
      };
      const clusteredMarker = L.circleMarker([point.latitude, point.longitude], markerOptions)
        .bindPopup(popupContent(point));
      const plainMarker = L.circleMarker([point.latitude, point.longitude], markerOptions)
        .bindPopup(popupContent(point));
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

  function setClustering(enabled) {
    clusteringEnabled = enabled;
    collectionLayer.removeLayer(activeMarkersLayer);
    activeMarkersLayer = clusteringEnabled ? clusteredMarkersLayer : plainMarkersLayer;
    collectionLayer.addLayer(activeMarkersLayer);
    clusterToggle.setAttribute("aria-pressed", String(clusteringEnabled));
    clusterToggle.classList.toggle("is-active", clusteringEnabled);
    clusterToggle.title = clusteringEnabled
      ? "Desactiver le clustering des sites collectes"
      : "Activer le clustering des sites collectes";
  }

  document.getElementById("sig-filters").addEventListener("change", function () {
    renderPoints(true);
  });
  document.getElementById("sig-reset-filters").addEventListener("click", function () {
    document.getElementById("sig-filters").reset();
    renderPoints(true);
  });
  clusterToggle.addEventListener("click", function () {
    setClustering(!clusteringEnabled);
  });
  siteIdentificationClose.addEventListener("click", hideSiteIdentification);
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
      isCollapsed ? "Deplier la legende" : "Replier la legende"
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

  if (territoryLayer.getBounds().isValid()) {
    map.fitBounds(territoryLayer.getBounds(), { padding: [12, 12] });
  }
  renderPoints(false);
}());

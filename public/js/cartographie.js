(function () {
  const points = JSON.parse(document.getElementById("sig-points-data").textContent);
  const regions = JSON.parse(document.getElementById("sig-regions-data").textContent);
  const siteCategoryIcons = JSON.parse(document.getElementById("sig-site-category-icons-data").textContent);
  const administrativeChoices = JSON.parse(document.getElementById("sig-administrative-choices-data")?.textContent || "{}");
  const administrativeChoiceLists = administrativeChoices.__choices || {};
  const geometryImportConfig = JSON.parse(document.getElementById("sig-geometry-import-config-data")?.textContent || "{}");
  let markerBounceDurationMs = 600;
  const i18nPayload = JSON.parse(document.getElementById("sig-i18n-data").textContent);
  const messages = i18nPayload.messages || {};
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
  const koboLightTriggers = document.querySelectorAll("[data-kobo-light-open]");
  const mapLegend = document.getElementById("sig-map-legend");
  const mapLegendToggle = document.getElementById("sig-map-legend-toggle");
  const mapLegendItems = document.getElementById("sig-map-legend-items");
  const mapFooterBand = document.getElementById("sig-map-footer-band");
  const coordinateControlContainer = document.getElementById("sig-coordinate-control");
  const mapPane = document.getElementById("sig-map-pane");
  const geometryImportOpen = document.getElementById("sig-geometry-import-open");
  const geometryImportInput = document.getElementById("sig-geometry-import-input");
  const visitedSitesSearchControl = document.getElementById("sig-visited-sites-search-control");
  const visitedSitesSearchInput = document.getElementById("sig-visited-sites-search");
  const visitedSitesSearchClear = document.getElementById("sig-visited-sites-search-clear");
  const geometryOverlay = document.getElementById("sig-geometry-overlay");
  const geometryOverlayHandle = document.getElementById("sig-geometry-overlay-handle");
  const geometryOverlayBody = document.getElementById("sig-geometry-results-body");
  const geometryClear = document.getElementById("sig-geometry-clear");
  const buildingsOpen = document.getElementById("sig-buildings-open");
  const sitesPlanningOpen = document.getElementById("sig-sites-planning-open");
  const measureToggle = document.getElementById("sig-measure-toggle");
  const loadingOverlay = document.getElementById("sig-loading-overlay");
  const map = L.map("sig-map", { maxZoom: 20 , zoomSnap: 0.1, zoomDelta: 0.1}).setView([7.54, -5.55], 6);
  applyMarkerBounceConfig();
  const CartographieSessionState = {
    key: "g2m.cartographie.session.v1",
    load() {
      try {
        return JSON.parse(sessionStorage.getItem(this.key));
      } catch (error) {
        return null;
      }
    },
    save(state) {
      try {
        sessionStorage.setItem(this.key, JSON.stringify({
          ...state,
          savedAt: Date.now()
        }));
      } catch (error) {
        // Session storage can be unavailable in hardened browser modes.
      }
    },
    clear() {
      try {
        sessionStorage.removeItem(this.key);
      } catch (error) {
        // Ignore storage errors; the cartography view must remain usable.
      }
    }
  };
  const savedContext = CartographieSessionState.load();
  let isRestoringContext = false;
  let activeBaseLayerName = t("layerRoad");
  let activeLayerContext = { id: "root", submissionId: null };
  let userDefinedToolsWidth = normalizeToolsWidth(savedContext?.layout?.toolsWidth);
  let contextPersistenceFrozenUntil = 0;
  const importedGeometryStyleKey = "g2m.sig.importedGeometryStyle.v1";
  let importedGeometryStylePrefs = loadImportedGeometryStylePrefs();
  const preparedBuildingStyleKey = "g2m.sig.preparedBuildingStyle.v1";
  let preparedBuildingStylePrefs = loadPreparedBuildingStylePrefs();
  let siteContourStylePrefs = loadConfiguredMapFeatureStyle(geometryImportConfig.siteContourStyle, {
    strokeColor: "#006b5b",
    strokeWeight: 2,
    dashStyle: "solid",
    fillOpacity: 0.12
  });
  let planningOsmBuildingStylePrefs = loadConfiguredMapFeatureStyle(geometryImportConfig.osmBuildingStyle, {
    strokeColor: "#7c3aed",
    strokeWeight: 2,
    dashStyle: "dashed",
    fillOpacity: 0.28
  });
  const spatialReferenceStylePrefs = {
    siteContour: loadConfiguredMapFeatureStyle(geometryImportConfig.spatialReferenceStyle?.siteContour, {
      strokeColor: "#00ffff",
      fillColor: "#ffffff",
      strokeWeight: 3,
      dashStyle: "solid",
      fillOpacity: 0.22
    }),
    buildingExtent: loadConfiguredMapFeatureStyle(geometryImportConfig.spatialReferenceStyle?.buildingExtent, {
      strokeColor: "#dc2626",
      fillColor: "#facc15",
      strokeWeight: 2,
      dashStyle: "solid",
      fillOpacity: 0.34
    }),
    network: {
      pyloneColor: geometryImportConfig.spatialReferenceStyle?.network?.pyloneColor || "#dc2626",
      chamberFillColor: geometryImportConfig.spatialReferenceStyle?.network?.chamberFillColor || "#facc15",
      chamberStrokeColor: geometryImportConfig.spatialReferenceStyle?.network?.chamberStrokeColor || "#dc2626",
      chamberRadius: Number(geometryImportConfig.spatialReferenceStyle?.network?.chamberRadius) || 7
    }
  };
  map.createPane("territoryPane");
  map.getPane("territoryPane").style.zIndex = 410;
  map.createPane("collectionPointsPane");
  map.getPane("collectionPointsPane").style.zIndex = 450;
  const clusterToggle = document.getElementById("sig-cluster-toggle");
  const collectionLayer = L.layerGroup().addTo(map);
  const importedGeometryLayer = L.geoJSON(null, {
    style: importedGeometryStyle,
    pointToLayer(feature, latlng) {
      return L.marker(latlng, {
        icon: importedGeometryPointIcon()
      });
    },
    onEachFeature(feature, layer) {
      const props = feature.properties || {};
      layer.bindPopup([
        props.nomSite,
        props.batiment,
        props.denomination
      ].filter(Boolean).join("<br>"));
    }
  }).addTo(map);
  const preparedBuildingsLayer = L.geoJSON(null, {
    style: preparedBuildingStyle,
    onEachFeature(feature, layer) {
      const props = feature.properties || {};
      layer.bindPopup([
        `<strong>${escapeHtml(props.building_code || "Bâtiment")}</strong>`,
        props.site_name ? escapeHtml(props.site_name) : "",
        props.status ? `Statut : ${escapeHtml(props.status)}` : "",
        props.source ? `Source : ${escapeHtml(props.source)}` : ""
      ].filter(Boolean).join("<br>"));
    }
  }).addTo(map);
  const printExtentLayer = L.layerGroup().addTo(map);
  const measureLayer = L.layerGroup().addTo(map);
  const sitesPlanningGeometryLayer = L.layerGroup().addTo(map);
  const spatialReferenceFocusLayer = L.layerGroup().addTo(map);
  const osmSelectionLayer = L.geoJSON(null, {
    style: {
      color: "#6f42c1",
      dashArray: "4,4",
      fillColor: "#6f42c1",
      fillOpacity: 0.08,
      opacity: 1,
      weight: 2
    }
  }).addTo(map);
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
  let importedGeometryRows = [];
  let importedGeometryTable = null;
  let importedGeometryTableHost = null;
  let preparedBuildingsTable = null;
  let preparedBuildingsData = [];
  let preparedBuildingsFeatureCollection = { type: "FeatureCollection", features: [] };
  let preparedBuildingSiteSuggestions = { missionId: null, siteCodes: [], siteNames: [] };
  let sitesPlanningTable = null;
  let sitesPlanningTree = null;
  let sitesPlanningData = [];
  let sitesPlanningSelection = null;
  let sitesPlanningOsmImportResults = [];
  let sitesPlanningOsmImportRunning = false;
  let sitesPlanningOsmSitesTable = null;
  let sitesPlanningOsmResultsTable = null;
  let sitesPlanningExportTable = null;
  const sitesPlanningOsmRequestTimeoutPassesMs = [30000, 60000];
  const sitesPlanningColumnPrefsKey = "g2m.sig.sitesPlanningColumns.v1";
  const visitedSitesColumnPrefsKey = "g2m.sig.visitedSitesColumns.v1";
  const visitedSitesMandatoryColumns = ["_id", "modB/nom_officiel", "modB/region", "modB/ministere"];
  const visitedSitesDefaultColumns = [
    "_id",
    "today",
    "modA/fiche_id",
    "modB/nom_officiel",
    "modB/region",
    "modB/ministere",
    "modB/commune",
    "modB/statut_fonct",
    "_submission_time"
  ];
  const visitedSitesAvailableColumns = [
    { field: "_id", title: "_id", locked: true },
    { field: "today", title: "Date jour" },
    { field: "modA/fiche_id", title: "ID fiche" },
    { field: "modA/enqueteur", title: "Enquêteur" },
    { field: "modA/equipe_num", title: "Équipe Kobo" },
    { field: "modA/superviseur2", title: "Superviseur" },
    { field: "modB/nom_officiel", title: "Nom officiel", locked: true, minWidth: 190, formatter: siteNameFormatter },
    { field: "modB/region", title: "Région", locked: true, formatter: administrativeChoiceFormatter },
    { field: "modB/departement", title: "Département", formatter: administrativeChoiceFormatter },
    { field: "modB/sous_prefecture", title: "Sous-préfecture", formatter: administrativeChoiceFormatter },
    { field: "modB/ministere", title: "Ministère", locked: true, formatter: administrativeChoiceFormatter },
    { field: "modB/nom_structure", title: "Nom structure" },
    { field: "modB/commune", title: "Commune" },
    { field: "modB/statut_fonct", title: "Statut fonctionnement" },
    { field: "modB/annee_creation", title: "Année création" },
    { field: "_geolocation", title: "Géolocalisation", minWidth: 140 },
    { field: "_submission_time", title: "Date soumission", minWidth: 135, formatter: visitedSiteDateFormatter }
  ];
  const georeferencingAbandonReasonLabels = {
    SITE_INTROUVABLE_SUR_BASEMAP: "Site introuvable sur basemap",
    IMAGERIE_INSUFFISANTE: "Imagerie insuffisante",
    COUVERTURE_BASEMAP_ABSENTE: "Couverture basemap absente",
    SITE_MASQUE_OU_OBSTRUE: "Site masque ou obstrue",
    CONTOUR_NON_DISCERNABLE: "Contour non discernable",
    SITE_CONFONDU_AVEC_ENVIRONNEMENT: "Site confondu avec l'environnement",
    LOCALISATION_INITIALE_TROP_INCERTAINE: "Localisation initiale trop incertaine"
  };
  const sitesPlanningTableColumns = [
    { title: "Code", field: "code", minWidth: 95 },
    { title: "Site", field: "site_name", minWidth: 190 },
    { title: "REGION", field: "region", minWidth: 145 },
    { title: "MINISTERE", field: "ministere", minWidth: 110 },
    { title: "LOCALITE", field: "localite", minWidth: 120 },
    { title: "Statut", field: "statut", minWidth: 95, formatter: sitesPlanningStatusFormatter },
    { title: "Georef.", field: "georeferencing_status", minWidth: 95, formatter: sitesPlanningGeoreferencingStatusFormatter },
    { title: "Motif d'abandon", field: "georeferencing_abandon_reason", minWidth: 190, formatter: sitesPlanningGeoreferencingReasonFormatter },
    { title: "Date prevue", field: "planned_visit_date", minWidth: 115, formatter: sitesPlanningDateFormatter },
    { title: "Date reelle", field: "actual_visit_date", minWidth: 115, formatter: sitesPlanningDateFormatter },
    { title: "Ecart", field: "schedule_gap_label", minWidth: 95 }
  ];
  let selectedPlanningSite = null;
  let planningLocationMode = null;
  let planningContourPoints = [];
  let planningReferenceMarker = null;
  let planningContourLayer = null;
  let planningOsmBuildingsLayer = null;
  let planningSpatialReferenceLayers = { siteContours: null, buildingExtents: null, networkPoints: null };
  let spatialReferenceRequestToken = 0;
  let planningDraftLayer = null;
  let planningDraftPointGeo = null;
  let planningDraftPolygonGeo = null;
  let selectedPreparedBuildingId = null;
  let selectedSiteId = null;
  const experimentalSiteLabelsEnabled = true;
  const siteLabelMinZoom = 14;
  const siteLabelCollisionPadding = 4;
  let siteLabelCollisionFrame = null;
  const siteMarkersById = new Map();
  const markerBounceTimers = new WeakMap();
  let osmSelectionMode = null;
  let osmSelectionPoints = [];
  let osmSelectionGeometry = null;
  let printExtentMode = false;
  let printExtentPoints = [];
  let printExtentBounds = null;
  let printExtentValidated = false;
  let printExtentRectangle = null;
  let printExtentHandles = [];
  let activePrintExtentForm = null;
  let measureMode = false;
  let measurePoints = [];
  let measureLine = null;
  let measureTotalMeters = 0;
  let measureStatusNode = null;
  let measureControlContainer = null;
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
    [t("layerGoogleSatellite")]: L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
      attribution: "&copy; Google Satellite",
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      maxZoom: 20
    }),
    [t("layerEsriSatellite")]: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19
    })
  };

  baseLayers[activeBaseLayerName].addTo(map);

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

  function loadImportedGeometryStylePrefs() {
    const defaults = {
      strokeColor: "#FF0000",
      highlightColor: "#0000FF",
      strokeWeight: 2,
      dashStyle: "dashed"
    };
    try {
      return normalizeImportedGeometryStylePrefs({
        ...defaults,
        ...JSON.parse(localStorage.getItem(importedGeometryStyleKey) || "{}")
      });
    } catch (error) {
      return defaults;
    }
  }

  function normalizeImportedGeometryStylePrefs(prefs) {
    return {
      ...normalizeStrokeStylePrefs(prefs, {
        strokeColor: "#FF0000",
        strokeWeight: 2,
        dashStyle: "dashed"
      }),
      highlightColor: /^#[0-9a-f]{6}$/i.test(prefs.highlightColor || "") ? prefs.highlightColor : "#0000FF"
    };
  }

  function saveImportedGeometryStylePrefs(prefs) {
    importedGeometryStylePrefs = normalizeImportedGeometryStylePrefs(prefs);
    try {
      localStorage.setItem(importedGeometryStyleKey, JSON.stringify(importedGeometryStylePrefs));
    } catch (error) {
      // The map remains usable if browser storage is disabled.
    }
    applyImportedGeometryStyles();
  }

  function importedGeometryDashArray() {
    return dashArrayForStyle(importedGeometryStylePrefs.dashStyle);
  }

  function dashArrayForStyle(dashStyle) {
    return {
      solid: null,
      dashed: "5,5",
      dotted: "1,5",
      dashdot: "8,4,2,4"
    }[dashStyle] || "5,5";
  }

  function applyImportedGeometryStyles() {
    importedGeometryLayer.eachLayer((layer) => {
      if (typeof layer.setStyle === "function") {
        layer.setStyle(importedGeometryStyle());
      } else if (typeof layer.setIcon === "function") {
        layer.setIcon(importedGeometryPointIcon());
      }
    });
  }

  function importedGeometryStyle(options = {}) {
    const highlighted = options.highlighted === true;
    return {
      color: highlighted ? importedGeometryStylePrefs.highlightColor : importedGeometryStylePrefs.strokeColor,
      dashArray: highlighted ? null : importedGeometryDashArray(),
      fill: false,
      fillOpacity: 0,
      opacity: 1,
      weight: highlighted ? importedGeometryStylePrefs.strokeWeight + 2 : importedGeometryStylePrefs.strokeWeight
    };
  }

  function importedGeometryPointIcon(options = {}) {
    const highlighted = options.highlighted === true;
    const color = highlighted ? importedGeometryStylePrefs.highlightColor : importedGeometryStylePrefs.strokeColor;
    const size = highlighted ? 28 : 22;
    return L.divIcon({
      className: "sig-imported-geometry-marker",
      html: `<span class="sig-imported-geometry-marker-pin" style="--geometry-marker-color: ${color}; --geometry-marker-size: ${size - 4}px;"></span>`,
      iconSize: [size, size],
      iconAnchor: [Math.round(size / 2), size],
      popupAnchor: [0, -size]
    });
  }

  function loadPreparedBuildingStylePrefs() {
    const defaults = {
      strokeColor: "#1f4e79",
      strokeWeight: 2,
      dashStyle: "dashed"
    };
    try {
      return normalizePreparedBuildingStylePrefs({
        ...defaults,
        ...JSON.parse(localStorage.getItem(preparedBuildingStyleKey) || "{}")
      });
    } catch (error) {
      return defaults;
    }
  }

  function normalizePreparedBuildingStylePrefs(prefs) {
    return normalizeStrokeStylePrefs(prefs, {
      strokeColor: "#1f4e79",
      strokeWeight: 2,
      dashStyle: "dashed"
    });
  }

  function normalizeStrokeStylePrefs(prefs, defaults) {
    const dashStyles = new Set(["solid", "dashed", "dotted", "dashdot"]);
    const hexColor = /^#[0-9a-f]{6}$/i;
    return {
      strokeColor: hexColor.test(prefs.strokeColor || "") ? prefs.strokeColor : defaults.strokeColor,
      strokeWeight: Math.max(1, Math.min(12, Number.parseInt(prefs.strokeWeight, 10) || defaults.strokeWeight)),
      dashStyle: dashStyles.has(prefs.dashStyle) ? prefs.dashStyle : defaults.dashStyle
    };
  }

  function loadConfiguredMapFeatureStyle(prefs, defaults) {
    const strokeStyle = normalizeStrokeStylePrefs(prefs || {}, {
      strokeColor: defaults.strokeColor,
      strokeWeight: defaults.strokeWeight,
      dashStyle: defaults.dashStyle
    });
    const fillOpacity = Number(prefs?.fillOpacity);
    const fillColor = /^#[0-9a-f]{6}$/i.test(prefs?.fillColor || "")
      ? prefs.fillColor
      : defaults.fillColor || defaults.strokeColor;
    return {
      ...strokeStyle,
      fillColor,
      fillOpacity: Number.isFinite(fillOpacity) && fillOpacity >= 0 && fillOpacity <= 1
        ? fillOpacity
        : defaults.fillOpacity
    };
  }

  function mapFeatureStyle(prefs) {
    return {
      color: prefs.strokeColor,
      dashArray: dashArrayForStyle(prefs.dashStyle),
      fill: true,
      fillColor: prefs.fillColor || prefs.strokeColor,
      fillOpacity: prefs.fillOpacity,
      opacity: 1,
      weight: prefs.strokeWeight
    };
  }

  function savePreparedBuildingStylePrefs(prefs) {
    preparedBuildingStylePrefs = normalizePreparedBuildingStylePrefs(prefs);
    try {
      localStorage.setItem(preparedBuildingStyleKey, JSON.stringify(preparedBuildingStylePrefs));
    } catch (error) {
      // The map remains usable if browser storage is disabled.
    }
    applyPreparedBuildingStyles();
  }

  function applyPreparedBuildingStyles() {
    preparedBuildingsLayer.eachLayer((layer) => {
      if (typeof layer.setStyle === "function") {
        layer.setStyle(preparedBuildingStyle(layer.feature));
      }
    });
  }

  function preparedBuildingStyle(feature) {
    const status = feature?.properties?.status || "prepare";
    const statusColor = {
      prepare: "#7f7f7f",
      transmis_terrain: "#1f4e79",
      verifie_terrain: "#16856f",
      a_corriger: "#d38b13",
      valide: "#0f766e",
      archive: "#777777"
    }[status] || "#1f4e79";
    const color = preparedBuildingStylePrefs.strokeColor || statusColor;
    return {
      color,
      dashArray: dashArrayForStyle(preparedBuildingStylePrefs.dashStyle),
      fill: true,
      fillColor: color,
      fillOpacity: 0.12,
      opacity: 1,
      weight: preparedBuildingStylePrefs.strokeWeight
    };
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
    [t("layerRegionalBoundaries")]: territoryLayer,
    "Bâtiments préparés": preparedBuildingsLayer,
    "Géométries importées": importedGeometryLayer
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
  mapFooterBand?.append(mapControlContainer);

  function setMapControlCollapsed(collapsed, options = {}) {
    const isCollapsed = Boolean(collapsed);
    mapControlContainer.classList.toggle("is-collapsed", isCollapsed);
    mapControlToggle.setAttribute("aria-expanded", String(!isCollapsed));
    mapControlToggle.setAttribute(
      "aria-label",
      isCollapsed ? t("layersExpand") : t("layersCollapse")
    );
    mapControlToggleIcon.className = isCollapsed
      ? "fa-solid fa-chevron-down"
      : "fa-solid fa-chevron-up";
    if (options.saveState !== false) {
      saveCurrentCartographyContext();
    }
  }

  function setLegendCollapsed(collapsed, options = {}) {
    const isCollapsed = Boolean(collapsed);
    mapLegend.classList.toggle("is-collapsed", isCollapsed);
    mapLegendToggle.setAttribute("aria-expanded", String(!isCollapsed));
    mapLegendToggle.setAttribute(
      "aria-label",
      isCollapsed ? t("legendExpand") : t("legendCollapse")
    );
    if (options.saveState !== false) {
      saveCurrentCartographyContext();
    }
  }

  mapControlToggle.addEventListener("click", function () {
    setMapControlCollapsed(!mapControlContainer.classList.contains("is-collapsed"));
  });

  mapControlContainer.addEventListener("mouseleave", function () {
    if (!mapControlContainer.classList.contains("is-collapsed")) {
      setMapControlCollapsed(true);
    }
  });

  mapControlContainer.addEventListener("focusout", function (event) {
    if (!mapControlContainer.contains(event.relatedTarget)) {
      setMapControlCollapsed(true);
    }
  });

  if (coordinateControlContainer) {
    L.DomEvent.disableClickPropagation(coordinateControlContainer);
  }

  const measureControl = L.control({ position: "bottomleft" });
  measureControl.onAdd = function () {
    const container = L.DomUtil.create("div", "sig-measure-control");
    measureControlContainer = container;
    const actions = L.DomUtil.create("div", "sig-measure-actions", container);
    const clearButton = L.DomUtil.create("button", "", actions);
    clearButton.type = "button";
    clearButton.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i><span>Effacer</span>';
    measureStatusNode = L.DomUtil.create("div", "sig-measure-status", container);
    measureStatusNode.textContent = "Distance : 0 m";
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    L.DomEvent.on(clearButton, "click", function () {
      clearMeasure();
    });
    return container;
  };
  measureControl.addTo(map);
  setMeasureMode(false);

  measureToggle?.addEventListener("click", function () {
    setMeasureMode(!measureMode);
  });

  map.on("mousemove", function (event) {
    updateCoordinateControl(event.latlng);
    updateMeasurePreview(event.latlng);
  });

  function updateCoordinateControl(latlng) {
    if (!coordinateControlContainer || !latlng) {
      return;
    }
    coordinateControlContainer.textContent = `Longitude - Latitude : ${formatCoordinate(latlng.lng)} - ${formatCoordinate(latlng.lat)}`;
  }

  function formatCoordinate(value) {
    return Number(value).toFixed(6);
  }

  function setMeasureMode(enabled) {
    measureMode = Boolean(enabled);
    map.getContainer().classList.toggle("is-measuring", measureMode);
    measureControlContainer?.classList.toggle("is-open", measureMode);
    if (measureToggle) {
      measureToggle.classList.toggle("is-active", measureMode);
      measureToggle.setAttribute("aria-pressed", String(measureMode));
      measureToggle.setAttribute(
        "aria-label",
        measureMode ? "Masquer les outils de mesure" : "Afficher les outils de mesure"
      );
      measureToggle.setAttribute(
        "title",
        measureMode ? "Masquer les outils de mesure" : "Afficher les outils de mesure"
      );
    }
    updateMeasureStatus();
  }

  function handleMeasureClick(event) {
    if (!measureMode) {
      return false;
    }
    const latlng = event.latlng;
    const previous = measurePoints[measurePoints.length - 1];
    if (previous) {
      measureTotalMeters += map.distance(previous, latlng);
    }
    measurePoints.push(latlng);
    renderMeasure();
    updateMeasureStatus();
    return true;
  }

  function renderMeasure() {
    measureLayer.clearLayers();
    measureLine = null;
    if (measurePoints.length > 1) {
      measureLine = L.polyline(measurePoints, {
        color: "#0f766e",
        opacity: 0.9,
        weight: 3
      }).addTo(measureLayer);
    }
    let cumulative = 0;
    measurePoints.forEach((latlng, index) => {
      if (index > 0) {
        cumulative += map.distance(measurePoints[index - 1], latlng);
      }
      const marker = L.circleMarker(latlng, {
        color: "#0f766e",
        fillColor: "#ffffff",
        fillOpacity: 1,
        radius: 5,
        weight: 2
      }).addTo(measureLayer);
      marker.bindTooltip(index === 0 ? "0 m" : formatDistanceMeters(cumulative), {
        direction: "top",
        offset: [0, -6],
        permanent: true
      });
    });
  }

  function updateMeasurePreview(latlng) {
    if (!measureMode || !latlng || !measurePoints.length) {
      updateMeasureStatus();
      return;
    }
    const lastPoint = measurePoints[measurePoints.length - 1];
    const previewTotal = measureTotalMeters + map.distance(lastPoint, latlng);
    updateMeasureStatus(previewTotal);
  }

  function updateMeasureStatus(previewMeters = null) {
    if (!measureStatusNode) {
      return;
    }
    const total = previewMeters ?? measureTotalMeters;
    const suffix = previewMeters === null ? "" : " (curseur)";
    measureStatusNode.textContent = `Distance : ${formatDistanceMeters(total)}${suffix}`;
  }

  function clearMeasure() {
    measurePoints = [];
    measureLine = null;
    measureTotalMeters = 0;
    measureLayer.clearLayers();
    updateMeasureStatus();
  }

  function formatDistanceMeters(value) {
    return `${Math.round(Number(value) || 0).toLocaleString(locale)} m`;
  }

  const layerBoxManager = new LayerBoxManager(toolsPanel, {
    rootId: "root",
    rootTitle: t("palRootTitle"),
    rootRender: function (container) {
      container.append(rootContent);
    }
  });
  const rootLayerHeader = layerBoxManager.getLayer("root")?.element.querySelector(".layer-box-header");
  if (rootLayerHeader && visitedSitesSearchControl) {
    rootLayerHeader.append(visitedSitesSearchControl);
  }

  layerBoxManager.on("activate", function (event) {
    workspace.classList.toggle("is-pal-detail-open", event.id !== "root");
    activeLayerContext.id = event.id;
    if (event.id === "root") {
      activeLayerContext.submissionId = null;
      syncVisitedSitesTable(lastVisitedSitesRows);
    }
    saveCurrentCartographyContext();
  });

  function openSitesPlanningLayer() {
    layerBoxManager.push({
      id: "sites-planning",
      title: "Explorateur des sites a visiter",
      render: renderSitesPlanningLayer,
      onClose() {
        cancelPlanningLocationEdit({ silent: true });
        sitesPlanningTable = null;
        sitesPlanningTree = null;
        sitesPlanningSelection = null;
      }
    });
    loadSitesPlanning();
    setToolsOpen(true);
  }

  function renderSitesPlanningLayer(container) {
    container.innerHTML = `
      <div class="sites-planning-layer-content sites-planning-layer-content-map">
        <div class="sites-planning-controls">
          <fieldset class="sites-planning-fieldset">
            <legend>Statuts</legend>
            <label><input type="checkbox" name="sig_planning_status" value="planned" checked><span>Planifie</span></label>
            <label><input type="checkbox" name="sig_planning_status" value="ongoing" checked><span>En cours</span></label>
            <label><input type="checkbox" name="sig_planning_status" value="done" checked><span>Realise</span></label>
          </fieldset>
          <label class="sites-planning-order">
            <span>Ordre hierarchique</span>
            <select id="sig-sites-planning-order">
              <option value="region-ministere-localite">REGION &rarr; MINISTERE &rarr; LOCALITE</option>
              <option value="ministere-region-localite">MINISTERE &rarr; REGION &rarr; LOCALITE</option>
            </select>
          </label>
          <button class="button" type="button" id="sig-sites-planning-refresh">
            <i class="fa-solid fa-rotate" aria-hidden="true"></i>
            <span>Actualiser</span>
          </button>
          <button class="button" type="button" id="sig-sites-planning-osm-open">
            <i class="fa-solid fa-building" aria-hidden="true"></i>
            <span>Importer emprise bâtiments</span>
          </button>
          <p class="sites-planning-feedback" id="sig-sites-planning-feedback" role="status" aria-live="polite"></p>
        </div>
        <section class="sites-planning-summary" aria-label="Indicateurs">
          <div><span>Sites</span><strong id="sig-sites-planning-total">0</strong></div>
          <div><span>Taux d'execution</span><strong id="sig-sites-planning-rate">0%</strong></div>
          <div><span>Realises</span><strong id="sig-sites-planning-done">0</strong></div>
          <div><span>Ecarts non renseignes</span><strong id="sig-sites-planning-missing">0</strong></div>
        </section>
        <section class="sites-planning-location-actions" id="sig-sites-planning-location-actions">
          <strong id="sig-sites-planning-selected-site">Aucun site selectionne</strong>
          <button class="button" type="button" id="sig-sites-planning-point-add" hidden disabled>Ajouter reference ponctuelle</button>
          <button class="button" type="button" id="sig-sites-planning-point-edit" hidden>Modifier reference ponctuelle</button>
          <button class="button" type="button" id="sig-sites-planning-polygon-add" hidden disabled>Ajouter contour</button>
          <button class="button" type="button" id="sig-sites-planning-polygon-edit" hidden>Modifier contour</button>
          <button class="button" type="button" id="sig-sites-planning-cancel-edit" hidden>Annuler</button>
          <button class="button button-primary" type="button" id="sig-sites-planning-save-edit" hidden>Enregistrer</button>
          <button class="button" type="button" id="sig-sites-planning-plan-open" hidden disabled>
            <i class="fa-solid fa-print" aria-hidden="true"></i>
            <span>Plan de situation</span>
          </button>
          <button class="button" type="button" id="sig-sites-planning-export-geojson" hidden disabled>
            <i class="fa-solid fa-file-export" aria-hidden="true"></i>
            <span>Exporter GeoJSON</span>
          </button>
          <p class="form-hint" id="sig-sites-planning-location-hint">Selectionnez un site dans la liste filtree.</p>
          <form class="sites-planning-plan-panel" id="sites-planning-plan-form" hidden>
            <div class="sites-planning-plan-grid">
              <label>
                <span>Type de plan</span>
                <select name="plan_type">
                  <option value="satellite">Plan satellite</option>
                  <option value="line">Plan filaire</option>
                  <option value="mixed">Plan mixte</option>
                </select>
              </label>
              <label>
                <span>Orientation</span>
                <select name="page_orientation">
                  <option value="auto">Automatique</option>
                  <option value="landscape">Paysage</option>
                  <option value="portrait">Portrait</option>
                </select>
              </label>
              <label>
                <span>Numérotation</span>
                <select name="numbering_mode">
                  <option value="auto">Automatique</option>
                  <option value="manual">Manuelle</option>
                </select>
              </label>
              <label>
                <span>Taille étiquettes</span>
                <input name="label_size" type="number" min="16" max="48" step="1" value="24">
              </label>
              <label>
                <span>Opacité étiquettes</span>
                <input name="label_opacity" type="range" min="0.2" max="1" step="0.05" value="1">
              </label>
            </div>
            <div class="prepared-buildings-plan-actions">
              <button class="button" type="button" data-print-extent-draw>Définir emprise</button>
              <button class="button" type="button" data-print-extent-validate disabled>Valider emprise</button>
              <button class="button" type="button" data-print-extent-clear disabled>Effacer emprise</button>
              <button class="button" type="button" data-buildings-plan-preview disabled>Aperçu imprimable</button>
              <button class="button button-primary" type="button" data-buildings-plan-print disabled>Imprimer / PDF</button>
            </div>
            <p class="form-hint" data-print-extent-status>Tracer et valider un cadre d'impression pour activer l'aperçu et l'impression.</p>
            <p class="sites-planning-plan-feedback" data-sites-planning-plan-feedback role="status" aria-live="polite"></p>
          </form>
        </section>
        <div class="sites-planning-explorer" id="sig-sites-planning-explorer">
          <section class="sites-planning-tree-panel">
            <div class="panel-header">
              <h2>Exploration</h2>
            </div>
            <div class="sites-planning-tree" id="sig-sites-planning-tree"></div>
          </section>
          <div class="sites-planning-pane-resizer" id="sig-sites-planning-pane-resizer" role="separator" aria-orientation="vertical" aria-label="Redimensionner les volets"></div>
          <section class="sites-planning-table-panel">
            <div class="panel-header">
              <h2>Sites filtres</h2>
              <span class="sites-planning-selection" id="sig-sites-planning-selection">Tous les sites</span>
              <span class="sites-planning-counts" id="sig-sites-planning-counts">0 filtre / 0 geolocalise</span>
            </div>
            <details class="sites-planning-column-toggle" id="sig-sites-planning-column-toggle">
              <summary>Colonnes</summary>
              <div class="sites-planning-column-menu" id="sig-sites-planning-column-menu">
                ${sitesPlanningTableColumns.map((column) => `
                  <label>
                    <input type="checkbox" value="${escapeHtml(column.field)}" checked>
                    <span>${escapeHtml(column.title)}</span>
                  </label>
                `).join("")}
              </div>
            </details>
            <div class="sites-planning-table" id="sig-sites-planning-table"></div>
          </section>
        </div>
        <section class="sites-planning-osm-dialog" id="sig-sites-planning-osm-dialog" hidden aria-label="Importation par lot des bâtiments">
          <div class="sites-planning-osm-panel">
            <header>
              <h2>Importer emprise bâtiments</h2>
              <button class="button button-ghost" type="button" id="sig-sites-planning-osm-close">Fermer</button>
            </header>
            <div class="sites-planning-osm-source">
              <strong>Source</strong>
              <label><input type="radio" name="sig_planning_building_source" value="osm" checked> OpenStreetMap</label>
              <label><input type="radio" name="sig_planning_building_source" value="topoexport" disabled> TopoExport</label>
            </div>
            <div class="sites-planning-osm-source">
              <strong>Mode d'import</strong>
              <label><input type="radio" name="sig_planning_osm_scope" value="missing" checked> Sites sans emprises uniquement</label>
              <label><input type="radio" name="sig_planning_osm_scope" value="all"> Tous les sites selectionnes</label>
            </div>
            <div class="sites-planning-osm-actions">
              <button class="button" type="button" id="sig-sites-planning-osm-select-all">Tout sélectionner</button>
              <button class="button" type="button" id="sig-sites-planning-osm-clear-all">Tout désélectionner</button>
              <button class="button button-primary" type="button" id="sig-sites-planning-osm-start" disabled>Démarer l'importation</button>
              <button class="button" type="button" id="sig-sites-planning-osm-save" hidden>Enregistrer les données</button>
            </div>
            <p class="sites-planning-osm-status" id="sig-sites-planning-osm-status" role="status" aria-live="polite"></p>
            <div class="sites-planning-osm-workspace">
              <section class="sites-planning-osm-column">
                <header>
                  <h3>Sites à traiter</h3>
                  <span id="sig-sites-planning-osm-selection-count">0 sélectionné</span>
                </header>
                <div class="sites-planning-osm-list" id="sig-sites-planning-osm-list"></div>
                <p class="sites-planning-osm-details" id="sig-sites-planning-osm-site-details">Cliquer sur un site pour afficher son détail.</p>
              </section>
              <section class="sites-planning-osm-column">
                <header>
                  <h3>Résultats d'importation</h3>
                  <span id="sig-sites-planning-osm-result-count">0 résultat</span>
                </header>
                <div class="sites-planning-osm-report" id="sig-sites-planning-osm-report"></div>
              </section>
            </div>
          </div>
        </section>
        <section class="sites-planning-export-dialog" id="sig-sites-planning-export-dialog" hidden aria-label="Export GeoJSON multi-sites">
          <div class="sites-planning-export-panel">
            <header>
              <h2>Exporter GeoJSON</h2>
              <button class="button button-ghost" type="button" id="sig-sites-planning-export-close">Fermer</button>
            </header>
            <p class="sites-planning-export-status" id="sig-sites-planning-export-status" role="status" aria-live="polite">Selectionnez les sites a exporter.</p>
            <div class="sites-planning-export-actions">
              <button class="button" type="button" id="sig-sites-planning-export-select-all">Tout selectionner</button>
              <button class="button" type="button" id="sig-sites-planning-export-clear-all">Tout deselectionner</button>
              <button class="button button-primary" type="button" id="sig-sites-planning-export-run" disabled>Exporter les fichiers</button>
            </div>
            <div class="sites-planning-export-table" id="sig-sites-planning-export-table"></div>
          </div>
        </section>
      </div>
    `;

    container.querySelectorAll('input[name="sig_planning_status"]').forEach((input) => {
      input.addEventListener("change", function () {
        sitesPlanningSelection = null;
        loadSitesPlanning();
      });
    });
    container.querySelector("#sig-sites-planning-order")?.addEventListener("change", function () {
      sitesPlanningSelection = null;
      renderSitesPlanningTree();
      renderSitesPlanningTable();
    });
    container.querySelector("#sig-sites-planning-refresh")?.addEventListener("click", function () {
      sitesPlanningSelection = null;
      loadSitesPlanning();
    });
    container.querySelector("#sig-sites-planning-osm-open")?.addEventListener("click", function () {
      openSitesPlanningOsmDialog();
    });
    container.querySelector("#sig-sites-planning-osm-close")?.addEventListener("click", function () {
      closeSitesPlanningOsmDialog();
    });
    container.querySelector("#sig-sites-planning-osm-select-all")?.addEventListener("click", function () {
      setSitesPlanningOsmSelection(true);
    });
    container.querySelector("#sig-sites-planning-osm-clear-all")?.addEventListener("click", function () {
      setSitesPlanningOsmSelection(false);
    });
    container.querySelector("#sig-sites-planning-osm-start")?.addEventListener("click", function () {
      startSitesPlanningOsmImport();
    });
    container.querySelector("#sig-sites-planning-osm-save")?.addEventListener("click", function () {
      saveSitesPlanningOsmImportResults();
    });
    container.querySelector("#sig-sites-planning-export-close")?.addEventListener("click", function () {
      closeSitesPlanningExportDialog();
    });
    container.querySelector("#sig-sites-planning-export-select-all")?.addEventListener("click", function () {
      setSitesPlanningExportSelection(true);
    });
    container.querySelector("#sig-sites-planning-export-clear-all")?.addEventListener("click", function () {
      setSitesPlanningExportSelection(false);
    });
    container.querySelector("#sig-sites-planning-export-run")?.addEventListener("click", function () {
      exportSelectedPlanningSitesGeoJson();
    });
    container.querySelector("#sig-sites-planning-point-add")?.addEventListener("click", function () {
      startPlanningPointCapture();
    });
    container.querySelector("#sig-sites-planning-point-edit")?.addEventListener("click", function () {
      startPlanningPointCapture();
    });
    container.querySelector("#sig-sites-planning-polygon-add")?.addEventListener("click", function () {
      startPlanningContourCapture();
    });
    container.querySelector("#sig-sites-planning-polygon-edit")?.addEventListener("click", function () {
      startPlanningContourCapture();
    });
    container.querySelector("#sig-sites-planning-cancel-edit")?.addEventListener("click", function () {
      cancelPlanningLocationEdit();
    });
    container.querySelector("#sig-sites-planning-save-edit")?.addEventListener("click", function () {
      savePlanningSiteLocation(currentPlanningDraftPayload());
    });
    container.querySelector("#sig-sites-planning-plan-open")?.addEventListener("click", function () {
      openSelectedPlanningSitePlanPanel();
    });
    container.querySelector("#sig-sites-planning-export-geojson")?.addEventListener("click", function () {
      openSitesPlanningExportDialog();
    });
    const planForm = container.querySelector("#sites-planning-plan-form");
    planForm?.querySelector("[data-print-extent-draw]")?.addEventListener("click", function () {
      startPrintExtentSelection(planForm);
    });
    planForm?.querySelector("[data-print-extent-validate]")?.addEventListener("click", function () {
      validatePrintExtent(planForm);
    });
    planForm?.querySelector("[data-print-extent-clear]")?.addEventListener("click", function () {
      clearPrintExtent(planForm);
    });
    planForm?.querySelector("[data-buildings-plan-preview]")?.addEventListener("click", function () {
      openSelectedPlanningSitePrintPlan(planForm, { autoPrint: false });
    });
    planForm?.querySelector("[data-buildings-plan-print]")?.addEventListener("click", function () {
      openSelectedPlanningSitePrintPlan(planForm, { autoPrint: true });
    });
    setupSitesPlanningColumnControls(container);
    setupSitesPlanningPaneResize(container);
    updatePlanningLocationActions();
  }

  function loadSitesPlanning() {
    const layer = layerBoxManager.getLayer("sites-planning");
    if (!layer) {
      return;
    }
    setSitesPlanningFeedback("Chargement du planning...");
    fetch(`/api/sites${sitesPlanningStatusQuery()}`, { headers: { "Accept": "application/json" } })
      .then((response) => {
        if (!response.ok) {
          throw new Error("sites_planning_load_failed");
        }
        return response.json();
      })
      .then((payload) => {
        sitesPlanningData = Array.isArray(payload.sites) ? payload.sites : [];
        selectedPlanningSite = selectedPlanningSite
          ? sitesPlanningData.find((site) => site.id === selectedPlanningSite.id) || null
          : null;
        setSitesPlanningFeedback("");
        renderSitesPlanningStats();
        renderSitesPlanningTree();
        renderSitesPlanningTable();
        renderSelectedPlanningSiteGeometry();
        updatePlanningLocationActions();
        refreshPalLayout();
      })
      .catch(() => {
        sitesPlanningData = [];
        selectedPlanningSite = null;
        setSitesPlanningFeedback("Impossible de charger le planning.", "is-error");
        renderSitesPlanningTree();
        renderSitesPlanningTable();
        renderSelectedPlanningSiteGeometry();
        updatePlanningLocationActions();
      });
  }

  function sitesPlanningStatusQuery() {
    const layer = layerBoxManager.getLayer("sites-planning");
    const statuses = Array.from(layer?.content.querySelectorAll('input[name="sig_planning_status"]:checked') || [])
      .map((input) => input.value);
    return statuses.length ? `?status=${encodeURIComponent(statuses.join(","))}` : "?status=__none__";
  }

  function sitesPlanningSitesWithContours() {
    return sitesPlanningData.filter((site) => site.polygon_geo?.type === "Polygon");
  }

  function openSitesPlanningOsmDialog() {
    const dialog = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-osm-dialog");
    if (!dialog) {
      return;
    }
    sitesPlanningOsmImportResults = [];
    dialog.hidden = false;
    renderSitesPlanningOsmList();
    renderSitesPlanningOsmReport(null);
    setSitesPlanningOsmStatus("Sélectionnez les sites à traiter.");
    updateSitesPlanningOsmActions();
  }

  function closeSitesPlanningOsmDialog() {
    const dialog = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-osm-dialog");
    if (dialog) {
      dialog.hidden = true;
    }
  }

  function renderSitesPlanningOsmList() {
    const layer = layerBoxManager.getLayer("sites-planning");
    const list = layer?.content.querySelector("#sig-sites-planning-osm-list");
    if (!list) {
      return;
    }
    const sites = sitesPlanningSitesWithContours();
    if (!sites.length) {
      list.innerHTML = '<p class="sites-planning-empty">Aucun site avec contour défini.</p>';
      sitesPlanningOsmSitesTable = null;
      updateSitesPlanningOsmSelectionCount();
      return;
    }
    const rows = sites.map((site) => ({
      id: site.id,
      code: site.code || `#${site.id}`,
      site_name: site.site_name || "Site sans nom",
      statut: site.statut || "",
      region: site.region || "",
      ministere: site.ministere || "",
      localite: site.localite || "",
      osm_building_count: Number(site.osm_building_count || planningOsmBuildingCount(site) || 0),
      has_buildings: sitesPlanningHasOsmBuildings(site)
    }));
    if (typeof Tabulator === "undefined") {
      list.innerHTML = rows.map((site) => `
        <label class="sites-planning-osm-site">
          <input type="checkbox" value="${escapeHtml(String(site.id))}">
          <span><strong>${escapeHtml(site.code)}</strong> ${escapeHtml(site.site_name)}${site.has_buildings ? ` - ${site.osm_building_count.toLocaleString(locale)} emprise(s) déjà importée(s)` : ""}</span>
        </label>
      `).join("");
      list.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.addEventListener("change", function () {
          updateSitesPlanningOsmSelectionCount();
          updateSitesPlanningOsmActions();
        });
      });
      updateSitesPlanningOsmSelectionCount();
      return;
    }
    if (sitesPlanningOsmSitesTable) {
      sitesPlanningOsmSitesTable.destroy();
    }
    list.innerHTML = "";
    if (list.dataset.selectionWatcherBound !== "true") {
      ["click", "dblclick", "keyup"].forEach((eventName) => {
        list.addEventListener(eventName, function () {
          window.setTimeout(function () {
            updateSitesPlanningOsmSelectionCount();
            updateSitesPlanningOsmActions();
          }, 0);
        });
      });
      list.dataset.selectionWatcherBound = "true";
    }
    sitesPlanningOsmSitesTable = new Tabulator(list, {
      data: rows,
      height: "100%",
      layout: "fitColumns",
      selectableRows: true,
      selectableRowsPersistence: false,
      pagination: rows.length > 100 ? "local" : false,
      paginationSize: 100,
      placeholder: "Aucun site avec contour défini.",
      rowFormatter(row) {
        if (row.getData().has_buildings) {
          row.getElement().classList.add("has-existing-osm-buildings");
        }
      },
      rowClick(event, row) {
        renderSitesPlanningOsmSiteDetails(row.getData());
      },
      rowDblClick(event, row) {
        row.toggleSelect();
      },
      rowSelectionChanged() {
        updateSitesPlanningOsmSelectionCount();
        updateSitesPlanningOsmActions();
      },
      columns: [
        {
          formatter: "rowSelection",
          titleFormatter: "rowSelection",
          hozAlign: "center",
          headerHozAlign: "center",
          headerSort: false,
          width: 42,
          cellClick(event, cell) {
            cell.getRow().toggleSelect();
          }
        },
        { title: "ID", field: "code", width: 105, headerFilter: "input", sorter: "string" },
        { title: "Nom", field: "site_name", minWidth: 190, headerFilter: "input", sorter: "string" },
        { title: "Statut", field: "statut", width: 92, headerFilter: "input", sorter: "string" },
        { title: "Emprises", field: "osm_building_count", width: 92, hozAlign: "right", sorter: "number" }
      ]
    });
    updateSitesPlanningOsmSelectionCount();
  }

  function setSitesPlanningOsmSelection(checked) {
    const list = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-osm-list");
    if (sitesPlanningOsmSitesTable) {
      if (checked) {
        sitesPlanningOsmSitesTable.selectRow();
      } else {
        sitesPlanningOsmSitesTable.deselectRow();
      }
    } else {
      list?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = checked;
      });
    }
    updateSitesPlanningOsmSelectionCount();
    updateSitesPlanningOsmActions();
  }

  function selectedSitesPlanningOsmIds() {
    const list = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-osm-list");
    if (sitesPlanningOsmSitesTable) {
      const selectedData = selectedSitesPlanningOsmTableData();
      return selectedData
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id) && id > 0);
    }
    return Array.from(list?.querySelectorAll('input[type="checkbox"]:checked') || [])
      .map((input) => Number(input.value))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  function selectedSitesPlanningOsmTableData() {
    if (!sitesPlanningOsmSitesTable) {
      return [];
    }
    const directSelection = typeof sitesPlanningOsmSitesTable.getSelectedData === "function"
      ? sitesPlanningOsmSitesTable.getSelectedData()
      : [];
    if (directSelection.length) {
      return directSelection;
    }
    const rows = typeof sitesPlanningOsmSitesTable.getRows === "function"
      ? sitesPlanningOsmSitesTable.getRows()
      : [];
    return rows
      .filter((row) => {
        if (typeof row.isSelected === "function" && row.isSelected()) {
          return true;
        }
        return row.getElement?.().classList.contains("tabulator-selected");
      })
      .map((row) => row.getData());
  }

  function updateSitesPlanningOsmSelectionCount() {
    const count = selectedSitesPlanningOsmIds().length;
    const node = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-osm-selection-count");
    if (node) {
      node.textContent = `${count.toLocaleString(locale)} sélectionné(s)`;
    }
  }

  function renderSitesPlanningOsmSiteDetails(site) {
    const node = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-osm-site-details");
    if (!node || !site) {
      return;
    }
    node.textContent = [
      site.code || `#${site.id}`,
      site.site_name,
      site.region,
      site.localite,
      `${Number(site.osm_building_count || 0).toLocaleString(locale)} emprise(s) existante(s)`
    ].filter(Boolean).join(" - ");
  }
  function sitesPlanningHasOsmBuildings(site) {
    const count = Number(site?.osm_building_count);
    return (Number.isFinite(count) && count > 0) || planningOsmBuildingCount(site) > 0;
  }

  function selectedSitesPlanningOsmImportScope() {
    const layer = layerBoxManager.getLayer("sites-planning");
    return layer?.content.querySelector('input[name="sig_planning_osm_scope"]:checked')?.value === "all"
      ? "all"
      : "missing";
  }

  function sitesPlanningOsmIdsToProcess(selectedIds) {
    const ids = Array.isArray(selectedIds) ? selectedIds : selectedSitesPlanningOsmIds();
    if (selectedSitesPlanningOsmImportScope() === "all") {
      return ids;
    }
    return ids.filter((siteId) => {
      const site = sitesPlanningData.find((candidate) => candidate.id === siteId);
      return !sitesPlanningHasOsmBuildings(site);
    });
  }

  function confirmLargeSitesPlanningOsmImport(count) {
    if (count < 10) {
      return true;
    }
    return window.confirm(
      `Vous allez lancer l'import OSM pour ${count.toLocaleString(locale)} sites. Cette operation peut prendre du temps et solliciter fortement l'API Overpass. Continuer ?`
    );
  }

  function updateSitesPlanningOsmActions() {
    const layer = layerBoxManager.getLayer("sites-planning");
    const startButton = layer?.content.querySelector("#sig-sites-planning-osm-start");
    const saveButton = layer?.content.querySelector("#sig-sites-planning-osm-save");
    if (startButton) {
      startButton.disabled = sitesPlanningOsmImportRunning || selectedSitesPlanningOsmIds().length === 0;
    }
    if (saveButton) {
      saveButton.hidden = sitesPlanningOsmImportRunning
        || !sitesPlanningOsmImportResults.some((result) => result.status === "success" && result.geojson && !result.saved);
    }
  }

  function setSitesPlanningOsmStatus(message, className = "") {
    const status = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-osm-status");
    if (!status) {
      return;
    }
    status.textContent = message || "";
    status.className = `sites-planning-osm-status ${className}`.trim();
  }

  async function startSitesPlanningOsmImport() {
    const layer = layerBoxManager.getLayer("sites-planning");
    const startButton = layer?.content.querySelector("#sig-sites-planning-osm-start");
    const selectedIds = selectedSitesPlanningOsmIds();
    const processIds = sitesPlanningOsmIdsToProcess(selectedIds);
    const skippedExisting = selectedIds.length - processIds.length;
    const source = layer?.content.querySelector('input[name="sig_planning_building_source"]:checked')?.value || "osm";
    if (!selectedIds.length || source !== "osm") {
      return;
    }
    if (!processIds.length) {
      sitesPlanningOsmImportResults = [];
      renderSitesPlanningOsmReport(null);
      setSitesPlanningOsmStatus(
        skippedExisting > 0
          ? "Aucun site a traiter : tous les sites selectionnes disposent deja d'emprises importees. Choisir \"Tous les sites selectionnes\" pour les reimporter."
          : "Aucun site a traiter.",
        "is-warning"
      );
      updateSitesPlanningOsmActions();
      return;
    }
    if (!confirmLargeSitesPlanningOsmImport(processIds.length)) {
      setSitesPlanningOsmStatus("Importation abandonnee par l'utilisateur.", "is-warning");
      return;
    }
    sitesPlanningOsmImportRunning = true;
    sitesPlanningOsmImportResults = [];
    renderSitesPlanningOsmReport(null);
    if (skippedExisting > 0) {
      setSitesPlanningOsmStatus(`${skippedExisting.toLocaleString(locale)} site(s) deja dotes d'emprises ignore(s).`, "is-warning");
    }
    updateSitesPlanningOsmActions();

    const firstPassFailures = await runSitesPlanningOsmImportPass({
      siteIds: processIds,
      source,
      passNumber: 1,
      timeoutMs: sitesPlanningOsmRequestTimeoutPassesMs[0]
    });

    if (firstPassFailures.length) {
      setSitesPlanningOsmStatus(
        `Passe 1 terminee : ${firstPassFailures.length} echec(s). Relance avec timeout 60 s...`,
        "is-warning"
      );
      await runSitesPlanningOsmImportPass({
        siteIds: firstPassFailures.map((result) => result.site_id),
        source,
        passNumber: 2,
        timeoutMs: sitesPlanningOsmRequestTimeoutPassesMs[1]
      });
    }

    sitesPlanningOsmImportRunning = false;
    const failures = sitesPlanningOsmImportResults.filter((result) => result.status === "error").length;
    setSitesPlanningOsmStatus(
      failures
        ? `Importation terminée avec ${failures} échec(s).`
        : "Importation terminée.",
      failures ? "is-error" : "is-success"
    );
    updateSitesPlanningOsmActions();
    if (startButton && selectedSitesPlanningOsmIds().length > 0) {
      startButton.disabled = false;
    }
  }

  async function runSitesPlanningOsmImportPass({ siteIds, source, passNumber, timeoutMs }) {
    const failures = [];
    for (const [index, siteId] of siteIds.entries()) {
      const site = sitesPlanningData.find((candidate) => candidate.id === siteId);
      const label = site?.site_name || site?.code || `site #${siteId}`;
      setSitesPlanningOsmStatus(
        `Extraction OSM passe ${passNumber}/2 (${Math.round(timeoutMs / 1000)} s) ${index + 1}/${siteIds.length} : ${label}`
      );
      try {
        const payload = await fetchSitesPlanningOsmPreview([siteId], source, timeoutMs);
        const result = payload.results?.[0] || {
          site_id: siteId,
          code: site?.code,
          site_name: site?.site_name,
          status: "error",
          imported: 0,
          error: "empty_osm_import_response"
        };
        const stored = upsertSitesPlanningOsmImportResult(siteId, result, {
          pass: passNumber,
          timeout_ms: timeoutMs,
          status: result.status,
          error: result.error || ""
        });
        if (stored.status === "error") {
          failures.push(stored);
        }
      } catch (error) {
        const stored = upsertSitesPlanningOsmImportResult(siteId, {
          site_id: siteId,
          code: site?.code,
          site_name: site?.site_name,
          status: "error",
          imported: 0,
          error: error.message
        }, {
          pass: passNumber,
          timeout_ms: timeoutMs,
          status: "error",
          error: error.message
        });
        failures.push(stored);
      }
      renderSitesPlanningOsmReport(buildSitesPlanningOsmReportPayload());
    }
    return failures;
  }

  function upsertSitesPlanningOsmImportResult(siteId, result, attempt) {
    const existingIndex = sitesPlanningOsmImportResults.findIndex((candidate) => candidate.site_id === siteId);
    const previous = existingIndex >= 0 ? sitesPlanningOsmImportResults[existingIndex] : {};
    const stored = {
      ...previous,
      ...result,
      site_id: siteId,
      saved: result.status === "success" ? Boolean(previous.saved) : false,
      attempts: [
        ...(previous.attempts || []),
        attempt
      ]
    };
    if (existingIndex >= 0) {
      sitesPlanningOsmImportResults.splice(existingIndex, 1, stored);
    } else {
      sitesPlanningOsmImportResults.push(stored);
    }
    return stored;
  }

  function fetchSitesPlanningOsmPreview(siteIds, source, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch("/api/sites/buildings/osm-preview", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ source, site_ids: siteIds }),
      signal: controller.signal
    })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (!ok || !payload.ok) {
          throw new Error(payload.error || "sites_planning_osm_import_failed");
        }
        return payload;
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          throw new Error("timeout_osm_import_site");
        }
        throw error;
      })
      .finally(() => {
        clearTimeout(timeout);
      });
  }

  function buildSitesPlanningOsmReportPayload() {
    return {
      results: sitesPlanningOsmImportResults,
      summary: {
        total_sites: sitesPlanningOsmImportResults.length,
        success_sites: sitesPlanningOsmImportResults.filter((result) => result.status === "success").length,
        failed_sites: sitesPlanningOsmImportResults.filter((result) => result.status === "error").length,
        total_buildings: sitesPlanningOsmImportResults.reduce((sum, result) => sum + Number(result.imported || 0), 0)
      }
    };
  }

  function renderSitesPlanningOsmReport(payload) {
    const report = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-osm-report");
    const countNode = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-osm-result-count");
    if (!report) {
      return;
    }
    const rows = (payload?.results || []).map((result) => ({
      site_id: result.site_id,
      code: result.code || String(result.site_id || ""),
      site_name: result.site_name || result.code || String(result.site_id || ""),
      status: result.status || "",
      result_label: result.status === "success" ? "Succes" : result.status === "error" ? "Echec" : result.status || "-",
      imported: Number(result.imported || 0),
      error: result.error || result.save_error || "",
      saved: Boolean(result.saved)
    }));
    if (countNode) {
      countNode.textContent = `${rows.length.toLocaleString(locale)} resultat(s)`;
    }
    if (!payload) {
      if (sitesPlanningOsmResultsTable) {
        sitesPlanningOsmResultsTable.clearData();
      } else {
        report.innerHTML = "";
      }
      return;
    }
    if (typeof Tabulator === "undefined") {
      const tableRows = rows.map((result) => `
        <tr>
          <td>${escapeHtml(result.site_name)}</td>
          <td>${escapeHtml(result.result_label)}</td>
          <td>${result.imported.toLocaleString(locale)}</td>
          <td>${escapeHtml(result.error)}</td>
        </tr>
      `).join("");
      report.innerHTML = `
        <div class="sites-planning-osm-summary">
          <strong>Resume des importations</strong>
          <span>${Number(payload.summary?.total_sites || 0).toLocaleString(locale)} site(s) traite(s)</span>
          <span>${Number(payload.summary?.total_buildings || 0).toLocaleString(locale)} batiment(s) importe(s)</span>
        </div>
        <table>
          <thead><tr><th>Site</th><th>Resultat</th><th>Batiments</th><th>Message</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      `;
      return;
    }
    if (!sitesPlanningOsmResultsTable) {
      report.innerHTML = "";
      sitesPlanningOsmResultsTable = new Tabulator(report, {
        data: rows,
        height: "100%",
        layout: "fitColumns",
        pagination: rows.length > 100 ? "local" : false,
        paginationSize: 100,
        placeholder: "Aucun resultat d'importation.",
        rowFormatter(row) {
          row.getElement().classList.toggle("is-success", row.getData().status === "success");
          row.getElement().classList.toggle("is-error", row.getData().status === "error");
        },
        columns: [
          { title: "ID", field: "code", width: 100, headerFilter: "input", sorter: "string" },
          { title: "Nom", field: "site_name", minWidth: 190, headerFilter: "input", sorter: "string" },
          { title: "Resultat", field: "result_label", width: 105, headerFilter: "input", sorter: "string" },
          { title: "Bat.", field: "imported", width: 70, hozAlign: "right", sorter: "number" },
          { title: "Message d'erreur", field: "error", minWidth: 180, headerFilter: "input", sorter: "string" }
        ]
      });
      return;
    }
    sitesPlanningOsmResultsTable.replaceData(rows);
  }
  async function saveSitesPlanningOsmImportResults() {
    const imports = sitesPlanningOsmImportResults
      .filter((result) => result.status === "success" && result.geojson && !result.saved);
    if (!imports.length) {
      return;
    }

    sitesPlanningOsmImportRunning = true;
    updateSitesPlanningOsmActions();
    let saved = 0;
    let failed = 0;

    for (const [index, result] of imports.entries()) {
      setSitesPlanningOsmStatus(`Enregistrement ${index + 1}/${imports.length} : ${result.site_name || result.code || result.site_id}`);
      try {
        const payload = await saveSingleSitesPlanningOsmImport(result);
        saved += Number(payload.result?.saved || 0);
        result.saved = true;
      } catch (error) {
        failed += 1;
        result.save_error = error.message;
      }
    }

    sitesPlanningOsmImportRunning = false;
    renderSitesPlanningOsmReport(buildSitesPlanningOsmReportPayload());
    updateSitesPlanningOsmActions();
    setSitesPlanningOsmStatus(
      failed
        ? `${saved} emprise(s) enregistrée(s), ${failed} échec(s) d'enregistrement.`
        : `${saved} emprise(s) enregistrée(s).`,
      failed ? "is-error" : "is-success"
    );
    if (saved > 0) {
      loadSitesPlanning();
    }
  }

  function saveSingleSitesPlanningOsmImport(result) {
    return fetch("/api/sites/buildings/osm-save", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        imports: [{
          site_id: result.site_id,
          geojson: result.geojson
        }]
      })
    })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (!ok || !payload.ok) {
          throw new Error(payload.error || "sites_planning_osm_save_failed");
        }
        return payload;
      });
  }

  function setSitesPlanningFeedback(message, className) {
    const feedback = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-feedback");
    if (!feedback) {
      return;
    }
    feedback.textContent = message || "";
    feedback.className = `sites-planning-feedback ${className || ""}`.trim();
  }

  function renderSitesPlanningStats() {
    const layer = layerBoxManager.getLayer("sites-planning");
    if (!layer) {
      return;
    }
    const total = sitesPlanningData.length;
    const done = sitesPlanningData.filter((site) => site.statut === "done").length;
    const missing = sitesPlanningData.filter((site) => site.schedule_gap_days === null).length;
    const rate = total ? Math.round((done / total) * 1000) / 10 : 0;
    layer.content.querySelector("#sig-sites-planning-total").textContent = String(total);
    layer.content.querySelector("#sig-sites-planning-rate").textContent = `${rate.toLocaleString(locale)}%`;
    layer.content.querySelector("#sig-sites-planning-done").textContent = String(done);
    layer.content.querySelector("#sig-sites-planning-missing").textContent = String(missing);
  }

  function renderSitesPlanningTree() {
    const layer = layerBoxManager.getLayer("sites-planning");
    const host = layer?.content.querySelector("#sig-sites-planning-tree");
    if (!host || !window.BootstrapTreeViewLite) {
      return;
    }
    if (!sitesPlanningTree) {
      sitesPlanningTree = new BootstrapTreeViewLite(host, {
        onSelect(node) {
          sitesPlanningSelection = node.criteria?.length ? node : null;
          renderSitesPlanningTable();
        }
      });
    }
    const rootNode = {
      key: "all",
      label: "Tous les sites",
      count: sitesPlanningData.length,
      criteria: [],
      expanded: true,
      children: buildSitesPlanningTree(sitesPlanningData, sitesPlanningOrder())
    };
    sitesPlanningTree.setData([rootNode]);
  }

  function sitesPlanningOrder() {
    const value = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-order")?.value;
    return value === "ministere-region-localite"
      ? ["ministere", "region", "localite"]
      : ["region", "ministere", "localite"];
  }

  function buildSitesPlanningTree(sites, order) {
    const root = { key: "root", criteria: [], children: [] };
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
            criteria: current.criteria.concat({ field, value: label }),
            children: []
          };
          current.children.push(child);
          current.children.sort((left, right) => left.label.localeCompare(right.label, locale, { sensitivity: "base" }));
        }
        child.count += 1;
        current = child;
      });
    });
    return root.children;
  }

  function sitesPlanningFilteredRows() {
    if (!sitesPlanningSelection?.criteria?.length) {
      return sitesPlanningData;
    }
    return sitesPlanningData.filter((site) => sitesPlanningSelection.criteria.every((entry) => {
      const value = site[entry.field] || "Non renseigne";
      return value === entry.value;
    }));
  }

  function setupSitesPlanningColumnControls(container) {
    const menu = container.querySelector("#sig-sites-planning-column-menu");
    if (!menu) {
      return;
    }
    const visibleFields = loadSitesPlanningVisibleColumns();
    menu.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = visibleFields.includes(input.value);
      input.addEventListener("change", function () {
        const checkedFields = Array.from(menu.querySelectorAll('input[type="checkbox"]:checked'))
          .map((checkbox) => checkbox.value);
        if (!checkedFields.length) {
          input.checked = true;
          return;
        }
        saveSitesPlanningVisibleColumns(checkedFields);
        applySitesPlanningColumnVisibility();
        refreshPalLayout();
      });
    });
  }

  function loadSitesPlanningVisibleColumns() {
    const defaults = sitesPlanningTableColumns.map((column) => column.field);
    try {
      const stored = JSON.parse(localStorage.getItem(sitesPlanningColumnPrefsKey));
      const validFields = Array.isArray(stored)
        ? stored.filter((field) => defaults.includes(field))
        : [];
      return validFields.length ? validFields : defaults;
    } catch (error) {
      return defaults;
    }
  }

  function saveSitesPlanningVisibleColumns(fields) {
    try {
      localStorage.setItem(sitesPlanningColumnPrefsKey, JSON.stringify(fields));
    } catch (error) {
      // Column visibility remains usable even if browser storage is blocked.
    }
  }

  function applySitesPlanningColumnVisibility() {
    if (!sitesPlanningTable) {
      return;
    }
    const visibleFields = loadSitesPlanningVisibleColumns();
    sitesPlanningTableColumns.forEach((column) => {
      if (visibleFields.includes(column.field)) {
        sitesPlanningTable.showColumn(column.field);
      } else {
        sitesPlanningTable.hideColumn(column.field);
      }
    });
  }

  function renderSitesPlanningTable() {
    const layer = layerBoxManager.getLayer("sites-planning");
    const host = layer?.content.querySelector("#sig-sites-planning-table");
    if (!host) {
      return;
    }
    const rows = sitesPlanningFilteredRows();
    const selectionLabel = layer.content.querySelector("#sig-sites-planning-selection");
    const countsLabel = layer.content.querySelector("#sig-sites-planning-counts");
    if (selectionLabel) {
      selectionLabel.textContent = sitesPlanningSelection?.criteria?.length
        ? sitesPlanningSelection.criteria.map((entry) => entry.value).join(" / ")
        : "Tous les sites";
    }
    if (countsLabel) {
      const geolocated = rows.filter((site) => isPlanningSiteGeolocated(site)).length;
      countsLabel.textContent = `${rows.length.toLocaleString(locale)} filtres / ${geolocated.toLocaleString(locale)} geolocalises`;
    }
    if (!sitesPlanningTable) {
      sitesPlanningTable = new Tabulator(host, {
        data: rows,
        height: "100%",
        layout: "fitColumns",
        placeholder: "Aucun site.",
        rowFormatter(row) {
          applySitesPlanningRowClasses(row);
        },
        columns: sitesPlanningTableColumns
      });
      sitesPlanningTable.on("rowClick", function (event, row) {
        selectPlanningSite(row.getData());
      });
      applySitesPlanningColumnVisibility();
    } else {
      sitesPlanningTable.replaceData(rows);
      applySitesPlanningColumnVisibility();
    }
    refreshPalLayout();
  }

  function isPlanningSiteGeolocated(site) {
    return site?.polygon_geo?.type === "Polygon" || site?.point_geo?.type === "Point";
  }

  function applySitesPlanningRowClasses(row) {
    const data = row.getData();
    const element = row.getElement();
    const hasContour = data.polygon_geo?.type === "Polygon";
    const hasPointOnly = !hasContour && data.point_geo?.type === "Point";
    element.classList.toggle("is-selected-planning-site", data.id === selectedPlanningSite?.id);
    element.classList.toggle("has-planning-contour", hasContour);
    element.classList.toggle("has-planning-reference-point", hasPointOnly);
    element.classList.toggle("has-georeferencing-abandoned", data.georeferencing_status === "abandoned");
  }

  function refreshSitesPlanningRowStyles() {
    if (!sitesPlanningTable) {
      return;
    }
    sitesPlanningTable.getRows().forEach((row) => {
      applySitesPlanningRowClasses(row);
    });
  }

  function sitesPlanningStatusFormatter(cell) {
    const value = String(cell.getValue() || "");
    const labels = { planned: "Planifie", ongoing: "En cours", done: "Realise" };
    return `<span class="sites-planning-status sites-planning-status-${escapeHtml(value)}">${escapeHtml(labels[value] || value || "-")}</span>`;
  }

  function sitesPlanningDateFormatter(cell) {
    const value = cell.getValue();
    return escapeHtml(formatPlanningDate(value) || "non renseigne");
  }

  function sitesPlanningGeoreferencingStatusFormatter(cell) {
    return cell.getValue() === "abandoned" ? "Impossible" : "";
  }

  function sitesPlanningGeoreferencingReasonFormatter(cell) {
    const data = cell.getRow().getData();
    return escapeHtml(data.georeferencing_abandon_reason_label || georeferencingAbandonReasonLabels[cell.getValue()] || "");
  }

  function formatPlanningDate(value) {
    if (!value) {
      return "";
    }
    const parts = String(value).split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
  }

  function selectPlanningSite(site) {
    if (!site) {
      return;
    }
    selectedPlanningSite = site;
    renderSelectedPlanningSiteGeometry();
    loadSpatialReferenceForFocus({ siteCode: site.code, siteName: site.site_name });
    updatePlanningLocationActions();
    refreshSitesPlanningRowStyles();
    const matchingPoint = findSubmissionPointForPlanningSite(site);
    if (hasPlanningSiteMapGeometry(site)) {
      zoomToPlanningSiteGeometry(site);
    } else if (matchingPoint) {
      selectSite(matchingPoint);
      flyToSubmission(matchingPoint);
    } else {
      zoomToPlanningSiteGeometry(site);
    }
  }

  function updatePlanningLocationActions() {
    const layer = layerBoxManager.getLayer("sites-planning");
    if (!layer) {
      return;
    }
    const selectedLabel = layer.content.querySelector("#sig-sites-planning-selected-site");
    const pointAddButton = layer.content.querySelector("#sig-sites-planning-point-add");
    const pointEditButton = layer.content.querySelector("#sig-sites-planning-point-edit");
    const polygonAddButton = layer.content.querySelector("#sig-sites-planning-polygon-add");
    const polygonEditButton = layer.content.querySelector("#sig-sites-planning-polygon-edit");
    const cancelButton = layer.content.querySelector("#sig-sites-planning-cancel-edit");
    const saveButton = layer.content.querySelector("#sig-sites-planning-save-edit");
    const planButton = layer.content.querySelector("#sig-sites-planning-plan-open");
    const exportButton = layer.content.querySelector("#sig-sites-planning-export-geojson");
    const planForm = layer.content.querySelector("#sites-planning-plan-form");
    const hint = layer.content.querySelector("#sig-sites-planning-location-hint");
    const hasSite = Boolean(selectedPlanningSite);
    const hasPoint = Boolean(selectedPlanningSite?.point_geo);
    const hasPolygon = Boolean(selectedPlanningSite?.polygon_geo);
    const osmBuildingCount = planningOsmBuildingCount(selectedPlanningSite);
    const isEditing = Boolean(planningLocationMode);
    const canSaveDraft = Boolean(currentPlanningDraftPayload());

    if (selectedLabel) {
      selectedLabel.textContent = hasSite
        ? [selectedPlanningSite.code, selectedPlanningSite.site_name || `Site #${selectedPlanningSite.id}`].filter(Boolean).join(" - ")
        : "Aucun site selectionne";
    }
    if (pointAddButton) {
      pointAddButton.hidden = isEditing || !hasSite || hasPoint;
      pointAddButton.disabled = !hasSite;
    }
    if (pointEditButton) {
      pointEditButton.hidden = isEditing || !hasSite || !hasPoint;
      pointEditButton.disabled = !hasSite;
    }
    if (polygonAddButton) {
      polygonAddButton.hidden = isEditing || !hasSite || hasPolygon;
      polygonAddButton.disabled = !hasSite;
    }
    if (polygonEditButton) {
      polygonEditButton.hidden = isEditing || !hasSite || !hasPolygon;
      polygonEditButton.disabled = !hasSite;
    }
    if (cancelButton) {
      cancelButton.hidden = !isEditing;
    }
    if (saveButton) {
      saveButton.hidden = !isEditing;
      saveButton.disabled = !canSaveDraft;
    }
    if (planButton) {
      planButton.hidden = isEditing || !hasSite || osmBuildingCount <= 0;
      planButton.disabled = !hasSite || osmBuildingCount <= 0;
    }
    if (exportButton) {
      const exportableCount = sitesPlanningExportableSites().length;
      exportButton.hidden = isEditing || exportableCount <= 0;
      exportButton.disabled = exportableCount <= 0;
      exportButton.title = exportableCount > 0
        ? "Selectionner les sites et exporter les contours ainsi que les emprises batiments."
        : "Export impossible : aucun site avec contour dans la liste filtree.";
    }
    if (planForm && (!hasSite || isEditing || osmBuildingCount <= 0)) {
      planForm.hidden = true;
    }
    if (hint) {
      hint.textContent = isEditing
        ? planningLocationMode === "point"
          ? "Cliquez sur la carte pour positionner le point, puis enregistrez."
          : "Cliquez pour tracer le contour. Le bouton Enregistrer apparait quand au moins 3 sommets sont saisis."
        : hasSite && osmBuildingCount > 0
        ? `${osmBuildingCount.toLocaleString(locale)} bâtiment(s) OSM affiché(s) pour ce site.`
        : hasSite
        ? "Utilisez les boutons pour definir les donnees de localisation sur la carte."
        : "Selectionnez un site dans la liste filtree.";
    }
  }

  function planningOsmBuildingCount(site) {
    return Array.isArray(site?.emprise_bat_osm?.features)
      ? site.emprise_bat_osm.features.length
      : 0;
  }

  function openSelectedPlanningSitePlanPanel() {
    const form = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sites-planning-plan-form");
    if (!form || !selectedPlanningSite || planningOsmBuildingCount(selectedPlanningSite) <= 0) {
      return;
    }
    form.hidden = !form.hidden;
    if (!form.hidden) {
      activePrintExtentForm = form;
      updatePrintPlanButtons(form);
      updatePrintExtentStatus(form, "Tracer et valider un cadre d'impression pour activer l'aperçu et l'impression.");
    }
  }

  async function openSelectedPlanningSitePrintPlan(form, options = {}) {
    const feedback = form?.querySelector("[data-sites-planning-plan-feedback]");
    if (!selectedPlanningSite) {
      setSelectedPlanningSitePlanFeedback(feedback, "Sélectionner un site.", "is-error");
      return;
    }
    if (!printExtentValidated || !printExtentBounds?.isValid()) {
      setSelectedPlanningSitePlanFeedback(feedback, "Définir et valider l'emprise d'impression avant de générer un plan.", "is-error");
      return;
    }
    let planData = null;
    try {
      setSelectedPlanningSitePlanFeedback(feedback, "Chargement des bâtiments du site...", "");
      planData = await fetchSelectedPlanningSitePlanData(selectedPlanningSite.id);
      selectedPlanningSite.emprise_bat_osm = planData.buildings;
    } catch (error) {
      setSelectedPlanningSitePlanFeedback(feedback, error.message || "Chargement du plan impossible.", "is-error");
      return;
    }
    const payload = buildSelectedPlanningSitePlanPayload(form, options, planData);
    if (!payload.featureCollection.features.length) {
      setSelectedPlanningSitePlanFeedback(feedback, "Aucun bâtiment importé n'est inclus dans l'emprise d'impression validée.", "is-error");
      return;
    }
    const planWindow = window.open("", "_blank", "width=1200,height=850");
    if (!planWindow) {
      setSelectedPlanningSitePlanFeedback(feedback, "Autoriser les fenêtres pop-up pour ouvrir le plan imprimable.", "is-error");
      return;
    }
    try {
      planWindow.document.open();
      planWindow.document.write(renderPreparedBuildingsPrintHtml(payload));
      planWindow.document.close();
      planWindow.focus();
      setSelectedPlanningSitePlanFeedback(
        feedback,
        options.autoPrint
          ? "Plan imprimable ouvert. Utiliser l'impression navigateur pour exporter en PDF."
          : "Aperçu imprimable ouvert.",
        "is-success"
      );
    } catch (error) {
      planWindow.document.body.innerHTML = "<p>Impossible de générer le plan imprimable depuis cette fenêtre.</p>";
      setSelectedPlanningSitePlanFeedback(feedback, "Impossible de générer le plan imprimable.", "is-error");
    }
  }

  function fetchSelectedPlanningSitePlanData(siteId) {
    return fetch(`/api/sites/${encodeURIComponent(siteId)}/buildings/plan`, {
      headers: { "Accept": "application/json" }
    })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (!ok || !payload.ok) {
          throw new Error(payload.error || "sites_planning_plan_load_failed");
        }
        return payload;
      });
  }

  function sitesPlanningExportableSites() {
    return sitesPlanningFilteredRows().filter((site) => site.polygon_geo?.type === "Polygon");
  }

  function openSitesPlanningExportDialog() {
    const dialog = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-export-dialog");
    if (!dialog) {
      return;
    }
    dialog.hidden = false;
    renderSitesPlanningExportTable();
    setSitesPlanningExportStatus("Selectionnez les sites a exporter.");
    updateSitesPlanningExportActions();
  }

  function closeSitesPlanningExportDialog() {
    const dialog = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-export-dialog");
    if (dialog) {
      dialog.hidden = true;
    }
  }

  function renderSitesPlanningExportTable() {
    const host = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-export-table");
    if (!host) {
      return;
    }
    const rows = sitesPlanningExportableSites().map((site) => ({
      id: site.id,
      code: site.code || `#${site.id}`,
      site_name: site.site_name || "Site sans nom",
      region: site.region || "",
      ministere: site.ministere || "",
      localite: site.localite || "",
      osm_building_count: planningOsmBuildingCount(site)
    }));
    if (typeof Tabulator === "undefined") {
      host.innerHTML = rows.map((site) => `
        <label class="sites-planning-osm-site">
          <input type="checkbox" value="${escapeHtml(String(site.id))}">
          <span><strong>${escapeHtml(site.code)}</strong> ${escapeHtml(site.site_name)} - ${site.osm_building_count.toLocaleString(locale)} batiment(s)</span>
        </label>
      `).join("");
      host.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.addEventListener("change", updateSitesPlanningExportActions);
      });
      return;
    }
    if (sitesPlanningExportTable) {
      sitesPlanningExportTable.destroy();
    }
    host.innerHTML = "";
    sitesPlanningExportTable = new Tabulator(host, {
      data: rows,
      height: "100%",
      layout: "fitColumns",
      selectableRows: true,
      selectableRowsPersistence: false,
      pagination: rows.length > 100 ? "local" : false,
      paginationSize: 100,
      placeholder: "Aucun site avec contour exportable.",
      rowDblClick(event, row) {
        row.toggleSelect();
      },
      rowSelectionChanged() {
        updateSitesPlanningExportActions();
      },
      columns: [
        {
          formatter: "rowSelection",
          titleFormatter: "rowSelection",
          hozAlign: "center",
          headerHozAlign: "center",
          headerSort: false,
          width: 42,
          cellClick(event, cell) {
            cell.getRow().toggleSelect();
          }
        },
        { title: "ID", field: "code", width: 105, headerFilter: "input", sorter: "string" },
        { title: "Nom", field: "site_name", minWidth: 210, headerFilter: "input", sorter: "string" },
        { title: "Region", field: "region", width: 130, headerFilter: "input", sorter: "string" },
        { title: "Localite", field: "localite", width: 130, headerFilter: "input", sorter: "string" },
        { title: "Bat.", field: "osm_building_count", width: 70, hozAlign: "right", sorter: "number" }
      ]
    });
  }

  function setSitesPlanningExportSelection(checked) {
    const host = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-export-table");
    if (sitesPlanningExportTable) {
      if (checked) {
        sitesPlanningExportTable.selectRow();
      } else {
        sitesPlanningExportTable.deselectRow();
      }
    } else {
      host?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = checked;
      });
    }
    updateSitesPlanningExportActions();
  }

  function selectedSitesPlanningExportIds() {
    const host = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-export-table");
    if (sitesPlanningExportTable) {
      return sitesPlanningExportTable.getSelectedData()
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id) && id > 0);
    }
    return Array.from(host?.querySelectorAll('input[type="checkbox"]:checked') || [])
      .map((input) => Number(input.value))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  function updateSitesPlanningExportActions() {
    const button = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-export-run");
    if (button) {
      button.disabled = selectedSitesPlanningExportIds().length === 0;
    }
  }

  function setSitesPlanningExportStatus(message, className = "") {
    const status = layerBoxManager.getLayer("sites-planning")?.content.querySelector("#sig-sites-planning-export-status");
    if (!status) {
      return;
    }
    status.textContent = message || "";
    status.className = `sites-planning-export-status ${className}`.trim();
  }

  async function exportSelectedPlanningSitesGeoJson() {
    const selectedIds = selectedSitesPlanningExportIds();
    if (!selectedIds.length) {
      setSitesPlanningExportStatus("Selectionnez au moins un site.", "is-error");
      return;
    }
    const selectedSites = selectedIds
      .map((id) => sitesPlanningData.find((site) => site.id === id))
      .filter(Boolean);
    try {
      setSitesPlanningExportStatus(`Preparation de l'export pour ${selectedSites.length.toLocaleString(locale)} site(s)...`);
      const plans = [];
      for (const [index, site] of selectedSites.entries()) {
        setSitesPlanningExportStatus(`Chargement ${index + 1}/${selectedSites.length} : ${site.site_name || site.code || site.id}`);
        plans.push(await fetchSelectedPlanningSitePlanData(site.id));
      }
      const siteContours = buildPlanningSitesContoursExportGeoJson(plans);
      const buildingExtents = buildPlanningSitesBuildingsExportGeoJson(plans);
      const name = planningSitesBatchExportName(selectedSites);
      downloadPlanningSiteGeoJson(siteContours, `${name}_contours_sites.geojson`);
      downloadPlanningSiteGeoJson(buildingExtents, `${name}_emprises_batiments.geojson`);
      setSitesPlanningExportStatus(
        `Export genere : ${siteContours.features.length.toLocaleString(locale)} contour(s), ${buildingExtents.features.length.toLocaleString(locale)} emprise(s).`,
        "is-success"
      );
    } catch (error) {
      setSitesPlanningExportStatus("Export GeoJSON impossible.", "is-error");
    }
  }

  function buildPlanningSitesContoursExportGeoJson(plans = []) {
    return {
      type: "FeatureCollection",
      name: "contours_sites",
      features: plans
        .map((plan) => plan.site)
        .filter((site) => site?.polygon_geo?.type === "Polygon")
        .map((site) => ({
          type: "Feature",
          properties: planningSiteExportProperties(site, "site_contour"),
          geometry: site.polygon_geo
        }))
    };
  }

  function buildPlanningSitesBuildingsExportGeoJson(plans = []) {
    const features = [];
    plans.forEach((plan) => {
      const site = plan.site;
      const buildings = plan.buildings?.type === "FeatureCollection" ? plan.buildings.features || [] : [];
      buildings.forEach((feature, index) => {
        if (!feature?.geometry) {
          return;
        }
        features.push({
          type: "Feature",
          properties: {
            ...(feature.properties || {}),
            ...planningSiteExportProperties(site, "building_extent"),
            building_export_index: index + 1
          },
          geometry: feature.geometry
        });
      });
    });
    return {
      type: "FeatureCollection",
      name: "emprises_batiments",
      features
    };
  }

  function planningSitesBatchExportName(sites = []) {
    if (sites.length === 1) {
      return selectedPlanningSiteExportName(sites[0]);
    }
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `sites_${sites.length}_${stamp}`;
  }

  async function exportSelectedPlanningSiteGeoJson() {
    if (!selectedPlanningSite) {
      setSitesPlanningFeedback("Selectionnez un site a exporter.", "is-error");
      return;
    }
    if (planningOsmBuildingCount(selectedPlanningSite) <= 0) {
      setSitesPlanningFeedback("Export impossible : aucune emprise de batiment importee pour ce site.", "is-error");
      updatePlanningLocationActions();
      return;
    }
    try {
      const planData = await fetchSelectedPlanningSitePlanData(selectedPlanningSite.id);
      selectedPlanningSite.emprise_bat_osm = planData.buildings;
      const geojson = buildSelectedPlanningSiteExportGeoJson(planData);
      if (!geojson.features.some((feature) => feature.properties?.feature_role === "building_extent")) {
        throw new Error("missing_building_extents");
      }
      downloadPlanningSiteGeoJson(geojson, selectedPlanningSiteExportFilename(planData.site || selectedPlanningSite));
      setSitesPlanningFeedback("Export GeoJSON genere.", "is-success");
      updatePlanningLocationActions();
    } catch (error) {
      const message = error.message === "missing_building_extents"
        ? "Export impossible : aucune emprise de batiment importee pour ce site."
        : "Export GeoJSON impossible.";
      setSitesPlanningFeedback(message, "is-error");
      updatePlanningLocationActions();
    }
  }

  function buildSelectedPlanningSiteExportGeoJson(planData = {}) {
    const site = planData.site || selectedPlanningSite;
    const buildings = planData.buildings?.type === "FeatureCollection"
      ? planData.buildings.features || []
      : selectedPlanningSite.emprise_bat_osm?.features || [];
    const features = [];
    if (site?.polygon_geo?.type === "Polygon") {
      features.push({
        type: "Feature",
        properties: planningSiteExportProperties(site, "site_contour"),
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
          ...planningSiteExportProperties(site, "building_extent"),
          building_export_index: index + 1
        },
        geometry: feature.geometry
      });
    });
    return {
      type: "FeatureCollection",
      name: selectedPlanningSiteExportName(site),
      features
    };
  }

  function planningSiteExportProperties(site, role) {
    return {
      feature_role: role,
      site_id: site?.id || selectedPlanningSite.id,
      site_code: site?.code || selectedPlanningSite.code || "",
      site_name: site?.site_name || selectedPlanningSite.site_name || "",
      region: site?.region || selectedPlanningSite.region || "",
      ministere: site?.ministere || selectedPlanningSite.ministere || "",
      localite: site?.localite || selectedPlanningSite.localite || ""
    };
  }

  function selectedPlanningSiteExportName(site) {
    return `site_${slugifyPlanningSiteExport([site?.code, site?.site_name].filter(Boolean).join("_") || site?.id || "selection")}`;
  }

  function selectedPlanningSiteExportFilename(site) {
    return `${selectedPlanningSiteExportName(site)}_contour_batiments.geojson`;
  }

  function downloadPlanningSiteGeoJson(geojson, filename) {
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

  function slugifyPlanningSiteExport(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      || "site";
  }

  function buildSelectedPlanningSitePlanPayload(form, options = {}, planData = {}) {
    const planType = form.elements.plan_type?.value || "satellite";
    const numberingMode = form.elements.numbering_mode?.value || "auto";
    const site = planData.site || selectedPlanningSite;
    const buildings = planData.buildings || selectedPlanningSite.emprise_bat_osm || { type: "FeatureCollection", features: [] };
    const features = numberedPreparedBuildingFeatures(
      preparedBuildingsFeaturesInPrintExtent(buildings.features || []),
      numberingMode
    );
    return {
      autoPrint: Boolean(options.autoPrint),
      planType,
      numberingMode,
      generatedAt: new Date().toLocaleString(locale),
      metadata: {
        siteName: site.site_name || site.code || "-",
        siteCode: site.code || "-",
        mission: planData.mission?.name || "Mission courante",
        region: site.region || "-"
      },
      style: {
        strokeColor: planningOsmBuildingStylePrefs.strokeColor,
        strokeWeight: planningOsmBuildingStylePrefs.strokeWeight,
        dashStyle: planningOsmBuildingStylePrefs.dashStyle,
        dashArray: dashArrayForStyle(planningOsmBuildingStylePrefs.dashStyle),
        fillOpacity: planningOsmBuildingStylePrefs.fillOpacity
      },
      labels: {
        size: normalizedPlanLabelSize(form.elements.label_size?.value),
        opacity: normalizedPlanLabelOpacity(form.elements.label_opacity?.value)
      },
      page: resolvePreparedBuildingsPrintPage(form),
      printBounds: {
        south: printExtentBounds.getSouth(),
        west: printExtentBounds.getWest(),
        north: printExtentBounds.getNorth(),
        east: printExtentBounds.getEast()
      },
      featureCollection: {
        type: "FeatureCollection",
        features
      },
      buildings: features.map((feature) => ({
        number: feature.properties.plan_number,
        koboBuildingNumber: "",
        fieldSituation: feature.properties.field_situation || feature.properties.situation_terrain || "",
        supervisorNote: "",
        cartographyAction: feature.properties.cartography_action || feature.properties.action_carto || "",
        source: feature.properties.source || "-"
      }))
    };
  }

  function setSelectedPlanningSitePlanFeedback(feedback, message, className = "") {
    if (!feedback) {
      return;
    }
    feedback.textContent = message;
    feedback.className = `sites-planning-plan-feedback ${className}`.trim();
  }

  function renderSelectedPlanningSiteGeometry() {
    sitesPlanningGeometryLayer.clearLayers();
    spatialReferenceFocusLayer.clearLayers();
    planningReferenceMarker = null;
    planningContourLayer = null;
    planningOsmBuildingsLayer = null;
    planningSpatialReferenceLayers = { siteContours: null, buildingExtents: null, networkPoints: null };
    planningDraftLayer = null;
    if (!selectedPlanningSite) {
      return;
    }
    if (selectedPlanningSite.point_geo?.type === "Point") {
      const latlng = geoJsonPointToLatLng(selectedPlanningSite.point_geo);
      planningReferenceMarker = L.marker(latlng, {
        title: selectedPlanningSite.site_name || "Reference site"
      }).addTo(sitesPlanningGeometryLayer);
    }
    if (selectedPlanningSite.polygon_geo?.type === "Polygon") {
      planningContourLayer = L.geoJSON(selectedPlanningSite.polygon_geo, {
        style: planningSiteContourStyle
      }).addTo(sitesPlanningGeometryLayer);
    }
    if (selectedPlanningSite.emprise_bat_osm?.type === "FeatureCollection") {
      planningOsmBuildingsLayer = L.geoJSON(selectedPlanningSite.emprise_bat_osm, {
        style: planningOsmBuildingStyle,
        onEachFeature: bindPlanningOsmBuildingPopup
      }).addTo(sitesPlanningGeometryLayer);
    }
  }

  function zoomToPlanningSiteGeometry(site) {
    const referenceBounds = spatialReferenceBounds();
    if (referenceBounds?.isValid()) {
      map.fitBounds(referenceBounds, { padding: [30, 30], maxZoom: 18 });
      return;
    }
    if (site.polygon_geo?.type === "Polygon" && planningContourLayer?.getBounds?.().isValid()) {
      map.fitBounds(planningContourLayer.getBounds(), { padding: [30, 30], maxZoom: 18 });
      return;
    }
    if (site.emprise_bat_osm?.type === "FeatureCollection" && planningOsmBuildingsLayer?.getBounds?.().isValid()) {
      map.fitBounds(planningOsmBuildingsLayer.getBounds(), { padding: [30, 30], maxZoom: 18 });
      return;
    }
    if (site.point_geo?.type === "Point") {
      map.flyTo(geoJsonPointToLatLng(site.point_geo), Math.max(map.getZoom(), 16), { animate: true, duration: 0.8 });
    }
  }

  function hasPlanningSiteMapGeometry(site) {
    return site?.polygon_geo?.type === "Polygon"
      || site?.point_geo?.type === "Point"
      || site?.emprise_bat_osm?.type === "FeatureCollection"
      || spatialReferenceBounds()?.isValid();
  }

  function loadSpatialReferenceForFocus(context = {}) {
    const params = new URLSearchParams();
    if (context.siteCode) {
      params.set("site_code", context.siteCode);
    }
    if (context.koboId) {
      params.set("kobo_id", context.koboId);
    }
    if (!params.toString()) {
      return Promise.resolve(null);
    }

    const token = ++spatialReferenceRequestToken;
    return fetch(`/api/sites/spatial-reference?${params.toString()}`, {
      headers: { "Accept": "application/json" }
    })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (token !== spatialReferenceRequestToken) {
          return null;
        }
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "spatial_reference_load_failed");
        }
        renderSpatialReferenceFocus(payload, context);
        if (selectedPlanningSite && context.siteCode && selectedPlanningSite.code === context.siteCode) {
          zoomToPlanningSiteGeometry(selectedPlanningSite);
        } else {
          const bounds = spatialReferenceBounds();
          if (bounds?.isValid()) {
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
          }
        }
        return payload;
      })
      .catch(() => {
        if (token === spatialReferenceRequestToken) {
          spatialReferenceFocusLayer.clearLayers();
          planningSpatialReferenceLayers = { siteContours: null, buildingExtents: null, networkPoints: null };
        }
        return null;
      });
  }

  function renderSpatialReferenceFocus(payload, context = {}) {
    spatialReferenceFocusLayer.clearLayers();
    planningSpatialReferenceLayers = { siteContours: null, buildingExtents: null, networkPoints: null };
    planningSpatialReferenceLayers.siteContours = addSpatialReferenceGeoJson(payload.site_contours, {
      style: spatialReferenceSiteContourStyle,
      label: "Contour site",
      siteName: context.siteName
    });
    planningSpatialReferenceLayers.buildingExtents = addSpatialReferenceGeoJson(payload.building_extents, {
      style: spatialReferenceBuildingStyle,
      label: "Emprise bâtiment",
      siteName: context.siteName
    });
    planningSpatialReferenceLayers.networkPoints = addSpatialReferenceGeoJson(payload.network_points, {
      pointToLayer: spatialReferenceNetworkPointLayer,
      label: "Noeud reseau",
      siteName: context.siteName
    });
  }

  function addSpatialReferenceGeoJson(collection, options = {}) {
    if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features) || !collection.features.length) {
      return null;
    }
    const layer = L.geoJSON(collection, {
      style: options.style,
      pointToLayer(feature, latlng) {
        return typeof options.pointToLayer === "function"
          ? options.pointToLayer(feature, latlng)
          : L.circleMarker(latlng, {
            color: options.pointColor || "#0f766e",
            fillColor: options.pointColor || "#0f766e",
            fillOpacity: 0.9,
            radius: 7,
            weight: 2
          });
      },
      onEachFeature(feature, featureLayer) {
        bindSpatialReferencePopup(feature, featureLayer, options);
      }
    }).addTo(spatialReferenceFocusLayer);
    return layer;
  }

  function bindSpatialReferencePopup(feature, layer, options = {}) {
    const props = feature.properties || {};
    layer.bindPopup([
      `<strong>${escapeHtml(options.label || props.entity_type || "Entite")}</strong>`,
      props.site_code ? `Site code : ${escapeHtml(props.site_code)}` : "",
      props.kobo_id ? `Kobo ID : ${escapeHtml(props.kobo_id)}` : "",
      props.building_code ? `Batiment : ${escapeHtml(props.building_code)}` : "",
      props.nature_point ? `Type : ${escapeHtml(props.nature_point)}` : "",
      props.name ? `Nom : ${escapeHtml(props.name)}` : "",
      options.siteName ? `Site : ${escapeHtml(options.siteName)}` : ""
    ].filter(Boolean).join("<br>"));
  }

  function spatialReferenceBounds() {
    const bounds = L.latLngBounds([]);
    spatialReferenceFocusLayer.eachLayer((layer) => {
      if (typeof layer.getBounds === "function" && layer.getBounds().isValid()) {
        bounds.extend(layer.getBounds());
      } else if (typeof layer.getLatLng === "function") {
        bounds.extend(layer.getLatLng());
      }
    });
    return bounds;
  }

  function planningOsmBuildingStyle() {
    return mapFeatureStyle(planningOsmBuildingStylePrefs);
  }

  function planningSiteContourStyle() {
    return mapFeatureStyle(siteContourStylePrefs);
  }

  function spatialReferenceSiteContourStyle() {
    return mapFeatureStyle(spatialReferenceStylePrefs.siteContour);
  }

  function spatialReferenceBuildingStyle() {
    return mapFeatureStyle(spatialReferenceStylePrefs.buildingExtent);
  }

  function spatialReferenceNetworkPointLayer(feature, latlng) {
    if (isSpatialReferencePylone(feature)) {
      return L.marker(latlng, {
        icon: spatialReferencePyloneIcon()
      });
    }
    return L.circleMarker(latlng, {
      color: spatialReferenceStylePrefs.network.chamberStrokeColor,
      fillColor: spatialReferenceStylePrefs.network.chamberFillColor,
      fillOpacity: 0.95,
      radius: spatialReferenceStylePrefs.network.chamberRadius,
      weight: 2
    });
  }

  function spatialReferencePyloneIcon() {
    const color = spatialReferenceStylePrefs.network.pyloneColor;
    return L.divIcon({
      className: "spatial-reference-pylone-icon",
      html: `<span style="color:${escapeHtml(color)}"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i></span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });
  }

  function isSpatialReferencePylone(feature) {
    return String(feature?.properties?.nature_point || "")
      .toLowerCase()
      .includes("pylone");
  }

  function bindPlanningOsmBuildingPopup(feature, layer) {
    const props = feature.properties || {};
    layer.bindPopup([
      `<strong>${escapeHtml(props.building_code || props.name || "Bâtiment OSM")}</strong>`,
      props.source_reference ? `Source : ${escapeHtml(props.source_reference)}` : "",
      selectedPlanningSite?.site_name ? `Site : ${escapeHtml(selectedPlanningSite.site_name)}` : ""
    ].filter(Boolean).join("<br>"));
  }

  function geoJsonPointToLatLng(point) {
    return L.latLng(Number(point.coordinates[1]), Number(point.coordinates[0]));
  }

  function startPlanningPointCapture() {
    if (!selectedPlanningSite) {
      return;
    }
    planningLocationMode = "point";
    planningContourPoints = [];
    planningDraftPointGeo = null;
    planningDraftPolygonGeo = null;
    clearPlanningDraftLayer();
    setSitesPlanningFeedback("Cliquez sur la carte pour placer le point de reference.");
    map.getContainer().classList.add("is-planning-location-capture");
    updatePlanningLocationActions();
  }

  function startPlanningContourCapture() {
    if (!selectedPlanningSite) {
      return;
    }
    planningLocationMode = "polygon";
    planningContourPoints = [];
    planningDraftPointGeo = null;
    planningDraftPolygonGeo = null;
    clearPlanningDraftLayer();
    setSitesPlanningFeedback("Cliquez pour tracer le contour. Double-cliquez pour terminer.");
    map.getContainer().classList.add("is-planning-location-capture");
    updatePlanningLocationActions();
  }

  function handlePlanningLocationClick(event) {
    if (!planningLocationMode || !selectedPlanningSite) {
      return false;
    }
    if (planningLocationMode === "point") {
      planningDraftPointGeo = {
        type: "Point",
        coordinates: [event.latlng.lng, event.latlng.lat]
      };
      renderPlanningDraftPoint(event.latlng);
      setSitesPlanningFeedback("Point de reference saisi. Cliquez sur Enregistrer pour valider.");
      updatePlanningLocationActions();
      return true;
    }
    if (planningLocationMode === "polygon") {
      planningContourPoints.push(event.latlng);
      renderPlanningDraftPolygon();
      if (planningContourPoints.length >= 3) {
        planningDraftPolygonGeo = buildPlanningDraftPolygonGeoJson();
        setSitesPlanningFeedback("Contour valide. Cliquez sur Enregistrer pour valider.");
      }
      updatePlanningLocationActions();
      return true;
    }
    return false;
  }

  function finishPlanningContourCapture(event) {
    if (planningLocationMode !== "polygon" || !selectedPlanningSite) {
      return false;
    }
    event?.originalEvent?.preventDefault();
    if (planningContourPoints.length < 3) {
      setSitesPlanningFeedback("Le contour doit contenir au moins 3 points.", "is-error");
      updatePlanningLocationActions();
      return true;
    }
    planningDraftPolygonGeo = buildPlanningDraftPolygonGeoJson();
    renderPlanningDraftPolygon();
    setSitesPlanningFeedback("Contour valide. Cliquez sur Enregistrer pour valider.");
    updatePlanningLocationActions();
    return true;
  }

  function buildPlanningDraftPolygonGeoJson() {
    if (planningContourPoints.length < 3) {
      return null;
    }
    const ring = planningContourPoints.map((latlng) => [latlng.lng, latlng.lat]);
    ring.push(ring[0]);
    return {
      type: "Polygon",
      coordinates: [ring]
    };
  }

  function renderPlanningDraftPoint(latlng) {
    clearPlanningDraftLayer();
    planningDraftLayer = L.circleMarker(latlng, {
      color: "#a93636",
      fillColor: "#fff",
      fillOpacity: 1,
      radius: 6,
      weight: 2
    }).addTo(sitesPlanningGeometryLayer);
  }

  function renderPlanningDraftPolygon() {
    clearPlanningDraftLayer();
    planningDraftLayer = planningContourPoints.length > 1
      ? L.polyline(planningContourPoints, { color: "#a93636", dashArray: "5 5", weight: 2 }).addTo(sitesPlanningGeometryLayer)
      : L.circleMarker(planningContourPoints[0], { color: "#a93636", radius: 5 }).addTo(sitesPlanningGeometryLayer);
  }

  function clearPlanningDraftLayer() {
    if (planningDraftLayer) {
      sitesPlanningGeometryLayer.removeLayer(planningDraftLayer);
      planningDraftLayer = null;
    }
  }

  function currentPlanningDraftPayload() {
    if (planningLocationMode === "point" && planningDraftPointGeo) {
      return { point_geo: planningDraftPointGeo };
    }
    if (planningLocationMode === "polygon" && planningDraftPolygonGeo) {
      return { polygon_geo: planningDraftPolygonGeo };
    }
    return null;
  }

  function cancelPlanningLocationEdit(options = {}) {
    planningLocationMode = null;
    planningContourPoints = [];
    planningDraftPointGeo = null;
    planningDraftPolygonGeo = null;
    clearPlanningDraftLayer();
    map.getContainer().classList.remove("is-planning-location-capture");
    if (!options.silent) {
      setSitesPlanningFeedback("Edition annulee.");
    }
    updatePlanningLocationActions();
  }

  function savePlanningSiteLocation(payload) {
    const siteId = selectedPlanningSite?.id;
    if (!siteId || !payload) {
      return;
    }
    setSitesPlanningFeedback("Enregistrement de la localisation...");
    fetch(`/api/sites/${encodeURIComponent(siteId)}/location`, {
      method: "PATCH",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("site_location_save_failed");
        }
        return response.json();
      })
      .then((responsePayload) => {
        const updatedSite = responsePayload.site;
        sitesPlanningData = sitesPlanningData.map((site) => site.id === updatedSite.id ? updatedSite : site);
        selectedPlanningSite = updatedSite;
        planningLocationMode = null;
        planningContourPoints = [];
        planningDraftPointGeo = null;
        planningDraftPolygonGeo = null;
        map.getContainer().classList.remove("is-planning-location-capture");
        setSitesPlanningFeedback("Localisation enregistree.", "is-success");
        renderSelectedPlanningSiteGeometry();
        updatePlanningLocationActions();
        renderSitesPlanningTable();
      })
      .catch(() => {
        setSitesPlanningFeedback("Impossible d'enregistrer la localisation.", "is-error");
      });
  }

  function findSubmissionPointForPlanningSite(site) {
    const siteName = normalizeLookup(site.site_name);
    if (!siteName) {
      return null;
    }
    return points.find((point) => {
      const raw = rawData(point);
      const officialName = rawValue(raw, "modB.nom_officiel") || rawValue(raw, "modB/nom_officiel") || point.display_submission_id;
      return normalizeLookup(officialName) === siteName;
    }) || null;
  }

  function normalizeLookup(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function setupSitesPlanningPaneResize(container) {
    const explorer = container.querySelector("#sig-sites-planning-explorer");
    const resizerNode = container.querySelector("#sig-sites-planning-pane-resizer");
    if (!explorer || !resizerNode) {
      return;
    }
    resizerNode.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      resizerNode.setPointerCapture(event.pointerId);
      explorer.classList.add("is-resizing");
      const onMove = function (moveEvent) {
        const rect = explorer.getBoundingClientRect();
        const minLeft = 210;
        const minRight = 300;
        const requestedWidth = moveEvent.clientX - rect.left;
        const maxLeft = Math.max(minLeft, rect.width - minRight);
        const nextWidth = Math.min(Math.max(requestedWidth, minLeft), maxLeft);
        explorer.style.setProperty("--sites-tree-width", `${Math.round(nextWidth)}px`);
        if (sitesPlanningTable) {
          sitesPlanningTable.redraw();
        }
      };
      const onUp = function (upEvent) {
        explorer.classList.remove("is-resizing");
        resizerNode.releasePointerCapture(upEvent.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  const table = new Tabulator("#sig-table", {
    data: [],
    height: "100%",
    layout: "fitColumns",
    placeholder: t("tableEmpty"),
    columns: buildVisitedSitesTableColumns(),
    rowFormatter(row) {
      row.getElement().classList.toggle("is-selected-site", siteMarkerKey(row.getData()) === selectedSiteId);
    }
  });
  let lastVisitedSitesRows = [];

  table.on("rowClick", function (event, row) {
    const point = row.getData();
    selectSite(point);
    flyToSubmission(point);
  });

  function syncVisitedSitesTable(visiblePoints = currentVisiblePoints()) {
    lastVisitedSitesRows = visiblePoints;
    return Promise.resolve(table.setData(visiblePoints)).then(function () {
      updateSelectedSiteTableRowStyles();
      scheduleVisitedSitesTableRedraw();
    });
  }

  function scheduleVisitedSitesTableRedraw() {
    window.requestAnimationFrame(function () {
      table.redraw(true);
    });
  }

  let palLayoutFrame = null;

  function refreshPalLayout() {
    if (palLayoutFrame) {
      return;
    }
    palLayoutFrame = window.requestAnimationFrame(function () {
      palLayoutFrame = null;
      if (table && typeof table.redraw === "function") {
        scheduleVisitedSitesTableRedraw();
      }
      if (sitesPlanningTable && typeof sitesPlanningTable.redraw === "function") {
        sitesPlanningTable.redraw();
      }
      map.invalidateSize();
    });
  }

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

  function openSitePopup(point) {
    const markers = siteMarkersById.get(siteMarkerKey(point)) || [];
    const marker = markers.find((candidate) => map.hasLayer(candidate)) || markers[0];
    if (!marker) {
      return;
    }
    window.setTimeout(function () {
      marker.openPopup();
    }, 250);
  }

  function applyMarkerBounceConfig() {
    const duration = Number(geometryImportConfig.markerBounceDurationMs);
    const normalizedDuration = Number.isInteger(duration) && duration >= 100 && duration <= 5000 ? duration : 600;
    markerBounceDurationMs = normalizedDuration;
    document.documentElement.style.setProperty("--marker-bounce-duration", `${normalizedDuration}ms`);
  }

  function siteLabelWrapLength() {
    const length = Number(geometryImportConfig.siteLabelWrapLength);
    return Number.isInteger(length) && length >= 10 && length <= 80 ? length : 30;
  }

  function agentTeamFormatter(cell) {
    const point = cell.getData();
    return escapeHtml([
      point.code_agent || t("unlinkedAgent"),
      point.nom_equipe || t("noTeam")
    ].join("/"));
  }

  function buildVisitedSitesTableColumns() {
    return selectedVisitedSitesColumnFields().map((field) => {
      const definition = visitedSitesAvailableColumns.find((column) => column.field === field);
      return {
        title: definition?.title || field,
        field,
        minWidth: definition?.minWidth || 120,
        formatter: definition?.formatter || visitedSiteFieldFormatter,
        sorter: visitedSiteColumnSorter(field),
        headerSort: true
      };
    });
  }

  function visitedSiteColumnSorter(field) {
    return function (a, b, aRow, bRow) {
      const aValue = normalizeVisitedSiteSortValue(aRow.getData(), field);
      const bValue = normalizeVisitedSiteSortValue(bRow.getData(), field);
      if (typeof aValue === "number" && typeof bValue === "number") {
        return aValue - bValue;
      }
      return String(aValue).localeCompare(String(bValue), locale, {
        numeric: true,
        sensitivity: "base"
      });
    };
  }

  function normalizeVisitedSiteSortValue(point, field) {
    const value = formatVisitedSiteSortValue(point, field);
    if (value === null || value === undefined || value === "") {
      return "";
    }
    const numeric = Number(value);
    if (field === "_id" && Number.isFinite(numeric)) {
      return numeric;
    }
    return String(value).trim();
  }

  function formatVisitedSiteSortValue(point, field) {
    const value = visitedSiteFieldValue(point, field);
    if (["modB/region", "modB/departement", "modB/sous_prefecture", "modB/ministere"].includes(field)) {
      return resolveAdministrativeChoice(field, value);
    }
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    if (value && typeof value === "object") {
      return JSON.stringify(value);
    }
    return value;
  }

  function selectedVisitedSitesColumnFields() {
    const available = new Set(visitedSitesAvailableColumns.map((column) => column.field));
    const stored = loadVisitedSitesColumnFields();
    const selected = (stored.length ? stored : visitedSitesDefaultColumns)
      .filter((field) => available.has(field));
    return [
      ...visitedSitesMandatoryColumns,
      ...selected.filter((field) => !visitedSitesMandatoryColumns.includes(field))
    ];
  }

  function loadVisitedSitesColumnFields() {
    try {
      const fields = JSON.parse(localStorage.getItem(visitedSitesColumnPrefsKey) || "[]");
      return Array.isArray(fields) ? fields : [];
    } catch (error) {
      return [];
    }
  }

  function saveVisitedSitesColumnFields(fields) {
    const available = new Set(visitedSitesAvailableColumns.map((column) => column.field));
    const nextFields = [
      ...visitedSitesMandatoryColumns,
      ...fields.filter((field) => available.has(field) && !visitedSitesMandatoryColumns.includes(field))
    ];
    try {
      localStorage.setItem(visitedSitesColumnPrefsKey, JSON.stringify(nextFields));
    } catch (error) {
      // The table remains usable if browser storage is disabled.
    }
    table.setColumns(buildVisitedSitesTableColumns());
    syncVisitedSitesTable(currentVisiblePoints());
  }

  function visitedSiteFieldFormatter(cell) {
    return escapeHtml(formatVisitedSiteValue(cell.getData(), cell.getColumn().getField()));
  }

  function administrativeChoiceFormatter(cell) {
    const field = cell.getColumn().getField();
    const value = visitedSiteFieldValue(cell.getData(), field);
    return escapeHtml(resolveAdministrativeChoice(field, value));
  }

  function resolveAdministrativeChoice(field, value) {
    const choiceListByField = {
      "modB/region": "adm1_ci",
      "modB/departement": "adm2_ci",
      "modB/sous_prefecture": "adm3_ci",
      "modB/ministere": "ministere",
      "modB/type_infra": "secteur",
      "modB/sous_type": "sous_type",
      "modB/milieu": "milieu"
    };
    const raw = value === undefined || value === null ? "" : String(value);
    const choiceListName = choiceListByField[field];
    if (!raw || !choiceListName) {
      return raw;
    }
    return administrativeChoices?.[choiceListName]?.[raw] || raw;
  }

  function administrativeChoiceItems(choiceListName) {
    const choices = administrativeChoiceLists?.[choiceListName];
    if (Array.isArray(choices) && choices.length) {
      return choices;
    }
    return Object.entries(administrativeChoices?.[choiceListName] || {}).map(([name, label]) => ({
      name,
      label,
      filters: {}
    }));
  }

  function filterAdministrativeChoices(choiceListName, dependencyName, dependencyValue) {
    const choices = administrativeChoiceItems(choiceListName);
    if (!dependencyValue) {
      return [];
    }
    return choices.filter((choice) => String(choice.filters?.[dependencyName] || "") === String(dependencyValue));
  }

  function populateAdministrativeSelect(select, choices, placeholder) {
    if (!select) {
      return;
    }
    const previous = select.value;
    select.replaceChildren(new Option(placeholder, ""));
    choices.forEach((choice) => {
      select.append(new Option(choice.label || choice.name, choice.name));
    });
    select.disabled = choices.length === 0;
    select.value = choices.some((choice) => String(choice.name) === previous) ? previous : "";
  }

  function updateAdministrativeFilterCascade(selected = {}) {
    const regionSelect = document.getElementById("sig-region-filter");
    const departmentSelect = document.getElementById("sig-department-filter");
    const subprefectureSelect = document.getElementById("sig-subprefecture-filter");
    const region = selected.region !== undefined ? selected.region : regionSelect?.value || "";
    if (regionSelect && selected.region !== undefined) {
      regionSelect.value = selected.region || "";
    }
    populateAdministrativeSelect(
      departmentSelect,
      filterAdministrativeChoices("adm2_ci", "region", region),
      "Tous les départements"
    );
    if (departmentSelect && selected.department !== undefined) {
      departmentSelect.value = Array.from(departmentSelect.options).some((option) => option.value === selected.department)
        ? selected.department
        : "";
    }
    const department = departmentSelect?.value || "";
    populateAdministrativeSelect(
      subprefectureSelect,
      filterAdministrativeChoices("adm3_ci", "dept", department),
      "Toutes les sous-préfectures"
    );
    if (subprefectureSelect && selected.subprefecture !== undefined) {
      subprefectureSelect.value = Array.from(subprefectureSelect.options).some((option) => option.value === selected.subprefecture)
        ? selected.subprefecture
        : "";
    }
  }

  function visitedSiteDateFormatter(cell) {
    const value = formatVisitedSiteValue(cell.getData(), cell.getColumn().getField());
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    return escapeHtml(Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale));
  }

  function formatVisitedSiteValue(point, field) {
    const value = visitedSiteFieldValue(point, field);
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    if (value && typeof value === "object") {
      return JSON.stringify(value);
    }
    return value ?? "";
  }

  function visitedSiteFieldValue(point, field) {
    const raw = rawData(point);
    if (field === "_id") {
      return rawValue(raw, "_id") ?? point.source_submission_id ?? point.id;
    }
    if (field === "_submission_time") {
      return rawValue(raw, "_submission_time") ?? point.submitted_at;
    }
    if (field === "_geolocation") {
      return rawValue(raw, "_geolocation") ?? [point.latitude, point.longitude].filter((value) => value !== undefined && value !== null);
    }
    return rawValue(raw, field) ?? rawValue(raw, field.replaceAll("/", "."));
  }

  function siteNameFormatter(cell) {
    const point = cell.getData();
    const raw = rawData(point);
    const siteName = rawValue(raw, "modB.nom_officiel") || rawValue(raw, "modB/nom_officiel");
    return escapeHtml(siteName || point.display_submission_id || point.source_submission_id || "-");
  }

  function submittedDateFormatter(cell) {
    const value = cell.getValue();
    if (!value) {
      return "-";
    }
    return escapeHtml(new Date(value).toLocaleDateString(locale));
  }

  function siteMarkerKey(pointOrId) {
    const id = typeof pointOrId === "object" ? pointOrId?.id : pointOrId;
    return id === null || id === undefined ? null : String(id);
  }

  function markerIconElement(marker) {
    if (!marker) {
      return null;
    }
    return marker._icon || marker.getElement?.() || null;
  }

  function clearMarkerBounceTimer(marker) {
    const timeout = markerBounceTimers.get(marker);
    if (timeout) {
      window.clearTimeout(timeout);
      markerBounceTimers.delete(marker);
    }
  }

  function setSiteMarkerBounce(marker, active) {
    const icon = markerIconElement(marker);
    clearMarkerBounceTimer(marker);
    if (!icon) {
      return;
    }
    icon.classList.remove("marker-bounce");
    if (!active) {
      return;
    }
    void icon.offsetWidth;
    icon.classList.add("marker-bounce");
    markerBounceTimers.set(marker, window.setTimeout(function () {
      icon.classList.remove("marker-bounce");
      markerBounceTimers.delete(marker);
    }, markerBounceDurationMs));
  }

  function updateSelectedSiteMarkerBounce() {
    siteMarkersById.forEach(function (markers, markerKey) {
      markers.forEach(function (marker) {
        setSiteMarkerBounce(marker, markerKey === selectedSiteId);
      });
    });
  }

  function siteLabelText(point) {
    const raw = rawData(point);
    return rawValue(raw, "modB.nom_officiel")
      || rawValue(raw, "modB/nom_officiel")
      || point.display_submission_id
      || point.source_submission_id
      || "";
  }

  function siteLabelHtml(label) {
    return fixedWrapSiteLabel(label, siteLabelWrapLength()).map(function (line) {
      return `<span>${escapeHtml(line)}</span>`;
    }).join("");
  }

  function fixedWrapSiteLabel(label, maxLineLength = 30) {
    const normalized = String(label || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return [];
    }
    const lines = [];
    let currentLine = "";
    normalized.split(" ").forEach(function (word) {
      if (!currentLine) {
        currentLine = word;
        return;
      }
      if (currentLine.length >= maxLineLength) {
        lines.push(currentLine);
        currentLine = word;
        return;
      }
      currentLine = `${currentLine} ${word}`;
    });
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  function updateSiteMarkerLabel(marker, point, selected = false) {
    if (!experimentalSiteLabelsEnabled || !marker || !point) {
      return;
    }
    const label = siteLabelText(point);
    const shouldShow = Boolean(label) && (selected || map.getZoom() >= siteLabelMinZoom);
    if (!shouldShow) {
      marker.unbindTooltip();
      return;
    }
    if (!marker.getTooltip()) {
      marker.bindTooltip(siteLabelHtml(label), {
        permanent: true,
        direction: "bottom",
        offset: [0, 12],
        opacity: 1,
        className: "sig-site-label"
      });
    } else {
      marker.setTooltipContent(siteLabelHtml(label));
    }
    marker.openTooltip();
  }

  function updateSiteMarkerLabels() {
    siteMarkersById.forEach(function (markers, markerKey) {
      markers.forEach(function (marker) {
        updateSiteMarkerLabel(marker, marker.__g2mSitePoint, markerKey === selectedSiteId);
      });
    });
    scheduleSiteLabelCollisionRefresh();
  }

  function scheduleSiteLabelCollisionRefresh() {
    if (siteLabelCollisionFrame) {
      return;
    }
    siteLabelCollisionFrame = window.requestAnimationFrame(function () {
      siteLabelCollisionFrame = null;
      resolveSiteLabelCollisions();
      window.requestAnimationFrame(resolveSiteLabelCollisions);
    });
  }

  function resolveSiteLabelCollisions() {
    const labels = [];
    siteMarkersById.forEach(function (markers, markerKey) {
      markers.forEach(function (marker) {
        if (!map.hasLayer(marker)) {
          return;
        }
        const element = marker.getTooltip?.()?.getElement?.();
        if (!element) {
          return;
        }
        element.classList.remove("sig-site-label-hidden");
        const rect = siteLabelCollisionRect(element);
        if (!rect) {
          return;
        }
        labels.push({
          element,
          rect,
          markerKey,
          priority: siteLabelCollisionPriority(markerKey),
          selected: markerKey === selectedSiteId
        });
      });
    });

    const accepted = [];
    labels
      .sort(siteLabelCollisionSort)
      .forEach(function (label) {
        const collides = accepted.some(function (acceptedRect) {
          return siteLabelRectsCollide(label.rect, acceptedRect);
        });
        label.element.classList.toggle("sig-site-label-hidden", collides && !label.selected);
        if (!collides || label.selected) {
          accepted.push(label.rect);
        }
      });
  }

  function siteLabelCollisionPriority(markerKey) {
    return markerKey === selectedSiteId ? 0 : 1;
  }

  function siteLabelCollisionSort(left, right) {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    if (left.rect.top !== right.rect.top) {
      return left.rect.top - right.rect.top;
    }
    if (left.rect.left !== right.rect.left) {
      return left.rect.left - right.rect.left;
    }
    return String(left.markerKey || "").localeCompare(String(right.markerKey || ""));
  }

  function siteLabelCollisionRect(element) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    return {
      left: rect.left - siteLabelCollisionPadding,
      right: rect.right + siteLabelCollisionPadding,
      top: rect.top - siteLabelCollisionPadding,
      bottom: rect.bottom + siteLabelCollisionPadding
    };
  }

  function siteLabelRectsCollide(left, right) {
    return left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top;
  }

  function registerSiteMarker(point, marker) {
    const markerKey = siteMarkerKey(point);
    if (!markerKey) {
      return marker;
    }
    marker.__g2mSitePoint = point;
    if (!siteMarkersById.has(markerKey)) {
      siteMarkersById.set(markerKey, []);
    }
    siteMarkersById.get(markerKey).push(marker);
    marker.on("add", function () {
      setSiteMarkerBounce(marker, markerKey === selectedSiteId);
      updateSiteMarkerLabel(marker, point, markerKey === selectedSiteId);
      scheduleSiteLabelCollisionRefresh();
    });
    marker.on("remove", function () {
      setSiteMarkerBounce(marker, false);
      marker.unbindTooltip();
    });
    return marker;
  }

  function selectSite(pointOrId) {
    const nextSiteId = siteMarkerKey(pointOrId);
    if (selectedSiteId === nextSiteId) {
      updateSelectedSiteMarkerBounce();
      updateSiteMarkerLabels();
      updateSelectedSiteTableRowStyles();
      loadSpatialReferenceForVisitedSite(pointOrId);
      return;
    }
    selectedSiteId = nextSiteId;
    updateSelectedSiteMarkerBounce();
    updateSiteMarkerLabels();
    updateSelectedSiteTableRowStyles();
    loadSpatialReferenceForVisitedSite(pointOrId);
  }

  function loadSpatialReferenceForVisitedSite(pointOrId) {
    if (!pointOrId || typeof pointOrId !== "object") {
      return;
    }
    const raw = rawData(pointOrId);
    const koboId = rawValue(raw, "_id")
      || rawValue(raw, "id")
      || rawValue(raw, "kobo_id")
      || pointOrId.display_submission_id
      || pointOrId.source_submission_id;
    loadSpatialReferenceForFocus({
      koboId,
      siteName: rawValue(raw, "modB.nom_officiel") || rawValue(raw, "modB/nom_officiel") || pointOrId.display_submission_id
    });
  }

  function updateSelectedSiteTableRowStyles() {
    if (!table || typeof table.getRows !== "function") {
      return;
    }
    table.getRows().forEach(function (row) {
      row.getElement().classList.toggle("is-selected-site", siteMarkerKey(row.getData()) === selectedSiteId);
    });
  }

  function parseTabSeparatedCsv(text) {
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
    if (!lines.length) {
      return { rows: [], errors: [{ line: 1, value: "", message: "Fichier vide." }] };
    }
    const headers = lines[0].split("\t").map((header) => header.trim());
    const expectedHeaders = ["NOM DU SITE", "BATIMENT", "GEOMETRIE", "DENOMINATION"];
    const headerIsValid = expectedHeaders.length === headers.length
      && expectedHeaders.every((header, index) => headers[index] === header);
    if (!headerIsValid) {
      return {
        rows: [],
        errors: [{
          line: 1,
          value: headers.join(" | "),
          message: `En-tête invalide. Colonnes attendues : ${expectedHeaders.join(", ")}.`
        }]
      };
    }
    const rows = [];
    const errors = [];
    lines.slice(1).forEach((line, index) => {
      const lineNumber = index + 2;
      const values = line.split("\t");
      if (values.length !== expectedHeaders.length) {
        errors.push({
          line: lineNumber,
          value: line,
          message: "Nombre de colonnes invalide."
        });
        return;
      }
      const row = expectedHeaders.reduce((record, header, columnIndex) => {
        record[header] = (values[columnIndex] || "").trim();
        return record;
      }, {});
      if (!row.GEOMETRIE) {
        errors.push({ line: lineNumber, value: "", message: "Champ GEOMETRIE vide." });
        return;
      }
      rows.push({ ...row, lineNumber });
    });
    return { rows, errors };
  }

  function parseImportedGeometry(encodedGeometry) {
    const normalized = String(encodedGeometry || "").trim();
    const typeMatch = normalized.match(/^([A-Za-z]+)\s*\(([\s\S]*)\)$/);
    if (!typeMatch) {
      throw new Error("Géométrie invalide ou parenthèses manquantes.");
    }
    const type = typeMatch[1].toUpperCase();
    const body = typeMatch[2].trim();
    if (type === "POINT") {
      const coordinates = parseEncodedCoordinateList(body);
      if (coordinates.length !== 1) {
        throw new Error("POINT doit contenir un seul couple longitude latitude.");
      }
      return {
        type: "Point",
        coordinates: coordinates[0]
      };
    }
    if (type === "LINE") {
      const coordinates = parseEncodedCoordinateList(body);
      if (coordinates.length < 2) {
        throw new Error("LINE doit contenir au moins deux points.");
      }
      return {
        type: "LineString",
        coordinates
      };
    }
    if (type === "POLYGON") {
      const coordinates = parseEncodedCoordinateList(body);
      if (coordinates.length < 4) {
        throw new Error("POLYGON doit contenir au moins quatre points.");
      }
      if (!sameCoordinatePair(coordinates[0], coordinates[coordinates.length - 1])) {
        throw new Error("POLYGON doit être fermé : le dernier point doit répéter le premier.");
      }
      return {
        type: "Polygon",
        coordinates: [coordinates]
      };
    }
    throw new Error(`Type non supporté : ${type}. Types autorisés : POINT, LINE, POLYGON.`);
  }

  function parseEncodedCoordinateList(text) {
    return String(text)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(parseEncodedCoordinate);
  }

  function parseEncodedCoordinate(text) {
    if (String(text).includes(",")) {
      throw new Error(`Coordonnée invalide : ${text}. Utiliser le point décimal et un espace entre longitude et latitude.`);
    }
    const parts = String(text).trim().split(/\s+/).map(Number);
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
      throw new Error(`Coordonnée invalide : ${text}`);
    }
    if (parts.length > 2) {
      throw new Error(`Coordonnée invalide : ${text}. Seuls longitude et latitude sont attendus.`);
    }
    return [parts[0], parts[1]];
  }

  function sameCoordinatePair(first, second) {
    return Math.abs(first[0] - second[0]) <= 1e-9 && Math.abs(first[1] - second[1]) <= 1e-9;
  }

  function importGeometryFile(text, fileName = "") {
    const extension = String(fileName || "").toLowerCase().split(".").pop();
    if (extension === "gpx") {
      return importGeometryGpx(text, fileName);
    }
    if (extension === "gems") {
      return importGeometryGems(text);
    }
    window.alert("Format non supporte. Utiliser un fichier .gems ou .gpx.");
    return undefined;
  }

  function importGeometryGems(text) {
    const parsed = parseTabSeparatedCsv(text);
    const features = [];
    const errors = [...parsed.errors];
    parsed.rows.forEach((row) => {
      try {
        const geometry = parseImportedGeometry(row.GEOMETRIE);
        features.push({
          type: "Feature",
          properties: {
            id: `imported-${row.lineNumber}`,
            lineNumber: row.lineNumber,
            nomSite: row["NOM DU SITE"],
            batiment: row.BATIMENT,
            denomination: row.DENOMINATION
          },
          geometry
        });
      } catch (error) {
        errors.push({
          line: row.lineNumber,
          value: row.GEOMETRIE,
          message: error.message
        });
        console.warn("Import géométrie ignoré", { line: row.lineNumber, value: row.GEOMETRIE, error });
      }
    });
    renderImportedGeometries(features);
    if (errors.length) {
      window.alert(errors.map((error) => `Ligne ${error.line} : ${error.message}\n${error.value || ""}`).join("\n\n"));
    }
  }

  function importGeometryGpx(text, fileName = "") {
    const parsed = parseGpxFeatures(text, fileName);
    renderImportedGeometries(parsed.features);
    if (parsed.errors.length) {
      window.alert(parsed.errors.map((error) => `${error.label} : ${error.message}`).join("\n\n"));
    }
  }

  function parseGpxFeatures(text, fileName = "") {
    const parser = new DOMParser();
    const document = parser.parseFromString(String(text || ""), "application/xml");
    if (document.querySelector("parsererror")) {
      return {
        features: [],
        errors: [{ label: fileName || "GPX", message: "Fichier GPX invalide ou illisible." }]
      };
    }

    const sourceName = stripFileExtension(fileName) || childText(document.documentElement, "name") || "Import GPX";
    const features = [];
    const errors = [];

    Array.from(document.getElementsByTagName("wpt")).forEach((waypoint, index) => {
      const coordinate = gpxPointCoordinate(waypoint);
      if (!coordinate) {
        errors.push({ label: `Waypoint ${index + 1}`, message: "Coordonnees lat/lon absentes ou invalides." });
        return;
      }
      features.push(gpxFeature({
        id: `gpx-wpt-${index + 1}`,
        sourceName,
        name: childText(waypoint, "name") || `Waypoint ${index + 1}`,
        description: gpxDescription(waypoint),
        geometry: { type: "Point", coordinates: coordinate }
      }));
    });

    Array.from(document.getElementsByTagName("trk")).forEach((track, trackIndex) => {
      const trackName = childText(track, "name") || `Trace ${trackIndex + 1}`;
      Array.from(track.getElementsByTagName("trkseg")).forEach((segment, segmentIndex) => {
        const coordinates = Array.from(segment.getElementsByTagName("trkpt"))
          .map(gpxPointCoordinate)
          .filter(Boolean);
        const label = `${trackName} - segment ${segmentIndex + 1}`;
        const geometry = gpxLineOrPolygonGeometry(coordinates);
        if (!geometry) {
          errors.push({ label, message: "Trace ignoree : moins de deux points valides." });
          return;
        }
        features.push(gpxFeature({
          id: `gpx-trk-${trackIndex + 1}-${segmentIndex + 1}`,
          sourceName,
          name: label,
          description: gpxDescription(track),
          geometry
        }));
      });
    });

    Array.from(document.getElementsByTagName("rte")).forEach((route, routeIndex) => {
      const coordinates = Array.from(route.getElementsByTagName("rtept"))
        .map(gpxPointCoordinate)
        .filter(Boolean);
      const routeName = childText(route, "name") || `Route ${routeIndex + 1}`;
      const geometry = gpxLineOrPolygonGeometry(coordinates);
      if (!geometry) {
        errors.push({ label: routeName, message: "Route ignoree : moins de deux points valides." });
        return;
      }
      features.push(gpxFeature({
        id: `gpx-rte-${routeIndex + 1}`,
        sourceName,
        name: routeName,
        description: gpxDescription(route),
        geometry
      }));
    });

    if (!features.length && !errors.length) {
      errors.push({ label: sourceName, message: "Aucune geometrie GPX exploitable trouvee." });
    }

    return { features, errors };
  }

  function gpxFeature({ id, sourceName, name, description, geometry }) {
    return {
      type: "Feature",
      properties: {
        id,
        lineNumber: "",
        nomSite: sourceName,
        batiment: name,
        denomination: description || geometry.type
      },
      geometry
    };
  }

  function gpxPointCoordinate(node) {
    const latitude = Number(node.getAttribute("lat"));
    const longitude = Number(node.getAttribute("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return [longitude, latitude];
  }

  function gpxLineOrPolygonGeometry(coordinates) {
    if (coordinates.length < 2) {
      return null;
    }
    if (coordinates.length >= 4 && sameCoordinatePair(coordinates[0], coordinates[coordinates.length - 1])) {
      return {
        type: "Polygon",
        coordinates: [coordinates]
      };
    }
    return {
      type: "LineString",
      coordinates
    };
  }

  function childText(node, tagName) {
    const child = Array.from(node.children || []).find((element) => element.localName === tagName);
    return child ? child.textContent.trim() : "";
  }

  function gpxDescription(node) {
    return childText(node, "desc") || childText(node, "cmt") || childText(node, "type");
  }

  function stripFileExtension(fileName) {
    return String(fileName || "").replace(/\.[^.]+$/, "");
  }

  function renderImportedGeometries(features) {
    importedGeometryLayer.clearLayers();
    importedGeometryRows = features.map((feature) => ({
      id: feature.properties.id,
      nomSite: feature.properties.nomSite,
      batiment: feature.properties.batiment,
      denomination: feature.properties.denomination
    }));
    importedGeometryLayer.addData({
      type: "FeatureCollection",
      features
    });
    openGeometryResultsView();
    importedGeometryTable.setData(importedGeometryRows);
    if (features.length && importedGeometryLayer.getBounds().isValid()) {
      map.fitBounds(importedGeometryLayer.getBounds(), { padding: [24, 24], maxZoom: 18 });
    }
  }

  function renderGeometryResultsContent(container) {
    if (!container) {
      return;
    }
    container.innerHTML = "";
    const controls = document.createElement("div");
    controls.className = "sig-geometry-style-tools";
    controls.innerHTML = `
      <label>
        <span>Contour</span>
        <input type="color" data-geometry-style="strokeColor" value="${importedGeometryStylePrefs.strokeColor}">
      </label>
      <label>
        <span>Surbrillance</span>
        <input type="color" data-geometry-style="highlightColor" value="${importedGeometryStylePrefs.highlightColor}">
      </label>
      <label>
        <span>Epaisseur</span>
        <input type="number" min="1" max="8" step="1" data-geometry-style="strokeWeight" value="${importedGeometryStylePrefs.strokeWeight}">
      </label>
      <label>
        <span>Style</span>
        <select data-geometry-style="dashStyle">
          <option value="solid" ${importedGeometryStylePrefs.dashStyle === "solid" ? "selected" : ""}>Continu</option>
          <option value="dashed" ${importedGeometryStylePrefs.dashStyle === "dashed" ? "selected" : ""}>Pointille</option>
          <option value="dotted" ${importedGeometryStylePrefs.dashStyle === "dotted" ? "selected" : ""}>Points</option>
          <option value="dashdot" ${importedGeometryStylePrefs.dashStyle === "dashdot" ? "selected" : ""}>Mixte</option>
        </select>
      </label>
      <button class="sig-geometry-clear-inline" type="button" data-geometry-clear>
        <i class="fa-solid fa-trash" aria-hidden="true"></i>
      </button>
    `;
    const tableHost = document.createElement("div");
    tableHost.className = "sig-geometry-table";
    tableHost.id = container === geometryOverlayBody ? "sig-geometry-table" : "";
    container.append(controls, tableHost);
    controls.addEventListener("input", updateImportedGeometryStyleFromControls);
    controls.addEventListener("change", updateImportedGeometryStyleFromControls);
    controls.querySelector("[data-geometry-clear]")?.addEventListener("click", clearImportedGeometries);
    ensureImportedGeometryTable(tableHost);
  }

  function updateImportedGeometryStyleFromControls(event) {
    const field = event.target?.dataset?.geometryStyle;
    if (!field) {
      return;
    }
    saveImportedGeometryStylePrefs({
      ...importedGeometryStylePrefs,
      [field]: event.target.value
    });
  }

  function buildPreparedBuildingStyleTools() {
    const details = document.createElement("details");
    details.className = "prepared-buildings-style-tools";
    details.innerHTML = `
      <summary>
        <i class="fa-solid fa-palette" aria-hidden="true"></i>
        Style
      </summary>
      <div class="prepared-buildings-style-panel">
        <label>
          <span>Couleur</span>
          <input type="color" data-prepared-building-style="strokeColor" value="${preparedBuildingStylePrefs.strokeColor}">
        </label>
        <label>
          <span>Epaisseur</span>
          <input type="number" min="1" max="8" step="1" data-prepared-building-style="strokeWeight" value="${preparedBuildingStylePrefs.strokeWeight}">
        </label>
        <label>
          <span>Trait</span>
          <select data-prepared-building-style="dashStyle">
            <option value="solid" ${preparedBuildingStylePrefs.dashStyle === "solid" ? "selected" : ""}>Continu</option>
            <option value="dashed" ${preparedBuildingStylePrefs.dashStyle === "dashed" ? "selected" : ""}>Pointille</option>
            <option value="dotted" ${preparedBuildingStylePrefs.dashStyle === "dotted" ? "selected" : ""}>Points</option>
            <option value="dashdot" ${preparedBuildingStylePrefs.dashStyle === "dashdot" ? "selected" : ""}>Mixte</option>
          </select>
        </label>
      </div>
    `;
    details.addEventListener("input", updatePreparedBuildingStyleFromControls);
    details.addEventListener("change", updatePreparedBuildingStyleFromControls);
    return details;
  }

  function updatePreparedBuildingStyleFromControls(event) {
    const field = event.target?.dataset?.preparedBuildingStyle;
    if (!field) {
      return;
    }
    savePreparedBuildingStylePrefs({
      ...preparedBuildingStylePrefs,
      [field]: event.target.value
    });
  }

  function ensureImportedGeometryTable(tableHost) {
    if (!tableHost) {
      return importedGeometryTable;
    }
    if (importedGeometryTable && importedGeometryTableHost === tableHost) {
      return importedGeometryTable;
    }
    if (importedGeometryTable && typeof importedGeometryTable.destroy === "function") {
      importedGeometryTable.destroy();
    }
    importedGeometryTableHost = tableHost;
    importedGeometryTable = new Tabulator(tableHost, {
      data: importedGeometryRows,
      height: "100%",
      layout: "fitColumns",
      placeholder: "Aucune forme",
      columns: [
        { title: "SITE", field: "nomSite", minWidth: 90 },
        { title: "BAT.", field: "batiment", minWidth: 70 },
        { title: "DENOM.", field: "denomination", minWidth: 110 }
      ]
    });
    importedGeometryTable.on("rowClick", function (event, row) {
      highlightImportedGeometry(row.getData().id);
    });
    return importedGeometryTable;
  }

  function highlightImportedGeometry(id) {
    importedGeometryLayer.eachLayer((layer) => {
      const featureId = layer.feature?.properties?.id;
      if (featureId !== id) {
        return;
      }
      if (typeof layer.setStyle === "function") {
        layer.setStyle(importedGeometryStyle({ highlighted: true }));
      } else if (typeof layer.setIcon === "function") {
        layer.setIcon(importedGeometryPointIcon({ highlighted: true }));
      }
      if (layer.getBounds && layer.getBounds().isValid()) {
        map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 19 });
      } else if (layer.getLatLng) {
        map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 18), { duration: 0.6 });
      }
      window.setTimeout(() => {
        if (typeof layer.setStyle === "function") {
          layer.setStyle(importedGeometryStyle());
        } else if (typeof layer.setIcon === "function") {
          layer.setIcon(importedGeometryPointIcon());
        }
      }, 3000);
    });
  }

  function openGeometryResultsView() {
    if (geometryImportConfig.resultsTarget === "layerbox") {
      if (geometryOverlay) {
        geometryOverlay.classList.remove("is-open");
      }
      layerBoxManager.renderToLayer("geometry-import-results", function (container) {
        container.classList.add("sig-geometry-layerbox");
        renderGeometryResultsContent(container);
      }, {
        title: "Resultat de l'importation",
        activate: true
      });
      window.setTimeout(function () {
        if (importedGeometryTable) {
          importedGeometryTable.redraw(true);
        }
      }, 0);
      return;
    }

    if (!geometryOverlay) {
      return;
    }
    geometryOverlay.classList.add("is-open");
    renderGeometryResultsContent(geometryOverlayBody);
    clampGeometryOverlayToMapPane();
    window.setTimeout(function () {
      if (importedGeometryTable) {
        importedGeometryTable.redraw(true);
      }
    }, 0);
  }

  function clearImportedGeometries() {
    importedGeometryLayer.clearLayers();
    importedGeometryRows = [];
    if (importedGeometryTable) {
      importedGeometryTable.setData([]);
    }
    if (geometryOverlay) {
      geometryOverlay.classList.remove("is-open");
    }
  }

  function clampGeometryOverlayToMapPane() {
    if (!geometryOverlay || !mapPane) {
      return;
    }
    const overlayRect = geometryOverlay.getBoundingClientRect();
    const hostRect = mapPane.getBoundingClientRect();
    const currentLeft = overlayRect.left - hostRect.left;
    const currentTop = overlayRect.top - hostRect.top;
    const maxLeft = Math.max(0, hostRect.width - overlayRect.width);
    const maxTop = Math.max(0, hostRect.height - overlayRect.height);
    geometryOverlay.style.left = `${Math.max(0, Math.min(currentLeft, maxLeft))}px`;
    geometryOverlay.style.top = `${Math.max(0, Math.min(currentTop, maxTop))}px`;
  }

  function popupContent(point) {
    const content = document.createElement("div");
    const heading = document.createElement("strong");
    const agent = document.createElement("div");
    const locality = document.createElement("div");
    const date = document.createElement("div");
    const status = document.createElement("div");
    const moreLink = document.createElement("a");

    heading.textContent = point.display_submission_id || point.source_submission_id;
    agent.textContent = `${point.code_agent || t("unlinkedAgent")} - ${point.nom_equipe || t("noTeam")}`;
    locality.textContent = [
      point.nom_sous_prefecture,
      point.nom_departement,
      point.nom_region
    ].filter(Boolean).join(", ");
    date.textContent = new Date(point.submitted_at).toLocaleString(locale);
    status.textContent = t("validationPrefix").replace("{{status}}", statusLabel(point.statut_validation));
    moreLink.href = `/soumissions/${point.id}/report`;
    moreLink.textContent = t("popupMore");
    moreLink.className = "sig-popup-more";
    moreLink.addEventListener("click", function (event) {
      event.preventDefault();
      showDecisionDetail(point);
    });
    content.append(heading, agent, locality, date, status, moreLink);
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
    let marker = null;

    if (markerIcon) {
      marker = L.marker([point.latitude, point.longitude], {
        icon: markerIcon,
        pane: "collectionPointsPane",
        title: category.label
      });
    } else {
      marker = L.circleMarker([point.latitude, point.longitude], {
        pane: "collectionPointsPane",
        color: markerColorHex[category.markerColor] || markerColorHex.gray,
        fillColor: markerColorHex[category.markerColor] || markerColorHex.gray,
        fillOpacity: 0.82,
        radius: 6,
        weight: 1
      });
    }

    marker.on("click", function () {
      selectSite(point);
    });
    return registerSiteMarker(point, marker);
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

  function showSiteIdentification(point, options = {}) {
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

    selectSite(point);
    activeLayerContext = { id: "site-detail", submissionId: point.id };
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
    if (options.saveState !== false) {
      setToolsOpen(true);
      saveCurrentCartographyContext();
    }
  }

  function showDecisionDetail(point, options = {}) {
    const title = point.display_submission_id || point.source_submission_id || t("decisionDetailTitle");
    selectSite(point);
    activeLayerContext = { id: "decision-detail", submissionId: point.id };
    layerBoxManager.renderToLayer("decision-detail", function (container) {
      const wrapper = document.createElement("section");
      const iframe = document.createElement("iframe");

      wrapper.className = "decision-detail-layer";
      iframe.className = "decision-detail-frame";
      iframe.src = `/soumissions/${point.id}/report?embed=pal`;
      iframe.title = title;
      wrapper.append(iframe);
      container.append(wrapper);
    }, {
      activate: true,
      title
    });
    if (options.saveState !== false) {
      setToolsOpen(true);
      saveCurrentCartographyContext();
    }
  }

  function showSubmissionDiagnostic(submissionId, axis, title) {
    if (!submissionId) {
      return;
    }
    const diagnosticTitle = title || "Diagnostic";
    activeLayerContext = { id: "submission-diagnostic", submissionId };
    layerBoxManager.renderToLayer("submission-diagnostic", function (container) {
      const wrapper = document.createElement("section");
      const iframe = document.createElement("iframe");

      wrapper.className = "decision-detail-layer diagnostic-layer";
      iframe.className = "decision-detail-frame diagnostic-frame";
      iframe.src = `/soumissions/${encodeURIComponent(submissionId)}/diagnostics/${encodeURIComponent(axis || "geometric")}?embed=pal`;
      iframe.title = diagnosticTitle;
      wrapper.append(iframe);
      container.append(wrapper);
    }, {
      activate: true,
      title: diagnosticTitle
    });
    setToolsOpen(true);
    saveCurrentCartographyContext();
  }

  async function openKoboLightLayer(options = {}) {
    activeLayerContext = { id: "kobo-import", submissionId: null };
    layerBoxManager.renderToLayer("kobo-import", function (container) {
      const shell = document.createElement("section");
      shell.className = "kobo-light";
      shell.innerHTML = `<p class="muted">${t("koboLightLoading")}</p>`;
      container.append(shell);
      loadKoboLightContent(shell);
    }, {
      activate: true,
      title: t("koboLightTitle")
    });
    setToolsOpen(true, { saveState: options.saveState });
    if (options.saveState !== false) {
      saveCurrentCartographyContext();
    }
  }

  async function loadKoboLightContent(shell) {
    try {
      const response = await fetch("/cartographie/kobo-light/status", {
        headers: { Accept: "application/json" }
      });
      const payload = await response.json();
      renderKoboLightForm(shell, payload);
    } catch (error) {
      shell.innerHTML = `<p class="form-error">${t("koboLightLoadError")}</p>`;
    }
  }

  function renderKoboLightForm(shell, payload) {
    const missions = payload.missions || [];
    const config = payload.config || {};
    const defaultMissionId = String(config.defaultMissionId || missions[0]?.id || "");
    const defaultMission = missions.find((mission) => String(mission.id) === defaultMissionId) || missions[0] || {};

    shell.replaceChildren();
    const description = document.createElement("p");
    const form = document.createElement("form");
    const feedback = document.createElement("div");

    description.className = "muted";
    description.textContent = t("koboLightDescription");
    form.className = "kobo-light-form";
    feedback.className = "kobo-light-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");

    form.innerHTML = `
      <label>${t("koboSyncMission")}
        <select name="mission_id" required>
          <option value="">${t("koboSyncSelectMission")}</option>
          ${missions.map((mission) => `<option value="${escapeHtml(mission.id)}" data-asset-uid="${escapeHtml(mission.kobo_asset_uid || "")}" ${String(mission.id) === defaultMissionId ? "selected" : ""}>${escapeHtml(mission.name)}</option>`).join("")}
        </select>
      </label>
      <label>${t("koboSyncAssetUid")}
        <input name="asset_uid" required value="${escapeHtml(config.defaultAssetUid || defaultMission.kobo_asset_uid || "")}">
      </label>
      <label>${t("koboSyncLimit")}
        <input name="limit" type="number" min="1" max="1000" value="100">
      </label>
      <label>${t("koboSyncSince")}
        <input name="since" type="datetime-local">
      </label>
      <label>${t("koboSyncGpsField")}
        <input name="gps_field" value="${escapeHtml(config.gpsField || "")}">
      </label>
      <label>${t("koboSyncAgentCodeField")}
        <input name="agent_code_field" value="${escapeHtml(config.agentCodeField || "")}">
      </label>
      <label>${t("koboSyncFormType")}
        <input name="form_type" value="${escapeHtml(config.formType || "site")}">
      </label>
      <label class="checkbox-label">
        <input name="dry_run" type="checkbox">
        ${t("koboSyncDryRun")}
      </label>
      <button class="button button-primary" type="submit" ${payload.ready ? "" : "disabled"}>${t("koboSyncAction")}</button>
    `;

    form.querySelector("[name='mission_id']").addEventListener("change", function (event) {
      const selected = event.target.selectedOptions[0];
      const assetUid = selected?.dataset.assetUid;
      if (assetUid) {
        form.elements.asset_uid.value = assetUid;
      }
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      await submitKoboLightSync(form, feedback);
    });

    if (!payload.ready) {
      const warning = document.createElement("p");
      warning.className = "form-error";
      warning.textContent = t("koboLightNotReady");
      shell.append(warning);
    }

    shell.append(description, form, feedback);
  }

  async function submitKoboLightSync(form, feedback) {
    const submitButton = form.querySelector("button[type='submit']");
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.dry_run = form.elements.dry_run.checked;
    submitButton.disabled = true;
    feedback.className = "kobo-light-feedback";
    feedback.textContent = t("koboLightSyncRunning");

    try {
      const response = await fetch("/cartographie/kobo-light/sync", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || t("koboLightSyncError"));
      }
      const summary = result.summary;
      feedback.classList.add("is-success");
      feedback.innerHTML = `
        <strong>${t("koboLightSyncDone")}</strong>
        <dl class="kobo-light-summary">
          <dt>${t("koboSummaryRead")}</dt><dd>${summary.read}</dd>
          <dt>${t("koboSummaryValid")}</dt><dd>${summary.valid}</dd>
          <dt>${t("koboSummaryInserted")}</dt><dd>${summary.inserted}</dd>
          <dt>${t("koboSummarySkipped")}</dt><dd>${summary.skipped}</dd>
        </dl>
      `;
    } catch (error) {
      feedback.classList.add("is-error");
      feedback.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  }

  function openPreparedBuildingsLayer(options = {}) {
    if (!buildingsOpen) {
      return;
    }
    activeLayerContext = { id: "prepared-buildings", submissionId: null };
    layerBoxManager.renderToLayer("prepared-buildings", function (container) {
      const shell = document.createElement("section");
      shell.className = "prepared-buildings";
      shell.innerHTML = `
        <p class="muted">Import, listing et visualisation des bâtiments préparés avant terrain.</p>
        <form class="prepared-buildings-form" id="prepared-buildings-form">
          <label>Mission
            <select name="mission_id" required>
              <option value="">Sélectionner une mission</option>
              ${missionOptionsHtml()}
            </select>
          </label>
          <label>Code site
            <input name="site_code" list="prepared-buildings-site-code-options" placeholder="Ex. SITE023" autocomplete="off">
          </label>
          <label>Nom du site
            <input name="site_name" list="prepared-buildings-site-name-options" placeholder="Nom officiel du site" autocomplete="off">
          </label>
          <datalist id="prepared-buildings-site-code-options"></datalist>
          <datalist id="prepared-buildings-site-name-options"></datalist>
          <label>Source
            <select name="source">
              <option value="import">Import</option>
              <option value="osm">OpenStreetMap</option>
              <option value="topoexport">TopoExport</option>
              <option value="satellite">Imagerie satellite</option>
              <option value="terrain">Terrain</option>
              <option value="manual">Saisie manuelle</option>
            </select>
          </label>
          <label>Filtrer par statut
            <select name="filter_status">
              <option value="">Tous les statuts</option>
              <option value="prepare">Pr&eacute;par&eacute;</option>
              <option value="transmis_terrain">Transmis terrain</option>
              <option value="verifie_terrain">V&eacute;rifi&eacute; terrain</option>
              <option value="a_corriger">&Agrave; corriger</option>
              <option value="valide">Valid&eacute;</option>
              <option value="archive">Archiv&eacute;</option>
            </select>
          </label>
          <label>Filtrer par source
            <select name="filter_source">
              <option value="">Toutes les sources</option>
              <option value="import">Import</option>
              <option value="osm">OpenStreetMap</option>
              <option value="topoexport">TopoExport</option>
              <option value="satellite">Imagerie satellite</option>
              <option value="terrain">Terrain</option>
              <option value="manual">Saisie manuelle</option>
            </select>
          </label>
          <label class="prepared-buildings-wide">Fichier GeoJSON
            <input name="geojson_file" type="file" accept=".geojson,.json,application/geo+json,application/json">
          </label>
          <div class="prepared-buildings-actions">
            <button class="button" type="button" data-buildings-refresh>Charger</button>
            ${buildingsOpen?.dataset.canImportBuildings === "true"
              ? '<button class="button button-primary" type="submit">Importer</button>'
              : '<span class="form-hint">Import réservé aux profils autorisés.</span>'}
          </div>
          ${buildingsOpen?.dataset.canImportBuildings === "true"
            ? `<div class="prepared-buildings-osm prepared-buildings-wide">
                <strong>Import OSM par zone</strong>
                <div class="prepared-buildings-osm-actions">
                  <button class="button" type="button" data-osm-rectangle>Rectangle</button>
                  <button class="button" type="button" data-osm-polygon>Polygone</button>
                  <button class="button" type="button" data-osm-clear>Effacer</button>
                  <button class="button button-primary" type="button" data-osm-import disabled>Importer OSM</button>
                </div>
                <p class="form-hint" data-osm-status>Aucune zone OSM d&eacute;finie. Surface maximale autoris&eacute;e : 5 km&sup2;.</p>
              </div>`
            : ""}
          ${buildingsOpen?.dataset.canImportBuildings === "true"
            ? `<div class="prepared-buildings-status prepared-buildings-wide">
                <label>Statut du b&acirc;timent s&eacute;lectionn&eacute;
                  <select name="status_update" disabled>
                    <option value="prepare">Pr&eacute;par&eacute;</option>
                    <option value="transmis_terrain">Transmis terrain</option>
                    <option value="verifie_terrain">V&eacute;rifi&eacute; terrain</option>
                    <option value="a_corriger">&Agrave; corriger</option>
                    <option value="valide">Valid&eacute;</option>
                    <option value="archive">Archiv&eacute;</option>
                  </select>
                </label>
                <button class="button" type="button" data-buildings-status-apply disabled>Appliquer</button>
              </div>`
            : ""}
          <div class="prepared-buildings-plan prepared-buildings-wide">
            <label>Type de plan
              <select name="plan_type">
                <option value="satellite">Plan satellite</option>
                <option value="line">Plan filaire</option>
                <option value="mixed">Plan mixte</option>
              </select>
            </label>
            <label>Num&eacute;rotation
              <select name="numbering_mode">
                <option value="auto">Automatique</option>
                <option value="manual">Manuelle / codes existants</option>
              </select>
            </label>
            <label>Orientation
              <select name="page_orientation">
                <option value="auto">Automatique</option>
                <option value="landscape">Paysage</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
            <label>Taille des &eacute;tiquettes
              <input name="label_size" type="number" min="16" max="48" step="1" value="24">
            </label>
            <label>Opacit&eacute; des &eacute;tiquettes
              <input name="label_opacity" type="range" min="0.2" max="1" step="0.05" value="1">
            </label>
            <div class="prepared-buildings-print-extent">
              <strong>Emprise d'impression</strong>
              <div class="prepared-buildings-plan-actions">
                <button class="button" type="button" data-print-extent-draw>D&eacute;finir sur la carte</button>
                <button class="button" type="button" data-print-extent-validate disabled>Valider l'emprise</button>
                <button class="button" type="button" data-print-extent-clear disabled>Effacer</button>
              </div>
              <p class="form-hint" data-print-extent-status>Tracer et valider un cadre d'impression pour activer l'aper&ccedil;u et l'impression.</p>
            </div>
            <div class="prepared-buildings-plan-actions">
              <button class="button" type="button" data-buildings-plan-preview disabled>Aper&ccedil;u imprimable</button>
              <button class="button button-primary" type="button" data-buildings-plan-print disabled>Imprimer / PDF</button>
            </div>
          </div>
        </form>
        <div class="prepared-buildings-feedback" role="status" aria-live="polite"></div>
        <div id="prepared-buildings-table" class="prepared-buildings-table"></div>
      `;
      container.append(shell);
      initializePreparedBuildingsShell(shell);
    }, {
      activate: true,
      title: "Bâtiments préparés"
    });
    setToolsOpen(true, { saveState: options.saveState });
    if (options.saveState !== false) {
      saveCurrentCartographyContext();
    }
  }

  function missionOptionsHtml() {
    return Array.from(document.querySelectorAll("#sig-mission-filter option"))
      .filter((option) => option.value)
      .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.textContent.trim())}</option>`)
      .join("");
  }

  function initializePreparedBuildingsShell(shell) {
    organizePreparedBuildingsLayout(shell);
    const form = shell.querySelector("#prepared-buildings-form");
    const feedback = shell.querySelector(".prepared-buildings-feedback");
    const missionSelect = form.elements.mission_id;
    const activeMission = document.getElementById("sig-mission-filter").value;
    if (activeMission) {
      missionSelect.value = activeMission;
    }
    ensurePreparedBuildingsTable(shell.querySelector("#prepared-buildings-table"));
    missionSelect.addEventListener("change", async function () {
      await refreshPreparedBuildingSiteSuggestions(form);
    });
    form.querySelector("[data-buildings-refresh]").addEventListener("click", async function () {
      await loadPreparedBuildings(form, feedback);
    });
    form.querySelector("[data-buildings-status-apply]")?.addEventListener("click", async function () {
      await updatePreparedBuildingStatus(form, feedback);
    });
    form.querySelector("[data-osm-rectangle]")?.addEventListener("click", function () {
      startOsmSelection("rectangle", form);
    });
    form.querySelector("[data-osm-polygon]")?.addEventListener("click", function () {
      startOsmSelection("polygon", form);
    });
    form.querySelector("[data-osm-clear]")?.addEventListener("click", function () {
      clearOsmSelection(form);
    });
    form.querySelector("[data-osm-import]")?.addEventListener("click", async function () {
      await importPreparedBuildingsFromOsm(form, feedback);
    });
    form.querySelector("[data-print-extent-draw]")?.addEventListener("click", function () {
      startPrintExtentSelection(form);
    });
    form.querySelector("[data-print-extent-validate]")?.addEventListener("click", function () {
      validatePrintExtent(form);
    });
    form.querySelector("[data-print-extent-clear]")?.addEventListener("click", function () {
      clearPrintExtent(form);
    });
    form.querySelector("[data-buildings-plan-preview]")?.addEventListener("click", function () {
      openPreparedBuildingsPrintPlan(form, feedback, { autoPrint: false });
    });
    form.querySelector("[data-buildings-plan-print]")?.addEventListener("click", function () {
      openPreparedBuildingsPrintPlan(form, feedback, { autoPrint: true });
    });
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      await submitPreparedBuildingsImport(form, feedback);
    });
    if (missionSelect.value) {
      refreshPreparedBuildingSiteSuggestions(form);
      loadPreparedBuildings(form, feedback);
    }
  }

  function organizePreparedBuildingsLayout(shell) {
    const form = shell.querySelector("#prepared-buildings-form");
    const feedback = shell.querySelector(".prepared-buildings-feedback");
    const table = shell.querySelector("#prepared-buildings-table");
    if (!form || form.dataset.layoutOrganized === "true") {
      return;
    }

    const sectionContext = preparedBuildingsSection("[1. Contexte]");
    const sectionFilters = preparedBuildingsSection("[2. Filtres d'affichage]");
    const sectionLoad = preparedBuildingsSection("[3. Charger]");
    const sectionSelection = preparedBuildingsSection("[5. Actions sur la s&eacute;lection]");
    const sectionPlans = preparedBuildingsSection("[6. Plans]");
    const gridContext = preparedBuildingsGrid();
    const gridFilters = preparedBuildingsGrid();
    const gridLoad = preparedBuildingsGrid();
    const gridPlans = preparedBuildingsGrid();
    const actions = form.querySelector(".prepared-buildings-actions");
    const refreshButton = form.querySelector("[data-buildings-refresh]");
    const osmBlock = form.querySelector(".prepared-buildings-osm");
    const statusBlock = form.querySelector(".prepared-buildings-status");
    const planBlock = form.querySelector(".prepared-buildings-plan");
    const siteCodeOptions = form.querySelector("#prepared-buildings-site-code-options");
    const siteNameOptions = form.querySelector("#prepared-buildings-site-name-options");

    appendField(gridContext, form.elements.mission_id);
    appendField(gridContext, form.elements.site_code);
    appendField(gridContext, form.elements.site_name);
    sectionContext.append(gridContext);

    appendField(gridFilters, form.elements.filter_status);
    appendField(gridFilters, form.elements.filter_source);
    if (refreshButton) {
      const refreshActions = document.createElement("div");
      refreshActions.className = "prepared-buildings-actions";
      refreshActions.append(refreshButton);
      gridFilters.append(refreshActions);
    }
    sectionFilters.append(gridFilters);

    appendField(gridLoad, form.elements.source);
    appendField(gridLoad, form.elements.geojson_file);
    if (actions && actions.childElementCount) {
      gridLoad.append(actions);
    }
    sectionLoad.append(gridLoad);
    if (osmBlock) {
      sectionLoad.append(osmBlock);
    }
    if (planBlock) {
      appendField(gridPlans, form.elements.plan_type);
      appendField(gridPlans, form.elements.numbering_mode);
      appendField(gridPlans, form.elements.page_orientation);
      appendField(gridPlans, form.elements.label_size);
      appendField(gridPlans, form.elements.label_opacity);
      const extentBlock = planBlock.querySelector(".prepared-buildings-print-extent");
      if (extentBlock) {
        gridPlans.append(extentBlock);
      }
      const planActions = planBlock.querySelector("[data-buildings-plan-preview]")?.closest(".prepared-buildings-plan-actions");
      if (planActions) {
        gridPlans.append(planActions);
      }
      sectionPlans.append(gridPlans);
    }

    form.innerHTML = "";
    form.append(sectionContext, sectionFilters, sectionLoad);
    if (statusBlock) {
      while (statusBlock.firstChild) {
        sectionSelection.append(statusBlock.firstChild);
      }
    }

    const tabs = buildPreparedBuildingsTabs([
      { id: "context", title: "1. Contexte", panel: sectionContext },
      { id: "filters", title: "2. Filtres", panel: sectionFilters },
      { id: "load", title: "3. Charger", panel: sectionLoad },
      ...(statusBlock ? [{ id: "selection", title: "5. S&eacute;lection", panel: sectionSelection }] : []),
      { id: "plans", title: "6. Plans", panel: sectionPlans }
    ]);

    form.append(tabs);
    if (siteCodeOptions) {
      form.append(siteCodeOptions);
    }
    if (siteNameOptions) {
      form.append(siteNameOptions);
    }

    if (table && !shell.querySelector(".prepared-buildings-list")) {
      const listSection = document.createElement("section");
      const heading = document.createElement("h3");
      listSection.className = "prepared-buildings-list";
      heading.innerHTML = "[4. Liste des b&acirc;timents]";
      table.before(listSection);
      listSection.append(heading, table);
    }

    if (feedback) {
      const feedbackRow = document.createElement("div");
      feedbackRow.className = "prepared-buildings-feedback-row";
      feedbackRow.append(feedback, buildPreparedBuildingStyleTools());
      form.after(feedbackRow);
    }
    form.dataset.layoutOrganized = "true";
  }

  function buildPreparedBuildingsTabs(items) {
    const wrapper = document.createElement("div");
    const tabList = document.createElement("div");
    const panels = document.createElement("div");
    wrapper.className = "prepared-buildings-tabs";
    tabList.className = "prepared-buildings-tab-list";
    tabList.setAttribute("role", "tablist");
    panels.className = "prepared-buildings-tab-panels";

    items.forEach((item, index) => {
      const tab = document.createElement("button");
      const panelId = `prepared-buildings-panel-${item.id}`;
      const tabId = `prepared-buildings-tab-${item.id}`;
      tab.className = "prepared-buildings-tab";
      tab.type = "button";
      tab.id = tabId;
      tab.innerHTML = item.title;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panelId);
      tab.setAttribute("aria-selected", String(index === 0));
      tab.classList.toggle("is-active", index === 0);

      item.panel.classList.add("prepared-buildings-tab-panel");
      item.panel.id = panelId;
      item.panel.setAttribute("role", "tabpanel");
      item.panel.setAttribute("aria-labelledby", tabId);
      item.panel.hidden = index !== 0;
      item.panel.classList.toggle("is-active", index === 0);

      tab.addEventListener("click", function () {
        activatePreparedBuildingsTab(wrapper, tabId);
      });

      tabList.append(tab);
      panels.append(item.panel);
    });

    wrapper.append(tabList, panels);
    return wrapper;
  }

  function activatePreparedBuildingsTab(wrapper, activeTabId) {
    wrapper.querySelectorAll(".prepared-buildings-tab").forEach((tab) => {
      const active = tab.id === activeTabId;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      if (panel) {
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
      }
    });
  }

  function preparedBuildingsSection(title) {
    const section = document.createElement("fieldset");
    const legend = document.createElement("legend");
    section.className = "prepared-buildings-section";
    legend.innerHTML = title;
    section.append(legend);
    return section;
  }

  function preparedBuildingsGrid() {
    const grid = document.createElement("div");
    grid.className = "prepared-buildings-grid";
    return grid;
  }

  function appendField(container, field) {
    const label = field?.closest("label");
    if (label) {
      container.append(label);
    }
  }

  function ensurePreparedBuildingsTable(host) {
    if (preparedBuildingsTable) {
      preparedBuildingsTable.destroy();
    }
    preparedBuildingsTable = new Tabulator(host, {
      data: preparedBuildingsData,
      height: 260,
      layout: "fitColumns",
      placeholder: "Aucun bâtiment préparé",
      columns: [
        { title: "Site", field: "site_name", minWidth: 110 },
        { title: "Code", field: "building_code", minWidth: 90 },
        { title: "Source", field: "source", width: 90 },
        { title: "Statut", field: "status", width: 120 }
      ]
    });
    preparedBuildingsTable.on("rowClick", function (event, row) {
      const rowData = row.getData();
      selectedPreparedBuildingId = rowData.id;
      const form = document.getElementById("prepared-buildings-form");
      if (form?.elements.status_update) {
        form.elements.status_update.disabled = false;
        form.elements.status_update.value = rowData.status || "prepare";
        form.querySelector("[data-buildings-status-apply]").disabled = false;
      }
      focusPreparedBuilding(selectedPreparedBuildingId);
    });
  }

  async function submitPreparedBuildingsImport(form, feedback) {
    const file = form.elements.geojson_file.files?.[0];
    if (!file) {
      feedback.textContent = "Sélectionner un fichier GeoJSON.";
      feedback.className = "prepared-buildings-feedback is-error";
      return;
    }
    try {
      feedback.className = "prepared-buildings-feedback";
      feedback.textContent = "Import en cours...";
      const geojson = JSON.parse(await file.text());
      const payload = {
        mission_id: form.elements.mission_id.value,
        site_code: form.elements.site_code.value,
        site_name: form.elements.site_name.value,
        source: form.elements.source.value,
        geojson
      };
      const response = await fetch("/cartographie/buildings/import", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Import impossible.");
      }
      feedback.className = "prepared-buildings-feedback is-success";
      feedback.textContent = `${result.result.imported} bâtiment(s) importé(s).`;
      form.elements.geojson_file.value = "";
      await refreshPreparedBuildingSiteSuggestions(form, { force: true });
      await loadPreparedBuildings(form, feedback, { keepMessage: true });
    } catch (error) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = error.message;
    }
  }

  async function refreshPreparedBuildingSiteSuggestions(form, options = {}) {
    const missionId = form?.elements.mission_id?.value || "";
    if (!missionId) {
      preparedBuildingSiteSuggestions = { missionId: null, siteCodes: [], siteNames: [] };
      renderPreparedBuildingSiteSuggestions(form);
      return;
    }
    if (!options.force && preparedBuildingSiteSuggestions.missionId === String(missionId)) {
      renderPreparedBuildingSiteSuggestions(form);
      return;
    }
    try {
      const params = new URLSearchParams({ mission_id: missionId });
      const response = await fetch(`/cartographie/buildings?${params.toString()}`, {
        headers: { Accept: "application/json" }
      });
      const featureCollection = await response.json();
      if (!response.ok) {
        throw new Error(featureCollection.error || "Chargement impossible.");
      }
      const features = featureCollection.features || [];
      preparedBuildingSiteSuggestions = {
        missionId: String(missionId),
        siteCodes: uniqueSortedPreparedBuildingValues(features, "site_code"),
        siteNames: uniqueSortedPreparedBuildingValues(features, "site_name")
      };
      renderPreparedBuildingSiteSuggestions(form);
    } catch (error) {
      console.warn("Suggestions sites bÃ¢timents indisponibles", error);
    }
  }

  function uniqueSortedPreparedBuildingValues(features, propertyName) {
    return Array.from(new Set(
      features
        .map((feature) => String(feature.properties?.[propertyName] || "").trim())
        .filter(Boolean)
    )).sort((first, second) => first.localeCompare(second, locale, { sensitivity: "base" }));
  }

  function renderPreparedBuildingSiteSuggestions(form) {
    renderDatalistOptions(form?.querySelector("#prepared-buildings-site-code-options"), preparedBuildingSiteSuggestions.siteCodes);
    renderDatalistOptions(form?.querySelector("#prepared-buildings-site-name-options"), preparedBuildingSiteSuggestions.siteNames);
  }

  function renderDatalistOptions(datalist, values) {
    if (!datalist) {
      return;
    }
    datalist.innerHTML = values
      .slice(0, 300)
      .map((value) => `<option value="${escapeHtml(value)}"></option>`)
      .join("");
  }

  async function loadPreparedBuildings(form, feedback, options = {}) {
    const missionId = form.elements.mission_id.value;
    if (!missionId) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = "Sélectionner une mission.";
      return;
    }
    const params = new URLSearchParams({ mission_id: missionId });
    if (form.elements.site_code.value.trim()) {
      params.set("site_code", form.elements.site_code.value.trim());
    }
    if (form.elements.filter_status.value) {
      params.set("status", form.elements.filter_status.value);
    }
    if (form.elements.filter_source.value) {
      params.set("source", form.elements.filter_source.value);
    }
    const response = await fetch(`/cartographie/buildings?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });
    const featureCollection = await response.json();
    if (!response.ok) {
      throw new Error(featureCollection.error || "Chargement impossible.");
    }
    preparedBuildingsFeatureCollection = featureCollection;
    preparedBuildingsLayer.clearLayers();
    preparedBuildingsLayer.addData(featureCollection);
    preparedBuildingsData = (featureCollection.features || []).map((feature) => ({
      id: feature.properties.id,
      site_name: feature.properties.site_name || feature.properties.site_code || "-",
      site_code: feature.properties.site_code || "-",
      building_code: feature.properties.building_code || "-",
      source: feature.properties.source || "-",
      status: feature.properties.status || "-"
    }));
    if (preparedBuildingsTable) {
      preparedBuildingsTable.setData(preparedBuildingsData);
    }
    if (!preparedBuildingsData.some((row) => row.id === selectedPreparedBuildingId)) {
      selectedPreparedBuildingId = null;
      if (form.elements.status_update) {
        form.elements.status_update.disabled = true;
        form.querySelector("[data-buildings-status-apply]").disabled = true;
      }
    }
    if (!options.keepMessage) {
      feedback.className = "prepared-buildings-feedback";
      feedback.textContent = `${preparedBuildingsData.length} bâtiment(s) préparé(s).`;
    }
    if (preparedBuildingsLayer.getBounds && preparedBuildingsLayer.getBounds().isValid()) {
      map.fitBounds(preparedBuildingsLayer.getBounds(), { padding: [28, 28], maxZoom: 19 });
    }
  }

  function openPreparedBuildingsPrintPlan(form, feedback, options = {}) {
    const features = preparedBuildingsFeatureCollection.features || [];
    if (!features.length) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = "Charger des bâtiments préparés avant de générer un plan.";
      return;
    }
    if (!printExtentValidated || !printExtentBounds?.isValid()) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = "Définir et valider l'emprise d'impression avant de générer un plan.";
      return;
    }

    const planPayload = buildPreparedBuildingsPlanPayload(form, options);
    if (!planPayload.featureCollection.features.length) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = "Aucun bÃ¢timent chargÃ© n'est inclus dans l'emprise d'impression validÃ©e.";
      return;
    }

    const planWindow = window.open("", "_blank", "width=1200,height=850");
    if (!planWindow) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = "Autoriser les fenêtres pop-up pour ouvrir le plan imprimable.";
      return;
    }

    try {
      planWindow.document.open();
      planWindow.document.write(renderPreparedBuildingsPrintHtml(planPayload));
      planWindow.document.close();
      planWindow.focus();
      feedback.className = "prepared-buildings-feedback is-success";
      feedback.textContent = options.autoPrint
        ? "Plan imprimable ouvert. Utiliser l'impression navigateur pour exporter en PDF."
        : "Aperçu imprimable ouvert.";
    } catch (error) {
      planWindow.document.body.innerHTML = "<p>Impossible de générer le plan imprimable depuis cette fenêtre.</p>";
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = "Impossible de générer le plan imprimable.";
    }
  }

  function buildPreparedBuildingsPlanPayload(form, options = {}) {
    const planType = form.elements.plan_type?.value || "satellite";
    const numberingMode = form.elements.numbering_mode?.value || "auto";
    const features = numberedPreparedBuildingFeatures(
      preparedBuildingsFeaturesInPrintExtent(preparedBuildingsFeatureCollection.features || []),
      numberingMode
    );
    const missionOption = form.elements.mission_id?.selectedOptions?.[0];
    const siteCode = form.elements.site_code.value.trim() || firstPreparedBuildingProperty("site_code") || "-";
    const siteName = form.elements.site_name.value.trim() || firstPreparedBuildingProperty("site_name") || siteCode;
    return {
      autoPrint: Boolean(options.autoPrint),
      planType,
      numberingMode,
      generatedAt: new Date().toLocaleString(locale),
      metadata: {
        siteName,
        siteCode,
        mission: missionOption?.textContent?.trim() || "-",
        region: preparedBuildingsPlanRegion(form, siteCode, siteName)
      },
      style: {
        strokeColor: preparedBuildingStylePrefs.strokeColor,
        strokeWeight: preparedBuildingStylePrefs.strokeWeight,
        dashStyle: preparedBuildingStylePrefs.dashStyle,
        dashArray: dashArrayForStyle(preparedBuildingStylePrefs.dashStyle),
        fillOpacity: 0.12
      },
      labels: {
        size: normalizedPlanLabelSize(form.elements.label_size?.value),
        opacity: normalizedPlanLabelOpacity(form.elements.label_opacity?.value)
      },
      page: resolvePreparedBuildingsPrintPage(form),
      printBounds: {
        south: printExtentBounds.getSouth(),
        west: printExtentBounds.getWest(),
        north: printExtentBounds.getNorth(),
        east: printExtentBounds.getEast()
      },
      featureCollection: {
        type: "FeatureCollection",
        features
      },
      buildings: features.map((feature) => ({
        number: feature.properties.plan_number,
        koboBuildingNumber: "",
        fieldSituation: feature.properties.field_situation || feature.properties.situation_terrain || "",
        supervisorNote: "",
        cartographyAction: feature.properties.cartography_action || feature.properties.action_carto || "",
        source: feature.properties.source || "-"
      }))
    };
  }

  function startPrintExtentSelection(form) {
    activePrintExtentForm = form;
    clearPrintExtent(form, { silent: true });
    osmSelectionMode = null;
    printExtentMode = true;
    printExtentPoints = [];
    map.getContainer().classList.add("is-print-extent-selecting");
    updatePrintExtentStatus(form, "Cliquer deux coins opposés du cadre d'impression sur la carte.");
    updatePrintPlanButtons(form);
  }

  function handlePrintExtentClick(event) {
    if (!printExtentMode) {
      return false;
    }
    printExtentPoints.push(event.latlng);
    if (printExtentPoints.length === 2) {
      setPrintExtentBounds(L.latLngBounds(printExtentPoints[0], printExtentPoints[1]));
      printExtentMode = false;
      map.getContainer().classList.remove("is-print-extent-selecting");
      const form = currentPrintExtentForm();
      updatePrintExtentStatus(form, "Cadre tracé. Ajuster les poignées si nécessaire, puis valider l'emprise.");
      updatePrintPlanButtons(form);
    }
    return true;
  }

  function setPrintExtentBounds(bounds) {
    printExtentBounds = bounds;
    printExtentValidated = false;
    renderPrintExtent();
  }

  function renderPrintExtent() {
    printExtentLayer.clearLayers();
    printExtentHandles = [];
    if (!printExtentBounds?.isValid()) {
      printExtentRectangle = null;
      return;
    }
    printExtentRectangle = L.rectangle(printExtentBounds, {
      color: "#111827",
      dashArray: "8,4",
      fillColor: "#2563eb",
      fillOpacity: 0.06,
      opacity: 1,
      weight: 2
    }).addTo(printExtentLayer);

    printExtentCornerLatLngs(printExtentBounds).forEach((latlng, index) => {
      const handle = L.marker(latlng, {
        draggable: true,
        icon: L.divIcon({
          className: "print-extent-handle",
          html: "",
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        }),
        zIndexOffset: 1200
      }).addTo(printExtentLayer);
      handle.on("drag", function (event) {
        printExtentValidated = false;
        resizePrintExtentFromHandle(index, event.target.getLatLng());
        updatePrintPlanButtons(currentPrintExtentForm());
      });
      handle.on("dragend", function () {
        const form = currentPrintExtentForm();
        printExtentValidated = false;
        updatePrintExtentStatus(form, "Cadre ajusté. Valider l'emprise pour verrouiller l'échelle.");
        updatePrintPlanButtons(form);
      });
      printExtentHandles.push(handle);
    });
  }

  function printExtentCornerLatLngs(bounds) {
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();
    return [
      L.latLng(north, west),
      L.latLng(north, east),
      L.latLng(south, east),
      L.latLng(south, west)
    ];
  }

  function resizePrintExtentFromHandle(index, latlng) {
    const corners = printExtentCornerLatLngs(printExtentBounds);
    const opposite = corners[(index + 2) % 4];
    printExtentBounds = L.latLngBounds(opposite, latlng);
    if (printExtentRectangle) {
      printExtentRectangle.setBounds(printExtentBounds);
    }
    printExtentCornerLatLngs(printExtentBounds).forEach((corner, cornerIndex) => {
      if (cornerIndex !== index && printExtentHandles[cornerIndex]) {
        printExtentHandles[cornerIndex].setLatLng(corner);
      }
    });
  }

  function validatePrintExtent(form) {
    if (!printExtentBounds?.isValid()) {
      updatePrintExtentStatus(form, "Tracer un cadre d'impression avant validation.");
      return;
    }
    printExtentValidated = true;
    updatePrintExtentStatus(form, "Emprise validée. L'échelle du plan sera verrouillée sur ce cadre.");
    updatePrintPlanButtons(form);
  }

  function clearPrintExtent(form, options = {}) {
    printExtentMode = false;
    printExtentPoints = [];
    printExtentBounds = null;
    printExtentValidated = false;
    printExtentRectangle = null;
    printExtentHandles = [];
    printExtentLayer.clearLayers();
    map.getContainer().classList.remove("is-print-extent-selecting");
    if (!options.silent) {
      updatePrintExtentStatus(form, "Tracer et valider un cadre d'impression pour activer l'aperçu et l'impression.");
    }
    updatePrintPlanButtons(form);
  }

  function currentPrintExtentForm() {
    return activePrintExtentForm
      || document.getElementById("prepared-buildings-form")
      || document.getElementById("sites-planning-plan-form");
  }

  function updatePrintExtentStatus(form, message) {
    const status = form?.querySelector("[data-print-extent-status]");
    if (status) {
      status.textContent = message;
    }
  }

  function updatePrintPlanButtons(form) {
    const canPrint = Boolean(printExtentValidated && printExtentBounds?.isValid());
    form?.querySelector("[data-buildings-plan-preview]")?.toggleAttribute("disabled", !canPrint);
    form?.querySelector("[data-buildings-plan-print]")?.toggleAttribute("disabled", !canPrint);
    form?.querySelector("[data-print-extent-validate]")?.toggleAttribute("disabled", !printExtentBounds?.isValid());
    form?.querySelector("[data-print-extent-clear]")?.toggleAttribute("disabled", !printExtentBounds?.isValid() && !printExtentMode);
  }

  function firstPreparedBuildingProperty(name) {
    const feature = (preparedBuildingsFeatureCollection.features || []).find((candidate) => candidate.properties?.[name]);
    return feature?.properties?.[name] || "";
  }

  function normalizedPlanLabelSize(value) {
    return Math.max(16, Math.min(48, Number.parseInt(value, 10) || 24));
  }

  function normalizedPlanLabelOpacity(value) {
    const opacity = Number.parseFloat(value);
    if (!Number.isFinite(opacity)) {
      return 1;
    }
    return Math.max(0.2, Math.min(1, opacity));
  }

  function resolvePreparedBuildingsPrintPage(form) {
    const requested = form.elements.page_orientation?.value || "auto";
    const orientation = requested === "portrait" || requested === "landscape"
      ? requested
      : automaticPrintOrientation(printExtentBounds);
    return {
      requestedOrientation: requested,
      orientation
    };
  }

  function automaticPrintOrientation(bounds) {
    if (!bounds?.isValid()) {
      return "landscape";
    }
    const center = bounds.getCenter();
    const widthMeters = map.distance(
      L.latLng(center.lat, bounds.getWest()),
      L.latLng(center.lat, bounds.getEast())
    );
    const heightMeters = map.distance(
      L.latLng(bounds.getSouth(), center.lng),
      L.latLng(bounds.getNorth(), center.lng)
    );
    return widthMeters >= heightMeters ? "landscape" : "portrait";
  }

  function preparedBuildingsFeaturesInPrintExtent(features) {
    if (!printExtentBounds?.isValid()) {
      return [];
    }
    return features
      .filter((feature) => featureGeometryWithinBounds(feature.geometry, printExtentBounds))
      .map((feature) => ({
        feature,
        sortPoint: featureSortPoint(feature)
      }))
      .sort((first, second) => {
        const latDelta = second.sortPoint.lat - first.sortPoint.lat;
        if (Math.abs(latDelta) > 1e-9) {
          return latDelta;
        }
        return first.sortPoint.lng - second.sortPoint.lng;
      })
      .map((entry) => entry.feature);
  }

  function featureGeometryWithinBounds(geometry, bounds) {
    const coordinates = flattenGeometryCoordinates(geometry);
    return coordinates.length > 0 && coordinates.every((coordinate) => bounds.contains(L.latLng(coordinate[1], coordinate[0])));
  }

  function flattenGeometryCoordinates(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) {
      return [];
    }
    if (geometry.type === "Polygon") {
      return geometry.coordinates.flat();
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.flat(2);
    }
    return [];
  }

  function featureSortPoint(feature) {
    const coordinates = flattenGeometryCoordinates(feature.geometry);
    if (!coordinates.length) {
      return L.latLng(0, 0);
    }
    const totals = coordinates.reduce((accumulator, coordinate) => ({
      lng: accumulator.lng + coordinate[0],
      lat: accumulator.lat + coordinate[1]
    }), { lng: 0, lat: 0 });
    return L.latLng(totals.lat / coordinates.length, totals.lng / coordinates.length);
  }

  function numberedPreparedBuildingFeatures(features, numberingMode) {
    return features.map((feature, index) => {
      const properties = { ...(feature.properties || {}) };
      properties.plan_number = numberingMode === "manual"
        ? (properties.building_code || `B${String(index + 1).padStart(2, "0")}`)
        : `B${String(index + 1).padStart(2, "0")}`;
      return {
        ...feature,
        properties
      };
    });
  }

  function preparedBuildingsPlanRegion(form, siteCode, siteName) {
    const missionId = form.elements.mission_id?.value || "";
    const normalizedSiteCode = normalizeCategory(siteCode);
    const normalizedSiteName = normalizeCategory(siteName);
    const match = points.find((point) => {
      if (missionId && String(point.mission_id) !== String(missionId)) {
        return false;
      }
      const raw = rawData(point);
      const pointCode = normalizeCategory(rawValue(raw, "modA.id_entite") || rawValue(raw, "modA/id_entite"));
      const pointName = normalizeCategory(rawValue(raw, "modB.nom_officiel") || rawValue(raw, "modB/nom_officiel"));
      return (normalizedSiteCode && pointCode === normalizedSiteCode)
        || (normalizedSiteName && pointName === normalizedSiteName);
    });
    return match?.nom_region || "-";
  }

  function renderFieldSituationChecklist(value) {
    const normalizedValue = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const options = [
      ["conforme", "Conforme"],
      ["inexistant", "Inexistant"],
      ["omis", "Omis"],
      ["regroupe", "Regroupé"],
      ["fractionne", "Fractionné"],
      ["mal positionne", "Mal positionné"]
    ];
    return `<div class="plan-situation-options">${options.map(([key, label]) => {
      const checked = normalizedValue === key ? " checked" : "";
      return `<label><input type="checkbox"${checked} disabled><span>${escapeHtml(label)}</span></label>`;
    }).join("")}</div>`;
  }

  function renderPreparedBuildingsPrintHtml(payload) {
    const encodedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");
    const pageOrientation = payload.page?.orientation === "portrait" ? "portrait" : "landscape";
    return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <title>Plan de situation - ${escapeHtml(payload.metadata.siteName)}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    * { box-sizing: border-box; }
    body { color: #182b37; font: 12px/1.35 Arial, sans-serif; margin: 0; }
    .plan-page { display: grid; gap: 10px; min-height: 100vh; padding: 14px; }
    .plan-page-1 { grid-template-rows: auto minmax(0, 1fr) auto; }
    .plan-building-page { align-content: start; page-break-before: always; break-before: page; }
    .plan-header { align-items: start; border-bottom: 2px solid #182b37; display: grid; gap: 10px; grid-template-columns: 1fr auto; padding-bottom: 10px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .plan-meta { display: grid; gap: 4px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
    .plan-meta div { display: grid; grid-template-columns: 110px 1fr; }
    .plan-meta dt { color: #5f7280; font-weight: 700; }
    .plan-meta dd { margin: 0; }
    .plan-north { border: 1px solid #182b37; border-radius: 999px; display: grid; height: 58px; place-items: center; width: 58px; }
    .plan-north strong { font-size: 18px; }
    .plan-map { border: 1px solid #182b37; height: 62vh; min-height: 460px; width: 100%; }
    .plan-line .plan-map { background: #fff; }
    .plan-legend { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .plan-card { border: 1px solid #d9e2e8; border-radius: 4px; padding: 9px; }
    .plan-card h2 { font-size: 13px; margin: 0 0 8px; text-transform: uppercase; }
    .legend-row { align-items: center; display: flex; gap: 8px; margin: 6px 0; }
    .legend-symbol { background: rgba(31, 78, 121, 0.12); border: ${payload.style.strokeWeight}px ${cssBorderStyle(payload.style.dashStyle)} ${escapeHtml(payload.style.strokeColor)}; display: inline-block; height: 18px; width: 28px; }
    .plan-building-list { border-collapse: collapse; width: 100%; }
    .plan-building-list th, .plan-building-list td { border-bottom: 1px solid #d9e2e8; padding: 4px 5px; text-align: left; vertical-align: top; }
    .plan-building-list th { background: #f4f7f8; font-size: 10px; text-transform: uppercase; }
    .plan-building-list td.plan-note-cell { min-width: 34mm; }
    .plan-building-list td.plan-situation-cell { min-width: 32mm; }
    .plan-situation-options { display: grid; font-size: 65%; gap: 2px; line-height: 1.15; }
    .plan-situation-options label { align-items: center; display: grid; gap: 4px; grid-template-columns: 10px 1fr; }
    .plan-situation-options input { height: 9px; margin: 0; width: 9px; }
    .plan-label { align-items: center; background: #fff; border: 1px solid #182b37; border-radius: 999px; color: #182b37; display: flex; font: 700 max(9px, calc(var(--plan-label-size) * 0.42))/1 Arial, sans-serif; height: var(--plan-label-size); justify-content: center; opacity: var(--plan-label-opacity); width: var(--plan-label-size); }
    .leaflet-control-attribution { font-size: 9px; }
    @media print {
      @page { margin: 10mm; size: A4 ${pageOrientation}; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .plan-page { min-height: auto; padding: 0; }
      .plan-page-1 { height: ${pageOrientation === "portrait" ? "277mm" : "190mm"}; }
      .plan-map { height: ${pageOrientation === "portrait" ? "188mm" : "105mm"}; min-height: 0; }
      .plan-building-page { padding-top: 0; }
    }
  </style>
</head>
<body class="plan-${escapeHtml(payload.planType)} plan-orientation-${pageOrientation}">
  <main class="plan-page plan-page-1">
    <header class="plan-header">
      <div>
        <h1>Plan de situation des bâtiments à vérifier</h1>
        <dl class="plan-meta">
          <div><dt>Site</dt><dd>${escapeHtml(payload.metadata.siteName)}</dd></div>
          <div><dt>Code site</dt><dd>${escapeHtml(payload.metadata.siteCode)}</dd></div>
          <div><dt>Mission</dt><dd>${escapeHtml(payload.metadata.mission)}</dd></div>
          <div><dt>Région</dt><dd>${escapeHtml(payload.metadata.region)}</dd></div>
          <div><dt>Type de plan</dt><dd>${escapeHtml(planTypeLabel(payload.planType))}</dd></div>
          <div><dt>Généré le</dt><dd>${escapeHtml(payload.generatedAt)}</dd></div>
        </dl>
      </div>
      <div class="plan-north" aria-label="Nord"><strong>↑ N</strong></div>
    </header>
    <section id="prepared-buildings-print-map" class="plan-map" aria-label="Carte imprimable"></section>
    <section class="plan-card plan-legend">
      <div>
        <h2>Légende</h2>
        <p class="legend-row"><span class="legend-symbol"></span><span>Bâtiments à vérifier</span></p>
      </div>
      <div>
        <h2>Échelle</h2>
        <p>Échelle approximative : voir barre d'échelle sur la carte.</p>
      </div>
      <div>
        <h2>Limites</h2>
        <p>Limites du site : non disponibles si aucune emprise de site n'est chargée dans G2M.</p>
      </div>
    </section>
  </main>
  <main class="plan-page plan-building-page">
    <section class="plan-card">
      <h2>Bâtiments à vérifier</h2>
      <table class="plan-building-list">
        <thead>
          <tr>
            <th>N° plan</th>
            <th>N° Bâtiment KOBO</th>
            <th>Situation terrain</th>
            <th>Contrôle superviseur</th>
            <th>Traitement spécialiste Carto</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>${payload.buildings.map((building) => `
          <tr>
            <td>${escapeHtml(building.number)}</td>
            <td class="plan-note-cell">${escapeHtml(building.koboBuildingNumber || "")}</td>
            <td class="plan-situation-cell">${renderFieldSituationChecklist(building.fieldSituation)}</td>
            <td class="plan-note-cell">${escapeHtml(building.supervisorNote || "")}</td>
            <td class="plan-note-cell">${escapeHtml(building.cartographyAction || "Maintenir / supprimer / créer / découper / fusionner / repositionner")}</td>
            <td>${escapeHtml(building.source)}</td>
          </tr>`).join("")}</tbody>
      </table>
    </section>
  </main>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <script>
    const planPayload = ${encodedPayload};
    const labelSize = Number(planPayload.labels && planPayload.labels.size) || 24;
    const map = L.map("prepared-buildings-print-map", { zoomControl: false, attributionControl: true });
    const printBounds = L.latLngBounds(
      [planPayload.printBounds.south, planPayload.printBounds.west],
      [planPayload.printBounds.north, planPayload.printBounds.east]
    );
    const baseLayers = {
      satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles &copy; Esri" }),
      mixed: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles &copy; Esri" })
    };
    if (planPayload.planType !== "line") {
      baseLayers[planPayload.planType === "mixed" ? "mixed" : "satellite"].addTo(map);
    }
    const dashArray = planPayload.style.dashArray || null;
    const buildingLayer = L.geoJSON(planPayload.featureCollection, {
      style: function () {
        return {
          color: planPayload.style.strokeColor,
          dashArray,
          fill: true,
          fillColor: planPayload.style.strokeColor,
          fillOpacity: planPayload.planType === "line" ? Math.min(0.08, Number(planPayload.style.fillOpacity) || 0.04) : Number(planPayload.style.fillOpacity) || 0.12,
          opacity: 1,
          weight: planPayload.style.strokeWeight
        };
      },
      onEachFeature: function (feature, layer) {
        const center = layer.getBounds ? layer.getBounds().getCenter() : layer.getLatLng();
        L.marker(center, {
          icon: L.divIcon({
            className: "",
            html: '<span class="plan-label" style="--plan-label-size: ' + labelSize + 'px; --plan-label-opacity: ' + (Number(planPayload.labels && planPayload.labels.opacity) || 1) + ';">' + String(feature.properties.plan_number || "") + '</span>',
            iconSize: [labelSize, labelSize],
            iconAnchor: [labelSize / 2, labelSize / 2]
          }),
          interactive: false
        }).addTo(map);
      }
    }).addTo(map);
    L.control.scale({ imperial: false, metric: true }).addTo(map);
    if (printBounds.isValid()) {
      map.fitBounds(printBounds, { animate: false, padding: [0, 0], maxZoom: 19 });
    } else if (buildingLayer.getBounds().isValid()) {
      map.fitBounds(buildingLayer.getBounds(), { animate: false, padding: [28, 28], maxZoom: 19 });
    }
    window.setTimeout(function () {
      map.invalidateSize();
      if (planPayload.autoPrint) {
        window.print();
      }
    }, 900);
  <\/script>
</body>
</html>`;
  }

  function planTypeLabel(planType) {
    return {
      satellite: "Plan satellite",
      line: "Plan filaire",
      mixed: "Plan mixte"
    }[planType] || "Plan satellite";
  }

  function cssBorderStyle(dashStyle) {
    return {
      solid: "solid",
      dashed: "dashed",
      dotted: "dotted",
      dashdot: "dashed"
    }[dashStyle] || "dashed";
  }

  async function updatePreparedBuildingStatus(form, feedback) {
    if (!selectedPreparedBuildingId) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = "Sélectionner un bâtiment dans le tableau.";
      return;
    }
    try {
      feedback.className = "prepared-buildings-feedback";
      feedback.textContent = "Mise à jour du statut...";
      const response = await fetch(`/cartographie/buildings/${selectedPreparedBuildingId}/status`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: form.elements.status_update.value })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Mise à jour impossible.");
      }
      feedback.className = "prepared-buildings-feedback is-success";
      feedback.textContent = "Statut mis à jour.";
      await loadPreparedBuildings(form, feedback, { keepMessage: true });
      focusPreparedBuilding(selectedPreparedBuildingId);
    } catch (error) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = error.message;
    }
  }

  function startOsmSelection(mode, form) {
    osmSelectionMode = mode;
    osmSelectionPoints = [];
    osmSelectionGeometry = null;
    osmSelectionLayer.clearLayers();
    updateOsmSelectionStatus(form, mode === "rectangle"
      ? "Cliquer deux coins opposés du rectangle sur la carte."
      : "Cliquer les sommets du polygone, puis double-cliquer pour terminer.");
    map.getContainer().classList.add("is-osm-selecting");
  }

  function clearOsmSelection(form) {
    osmSelectionMode = null;
    osmSelectionPoints = [];
    osmSelectionGeometry = null;
    osmSelectionLayer.clearLayers();
    map.getContainer().classList.remove("is-osm-selecting");
    updateOsmSelectionStatus(form, "Aucune zone OSM définie. Surface maximale autorisée : 5 km².");
  }

  function handleOsmSelectionClick(event) {
    if (!osmSelectionMode) {
      return;
    }
    const point = [event.latlng.lng, event.latlng.lat];
    osmSelectionPoints.push(point);
    if (osmSelectionMode === "rectangle" && osmSelectionPoints.length === 2) {
      setOsmSelectionGeometry(rectangleToPolygon(osmSelectionPoints[0], osmSelectionPoints[1]));
      osmSelectionMode = null;
      map.getContainer().classList.remove("is-osm-selecting");
      return;
    }
    if (osmSelectionMode === "polygon") {
      previewOsmSelectionPolygon();
    }
  }

  function finishOsmSelectionPolygon() {
    if (osmSelectionMode !== "polygon") {
      return;
    }
    if (osmSelectionPoints.length < 3) {
      return;
    }
    setOsmSelectionGeometry(closeRing(osmSelectionPoints));
    osmSelectionMode = null;
    map.getContainer().classList.remove("is-osm-selecting");
  }

  function previewOsmSelectionPolygon() {
    osmSelectionLayer.clearLayers();
    if (osmSelectionPoints.length === 1) {
      L.marker([osmSelectionPoints[0][1], osmSelectionPoints[0][0]]).addTo(osmSelectionLayer);
      return;
    }
    L.polyline(osmSelectionPoints.map(([lng, lat]) => [lat, lng]), {
      color: "#6f42c1",
      dashArray: "4,4",
      weight: 2
    }).addTo(osmSelectionLayer);
  }

  function setOsmSelectionGeometry(ring) {
    osmSelectionGeometry = {
      type: "Polygon",
      coordinates: [ring]
    };
    osmSelectionLayer.clearLayers();
    osmSelectionLayer.addData(osmSelectionGeometry);
    const form = document.getElementById("prepared-buildings-form");
    const area = polygonAreaKm2(ring);
    const valid = area > 0 && area <= 5;
    form.querySelector("[data-osm-import]").disabled = !valid;
    updateOsmSelectionStatus(form, valid
      ? `Zone OSM prête : ${area.toFixed(3)} km².`
      : `Zone trop grande ou invalide : ${area.toFixed(3)} km². Maximum : 5 km².`);
  }

  function updateOsmSelectionStatus(form, message) {
    const status = form?.querySelector("[data-osm-status]");
    if (status) {
      status.textContent = message;
    }
    const importButton = form?.querySelector("[data-osm-import]");
    if (importButton && !osmSelectionGeometry) {
      importButton.disabled = true;
    }
  }

  function rectangleToPolygon(first, second) {
    const west = Math.min(first[0], second[0]);
    const east = Math.max(first[0], second[0]);
    const south = Math.min(first[1], second[1]);
    const north = Math.max(first[1], second[1]);
    return closeRing([
      [west, south],
      [east, south],
      [east, north],
      [west, north]
    ]);
  }

  function closeRing(points) {
    const ring = points.map((point) => [...point]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([...first]);
    }
    return ring;
  }

  function polygonAreaKm2(ring) {
    if (!Array.isArray(ring) || ring.length < 4) {
      return 0;
    }
    const meanLat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(meanLat * Math.PI / 180);
    const projected = ring.map(([lng, lat]) => [lng * metersPerDegreeLng, lat * metersPerDegreeLat]);
    let area = 0;
    for (let index = 0; index < projected.length - 1; index += 1) {
      area += projected[index][0] * projected[index + 1][1] - projected[index + 1][0] * projected[index][1];
    }
    return Math.abs(area) / 2 / 1000000;
  }

  async function importPreparedBuildingsFromOsm(form, feedback) {
    if (!osmSelectionGeometry) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = "Définir une zone OSM avant import.";
      return;
    }
    if (!form.elements.mission_id.value) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = "Sélectionner une mission.";
      return;
    }
    try {
      feedback.className = "prepared-buildings-feedback";
      feedback.textContent = "Import OSM en cours...";
      const response = await fetch("/cartographie/buildings/import-osm", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mission_id: form.elements.mission_id.value,
          site_code: form.elements.site_code.value,
          site_name: form.elements.site_name.value,
          selection: osmSelectionGeometry
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error([result.error || "Import OSM impossible.", result.details].filter(Boolean).join(" - "));
      }
      feedback.className = "prepared-buildings-feedback is-success";
      feedback.textContent = `${result.result.imported} bâtiment(s) OSM importé(s).`;
      await loadPreparedBuildings(form, feedback, { keepMessage: true });
    } catch (error) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = error.message;
    }
  }

  function focusPreparedBuilding(id) {
    preparedBuildingsLayer.eachLayer((layer) => {
      const featureId = layer.feature?.properties?.id;
      if (featureId !== id || typeof layer.setStyle !== "function") {
        return;
      }
      layer.setStyle({ color: "#0000FF", weight: 4, dashArray: null, fillOpacity: 0.18 });
      if (layer.getBounds && layer.getBounds().isValid()) {
        map.fitBounds(layer.getBounds(), { padding: [32, 32], maxZoom: 20 });
      }
      window.setTimeout(() => {
        layer.setStyle(preparedBuildingStyle(layer.feature));
      }, 3000);
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function setToolsOpen(open, options = {}) {
    workspace.classList.toggle("is-tools-open", open);
    toolsToggle.setAttribute("aria-expanded", String(open));
    toolsToggle.setAttribute(
      "aria-label",
      open ? t("toolsHide") : t("toolsShow")
    );
    window.setTimeout(function () {
      map.invalidateSize();
      syncVisitedSitesTable(lastVisitedSitesRows);
    }, 320);
    if (options.saveState !== false) {
      saveCurrentCartographyContext();
    }
  }

  function filters() {
    return {
      mission: document.getElementById("sig-mission-filter").value,
      region: document.getElementById("sig-region-filter").value,
      department: document.getElementById("sig-department-filter").value,
      subprefecture: document.getElementById("sig-subprefecture-filter").value,
      ministry: document.getElementById("sig-ministry-filter").value,
      search: visitedSitesSearchInput?.value || "",
      from: document.getElementById("sig-date-from").value,
      to: document.getElementById("sig-date-to").value
    };
  }

  function currentVisiblePoints() {
    const criteria = filters();
    return points.filter(function (point) {
      return isVisible(point, criteria);
    });
  }

  function isVisible(point, criteria) {
    const day = point.submitted_at.slice(0, 10);
    return (!criteria.mission || String(point.mission_id) === criteria.mission)
      && (!criteria.region || String(visitedSiteFieldValue(point, "modB/region") || point.nom_region || "") === criteria.region)
      && (!criteria.department || String(visitedSiteFieldValue(point, "modB/departement") || "") === criteria.department)
      && (!criteria.subprefecture || String(visitedSiteFieldValue(point, "modB/sous_prefecture") || point.nom_sous_prefecture || "") === criteria.subprefecture)
      && (!criteria.ministry || String(visitedSiteFieldValue(point, "modB/ministere") || "") === criteria.ministry)
      && matchesVisitedSiteSearch(point, criteria.search)
      && (!criteria.from || day >= criteria.from)
      && (!criteria.to || day <= criteria.to);
  }

  function matchesVisitedSiteSearch(point, query) {
    const terms = normalizeSearchText(query).split(" ").filter(Boolean);
    if (!terms.length) {
      return true;
    }
    const haystack = normalizeSearchText(visitedSiteSearchValues(point).join(" "));
    return terms.every((term) => haystack.includes(term));
  }

  function visitedSiteSearchValues(point) {
    return [
      "modB/nom_officiel",
      "modB/region",
      "modB/departement",
      "modB/sous_prefecture",
      "modB/ministere",
      "modB/type_infra",
      "modB/sous_type",
      "modB/commune",
      "modB/milieu"
    ].map((field) => resolvedVisitedSiteSearchValue(point, field));
  }

  function resolvedVisitedSiteSearchValue(point, field) {
    const value = visitedSiteFieldValue(point, field);
    return resolveAdministrativeChoice(field, value) || value || "";
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function updateMetrics(visiblePoints) {
    const count = { validee: 0, a_verifier: 0, rejetee: 0 };
    visiblePoints.forEach(function (point) {
      count[point.statut_validation] += 1;
    });
    document.getElementById("sig-visible-total").textContent = visiblePoints.length;
    updateVisitedSitesTableTitle(visiblePoints.length);
    document.getElementById("sig-count-valid").textContent = count.validee;
    document.getElementById("sig-count-check").textContent = count.a_verifier;
    document.getElementById("sig-count-rejected").textContent = count.rejetee;
  }

  function updateVisitedSitesTableTitle(count) {
    const title = document.getElementById("sig-table-title");
    if (!title) {
      return;
    }
    title.textContent = (t("tableVisibleCount") || "{{count}} sites affiché(s)").replace("{{count}}", count);
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
    const visiblePoints = currentVisiblePoints();

    clusteredMarkersLayer.clearLayers();
    plainMarkersLayer.clearLayers();
    siteMarkersById.clear();
    visiblePoints.forEach(function (point) {
      const clusteredMarker = createSiteMarker(point).bindPopup(popupContent(point));
      const plainMarker = createSiteMarker(point).bindPopup(popupContent(point));
      clusteredMarker.addTo(clusteredMarkersLayer);
      plainMarker.addTo(plainMarkersLayer);
    });
    if (selectedSiteId && !siteMarkersById.has(selectedSiteId)) {
      selectedSiteId = null;
    }
    updateSelectedSiteMarkerBounce();
    updateSiteMarkerLabels();

    syncVisitedSitesTable(visiblePoints);
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
    updateSelectedSiteMarkerBounce();
    clusterToggle.setAttribute("aria-pressed", String(clusteringEnabled));
    clusterToggle.classList.toggle("is-active", clusteringEnabled);
    clusterToggle.title = clusteringEnabled
      ? t("clusterDisable")
      : t("clusterEnable");
    saveCurrentCartographyContext();
  }

  function currentMapState() {
    const center = map.getCenter();
    return {
      center: {
        lat: center.lat,
        lng: center.lng
      },
      zoom: map.getZoom(),
      baseLayer: activeBaseLayerName
    };
  }

  function currentLayoutState() {
    return {
      toolsOpen: workspace.classList.contains("is-tools-open"),
      toolsWidth: userDefinedToolsWidth,
      clusterEnabled: clusteringEnabled,
      legendCollapsed: mapLegend.classList.contains("is-collapsed"),
      layerControlCollapsed: mapControlContainer.classList.contains("is-collapsed"),
      activeLayerId: activeLayerContext.id || "root",
      selectedSubmissionId: activeLayerContext.submissionId || null
    };
  }

  function normalizeToolsWidth(value) {
    const width = Number(value);
    return Number.isFinite(width) && width > 0 ? width : null;
  }

  function saveCurrentCartographyContext() {
    if (isRestoringContext || Date.now() < contextPersistenceFrozenUntil) {
      return;
    }
    saveCartographyContextNow();
  }

  function saveCartographyContextNow() {
    CartographieSessionState.save({
      filters: filters(),
      map: currentMapState(),
      layout: currentLayoutState()
    });
  }

  function restoreFilterValues(criteria) {
    if (!criteria) {
      return;
    }
    document.getElementById("sig-mission-filter").value = criteria.mission || "";
    updateAdministrativeFilterCascade({
      region: criteria.region || "",
      department: criteria.department || "",
      subprefecture: criteria.subprefecture || ""
    });
    document.getElementById("sig-ministry-filter").value = criteria.ministry || "";
    if (visitedSitesSearchInput) {
      visitedSitesSearchInput.value = criteria.search || "";
    }
    if (visitedSitesSearchClear) {
      visitedSitesSearchClear.hidden = !visitedSitesSearchInput?.value;
    }
    document.getElementById("sig-date-from").value = criteria.from || "";
    document.getElementById("sig-date-to").value = criteria.to || "";
  }

  function restoreBaseLayer(name) {
    if (!name || !baseLayers[name]) {
      return;
    }
    Object.values(baseLayers).forEach(function (layer) {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
    activeBaseLayerName = name;
    baseLayers[name].addTo(map);
  }

  function restoreMapView(mapState) {
    if (!mapState?.center) {
      return false;
    }
    const latitude = Number(mapState.center.lat);
    const longitude = Number(mapState.center.lng);
    const zoom = Number(mapState.zoom);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(zoom)) {
      return false;
    }
    map.setView([latitude, longitude], zoom, { animate: false });
    return true;
  }

  function restoreLayout(layout) {
    if (!layout) {
      return;
    }
    const restoredToolsWidth = normalizeToolsWidth(layout.toolsWidth);
    userDefinedToolsWidth = restoredToolsWidth;
    if (restoredToolsWidth) {
      workspace.style.setProperty("--sig-tools-width", `${restoredToolsWidth}px`);
    } else {
      workspace.style.removeProperty("--sig-tools-width");
    }
    setToolsOpen(Boolean(layout.toolsOpen), { saveState: false });
    setClustering(layout.clusterEnabled !== false);
    const legendCollapsed = layout.legendCollapsed !== false;
    const layerControlCollapsed = layout.layerControlCollapsed !== false;
    setLegendCollapsed(legendCollapsed, { saveState: false });
    setMapControlCollapsed(layerControlCollapsed, { saveState: false });
  }

  function restoreActiveLayer(layout) {
    if (!layout?.activeLayerId || layout.activeLayerId === "root") {
      return;
    }
    if (layout.activeLayerId === "kobo-import") {
      openKoboLightLayer({ saveState: false });
      return;
    }
    if (layout.activeLayerId === "prepared-buildings") {
      openPreparedBuildingsLayer({ saveState: false });
      return;
    }
    const point = points.find(function (candidate) {
      return String(candidate.id) === String(layout.selectedSubmissionId);
    });
    if (!point) {
      return;
    }
    if (layout.activeLayerId === "decision-detail") {
      showDecisionDetail(point, { saveState: false });
    } else if (layout.activeLayerId === "site-detail") {
      showSiteIdentification(point, { saveState: false });
    }
  }

  async function openSubmissionFromQuery() {
    const submissionId = new URLSearchParams(window.location.search).get("submission_id");
    if (!submissionId) {
      return false;
    }
    const point = points.find(function (candidate) {
      return String(candidate.id) === String(submissionId);
    });
    if (!point) {
      return false;
    }
    if (!isVisible(point, filters())) {
      document.getElementById("sig-mission-filter").value = String(point.mission_id || "");
      updateAdministrativeFilterCascade({
        region: "",
        department: "",
        subprefecture: ""
      });
      document.getElementById("sig-ministry-filter").value = "";
      if (visitedSitesSearchInput) {
        visitedSitesSearchInput.value = "";
      }
      if (visitedSitesSearchClear) {
        visitedSitesSearchClear.hidden = true;
      }
      document.getElementById("sig-date-from").value = "";
      document.getElementById("sig-date-to").value = "";
    }
    selectSite(point);
    flyToSubmission(point);
    openSitePopup(point);
    return true;
  }

  async function restoreCartographyContext(context) {
    if (!context) {
      return false;
    }
    isRestoringContext = true;
    try {
      restoreFilterValues(context.filters);
      restoreBaseLayer(context.map?.baseLayer);
      renderPoints(false);
      restoreLayout(context.layout);
      restoreMapView(context.map);
      restoreActiveLayer(context.layout);
      return true;
    } finally {
      isRestoringContext = false;
      saveCurrentCartographyContext();
    }
  }

  function setFilterPanelOpen(open) {
    const panel = document.getElementById("sig-filter-panel");
    const toggle = document.getElementById("sig-filter-toggle");
    if (!panel || !toggle) {
      return;
    }
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      panel.querySelector("select, input, button")?.focus();
    }
    refreshPalLayout();
  }

  function setSummaryPanelOpen(open) {
    const panel = document.getElementById("sig-summary-panel");
    const toggle = document.getElementById("sig-summary-toggle");
    if (!panel || !toggle) {
      return;
    }
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    refreshPalLayout();
  }

  function openVisitedSitesColumnsModal() {
    const modal = document.getElementById("sig-columns-modal");
    if (!modal) {
      return;
    }
    renderVisitedSitesColumnsList();
    modal.hidden = false;
    modal.querySelector("input, button")?.focus();
  }

  function closeVisitedSitesColumnsModal() {
    const modal = document.getElementById("sig-columns-modal");
    if (modal) {
      modal.hidden = true;
    }
  }

  function renderVisitedSitesColumnsList() {
    const list = document.getElementById("sig-columns-list");
    if (!list) {
      return;
    }
    const selected = new Set(selectedVisitedSitesColumnFields());
    list.innerHTML = visitedSitesAvailableColumns.map((column) => {
      const checked = selected.has(column.field) || column.locked;
      const disabled = column.locked ? " disabled" : "";
      return `<label class="sig-column-option">
        <input type="checkbox" name="column" value="${escapeHtml(column.field)}"${checked ? " checked" : ""}${disabled}>
        <span>${escapeHtml(column.title)}</span>
        ${column.locked ? "<em>fixe</em>" : ""}
      </label>`;
    }).join("");
  }

  let visitedSitesSearchDebounce = null;

  function scheduleVisitedSitesSearchFilter() {
    if (visitedSitesSearchClear) {
      visitedSitesSearchClear.hidden = !visitedSitesSearchInput?.value;
    }
    window.clearTimeout(visitedSitesSearchDebounce);
    visitedSitesSearchDebounce = window.setTimeout(function () {
      renderPoints(true);
      saveCurrentCartographyContext();
    }, 800);
  }

  function clearVisitedSitesSearch() {
    if (!visitedSitesSearchInput) {
      return;
    }
    visitedSitesSearchInput.value = "";
    if (visitedSitesSearchClear) {
      visitedSitesSearchClear.hidden = true;
    }
    window.clearTimeout(visitedSitesSearchDebounce);
    renderPoints(true);
    saveCurrentCartographyContext();
    visitedSitesSearchInput.focus();
  }

  document.getElementById("sig-filter-toggle")?.addEventListener("click", function () {
    const panel = document.getElementById("sig-filter-panel");
    setFilterPanelOpen(panel?.hidden !== false);
  });
  document.getElementById("sig-summary-toggle")?.addEventListener("click", function () {
    const panel = document.getElementById("sig-summary-panel");
    setSummaryPanelOpen(panel?.hidden !== false);
  });
  visitedSitesSearchInput?.addEventListener("input", scheduleVisitedSitesSearchFilter);
  visitedSitesSearchInput?.addEventListener("search", function () {
    if (!visitedSitesSearchInput.value) {
      clearVisitedSitesSearch();
    }
  });
  visitedSitesSearchClear?.addEventListener("click", clearVisitedSitesSearch);
  document.getElementById("sig-filters").addEventListener("change", function (event) {
    if (event.target.id === "sig-mission-filter") {
      saveCurrentCartographyContext();
    }
    if (event.target.id === "sig-region-filter") {
      updateAdministrativeFilterCascade({
        region: event.target.value,
        department: "",
        subprefecture: ""
      });
    }
    if (event.target.id === "sig-department-filter") {
      updateAdministrativeFilterCascade({
        region: document.getElementById("sig-region-filter").value,
        department: event.target.value,
        subprefecture: ""
      });
    }
  });
  document.getElementById("sig-filters").addEventListener("submit", function (event) {
    event.preventDefault();
    renderPoints(true);
    setFilterPanelOpen(false);
    saveCurrentCartographyContext();
  });
  document.getElementById("sig-reset-filters").addEventListener("click", function () {
    contextPersistenceFrozenUntil = Date.now() + 1000;
    CartographieSessionState.clear();
    userDefinedToolsWidth = null;
    workspace.style.removeProperty("--sig-tools-width");
    document.getElementById("sig-filters").reset();
    updateAdministrativeFilterCascade({
      region: "",
      department: "",
      subprefecture: ""
    });
    if (visitedSitesSearchInput) {
      visitedSitesSearchInput.value = "";
    }
    if (visitedSitesSearchClear) {
      visitedSitesSearchClear.hidden = true;
    }
    window.clearTimeout(visitedSitesSearchDebounce);
    renderPoints(true);
    setFilterPanelOpen(false);
    window.setTimeout(function () {
      contextPersistenceFrozenUntil = 0;
      saveCartographyContextNow();
    }, 1000);
  });
  document.getElementById("sig-columns-open-inline")?.addEventListener("click", openVisitedSitesColumnsModal);
  document.querySelectorAll("[data-sig-columns-close]").forEach((button) => {
    button.addEventListener("click", closeVisitedSitesColumnsModal);
  });
  document.getElementById("sig-columns-form")?.addEventListener("submit", function (event) {
    event.preventDefault();
    const fields = Array.from(event.currentTarget.querySelectorAll('input[name="column"]:checked'))
      .map((input) => input.value);
    saveVisitedSitesColumnFields(fields);
    closeVisitedSitesColumnsModal();
  });
  document.getElementById("sig-columns-reset")?.addEventListener("click", function () {
    saveVisitedSitesColumnFields(visitedSitesDefaultColumns);
    renderVisitedSitesColumnsList();
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
  if (geometryImportOpen && geometryImportInput) {
    geometryImportOpen.addEventListener("click", function () {
      geometryImportInput.click();
    });
    geometryImportInput.addEventListener("change", function () {
      const file = geometryImportInput.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", function () {
        importGeometryFile(reader.result || "", file.name);
        geometryImportInput.value = "";
      });
      reader.readAsText(file, "utf-8");
    });
  }
  if (geometryClear) {
    geometryClear.addEventListener("click", clearImportedGeometries);
  }
  if (buildingsOpen) {
    buildingsOpen.addEventListener("click", function () {
      openPreparedBuildingsLayer();
    });
  }
  if (sitesPlanningOpen) {
    sitesPlanningOpen.addEventListener("click", function () {
      openSitesPlanningLayer();
    });
  }
  if (geometryOverlay && geometryOverlayHandle) {
    let overlayDrag = null;
    geometryOverlayHandle.addEventListener("pointerdown", function (event) {
      if (event.target.closest("button")) {
        return;
      }
      const rect = geometryOverlay.getBoundingClientRect();
      const hostRect = mapPane.getBoundingClientRect();
      overlayDrag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        hostLeft: hostRect.left,
        hostTop: hostRect.top,
        maxLeft: hostRect.width - rect.width,
        maxTop: hostRect.height - rect.height
      };
      geometryOverlayHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    geometryOverlayHandle.addEventListener("pointermove", function (event) {
      if (!overlayDrag) {
        return;
      }
      const left = Math.max(0, Math.min(event.clientX - overlayDrag.hostLeft - overlayDrag.offsetX, overlayDrag.maxLeft));
      const top = Math.max(0, Math.min(event.clientY - overlayDrag.hostTop - overlayDrag.offsetY, overlayDrag.maxTop));
      geometryOverlay.style.left = `${left}px`;
      geometryOverlay.style.top = `${top}px`;
    });
    geometryOverlayHandle.addEventListener("pointerup", function (event) {
      overlayDrag = null;
      geometryOverlayHandle.releasePointerCapture(event.pointerId);
    });
    geometryOverlayHandle.addEventListener("pointercancel", function () {
      overlayDrag = null;
    });
    if ("ResizeObserver" in window) {
      const geometryOverlayResizeObserver = new ResizeObserver(function () {
        clampGeometryOverlayToMapPane();
        if (importedGeometryTable) {
          importedGeometryTable.redraw(true);
        }
      });
      geometryOverlayResizeObserver.observe(geometryOverlay);
    }
  }
  koboLightTriggers.forEach(function (trigger) {
    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      openKoboLightLayer();
    });
  });
  mapLegendToggle.addEventListener("click", function () {
    setLegendCollapsed(!mapLegend.classList.contains("is-collapsed"));
  });
  mapLegend.addEventListener("mouseleave", function () {
    if (!mapLegend.classList.contains("is-collapsed")) {
      setLegendCollapsed(true);
    }
  });
  mapLegend.addEventListener("focusout", function (event) {
    if (!mapLegend.contains(event.relatedTarget)) {
      setLegendCollapsed(true);
    }
  });
  map.on("moveend zoomend", saveCurrentCartographyContext);
  map.on("moveend zoomend", updateSiteMarkerLabels);
  map.on("click", function (event) {
    if (handleMeasureClick(event)) {
      return;
    }
    if (handlePrintExtentClick(event)) {
      return;
    }
    if (handlePlanningLocationClick(event)) {
      return;
    }
    handleOsmSelectionClick(event);
  });
  map.on("dblclick", function (event) {
    if (finishPlanningContourCapture(event)) {
      return;
    }
    if (osmSelectionMode === "polygon") {
      event.originalEvent?.preventDefault();
      finishOsmSelectionPolygon();
    }
  });
  map.on("baselayerchange", function (event) {
    activeBaseLayerName = event.name;
    saveCurrentCartographyContext();
  });

  window.addEventListener("g2m:site-search-center-map", function (event) {
    const latitude = Number(event.detail?.latitude);
    const longitude = Number(event.detail?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    map.closePopup();
    map.flyTo([latitude, longitude], Math.max(map.getZoom(), 16), {
      animate: true,
      duration: 0.8
    });
  });

  let resizing = false;

  function setToolWidth(pointerX) {
    const rect = workspace.getBoundingClientRect();
    const separatorWidth = resizer.offsetWidth;
    const minimumToolsWidth = Math.min(285, rect.width / 2);
    const maximumToolsWidth = (rect.width * (2 / 3)) - separatorWidth;
    const width = Math.max(minimumToolsWidth, Math.min(pointerX - rect.left, maximumToolsWidth));
    userDefinedToolsWidth = width;
    workspace.style.setProperty("--sig-tools-width", `${width}px`);
    refreshPalLayout();
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
    saveCurrentCartographyContext();
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
    saveCurrentCartographyContext();
    event.preventDefault();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      setToolsOpen(false);
    }
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) {
      return;
    }
    const message = event.data || {};
    if (message.type === "g2m:open-submission-diagnostic") {
      showSubmissionDiagnostic(message.submissionId, message.axis, message.title);
    }
  });

  showLoading();
  window.requestAnimationFrame(async function () {
    try {
      renderCategoryLegend();
      const hasSubmissionQuery = Boolean(new URLSearchParams(window.location.search).get("submission_id"));
      const restored = hasSubmissionQuery ? false : await restoreCartographyContext(savedContext);
      if (!restored && territoryLayer.getBounds().isValid()) {
        map.fitBounds(territoryLayer.getBounds(), { padding: [12, 12] });
      }
      if (!restored) {
        updateAdministrativeFilterCascade();
        renderPoints(false);
        saveCurrentCartographyContext();
      }
    } finally {
      hideLoading();
      await openSubmissionFromQuery();
      if (new URLSearchParams(window.location.search).get("kobo") === "1") {
        openKoboLightLayer();
      }
    }
  });
}());

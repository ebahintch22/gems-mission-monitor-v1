(function () {
  const points = JSON.parse(document.getElementById("sig-points-data").textContent);
  const regions = JSON.parse(document.getElementById("sig-regions-data").textContent);
  const siteCategoryIcons = JSON.parse(document.getElementById("sig-site-category-icons-data").textContent);
  const geometryImportConfig = JSON.parse(document.getElementById("sig-geometry-import-config-data")?.textContent || "{}");
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
  const koboLightTriggers = document.querySelectorAll("[data-kobo-light-open]");
  const mapLegend = document.getElementById("sig-map-legend");
  const mapLegendToggle = document.getElementById("sig-map-legend-toggle");
  const mapLegendItems = document.getElementById("sig-map-legend-items");
  const mapPane = document.getElementById("sig-map-pane");
  const geometryImportOpen = document.getElementById("sig-geometry-import-open");
  const geometryImportInput = document.getElementById("sig-geometry-import-input");
  const geometryOverlay = document.getElementById("sig-geometry-overlay");
  const geometryOverlayHandle = document.getElementById("sig-geometry-overlay-handle");
  const geometryOverlayBody = document.getElementById("sig-geometry-results-body");
  const geometryClear = document.getElementById("sig-geometry-clear");
  const buildingsOpen = document.getElementById("sig-buildings-open");
  const loadingOverlay = document.getElementById("sig-loading-overlay");
  const map = L.map("sig-map", { maxZoom: 20 }).setView([7.54, -5.55], 6);
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
  map.createPane("territoryPane");
  map.getPane("territoryPane").style.zIndex = 410;
  map.createPane("collectionPointsPane");
  map.getPane("collectionPointsPane").style.zIndex = 450;
  const clusterToggle = document.getElementById("sig-cluster-toggle");
  const collectionLayer = L.layerGroup().addTo(map);
  const importedGeometryLayer = L.geoJSON(null, {
    style: importedGeometryStyle,
    pointToLayer(feature, latlng) {
      return L.circleMarker(latlng, {
        ...importedGeometryStyle(),
        fillOpacity: 0,
        radius: 6
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
  let selectedPreparedBuildingId = null;
  let osmSelectionMode = null;
  let osmSelectionPoints = [];
  let osmSelectionGeometry = null;
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
    const dashStyles = new Set(["solid", "dashed", "dotted", "dashdot"]);
    const hexColor = /^#[0-9a-f]{6}$/i;
    return {
      strokeColor: hexColor.test(prefs.strokeColor || "") ? prefs.strokeColor : "#FF0000",
      highlightColor: hexColor.test(prefs.highlightColor || "") ? prefs.highlightColor : "#0000FF",
      strokeWeight: Math.max(1, Math.min(8, Number.parseInt(prefs.strokeWeight, 10) || 2)),
      dashStyle: dashStyles.has(prefs.dashStyle) ? prefs.dashStyle : "dashed"
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
    return {
      solid: null,
      dashed: "5,5",
      dotted: "1,5",
      dashdot: "8,4,2,4"
    }[importedGeometryStylePrefs.dashStyle] || "5,5";
  }

  function applyImportedGeometryStyles() {
    importedGeometryLayer.eachLayer((layer) => {
      if (typeof layer.setStyle === "function") {
        layer.setStyle(importedGeometryStyle());
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

  function preparedBuildingStyle(feature) {
    const status = feature?.properties?.status || "prepare";
    const color = {
      prepare: "#7f7f7f",
      transmis_terrain: "#1f4e79",
      verifie_terrain: "#16856f",
      a_corriger: "#d38b13",
      valide: "#0f766e",
      archive: "#777777"
    }[status] || "#1f4e79";
    return {
      color,
      dashArray: status === "valide" ? null : "6,4",
      fill: true,
      fillColor: color,
      fillOpacity: 0.12,
      opacity: 1,
      weight: 2
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
    saveCurrentCartographyContext();
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
    activeLayerContext.id = event.id;
    if (event.id === "root") {
      activeLayerContext.submissionId = null;
    }
    saveCurrentCartographyContext();
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
  });

  let palLayoutFrame = null;

  function refreshPalLayout() {
    if (palLayoutFrame) {
      return;
    }
    palLayoutFrame = window.requestAnimationFrame(function () {
      palLayoutFrame = null;
      if (table && typeof table.redraw === "function") {
        table.redraw(true);
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
      if (featureId !== id || typeof layer.setStyle !== "function") {
        return;
      }
      layer.setStyle(importedGeometryStyle({ highlighted: true }));
      if (layer.getBounds && layer.getBounds().isValid()) {
        map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 19 });
      } else if (layer.getLatLng) {
        map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 18), { duration: 0.6 });
      }
      window.setTimeout(() => {
        if (typeof layer.setStyle === "function") {
          layer.setStyle(importedGeometryStyle());
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
            <input name="site_code" placeholder="Ex. SITE023">
          </label>
          <label>Nom du site
            <input name="site_name" placeholder="Nom officiel du site">
          </label>
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
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      await submitPreparedBuildingsImport(form, feedback);
    });
    if (missionSelect.value) {
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
    const gridContext = preparedBuildingsGrid();
    const gridFilters = preparedBuildingsGrid();
    const gridLoad = preparedBuildingsGrid();
    const actions = form.querySelector(".prepared-buildings-actions");
    const refreshButton = form.querySelector("[data-buildings-refresh]");
    const osmBlock = form.querySelector(".prepared-buildings-osm");
    const statusBlock = form.querySelector(".prepared-buildings-status");

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
      ...(statusBlock ? [{ id: "selection", title: "5. S&eacute;lection", panel: sectionSelection }] : [])
    ]);

    form.append(tabs);

    if (table && !shell.querySelector(".prepared-buildings-list")) {
      const listSection = document.createElement("section");
      const heading = document.createElement("h3");
      listSection.className = "prepared-buildings-list";
      heading.innerHTML = "[4. Liste des b&acirc;timents]";
      table.before(listSection);
      listSection.append(heading, table);
    }

    if (feedback) {
      form.after(feedback);
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
      await loadPreparedBuildings(form, feedback, { keepMessage: true });
    } catch (error) {
      feedback.className = "prepared-buildings-feedback is-error";
      feedback.textContent = error.message;
    }
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
    }, 320);
    if (options.saveState !== false) {
      saveCurrentCartographyContext();
    }
  }

  function filters() {
    return {
      mission: document.getElementById("sig-mission-filter").value,
      region: document.getElementById("sig-region-filter").value,
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
      && (!criteria.region || point.nom_region === criteria.region)
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

  function setMissionScopedFilters(options, selected = {}) {
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
    if (selected.equipe && Array.from(equipeSelect.options).some((option) => option.value === selected.equipe)) {
      equipeSelect.value = selected.equipe;
    }
    if (selected.agent && Array.from(agentSelect.options).some((option) => option.value === selected.agent)) {
      agentSelect.value = selected.agent;
    }
  }

  async function loadMissionScopedFilters(missionId, options = {}) {
    const reframeMap = options.reframeMap !== false;
    showLoading();
    if (!missionId) {
      setMissionScopedFilters({ equipes: [], agents: [] });
      renderPoints(reframeMap);
      hideLoading();
      return;
    }

    try {
      const response = await fetch(`/cartographie/options?mission_id=${encodeURIComponent(missionId)}`, {
        headers: { Accept: "application/json" }
      });
      setMissionScopedFilters(response.ok ? await response.json() : { equipes: [], agents: [] }, {
        equipe: options.equipe,
        agent: options.agent
      });
      renderPoints(reframeMap);
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
    document.getElementById("sig-region-filter").value = criteria.region || "";
    document.getElementById("sig-validation-filter").value = criteria.validation || "";
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
    mapLegend.classList.toggle("is-collapsed", legendCollapsed);
    mapLegendToggle.setAttribute("aria-expanded", String(!legendCollapsed));
    mapLegendToggle.setAttribute("aria-label", legendCollapsed ? t("legendExpand") : t("legendCollapse"));
    mapControlContainer.classList.toggle("is-collapsed", layerControlCollapsed);
    mapControlToggle.setAttribute("aria-expanded", String(!layerControlCollapsed));
    mapControlToggle.setAttribute("aria-label", layerControlCollapsed ? t("layersExpand") : t("layersCollapse"));
    mapControlToggleIcon.className = layerControlCollapsed
      ? "fa-solid fa-chevron-down"
      : "fa-solid fa-chevron-up";
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

  async function restoreCartographyContext(context) {
    if (!context) {
      return false;
    }
    isRestoringContext = true;
    try {
      restoreFilterValues(context.filters);
      restoreBaseLayer(context.map?.baseLayer);
      await loadMissionScopedFilters(context.filters?.mission || "", {
        reframeMap: false,
        equipe: context.filters?.equipe,
        agent: context.filters?.agent
      });
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

  document.getElementById("sig-filters").addEventListener("change", function (event) {
    if (event.target.id === "sig-mission-filter") {
      loadMissionScopedFilters(event.target.value).then(saveCurrentCartographyContext);
      return;
    }
    renderPoints(true);
    saveCurrentCartographyContext();
  });
  document.getElementById("sig-reset-filters").addEventListener("click", function () {
    contextPersistenceFrozenUntil = Date.now() + 1000;
    CartographieSessionState.clear();
    userDefinedToolsWidth = null;
    workspace.style.removeProperty("--sig-tools-width");
    document.getElementById("sig-filters").reset();
    setMissionScopedFilters({ equipes: [], agents: [] });
    renderPoints(true);
    window.setTimeout(function () {
      contextPersistenceFrozenUntil = 0;
      saveCartographyContextNow();
    }, 1000);
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
    const isCollapsed = mapLegend.classList.toggle("is-collapsed");
    mapLegendToggle.setAttribute("aria-expanded", String(!isCollapsed));
    mapLegendToggle.setAttribute(
      "aria-label",
      isCollapsed ? t("legendExpand") : t("legendCollapse")
    );
    saveCurrentCartographyContext();
  });
  map.on("moveend zoomend", saveCurrentCartographyContext);
  map.on("click", handleOsmSelectionClick);
  map.on("dblclick", function (event) {
    if (osmSelectionMode === "polygon") {
      event.originalEvent?.preventDefault();
      finishOsmSelectionPolygon();
    }
  });
  map.on("baselayerchange", function (event) {
    activeBaseLayerName = event.name;
    saveCurrentCartographyContext();
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
      const restored = await restoreCartographyContext(savedContext);
      if (!restored && territoryLayer.getBounds().isValid()) {
        map.fitBounds(territoryLayer.getBounds(), { padding: [12, 12] });
      }
      if (!restored) {
        setMissionScopedFilters({ equipes: [], agents: [] });
        renderPoints(false);
        saveCurrentCartographyContext();
      }
    } finally {
      hideLoading();
      if (new URLSearchParams(window.location.search).get("kobo") === "1") {
        openKoboLightLayer();
      }
    }
  });
}());

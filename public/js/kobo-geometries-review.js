(function () {
  const payload = JSON.parse(document.getElementById("kobo-geometry-review-payload").textContent);
  const summary = JSON.parse(document.getElementById("kobo-geometry-review-summary").textContent);
  const catalog = JSON.parse(document.getElementById("kobo-geometry-review-catalog")?.textContent || "{\"batches\":[]}");
  const localAssets = JSON.parse(document.getElementById("kobo-geometry-review-assets")?.textContent || "{\"total\":0,\"bySubmissionId\":{}}");
  const choiceIndex = JSON.parse(document.getElementById("kobo-geometry-review-choices")?.textContent || "{}");
  const results = Array.isArray(payload.results) ? payload.results : [];
  const records = Array.isArray(summary.records) ? summary.records : [];
  const workspace = document.getElementById("kobo-geometry-review");
  const leftPane = document.getElementById("kobo-geometry-review-left");
  const resizer = document.getElementById("kobo-geometry-resizer");
  const layoutStorageKey = "g2m.koboGeometryReview.layout.v1";
  let selectedIndex = null;
  let selectedExplorerNodeId = "site";
  let explorerSearchQuery = "";
  let table = null;
  let resizing = false;

  const map = L.map("kobo-geometry-review-map", {
    maxZoom: 20,
    zoomSnap: 0.1,
    zoomDelta: 0.1
  }).setView([7.54, -5.55], 6);

  const baseLayers = {
    "OSM routes": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors"
    }),
    "Google Satellite": L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
      attribution: "&copy; Google Satellite",
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      maxZoom: 20
    }),
    "Esri Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19
    }),
    "Carto clair": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
      subdomains: "abcd",
      maxZoom: 19
    })
  };

  baseLayers["Google Satellite"].addTo(map);

  const siteLayer = L.geoJSON(null, {
    style: {
      color: "#2563eb",
      fillColor: "#2563eb",
      fillOpacity: 0.12,
      opacity: 1,
      weight: 3
    },
    pointToLayer(feature, latlng) {
      return L.circleMarker(latlng, pointStyle("#2563eb"));
    },
    onEachFeature: bindFeaturePopup
  }).addTo(map);

  const buildingLayer = L.geoJSON(null, {
    style(feature) {
      const review = feature.properties?.requires_review;
      return {
        color: review ? "#dc2626" : "#f97316",
        fillColor: review ? "#dc2626" : "#f97316",
        fillOpacity: review ? 0.26 : 0.2,
        opacity: 1,
        weight: review ? 3 : 2
      };
    },
    pointToLayer(feature, latlng) {
      return L.circleMarker(latlng, pointStyle(feature.properties?.requires_review ? "#dc2626" : "#f97316"));
    },
    onEachFeature: bindFeaturePopup
  }).addTo(map);

  const buildingCentroidLayer = L.geoJSON(null, {
    pointToLayer(feature, latlng) {
      const color = feature.properties?.requires_review ? "#dc2626" : "#0891b2";
      return L.circleMarker(latlng, {
        ...pointStyle(color),
        radius: 5,
        color: "#111827",
        fillColor: color,
        weight: 2
      });
    },
    onEachFeature: bindFeaturePopup
  }).addTo(map);

  const raccordementLayer = L.geoJSON(null, {
    pointToLayer(feature, latlng) {
      return L.circleMarker(latlng, pointStyle("#16a34a"));
    },
    onEachFeature: bindFeaturePopup
  }).addTo(map);

  const pyloneLayer = L.geoJSON(null, {
    pointToLayer(feature, latlng) {
      return L.circleMarker(latlng, pointStyle("#7c3aed"));
    },
    onEachFeature: bindFeaturePopup
  }).addTo(map);

  const referenceMatchingLayer = L.geoJSON(null, {
    style: referenceMatchingStyle,
    pointToLayer(feature, latlng) {
      const color = referenceMatchingColor(feature.properties?.class);
      return L.circleMarker(latlng, {
        ...pointStyle(color),
        radius: referenceMatchingPointRadius(feature.properties),
        color: "#111827",
        fillColor: color,
        weight: 2
      });
    },
    onEachFeature: bindReferenceMatchingPopup
  });

  const normalizedBuildingsLayer = L.geoJSON(null, {
    style: normalizedBuildingStyle,
    onEachFeature: bindNormalizedBuildingPopup
  });

  const layerControl = L.control.layers(baseLayers, {
    "Emprise site": siteLayer,
    "Batiments": buildingLayer,
    "Centroides batiments": buildingCentroidLayer,
    "Raccordement": raccordementLayer,
    "Pylones": pyloneLayer,
    "Appariement de reference": referenceMatchingLayer,
    "Emprises normalisees": normalizedBuildingsLayer
  }, {
    collapsed: false,
    position: "topright"
  }).addTo(map);
  layerControl.getContainer().classList.add("map-control-container");

  restoreLeftPaneWidth();
  initializeVersionFilter();
  initializeTable();
  bindEvents();
  if (records.length > 0) {
    selectSubmission(0);
  }

  function initializeVersionFilter() {
    const versionFilter = document.getElementById("kobo-geometry-version-filter");
    const versions = [...new Set(records.map((record) => record.form_version).filter(Boolean))].sort();
    versions.forEach((version) => versionFilter.add(new Option(version, version)));
  }

  function initializeTable() {
    table = new Tabulator("#kobo-geometry-review-table", {
      data: records,
      layout: "fitDataStretch",
      height: "100%",
      selectableRows: 1,
      index: "index",
      columns: [
        { title: "Nom officiel", field: "official_name", width: 190 },
        { title: "Localite", field: "locality", width: 130 },
        { title: "Kobo", field: "kobo_id", width: 92 },
        { title: "Statut", field: "status", width: 82, formatter: statusFormatter },
        { title: "Bat.", field: "building_count", width: 62, hozAlign: "right" },
        { title: "Warn.", field: "warning_count", width: 72, hozAlign: "right" },
        { title: "Revue", field: "requires_review", width: 74, formatter: booleanFormatter },
        { title: "Version", field: "form_version", minWidth: 160 }
      ],
      rowFormatter(row) {
        const data = row.getData();
        row.getElement().classList.toggle("requires-review", Boolean(data.requires_review));
      }
    });

    table.on("rowClick", function (event, row) {
      selectSubmission(row.getData().index);
    });
  }

  function bindEvents() {
    const batchSelect = document.getElementById("kobo-geometry-batch-select");
    const outputSelect = document.getElementById("kobo-geometry-output-select");
    const sourceForm = document.getElementById("kobo-geometry-source-form");
    if (batchSelect && outputSelect) {
      batchSelect.addEventListener("change", function () {
        renderOutputOptions(batchSelect.value, outputSelect);
      });
    }
    if (sourceForm) {
      sourceForm.addEventListener("submit", function () {
        if (!batchSelect.value) {
          batchSelect.disabled = true;
          outputSelect.disabled = true;
        } else if (!outputSelect.value) {
          outputSelect.disabled = true;
        }
      });
    }
    document.querySelectorAll("[data-kobo-geometry-tab]").forEach((tab) => {
      tab.addEventListener("click", function () {
        setActiveTab(tab.dataset.koboGeometryTab);
      });
    });
    document.getElementById("kobo-geometry-status-filter").addEventListener("change", applyFilters);
    document.getElementById("kobo-geometry-version-filter").addEventListener("change", applyFilters);
    document.getElementById("kobo-geometry-review-required-filter").addEventListener("change", applyFilters);
    document.getElementById("kobo-geometry-reset-filters").addEventListener("click", function () {
      document.getElementById("kobo-geometry-review-filters").reset();
      applyFilters();
    });
    document.getElementById("kobo-geometry-fit").addEventListener("click", fitActiveLayers);
    document.getElementById("kobo-geometry-copy-json").addEventListener("click", copyCurrentJson);
    document.getElementById("kobo-submission-tree-search")?.addEventListener("input", function (event) {
      explorerSearchQuery = event.target.value;
      rerenderCurrentSubmissionExplorer();
    });
    document.getElementById("kobo-reference-matching-form")?.addEventListener("submit", loadReferenceMatching);
    document.getElementById("kobo-reference-matching-clear")?.addEventListener("click", clearReferenceMatching);
    document.getElementById("kobo-normalized-buildings-form")?.addEventListener("submit", loadNormalizedBuildings);
    document.getElementById("kobo-normalized-buildings-clear")?.addEventListener("click", clearNormalizedBuildings);
    if (resizer) {
      resizer.addEventListener("pointerdown", startResize);
      resizer.addEventListener("pointermove", resizeLeftPane);
      resizer.addEventListener("pointerup", stopResize);
      resizer.addEventListener("pointercancel", stopResize);
      resizer.addEventListener("keydown", resizeLeftPaneWithKeyboard);
    }
    window.addEventListener("resize", function () {
      map.invalidateSize();
      if (table) {
        table.redraw(true);
      }
    });
  }

  function renderOutputOptions(batchName, outputSelect) {
    outputSelect.replaceChildren();
    if (!batchName) {
      outputSelect.add(new Option("Selection automatique", ""));
      outputSelect.disabled = true;
      return;
    }

    const batch = (catalog.batches || []).find((candidate) => candidate.name === batchName);
    const outputs = batch?.outputs || [];
    if (outputs.length === 0) {
      outputSelect.add(new Option("Aucun fichier dans 02_output", ""));
      outputSelect.disabled = true;
      return;
    }

    outputs.forEach((output) => outputSelect.add(new Option(output, output)));
    outputSelect.disabled = false;
  }

  function setActiveTab(tabId) {
    document.querySelectorAll("[data-kobo-geometry-tab]").forEach((tab) => {
      const active = tab.dataset.koboGeometryTab === tabId;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-kobo-geometry-panel]").forEach((panel) => {
      const active = panel.dataset.koboGeometryPanel === tabId;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    window.setTimeout(function () {
      map.invalidateSize();
      if (table) {
        table.redraw(true);
      }
    }, 0);
  }

  function startResize(event) {
    if (window.matchMedia("(max-width: 800px)").matches) {
      return;
    }
    resizing = true;
    workspace.classList.add("is-resizing");
    resizer.setPointerCapture(event.pointerId);
    setLeftPaneWidthFromPointer(event.clientX);
    event.preventDefault();
  }

  function resizeLeftPane(event) {
    if (!resizing) {
      return;
    }
    setLeftPaneWidthFromPointer(event.clientX);
  }

  function stopResize(event) {
    if (!resizing) {
      return;
    }
    resizing = false;
    workspace.classList.remove("is-resizing");
    if (event?.pointerId !== undefined && resizer.hasPointerCapture(event.pointerId)) {
      resizer.releasePointerCapture(event.pointerId);
    }
    persistLeftPaneWidth();
    refreshLayout();
  }

  function resizeLeftPaneWithKeyboard(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const currentWidth = leftPane.getBoundingClientRect().width;
    const totalWidth = workspace.getBoundingClientRect().width;
    const delta = event.key === "ArrowRight" ? 24 : -24;
    setLeftPaneWidthPercent(((currentWidth + delta) / totalWidth) * 100);
    persistLeftPaneWidth();
    refreshLayout();
    event.preventDefault();
  }

  function setLeftPaneWidthFromPointer(pointerX) {
    const rect = workspace.getBoundingClientRect();
    setLeftPaneWidthPercent(((pointerX - rect.left) / rect.width) * 100);
    refreshLayout();
  }

  function setLeftPaneWidthPercent(percent) {
    const clamped = Math.max(20, Math.min(60, Number(percent) || 38));
    workspace.style.setProperty("--kobo-geometry-left-width", `${clamped}%`);
  }

  function persistLeftPaneWidth() {
    try {
      const width = leftPane.getBoundingClientRect().width;
      const total = workspace.getBoundingClientRect().width;
      sessionStorage.setItem(layoutStorageKey, JSON.stringify({
        leftWidthPercent: (width / total) * 100
      }));
    } catch (error) {
      // Layout persistence is optional.
    }
  }

  function restoreLeftPaneWidth() {
    try {
      const state = JSON.parse(sessionStorage.getItem(layoutStorageKey) || "{}");
      if (Number.isFinite(state.leftWidthPercent)) {
        setLeftPaneWidthPercent(state.leftWidthPercent);
      }
    } catch (error) {
      // Keep default width.
    }
  }

  function refreshLayout() {
    window.requestAnimationFrame(function () {
      map.invalidateSize();
      if (table) {
        table.redraw(true);
      }
    });
  }

  function applyFilters() {
    const status = document.getElementById("kobo-geometry-status-filter").value;
    const version = document.getElementById("kobo-geometry-version-filter").value;
    const reviewOnly = document.getElementById("kobo-geometry-review-required-filter").checked;
    table.setFilter(function (record) {
      return (!status || record.status === status)
        && (!version || record.form_version === version)
        && (!reviewOnly || record.requires_review);
    });
  }

  function selectSubmission(index) {
    const result = results[index];
    const record = records.find((candidate) => candidate.index === index);
    if (!result || !record) {
      return;
    }

    selectedIndex = index;
    if (table) {
      table.deselectRow();
      table.selectRow(index);
    }

    document.getElementById("kobo-geometry-current-title").textContent = [
      record.kobo_id ? `Kobo ${record.kobo_id}` : "Soumission Kobo",
      record.source_submission_id
    ].filter(Boolean).join(" - ");
    document.getElementById("kobo-geometry-current-subtitle").textContent = [
      record.form_version ? `Version ${record.form_version}` : "",
      `${record.building_count} batiment(s)`,
      `${record.warning_count} warning(s)`
    ].filter(Boolean).join(" | ");
    document.getElementById("kobo-geometry-json-viewer").textContent = JSON.stringify(result, null, 2);

    renderSubmissionExplorer(result, record);
    renderQuality(result);
    renderGeometries(result);
    fitActiveLayers();
  }

  function renderSubmissionExplorer(result, record) {
    const treeHost = document.getElementById("kobo-submission-tree");
    const detailHost = document.getElementById("kobo-submission-detail");
    const countNode = document.getElementById("kobo-submission-tree-count");
    if (!treeHost || !detailHost) {
      return;
    }

    const nodes = buildSubmissionTree(result, record);
    const searchQuery = normalizeSearchText(explorerSearchQuery);
    const visibleNodes = searchQuery ? filterTreeNodes(nodes, searchQuery) : nodes;
    const flatNodes = flattenTree(visibleNodes);
    if (flatNodes.length && !flatNodes.some((node) => node.id === selectedExplorerNodeId)) {
      selectedExplorerNodeId = flatNodes[0].id;
    }
    countNode.textContent = String(flatNodes.length);
    treeHost.innerHTML = flatNodes.length
      ? renderTreeNodes(visibleNodes)
      : `<p class="empty kobo-submission-tree-empty">Aucune rubrique ne correspond a la recherche.</p>`;
    treeHost.querySelectorAll("[data-kobo-tree-node]").forEach((button) => {
      button.addEventListener("click", function () {
        selectedExplorerNodeId = button.dataset.koboTreeNode;
        renderSubmissionExplorer(result, record);
        focusExplorerGeometry(selectedExplorerNodeId);
      });
    });
    const activeNode = flatNodes.find((node) => node.id === selectedExplorerNodeId) || flatNodes[0];
    detailHost.innerHTML = activeNode
      ? renderExplorerDetail(activeNode, result, record)
      : `<article class="kobo-submission-detail-card"><h3>Recherche</h3><p class="empty">Aucune rubrique ne correspond a la recherche.</p></article>`;
  }

  function rerenderCurrentSubmissionExplorer() {
    if (selectedIndex === null) {
      return;
    }
    const result = results[selectedIndex];
    const record = records.find((candidate) => candidate.index === selectedIndex);
    if (result && record) {
      renderSubmissionExplorer(result, record);
    }
  }

  function buildSubmissionTree(result, record) {
    const buildings = Array.isArray(result.building_geometries) ? result.building_geometries : [];
    const pylones = Array.isArray(result.pylone_geometries) ? result.pylone_geometries : [];
    const photoCount = countKnownPhotos(result);
    return [
      {
        id: "site",
        type: "site",
        icon: "fa-map-location-dot",
        label: "Site",
        badge: record.official_name ? "" : "à compléter",
        children: [
          { id: "site.identification", type: "site-section", icon: "fa-id-card", label: "Identification" },
          { id: "site.localisation", type: "site-section", icon: "fa-location-dot", label: "Localisation" },
          { id: "site.indicators", type: "site-section", icon: "fa-chart-simple", label: "Indicateurs" }
        ]
      },
      {
        id: "pylones",
        type: "collection",
        icon: "fa-tower-broadcast",
        label: "Pylônes",
        badge: pylones.length,
        children: pylones.map((entry, index) => ({
          id: `pylone.${index}`,
          type: "pylone",
          icon: "fa-tower-broadcast",
          label: `Pylône ${index + 1}`,
          badge: entry.requires_review ? "revue" : ""
        }))
      },
      {
        id: "buildings",
        type: "collection",
        icon: "fa-building",
        label: "Bâtiments",
        badge: buildings.length,
        children: buildings.map((entry, index) => ({
          id: `building.${index}`,
          type: "building",
          icon: "fa-building",
          label: buildingTreeLabel(entry, index),
          badge: entry.requires_review ? "revue" : ""
        }))
      },
      { id: "raccordement", type: "raccordement", icon: "fa-network-wired", label: "Raccordement", badge: result.raccordement_geometry?.geometry ? "" : "absent" },
      { id: "photos", type: "photos", icon: "fa-images", label: "Photos", badge: photoCount },
      { id: "json", type: "json", icon: "fa-code", label: "JSON normalisé" }
    ];
  }

  function renderTreeNodes(nodes, depth = 0) {
    return `<ul class="kobo-submission-tree-list depth-${depth}">${nodes.map((node) => (
      `<li>
        <button class="kobo-submission-tree-node ${node.id === selectedExplorerNodeId ? "is-active" : ""}" type="button" data-kobo-tree-node="${escapeHtml(node.id)}" style="--depth:${depth}">
          <i class="fa-solid ${escapeHtml(node.icon || "fa-circle-dot")}" aria-hidden="true"></i>
          <span>${escapeHtml(node.label)}</span>
          ${node.badge !== undefined && node.badge !== "" ? `<em>${escapeHtml(node.badge)}</em>` : ""}
        </button>
        ${Array.isArray(node.children) && node.children.length ? renderTreeNodes(node.children, depth + 1) : ""}
      </li>`
    )).join("")}</ul>`;
  }

  function renderExplorerDetail(node, result, record) {
    if (!node) {
      return `<p class="empty">Selectionnez une rubrique dans l'arbre.</p>`;
    }

    if (node.type === "building") {
      const index = Number(node.id.split(".")[1]);
      return renderBuildingDetail(result.building_geometries?.[index], index);
    }

    if (node.type === "pylone") {
      const index = Number(node.id.split(".")[1]);
      return renderPyloneDetail(result.pylone_geometries?.[index], index);
    }

    if (node.id === "site.identification") {
      return renderSectionDetail("Identification du site", [
        fieldLine("Nom officiel", record.official_name || result.site_description?.official_name),
        fieldLine("Localité", record.locality || result.site_description?.locality),
        fieldLine("Région", displayValue(result.site_description?.region, "modB.region")),
        fieldLine("Version formulaire", result.form_version),
        fieldLine("Identifiant Kobo", result.kobo_id),
        fieldLine("Identifiant source", result.source_submission_id),
        fieldLine("Soumis le", formatDateTime(result.site_description?.submitted_at))
      ]);
    }

    if (node.id === "site.localisation" || node.id === "site") {
      return renderSectionDetail(node.id === "site" ? "Synthèse du site" : "Localisation du site", [
        fieldLine("Nom officiel", record.official_name || result.site_description?.official_name),
        fieldLine("Localité", record.locality || result.site_description?.locality),
        fieldLine("Géométrie site", result.site_geometry?.geometry?.type),
        fieldLine("Champ source", result.site_geometry?.source_field),
        fieldLine("Parseur", result.site_geometry?.parser),
        fieldLine("Revue requise", result.site_geometry?.requires_review ? "Oui" : "Non"),
        rawBlock("Valeur brute", result.site_geometry?.raw_value)
      ]);
    }

    if (node.id === "site.indicators") {
      return renderSectionDetail("Indicateurs disponibles", [
        fieldLine("Bâtiments extraits", result.building_geometries?.length || 0),
        fieldLine("Pylônes extraits", result.pylone_geometries?.length || 0),
        fieldLine("Raccordement", result.raccordement_geometry?.geometry ? "Présent" : "Absent"),
        fieldLine("Statut qualité", result.geometry_quality_report?.status || "unknown"),
        fieldLine("Alertes", result.geometry_quality_report?.warnings?.length || 0)
      ]);
    }

    if (node.id === "buildings") {
      return renderCollectionDetail("Bâtiments", result.building_geometries || [], "building");
    }

    if (node.id === "pylones") {
      return renderCollectionDetail("Pylônes", result.pylone_geometries || [], "pylone");
    }

    if (node.id === "raccordement") {
      return renderRaccordementDetail(result.raccordement_geometry);
    }

    if (node.id === "photos") {
      return renderPhotoDetail(result);
    }

    if (node.id === "json") {
      return renderSectionDetail("Diagnostic JSON", [
        fieldLine("Schéma", payload.schema_name || "g2m_kobo_geometry_extraction_output"),
        fieldLine("Soumission", result.source_submission_id || result.kobo_id),
        fieldLine("Objets bâtiment", result.building_geometries?.length || 0),
        fieldLine("Objets pylône", result.pylone_geometries?.length || 0),
        `<button class="button secondary" type="button" data-kobo-tree-copy-json>Copier le JSON normalisé</button>`
      ]);
    }

    return renderSectionDetail(node.label, [fieldLine("Type", node.type)]);
  }

  function renderBuildingDetail(entry, index) {
    if (!entry) {
      return `<p class="empty">Bâtiment introuvable.</p>`;
    }
    const props = entry.properties || {};
    return renderSectionDetail(`Bâtiment ${index + 1}`, [
      fieldLine("Numéro", props.building_number),
      fieldLine("Nom", props.building_name),
      fieldLine("Statut", displayValue(props.building_status, "batiment.bat_statut")),
      fieldLine("Vocation", displayValue(props.building_vocation, "batiment.bat_vocation")),
      fieldLine("Services installés", props.building_services),
      fieldLine("LAN", displayValue(props.building_lan, "batiment.lan")),
      fieldLine("Faisabilité câblage", displayValue(props.building_cabling_feasibility, "batiment.faisab_cablage")),
      fieldLine("Goulottes", displayValue(props.building_cable_trunking, "batiment.goulottes")),
      fieldLine("Wi-Fi prévu", props.building_planned_wifi_count),
      fieldLine("Baie", displayValue(props.building_rack, "batiment.baie")),
      fieldLine("Équipements actifs", displayValue(props.building_active_equipment, "batiment.equip_actifs")),
      fieldLine("Détail équipements", props.building_equipment_detail),
      fieldLine("Géométrie", entry.geometry?.type),
      fieldLine("Champ source", entry.source_field),
      fieldLine("Parseur", entry.parser),
      fieldLine("Revue requise", entry.requires_review ? "Oui" : "Non"),
      `<button class="button secondary" type="button" data-kobo-tree-zoom="building.${index}">Zoom bâtiment</button>`,
      rawBlock("Valeur brute géométrique", entry.raw_value)
    ]);
  }

  function renderPyloneDetail(entry, index) {
    if (!entry) {
      return `<p class="empty">Pylône introuvable.</p>`;
    }
    const props = entry.properties || {};
    return renderSectionDetail(`Pylône ${index + 1}`, [
      fieldLine("Opérateur", displayValue(props.operator_name || props.pylone_operator, "modE.pylone_rep.pylone_op")),
      fieldLine("Altitude", props.altitude),
      fieldLine("Précision", props.precision_m ? `${props.precision_m} m` : ""),
      fieldLine("Géométrie", entry.geometry?.type),
      fieldLine("Champ source", entry.source_field),
      fieldLine("Parseur", entry.parser),
      fieldLine("Revue requise", entry.requires_review ? "Oui" : "Non"),
      `<button class="button secondary" type="button" data-kobo-tree-zoom="pylone.${index}">Zoom pylône</button>`,
      rawBlock("Valeur brute", entry.raw_value)
    ]);
  }

  function renderRaccordementDetail(entry) {
    if (!entry?.geometry) {
      return renderSectionDetail("Raccordement", [
        fieldLine("Statut", "Aucun point de raccordement extrait")
      ]);
    }
    const props = entry.properties || {};
    return renderSectionDetail("Raccordement", [
      fieldLine("Opérateur", displayValue(props.operator_name || props.fiber_owner, "modH.prop_fibre")),
      fieldLine("Altitude", props.altitude),
      fieldLine("Précision", props.precision_m ? `${props.precision_m} m` : ""),
      fieldLine("Géométrie", entry.geometry?.type),
      fieldLine("Champ source", entry.source_field),
      fieldLine("Parseur", entry.parser),
      fieldLine("Revue requise", entry.requires_review ? "Oui" : "Non"),
      `<button class="button secondary" type="button" data-kobo-tree-zoom="raccordement">Zoom raccordement</button>`,
      rawBlock("Valeur brute", entry.raw_value)
    ]);
  }

  function renderCollectionDetail(title, items, type) {
    if (!items.length) {
      return renderSectionDetail(title, [fieldLine("Statut", "Aucun objet extrait")]);
    }
    return renderSectionDetail(title, items.map((item, index) => {
      const label = type === "building" ? buildingTreeLabel(item, index) : `Pylône ${index + 1}`;
      return `<button class="kobo-submission-related-link" type="button" data-kobo-tree-jump="${type === "building" ? "building" : "pylone"}.${index}">
        <span>${escapeHtml(label)}</span>
        <em>${item.requires_review ? "Revue" : "OK"}</em>
      </button>`;
    }));
  }

  function renderSectionDetail(title, rows) {
    window.setTimeout(bindExplorerDetailActions, 0);
    return `<article class="kobo-submission-detail-card">
      <h3>${escapeHtml(title)}</h3>
      <dl>${rows.filter(Boolean).join("")}</dl>
    </article>`;
  }

  function bindExplorerDetailActions() {
    document.querySelectorAll("[data-kobo-tree-jump]").forEach((button) => {
      button.addEventListener("click", function () {
        selectedExplorerNodeId = button.dataset.koboTreeJump;
        const result = results[selectedIndex];
        const record = records.find((candidate) => candidate.index === selectedIndex);
        renderSubmissionExplorer(result, record);
        focusExplorerGeometry(selectedExplorerNodeId);
      }, { once: true });
    });
    document.querySelectorAll("[data-kobo-tree-zoom]").forEach((button) => {
      button.addEventListener("click", function () {
        focusExplorerGeometry(button.dataset.koboTreeZoom);
      }, { once: true });
    });
    document.querySelector("[data-kobo-tree-copy-json]")?.addEventListener("click", copyCurrentJson, { once: true });
  }

  function fieldLine(label, value) {
    if (value === undefined || value === null || value === "") {
      return "";
    }
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatPopupValue(value))}</dd>`;
  }

  function rawBlock(label, value) {
    if (!value) {
      return "";
    }
    return `<dt>${escapeHtml(label)}</dt><dd><code>${escapeHtml(value)}</code></dd>`;
  }

  function displayValue(value, fieldPath) {
    if (value === undefined || value === null || value === "") {
      return "";
    }
    const entry = choiceIndex[String(fieldPath || "").replaceAll("/", ".")];
    if (!entry) {
      return humanizeValue(value);
    }
    const values = Array.isArray(value) ? value : String(value).split(/[\s,]+/).filter(Boolean);
    if (entry.multiple || values.length > 1) {
      return values.map((item) => resolveChoiceLabel(item, entry)).join(", ");
    }
    return resolveChoiceLabel(value, entry);
  }

  function resolveChoiceLabel(value, entry) {
    const raw = String(value || "");
    return entry.choices?.[raw] || entry.choices?.[raw.trim().toLowerCase()] || humanizeValue(raw);
  }

  function humanizeValue(value) {
    if (Array.isArray(value)) {
      return value.map(humanizeValue).join(", ");
    }
    return String(value)
      .replaceAll("_", " ")
      .replaceAll("-", " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  function buildingTreeLabel(entry, index) {
    const props = entry?.properties || {};
    const number = props.building_number || index + 1;
    const name = props.building_name || props.building_vocation || "";
    return [`Bâtiment ${number}`, name].filter(Boolean).join(" - ");
  }

  function flattenTree(nodes) {
    return nodes.flatMap((node) => [node, ...flattenTree(node.children || [])]);
  }

  function filterTreeNodes(nodes, query) {
    return nodes.reduce((matches, node) => {
      const children = filterTreeNodes(node.children || [], query);
      if (nodeMatchesSearch(node, query) || children.length) {
        matches.push({ ...node, children });
      }
      return matches;
    }, []);
  }

  function nodeMatchesSearch(node, query) {
    return normalizeSearchText([
      node.id,
      node.type,
      node.label,
      node.badge
    ].filter(Boolean).join(" ")).includes(query);
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function renderPhotoDetail(result) {
    const photos = localPhotosForSubmission(result);
    if (!photos.length) {
      return renderSectionDetail("Photos", [
        fieldLine("Photos rattachees", 0),
        `<p class="form-hint">Aucune photo rattachee a cette soumission.</p>`
      ]);
    }

    return `<article class="kobo-submission-detail-card">
      <h3>Photos</h3>
      <p class="kobo-submission-photo-summary">${photos.length} photo(s) rattachee(s) a cette soumission.</p>
      <div class="kobo-submission-photo-grid">
        ${photos.map(renderPhotoTile).join("")}
      </div>
    </article>`;
  }

  function renderPhotoTile(photo) {
    const imageUrl = photo.thumbnail_url || photo.url;
    return `<a class="kobo-submission-photo-tile" href="${escapeHtml(photo.url)}" target="_blank" rel="noopener">
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(photo.filename || "Photo Kobo")}" loading="lazy">
      <span>${escapeHtml(photo.filename || "Photo Kobo")}</span>
      ${photo.source ? `<small>${escapeHtml(photo.source)}</small>` : ""}
      ${photo.size_bytes ? `<em>${escapeHtml(formatBytes(photo.size_bytes))}</em>` : ""}
    </a>`;
  }

  function countKnownPhotos(result) {
    return localPhotosForSubmission(result).length;
  }

  function localPhotosForSubmission(result) {
    const bySubmissionId = localAssets?.bySubmissionId || {};
    const ids = [
      result?.source_submission_id,
      result?.submission_id,
      result?.uuid,
      result?.kobo_uuid,
      result?.kobo_id
    ].map((value) => String(value || "").trim()).filter(Boolean);
    const photos = [];
    const seen = new Set();
    ids.forEach((id) => {
      (bySubmissionId[id] || []).forEach((photo) => {
        const key = photo.media_file_id || `${photo.asset_uid}/${photo.submission_id}/${photo.filename}`;
        if (!seen.has(key)) {
          seen.add(key);
          photos.push(photo);
        }
      });
    });
    return photos;
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "";
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
    }
    if (bytes >= 1024) {
      return `${Math.round(bytes / 1024)} Ko`;
    }
    return `${bytes} o`;
  }

  function formatDateTime(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString("fr-FR");
  }

  function focusExplorerGeometry(nodeId) {
    resetGeometryHighlights();
    if (nodeId === "site" || nodeId === "site.localisation") {
      highlightLayerByIndex(siteLayer, 0, "#1d4ed8");
      fitGroupLayer(siteLayer);
      return;
    }
    if (nodeId.startsWith("building.")) {
      const index = Number(nodeId.split(".")[1]);
      highlightLayerByIndex(buildingLayer, index, "#b91c1c");
      fitLayerByIndex(buildingLayer, index);
      return;
    }
    if (nodeId.startsWith("pylone.")) {
      const index = Number(nodeId.split(".")[1]);
      highlightLayerByIndex(pyloneLayer, index, "#5b21b6");
      fitLayerByIndex(pyloneLayer, index);
      return;
    }
    if (nodeId === "raccordement") {
      highlightLayerByIndex(raccordementLayer, 0, "#15803d");
      fitGroupLayer(raccordementLayer);
    }
  }

  function resetGeometryHighlights() {
    siteLayer.resetStyle();
    buildingLayer.resetStyle();
    raccordementLayer.eachLayer((layer) => layer.setStyle?.(pointStyle("#16a34a")));
    pyloneLayer.eachLayer((layer) => layer.setStyle?.(pointStyle("#7c3aed")));
  }

  function highlightLayerByIndex(group, index, color) {
    const layer = layerAt(group, index);
    if (!layer) {
      return;
    }
    if (typeof layer.setStyle === "function") {
      layer.setStyle({
        color,
        fillColor: color,
        fillOpacity: 0.36,
        opacity: 1,
        radius: 10,
        weight: 5
      });
    }
    layer.bringToFront?.();
    layer.openPopup?.();
  }

  function fitLayerByIndex(group, index) {
    const layer = layerAt(group, index);
    if (!layer) {
      return;
    }
    if (typeof layer.getBounds === "function" && layer.getBounds().isValid()) {
      map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 19 });
    } else if (typeof layer.getLatLng === "function") {
      map.setView(layer.getLatLng(), Math.max(map.getZoom(), 18));
    }
  }

  function fitGroupLayer(group) {
    const bounds = L.latLngBounds([]);
    group.eachLayer((layer) => {
      if (typeof layer.getBounds === "function" && layer.getBounds().isValid()) {
        bounds.extend(layer.getBounds());
      } else if (typeof layer.getLatLng === "function") {
        bounds.extend(layer.getLatLng());
      }
    });
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 });
    }
  }

  function layerAt(group, index) {
    let found = null;
    let cursor = 0;
    group.eachLayer((layer) => {
      if (cursor === index) {
        found = layer;
      }
      cursor += 1;
    });
    return found;
  }

  function renderQuality(result) {
    const report = result.geometry_quality_report || {};
    const statusNode = document.getElementById("kobo-geometry-quality-status");
    const body = document.getElementById("kobo-geometry-quality-body");
    const warnings = Array.isArray(report.warnings) ? report.warnings : [];
    const selectedSources = Array.isArray(report.selected_sources) ? report.selected_sources : [];

    statusNode.textContent = report.status || "-";
    statusNode.className = `badge status-${report.status || "unknown"}`;
    body.innerHTML = [
      `<div class="kobo-geometry-quality-grid">
        <span>Sources retenues</span><strong>${selectedSources.length}</strong>
        <span>Warnings</span><strong>${warnings.length}</strong>
        <span>Errors</span><strong>${Array.isArray(report.errors) ? report.errors.length : 0}</strong>
      </div>`,
      `<h3>Sources</h3>${renderAttemptList(selectedSources.slice(0, 8), "Aucune source retenue")}`,
      `<h3>Warnings</h3>${renderAttemptList(warnings.slice(0, 12), "Aucun warning")}`
    ].join("");
  }

  function renderAttemptList(items, emptyLabel) {
    if (!items.length) {
      return `<p class="empty">${escapeHtml(emptyLabel)}</p>`;
    }

    return `<ul class="kobo-geometry-attempt-list">${items.map((item) => (
      `<li>
        <strong>${escapeHtml(item.output_property || "-")}</strong>
        <span>${escapeHtml(item.source_field || "-")}</span>
        ${item.reason ? `<em>${escapeHtml(item.reason)}</em>` : ""}
      </li>`
    )).join("")}</ul>`;
  }

  function renderGeometries(result) {
    siteLayer.clearLayers();
    buildingLayer.clearLayers();
    buildingCentroidLayer.clearLayers();
    raccordementLayer.clearLayers();
    pyloneLayer.clearLayers();

    addGeometry(siteLayer, result.site_geometry, "Site");
    (result.building_geometries || []).forEach((entry, index) => {
      addGeometry(buildingLayer, entry, `Batiment ${index + 1}`);
      addBuildingCentroid(entry, index);
    });
    addGeometry(raccordementLayer, result.raccordement_geometry, "Raccordement");
    (result.pylone_geometries || []).forEach((entry, index) => {
      addGeometry(pyloneLayer, entry, `Pylone ${index + 1}`);
    });
  }

  function addBuildingCentroid(entry, index) {
    const centroid = entry?.properties?.centroid_point;
    if (!centroid || centroid.type !== "Point" || !Array.isArray(centroid.coordinates)) {
      return;
    }

    buildingCentroidLayer.addData({
      type: "Feature",
      properties: {
        label: `Centroide batiment ${index + 1}`,
        ...buildingPopupProperties(entry),
        source_field: entry.source_field,
        parser: entry.parser,
        role: "building_centroid",
        requires_review: Boolean(entry.requires_review)
      },
      geometry: centroid
    });
  }

  function addGeometry(layer, entry, label) {
    if (!entry?.geometry) {
      return;
    }

    layer.addData({
      type: "Feature",
      properties: {
        label,
        ...buildingPopupProperties(entry),
        source_field: entry.source_field,
        parser: entry.parser,
        role: entry.role,
        requires_review: Boolean(entry.requires_review)
      },
      geometry: entry.geometry
    });
  }

  function buildingPopupProperties(entry) {
    const properties = entry?.properties || {};
    return {
      building_number: properties.building_number,
      building_name: properties.building_name,
      building_status: properties.building_status,
      building_vocation: properties.building_vocation,
      building_services: properties.building_services,
      building_lan: properties.building_lan,
      building_cabling_feasibility: properties.building_cabling_feasibility,
      building_cable_trunking: properties.building_cable_trunking,
      building_planned_wifi_count: properties.building_planned_wifi_count,
      building_rack: properties.building_rack,
      building_active_equipment: properties.building_active_equipment,
      building_equipment_detail: properties.building_equipment_detail
    };
  }

  function fitActiveLayers() {
    const bounds = L.latLngBounds([]);
    [siteLayer, buildingLayer, buildingCentroidLayer, raccordementLayer, pyloneLayer, referenceMatchingLayer, normalizedBuildingsLayer].forEach((group) => {
      group.eachLayer((layer) => {
        if (typeof layer.getBounds === "function") {
          const layerBounds = layer.getBounds();
          if (layerBounds.isValid()) {
            bounds.extend(layerBounds);
          }
        } else if (typeof layer.getLatLng === "function") {
          bounds.extend(layer.getLatLng());
        }
      });
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 });
    }
  }

  async function copyCurrentJson() {
    if (selectedIndex === null || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(results[selectedIndex], null, 2));
  }

  async function loadReferenceMatching(event) {
    event.preventDefault();
    const batchSelect = document.getElementById("kobo-reference-matching-batch-select");
    const status = document.getElementById("kobo-reference-matching-status");
    const count = document.getElementById("kobo-reference-matching-count");
    const params = new URLSearchParams();
    if (batchSelect?.value) {
      params.set("batch", batchSelect.value);
    }

    status.textContent = "Chargement de matching_review.geojson...";
    try {
      const response = await fetch(`/cartographie/extractions-kobo/reference-matching?${params.toString()}`, {
        headers: { Accept: "application/json" }
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || "Chargement impossible.");
      }

      referenceMatchingLayer.clearLayers();
      referenceMatchingLayer.addData(body.payload);
      if (!map.hasLayer(referenceMatchingLayer)) {
        referenceMatchingLayer.addTo(map);
      }

      const featureCount = Array.isArray(body.payload?.features) ? body.payload.features.length : 0;
      count.textContent = String(featureCount);
      status.textContent = `${featureCount} objet(s) charges depuis ${body.batch}/06_matching/${body.output}.`;
      fitActiveLayers();
    } catch (error) {
      status.textContent = error.message;
      count.textContent = "0";
    }
  }

  function clearReferenceMatching() {
    referenceMatchingLayer.clearLayers();
    if (map.hasLayer(referenceMatchingLayer)) {
      map.removeLayer(referenceMatchingLayer);
    }
    document.getElementById("kobo-reference-matching-count").textContent = "0";
    document.getElementById("kobo-reference-matching-status").textContent = "Appariement masque.";
  }

  async function loadNormalizedBuildings(event) {
    event.preventDefault();
    const batchSelect = document.getElementById("kobo-normalized-buildings-batch-select");
    const status = document.getElementById("kobo-normalized-buildings-status");
    const count = document.getElementById("kobo-normalized-buildings-count");
    const params = new URLSearchParams();
    if (batchSelect?.value) {
      params.set("batch", batchSelect.value);
    }

    status.textContent = "Chargement de emprises_batiment_normalized.geojson...";
    try {
      const response = await fetch(`/cartographie/extractions-kobo/reference-normalized-buildings?${params.toString()}`, {
        headers: { Accept: "application/json" }
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || "Chargement impossible.");
      }

      normalizedBuildingsLayer.clearLayers();
      normalizedBuildingsLayer.addData(body.payload);
      if (!map.hasLayer(normalizedBuildingsLayer)) {
        normalizedBuildingsLayer.addTo(map);
      }

      const featureCount = Array.isArray(body.payload?.features) ? body.payload.features.length : 0;
      count.textContent = String(featureCount);
      status.textContent = `${featureCount} emprise(s) chargee(s) depuis ${body.batch}/06_matching/${body.output}.`;
      fitActiveLayers();
    } catch (error) {
      status.textContent = error.message;
      count.textContent = "0";
    }
  }

  function clearNormalizedBuildings() {
    normalizedBuildingsLayer.clearLayers();
    if (map.hasLayer(normalizedBuildingsLayer)) {
      map.removeLayer(normalizedBuildingsLayer);
    }
    document.getElementById("kobo-normalized-buildings-count").textContent = "0";
    document.getElementById("kobo-normalized-buildings-status").textContent = "Emprises normalisees masquees.";
  }

  function pointStyle(color) {
    return {
      radius: 7,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      opacity: 1,
      weight: 2
    };
  }

  function bindFeaturePopup(feature, layer) {
    const props = feature.properties || {};
    layer.bindPopup([
      `<strong>${escapeHtml(props.label || "Geometrie")}</strong>`,
      popupLine("Numero", props.building_number),
      popupLine("Nom", props.building_name),
      popupLine("Statut", props.building_status),
      popupLine("Vocation", props.building_vocation),
      popupLine("Services installes", props.building_services),
      popupLine("LAN", props.building_lan),
      popupLine("Faisabilite cablage", props.building_cabling_feasibility),
      popupLine("Goulottes", props.building_cable_trunking),
      popupLine("Wi-Fi prevu", props.building_planned_wifi_count),
      popupLine("Baie", props.building_rack),
      popupLine("Equipements actifs", props.building_active_equipment),
      popupLine("Detail equipements", props.building_equipment_detail),
      props.source_field ? `Champ : ${escapeHtml(props.source_field)}` : "",
      props.parser ? `Parseur : ${escapeHtml(props.parser)}` : "",
      props.requires_review ? "<em>Revue requise</em>" : ""
    ].filter(Boolean).join("<br>"));
  }

  function bindReferenceMatchingPopup(feature, layer) {
    const props = feature.properties || {};
    layer.bindPopup([
      `<strong>${escapeHtml(referenceMatchingTitle(props))}</strong>`,
      popupLine("Classe", props.class),
      popupLine("Couche", props.layer),
      popupLine("Site", props.official_name || props.site_code || props.site_id),
      popupLine("Soumission", props.source_submission_id),
      popupLine("Batiment Kobo", props.kobo_building_index),
      popupLine("Reference", props.reference_id || props.reference_building_id || props.reference_site_id),
      popupLine("Score", formatScore(props.score)),
      props.reason ? escapeHtml(props.reason) : ""
    ].filter(Boolean).join("<br>"));
  }

  function bindNormalizedBuildingPopup(feature, layer) {
    const props = feature.properties || {};
    const kobo = props.kobo_attributes || {};
    layer.bindPopup([
      `<strong>${escapeHtml(normalizedBuildingTitle(props))}</strong>`,
      popupLine("Statut lien", props.link_status),
      popupLine("Score", props.score_fiabilite),
      popupLine("Nb centroides", props.nb_centroide),
      popupLine("Distance m", props.distance_to_centroid),
      popupLine("Site", props.site_code),
      popupLine("Soumission", kobo.source_submission_id || props.source_submission_id),
      popupLine("Nom officiel", kobo["modB/nom_officiel"] || kobo.official_name),
      popupLine("Localite", kobo["modB/commune"] || kobo.locality),
      popupLine("Batiment", kobo.building_number || kobo["batiment/num_bat"]),
      popupLine("Nom batiment", kobo.building_name || kobo["batiment/bat_nom"]),
      popupLine("LAN", kobo.building_lan || kobo["batiment/lan"]),
      popupLine("Faisabilite cablage", kobo.building_cabling_feasibility || kobo["batiment/faisab_cablage"]),
      popupLine("Goulottes", kobo.building_cable_trunking || kobo["batiment/goulottes"]),
      popupLine("Wi-Fi prevu", kobo.building_planned_wifi_count || kobo["batiment/nb_wifi_prevu"]),
      popupLine("Baie", kobo.building_rack || kobo["batiment/baie"]),
      popupLine("Equipements actifs", kobo.building_active_equipment || kobo["batiment/equip_actifs"]),
      popupLine("Detail equipements", kobo.building_equipment_detail || kobo["batiment/equip_detail"])
    ].filter(Boolean).join("<br>"));
  }

  function normalizedBuildingTitle(props) {
    if (props.link_status === "direct") {
      return "Emprise normalisee - lien direct";
    }
    if (props.link_status === "conflit") {
      return "Emprise normalisee - conflit";
    }
    if (props.link_status === "proximity") {
      return "Emprise normalisee - proximite";
    }
    return "Emprise normalisee";
  }

  function normalizedBuildingStyle(feature) {
    const color = normalizedBuildingColor(feature.properties?.link_status);
    return {
      color,
      fillColor: color,
      fillOpacity: feature.properties?.link_status === "none" ? 0.08 : 0.24,
      opacity: 1,
      weight: feature.properties?.link_status === "conflit" ? 3 : 2,
      dashArray: feature.properties?.link_status === "none" ? "6 4" : null
    };
  }

  function normalizedBuildingColor(status) {
    const colors = {
      direct: "#16a34a",
      conflit: "#f97316",
      proximity: "#0ea5e9",
      none: "#6b7280"
    };
    return colors[status] || "#334155";
  }

  function referenceMatchingTitle(props) {
    if (props.layer === "building_centroid_match") {
      return "Centroide Kobo apparie";
    }
    if (props.layer === "building_reference_match") {
      return "Emprise batiment de reference";
    }
    if (props.layer === "site_reference_match") {
      return "Contour site de reference";
    }
    return "Appariement de reference";
  }

  function referenceMatchingStyle(feature) {
    const props = feature.properties || {};
    const color = referenceMatchingColor(props.class);
    const layer = props.layer || "";
    return {
      color,
      fillColor: color,
      fillOpacity: layer.includes("site") ? 0.08 : 0.22,
      opacity: 1,
      weight: layer.includes("site") ? 3 : 2,
      dashArray: props.class === "D" ? "6 4" : null
    };
  }

  function referenceMatchingColor(matchClass) {
    const colors = {
      A: "#16a34a",
      B: "#f97316",
      C: "#dc2626",
      D: "#6b7280",
      E: "#a855f7",
      F: "#991b1b",
      matched: "#16a34a",
      review: "#f97316",
      ambiguous: "#a855f7",
      unmatched: "#dc2626"
    };
    return colors[matchClass] || "#0f766e";
  }

  function referenceMatchingPointRadius(props) {
    if (props?.layer === "building_centroid_match") {
      return 6;
    }
    return 5;
  }

  function popupLine(label, value) {
    if (value === undefined || value === null || value === "") {
      return "";
    }
    return `${escapeHtml(label)} : ${escapeHtml(formatPopupValue(value))}`;
  }

  function formatPopupValue(value) {
    if (Array.isArray(value)) {
      return value.filter((item) => item !== undefined && item !== null && item !== "").join(", ");
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return value;
  }

  function formatScore(value) {
    const score = Number(value);
    return Number.isFinite(score) ? score.toFixed(3) : "";
  }


  function statusFormatter(cell) {
    const value = cell.getValue() || "unknown";
    return `<span class="badge status-${escapeHtml(value)}">${escapeHtml(value)}</span>`;
  }

  function booleanFormatter(cell) {
    return cell.getValue() ? "Oui" : "Non";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}());

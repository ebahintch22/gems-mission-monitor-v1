(function () {
  const points = JSON.parse(document.getElementById("sig-points-data").textContent);
  const regions = JSON.parse(document.getElementById("sig-regions-data").textContent);
  const workspace = document.getElementById("sig-workspace");
  const resizer = document.getElementById("sig-resizer");
  const map = L.map("sig-map").setView([7.54, -5.55], 6);
  const markersLayer = L.layerGroup().addTo(map);
  const colors = {
    validee: "#16856f",
    a_verifier: "#d38b13",
    rejetee: "#b84545"
  };

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const territoryLayer = L.geoJSON(regions, {
    style: {
      color: "#527487",
      fillColor: "#dce7eb",
      fillOpacity: 0.23,
      weight: 1
    },
    onEachFeature: function (feature, layer) {
      layer.bindTooltip(feature.properties.nom_region);
    }
  }).addTo(map);

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
    ]
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

  function renderPoints() {
    const visiblePoints = points.filter(function (point) {
      return isVisible(point, filters());
    });

    markersLayer.clearLayers();
    visiblePoints.forEach(function (point) {
      L.circleMarker([point.latitude, point.longitude], {
        color: colors[point.statut_validation],
        fillColor: colors[point.statut_validation],
        fillOpacity: 0.8,
        radius: 5,
        weight: 1
      }).bindPopup(popupContent(point)).addTo(markersLayer);
    });

    table.setData(visiblePoints);
    updateMetrics(visiblePoints);
  }

  document.getElementById("sig-filters").addEventListener("change", renderPoints);
  document.getElementById("sig-reset-filters").addEventListener("click", function () {
    document.getElementById("sig-filters").reset();
    renderPoints();
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

  if (territoryLayer.getBounds().isValid()) {
    map.fitBounds(territoryLayer.getBounds(), { padding: [12, 12] });
  }
  renderPoints();
}());

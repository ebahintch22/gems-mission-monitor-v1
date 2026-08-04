(function () {
  const host = document.getElementById("submission-detail-map");
  const data = document.getElementById("submission-detail-data");
  if (!host || !data || typeof L === "undefined") {
    return;
  }
  const payload = JSON.parse(data.textContent || "{}");
  const features = payload.map?.features || [];
  const map = L.map(host, { maxZoom: 20 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const layer = L.geoJSON({ type: "FeatureCollection", features }, {
    style(feature) {
      if (feature.properties?.kind === "building") {
        return { color: "#dc2626", fillColor: "#facc15", fillOpacity: 0.32, weight: 2 };
      }
      if (feature.properties?.kind === "site-polygon") {
        return { color: "#00a6b4", fillColor: "#ffffff", fillOpacity: 0.18, weight: 3 };
      }
      return { color: "#174a7e", fillColor: "#d9eaf7", fillOpacity: 0.22, weight: 2 };
    },
    pointToLayer(feature, latlng) {
      const color = feature.properties?.kind === "fiber" ? "#c7752a" : "#174a7e";
      return L.circleMarker(latlng, {
        color,
        fillColor: color,
        fillOpacity: 0.85,
        radius: 7,
        weight: 2
      });
    },
    onEachFeature(feature, featureLayer) {
      featureLayer.bindPopup(feature.properties?.label || payload.title || "Position");
    }
  }).addTo(map);

  if (layer.getBounds().isValid()) {
    map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 18 });
  } else {
    map.setView([7.54, -5.55], 6);
  }

  document.querySelectorAll("[data-map-feature]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.mapFeature;
      let found = null;
      layer.eachLayer((featureLayer) => {
        if (featureLayer.feature?.properties?.itemId === id) {
          found = featureLayer;
        }
      });
      if (!found) {
        return;
      }
      if (found.getBounds) {
        map.fitBounds(found.getBounds(), { padding: [24, 24], maxZoom: 19 });
      } else if (found.getLatLng) {
        map.setView(found.getLatLng(), Math.max(map.getZoom(), 18));
      }
      found.openPopup();
      document.getElementById("section-location")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}());

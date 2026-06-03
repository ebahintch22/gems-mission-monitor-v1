(function () {
  const dataElement = document.getElementById("missions-data");
  const missions = JSON.parse(dataElement.textContent);
  const i18nElement = document.getElementById("missions-i18n-data");
  const messages = i18nElement ? JSON.parse(i18nElement.textContent).messages : {};
  function t(key) {
    return messages[key] || key;
  }

  new Tabulator("#missions-table", {
    data: missions,
    layout: "fitColumns",
    placeholder: t("tableEmpty"),
    columns: [
      {
        title: t("mission"),
        field: "name",
        minWidth: 160,
        formatter: function (cell) {
          const link = document.createElement("a");
          link.href = `/missions/${cell.getRow().getData().id}`;
          link.textContent = cell.getValue();
          return link;
        }
      },
      { title: t("region"), field: "region" },
      { title: t("status"), field: "status" },
      { title: t("agents"), field: "collectors", hozAlign: "right" },
      { title: t("start"), field: "start_date" }
    ]
  });

  const map = L.map("missions-map").setView([7.54, -5.55], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const markers = [];
  missions.forEach(function (mission) {
    if (mission.latitude !== null && mission.longitude !== null) {
      const popup = document.createElement("div");
      const name = document.createElement("strong");
      const region = document.createElement("div");
      name.textContent = mission.name;
      region.textContent = mission.region;
      popup.append(name, region);
      markers.push(L.marker([mission.latitude, mission.longitude]).addTo(map).bindPopup(popup));
    }
  });

  if (markers.length) {
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
  }
}());

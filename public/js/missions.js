(function () {
  const dataElement = document.getElementById("missions-data");
  const missions = JSON.parse(dataElement.textContent);

  new Tabulator("#missions-table", {
    data: missions,
    layout: "fitColumns",
    placeholder: "Aucune mission enregistree",
    columns: [
      {
        title: "Mission",
        field: "name",
        minWidth: 160,
        formatter: function (cell) {
          const link = document.createElement("a");
          link.href = `/missions/${cell.getRow().getData().id}`;
          link.textContent = cell.getValue();
          return link;
        }
      },
      { title: "Region", field: "region" },
      { title: "Statut", field: "status" },
      { title: "Agents", field: "collectors", hozAlign: "right" },
      { title: "Debut", field: "start_date" }
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

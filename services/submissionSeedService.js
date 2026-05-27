const FORM_ID = "padci_survey_terrain_vf";
const FORM_VERSION = "2026052601";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function polygonParts(geometry) {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }
  throw new Error(`Type de geometrie non supporte pour le seed : ${geometry.type}.`);
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[previous];
    const crosses = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point, coordinates) {
  return pointInRing(point, coordinates[0])
    && !coordinates.slice(1).some((hole) => pointInRing(point, hole));
}

function randomPointInGeometry(geometry, random) {
  const parts = polygonParts(geometry);
  const part = parts[Math.floor(random() * parts.length)];
  const outerRing = part[0];
  const longitudes = outerRing.map((coordinate) => coordinate[0]);
  const latitudes = outerRing.map((coordinate) => coordinate[1]);
  const bounds = {
    minLongitude: Math.min(...longitudes),
    maxLongitude: Math.max(...longitudes),
    minLatitude: Math.min(...latitudes),
    maxLatitude: Math.max(...latitudes)
  };

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const point = [
      bounds.minLongitude + random() * (bounds.maxLongitude - bounds.minLongitude),
      bounds.minLatitude + random() * (bounds.maxLatitude - bounds.minLatitude)
    ];
    if (pointInPolygon(point, part)) {
      return { longitude: point[0], latitude: point[1] };
    }
  }

  throw new Error("Impossible de generer un point a l'interieur d'une sous-prefecture.");
}

function isoDateWithOffset(endDate, daysAgo, hour, minute) {
  const date = new Date(endDate);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

function siteShape(latitude, longitude) {
  const delta = 0.00015;
  return [
    `${latitude - delta} ${longitude - delta} 0 7`,
    `${latitude - delta} ${longitude + delta} 0 7`,
    `${latitude + delta} ${longitude + delta} 0 7`,
    `${latitude + delta} ${longitude - delta} 0 7`,
    `${latitude - delta} ${longitude - delta} 0 7`
  ].join(";");
}

function rawSubmission(data) {
  const condition = data.statutValidation === "rejetee"
    ? "inaccessible"
    : (data.statutValidation === "a_verifier" ? "partielle" : "complete");
  const healthSite = data.sequence % 3 === 0;

  return {
    _form_id: FORM_ID,
    _version: FORM_VERSION,
    start: data.submittedAt,
    end: data.submittedAt,
    today: data.submittedAt.slice(0, 10),
    deviceid: `SIM-DEVICE-${data.agent.code_agent}`,
    modA: {
      fiche_id: data.submissionId,
      id_entite: `SITE-${String(data.sequence).padStart(5, "0")}`,
      enqueteur: data.agent.code_agent,
      equipe: String(data.equipe.id),
      superviseur: "",
      gps_site: `${data.latitude.toFixed(6)} ${data.longitude.toFixed(6)} 0 ${data.precision}`,
      gps_centre: `${(data.latitude + 0.00005).toFixed(6)} ${(data.longitude + 0.00005).toFixed(6)} 0 ${data.precision + 1}`,
      conditions: condition,
      motif_incomplet: condition === "complete" ? "" : "Controle terrain a completer"
    },
    modB: {
      nom_officiel: `${healthSite ? "Centre de sante" : "Etablissement public"} ${data.sousPrefecture.nom_sous_prefecture}`,
      ministere: healthSite ? "mshpcmu" : "mena",
      type_infra: healthSite ? "sante" : "education",
      region: data.sousPrefecture.nom_region,
      departement: data.sousPrefecture.nom_departement,
      sous_prefecture: data.sousPrefecture.nom_sous_prefecture,
      commune: data.sousPrefecture.nom_sous_prefecture,
      milieu: data.sequence % 2 === 0 ? "urbain" : "rural",
      statut_fonct: "fonctionnel",
      emprise_site: siteShape(data.latitude, data.longitude),
      acces_route: "accessible"
    },
    modC: {
      nb_batiments: 1 + (data.sequence % 4),
      personnel: 4 + (data.sequence % 26),
      utilisateurs_cible: 10 + (data.sequence % 80),
      plages: "journee"
    },
    modD: {
      electricite: data.sequence % 5 === 0 ? "non" : "oui",
      source_elec: data.sequence % 5 === 0 ? "solaire" : "reseau",
      dispo_jour: data.sequence % 4 === 0 ? "partielle" : "continue"
    },
    modE: {
      operateurs: "orange mtn",
      orange_tech: data.sequence % 4 === 0 ? "3g" : "4g",
      orange_qual: data.anomalyCount ? "faible" : "bonne",
      debit_mob_desc: Number((2 + (data.sequence % 18) * 0.7).toFixed(1))
    },
    modN: {
      observations: data.anomalyCount ? "Verification requise." : "Collecte complete.",
      validation: data.statutValidation
    }
  };
}

function seedSubmissions(db, options = {}) {
  const random = seededRandom(options.seed || 20260527);
  const perAgent = options.perAgent || 30;
  const inactiveCount = options.inactiveCount === undefined ? 2 : options.inactiveCount;
  const inactiveSubmissions = options.inactiveSubmissions || 4;
  const endDate = options.endDate || new Date().toISOString();
  const agents = db.prepare(`
    SELECT a.id, a.nom, a.prenoms, a.code_agent, a.equipe_id, e.mission_id, e.nom_equipe
    FROM agents_collecte a
    JOIN equipes e ON e.id = a.equipe_id
    WHERE a.statut = 'actif'
    ORDER BY a.code_agent
  `).all();

  if (!agents.length) {
    throw new Error("Aucun agent actif affecte a une equipe n'est disponible pour le seed.");
  }

  const sousPrefecturesByEquipe = new Map();
  const territoryStatement = db.prepare(`
    SELECT
      sp.id, sp.nom_sous_prefecture, sp.geometry_geojson,
      d.nom_departement, r.nom_region
    FROM equipe_regions er
    JOIN regions r ON r.id = er.region_id
    JOIN departements d ON d.region_id = r.id
    JOIN sous_prefectures sp ON sp.departement_id = d.id
    WHERE er.equipe_id = ? AND sp.geometry_geojson IS NOT NULL
    ORDER BY sp.id
  `);
  const missionStatement = db.prepare("SELECT id, kobo_asset_uid FROM missions WHERE id = ?");
  const upsert = db.prepare(`
    INSERT INTO soumissions_collecte (
      source, source_submission_id, kobo_asset_uid, mission_id, equipe_id,
      agent_id, sous_prefecture_id, code_agent_source, submitted_at,
      latitude, longitude, precision_m, statut_validation, anomaly_count,
      formulaire_type, raw_data_json
    ) VALUES (
      'simulation', @source_submission_id, @kobo_asset_uid, @mission_id, @equipe_id,
      @agent_id, @sous_prefecture_id, @code_agent_source, @submitted_at,
      @latitude, @longitude, @precision_m, @statut_validation, @anomaly_count,
      @formulaire_type, @raw_data_json
    )
    ON CONFLICT(source, source_submission_id) DO UPDATE SET
      mission_id = excluded.mission_id,
      equipe_id = excluded.equipe_id,
      agent_id = excluded.agent_id,
      sous_prefecture_id = excluded.sous_prefecture_id,
      code_agent_source = excluded.code_agent_source,
      submitted_at = excluded.submitted_at,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      precision_m = excluded.precision_m,
      statut_validation = excluded.statut_validation,
      anomaly_count = excluded.anomaly_count,
      formulaire_type = excluded.formulaire_type,
      raw_data_json = excluded.raw_data_json,
      synced_at = CURRENT_TIMESTAMP
  `);

  const report = {
    agents: agents.length,
    generated: 0,
    validees: 0,
    aVerifier: 0,
    rejetees: 0,
    agentsLowActivity: []
  };

  db.transaction(() => {
    agents.forEach((agent, agentIndex) => {
      let territories = sousPrefecturesByEquipe.get(agent.equipe_id);
      if (!territories) {
        territories = territoryStatement.all(agent.equipe_id);
        sousPrefecturesByEquipe.set(agent.equipe_id, territories);
      }
      if (!territories.length) {
        throw new Error(`Aucune sous-prefecture disponible pour l'equipe ${agent.nom_equipe}.`);
      }

      const isLowActivity = agentIndex >= agents.length - inactiveCount;
      const count = isLowActivity ? inactiveSubmissions : perAgent;
      if (isLowActivity) {
        report.agentsLowActivity.push(agent.code_agent);
      }
      const mission = missionStatement.get(agent.mission_id);

      for (let sequence = 1; sequence <= count; sequence += 1) {
        const territory = territories[Math.floor(random() * territories.length)];
        const point = randomPointInGeometry(JSON.parse(territory.geometry_geojson), random);
        const anomalyCount = sequence % 13 === 0 ? 2 : (sequence % 9 === 0 ? 1 : 0);
        const statutValidation = sequence % 17 === 0
          ? "rejetee"
          : (anomalyCount ? "a_verifier" : "validee");
        const daysAgo = isLowActivity
          ? 10 + sequence
          : Math.floor(random() * 10);
        const submittedAt = isoDateWithOffset(endDate, daysAgo, 7 + (sequence % 9), sequence % 60);
        const submissionId = `SIM-${agent.code_agent}-${String(sequence).padStart(3, "0")}`;
        const precision = 4 + Math.floor(random() * 9);
        const rawData = rawSubmission({
          agent,
          equipe: { id: agent.equipe_id, name: agent.nom_equipe },
          sousPrefecture: territory,
          latitude: point.latitude,
          longitude: point.longitude,
          precision,
          submittedAt,
          submissionId,
          sequence,
          anomalyCount,
          statutValidation
        });

        upsert.run({
          source_submission_id: submissionId,
          kobo_asset_uid: mission.kobo_asset_uid,
          mission_id: agent.mission_id,
          equipe_id: agent.equipe_id,
          agent_id: agent.id,
          sous_prefecture_id: territory.id,
          code_agent_source: agent.code_agent,
          submitted_at: submittedAt,
          latitude: point.latitude,
          longitude: point.longitude,
          precision_m: precision,
          statut_validation: statutValidation,
          anomaly_count: anomalyCount,
          formulaire_type: FORM_ID,
          raw_data_json: JSON.stringify(rawData)
        });
        report.generated += 1;
        if (statutValidation === "validee") report.validees += 1;
        if (statutValidation === "a_verifier") report.aVerifier += 1;
        if (statutValidation === "rejetee") report.rejetees += 1;
      }
    });
  })();

  return report;
}

module.exports = {
  FORM_ID,
  FORM_VERSION,
  seedSubmissions
};

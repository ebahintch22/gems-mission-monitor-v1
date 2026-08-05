module.exports = {
  id: "padci-site",
  title: "Dossier technique PADCI",
  subtitle: "Fiche detaillee interactive",
  formId: "padci_survey_terrain_vf_v12",
  header: {
    title: "modB/nom_officiel",
    subtitle: "modA/fiche_id",
    status: "statut_validation",
    badges: [
      { key: "modB/type_infra", label: "Secteur", type: "choice" },
      { key: "modB/sous_type", label: "Type", type: "choice" },
      { key: "modN/priorite", label: "Priorite", type: "status" },
      { key: "modN/niveau_co", label: "Connectivite", type: "status" }
    ]
  },
  kpis: [
    { key: "modC/nb_batiments", label: "Batiments", type: "integer", fallbackComputed: "buildingCount" },
    { key: "modC/personnel", label: "Personnel", type: "integer" },
    { key: "modC/nb_lits", label: "Lits", type: "integer" },
    { key: "modC/patients_jour", label: "Patients / jour", type: "integer" },
    { key: "modB/superficie", label: "Superficie", type: "area", fallbackComputed: "siteArea", fallbackWhenZero: true },
    { key: "modD/electricite", label: "Electricite", type: "boolean" },
    { key: "modF/internet", label: "Internet", type: "choice" },
    { key: "modH/dist_raccord", label: "Distance raccord.", type: "distance" }
  ],
  sections: [
    {
      id: "overview",
      title: "Vue generale",
      icon: "fa-gauge-high",
      type: "overview"
    },
    {
      id: "identification",
      title: "Identification",
      icon: "fa-building",
      fields: [
        { key: "modB/nom_officiel", label: "Nom officiel" },
        { key: "modB/region", label: "Region", type: "choice" },
        { key: "modB/departement", label: "Departement", type: "choice" },
        { key: "modB/sous_prefecture", label: "Sous-prefecture", type: "choice" },
        { key: "modB/commune", label: "Commune" },
        { key: "modB/quartier", label: "Quartier" },
        { key: "modB/adresse", label: "Adresse", type: "longText" },
        { key: "modB/milieu", label: "Milieu", type: "choice" },
        { key: "modB/annee_creation", label: "Annee de creation", type: "integer" },
        { key: "modB/resp_nom", label: "Responsable rencontre" },
        { key: "modB/resp_fonction", label: "Fonction" },
        { key: "modB/resp_tel", label: "Telephone", type: "phone" },
        { key: "modB/resp_email", label: "Email", type: "email" },
        { key: "modA/enqueteur", label: "Enqueteur" },
        { key: "modA/superviseur2", label: "Superviseur" },
        { key: "start", label: "Debut collecte", type: "datetime" },
        { key: "end", label: "Fin collecte", type: "datetime" }
      ]
    },
    {
      id: "location",
      title: "Localisation",
      icon: "fa-map-location-dot",
      type: "map",
      fields: [
        { key: "modA/gps_site", label: "GPS site", type: "gps" },
        { key: "modA/gps_centre", label: "Centre du site", type: "gps" },
        { key: "modA/gps_manuel", label: "Point manuel", type: "gps" },
        { key: "modB/emprise_site", label: "Emprise site", type: "wktPolygon" },
        { key: "modB/emprise_site_manuel", label: "Emprise manuelle", type: "wktPolygon" }
      ]
    },
    {
      id: "site",
      title: "Caracteristiques",
      icon: "fa-school",
      fields: [
        { key: "modB/type_infra", label: "Type d'infrastructure", type: "choice" },
        { key: "modB/sous_type", label: "Sous-type", type: "choice" },
        { key: "modB/statut_fonct", label: "Statut de fonctionnement", type: "choice" },
        { key: "modB/acces_route", label: "Acces routier", type: "choice" },
        { key: "modC/nb_batiments", label: "Nombre de batiments", type: "integer" },
        { key: "modC/personnel", label: "Personnel", type: "integer" },
        { key: "modC/capacite", label: "Capacite / activite", type: "number" }
      ]
    },
    {
      id: "energy",
      title: "Energie",
      icon: "fa-bolt",
      fields: [
        { key: "modD/electricite", label: "Presence electricite", type: "boolean" },
        { key: "modD/source_elec", label: "Sources d'energie", type: "multiChoice" },
        { key: "modD/puissance", label: "Puissance", type: "number" },
        { key: "modD/raccord_type", label: "Type de raccordement", type: "choice" },
        { key: "modD/dispo_jour", label: "Disponibilite", type: "choice" },
        { key: "modD/freq_coupure", label: "Frequence des coupures", type: "choice" },
        { key: "modD/qualite_courant", label: "Qualite du courant", type: "choice" },
        { key: "modD/groupe_etat", label: "Etat du groupe", type: "choice" },
        { key: "modD/solaire_etat", label: "Solaire", type: "choice" },
        { key: "modD/mise_terre", label: "Mise a la terre", type: "choice" },
        { key: "modD/obs_elec", label: "Observations", type: "longText" }
      ]
    },
    {
      id: "telecom",
      title: "Telecom",
      icon: "fa-tower-broadcast",
      fields: [
        { key: "modE/operateurs", label: "Operateurs detectes", type: "multiChoice" },
        { key: "modE/techno_mobile", label: "Technologie disponible", type: "multiChoice" },
        { key: "modE/orange_qual", label: "Qualite Orange", type: "choice" },
        { key: "modE/mtn_qual", label: "Qualite MTN", type: "choice" },
        { key: "modE/moov_qual", label: "Qualite Moov", type: "choice" },
        { key: "modE/pylone", label: "Presence de pylones", type: "boolean" },
        { key: "modE/nb_pylones", label: "Nombre de pylones", type: "integer" }
      ],
      repeats: [{
        id: "pylons",
        title: "Pylones",
        source: ["modE/pylone_rep", "modE/pylone_rep/modE/pylone_rep"],
        itemTitle: "type_pylone",
        fields: [
          { key: "type_pylone", label: "Type", type: "choice" },
          { key: "operateur", label: "Operateur", type: "choice" },
          { key: "gps_pylone", label: "Position", type: "gps" },
          { key: "dist_pylone", label: "Distance", type: "distance" }
        ]
      }]
    },
    {
      id: "internet",
      title: "Internet",
      icon: "fa-wifi",
      fields: [
        { key: "modF/internet", label: "Statut internet", type: "choice" },
        { key: "modF/operateurs_internet", label: "Operateurs", type: "multiChoice" },
        { key: "modF/meilleur_choix", label: "Meilleur choix", type: "choice" },
        { key: "modF/redondance", label: "Redondance", type: "boolean" },
        { key: "modF/obs_internet", label: "Observations", type: "longText" }
      ],
      repeats: [{
        id: "operators",
        title: "Operateurs internet",
        source: ["modF/operateur_rep", "modF/operateur_rep/modF/operateur_rep"],
        itemTitle: "operateur",
        fields: [
          { key: "operateur", label: "Operateur", type: "choice" },
          { key: "satisfaction", label: "Satisfaction", type: "choice" }
        ],
        nestedRepeats: [{
          id: "links",
          title: "Liens de connexion",
          source: ["lien_rep", "modF/operateur_rep/lien_rep"],
          itemTitle: "technologie",
          fields: [
            { key: "position", label: "Position", type: "gps" },
            { key: "technologie", label: "Technologie", type: "choice" },
            { key: "statut", label: "Statut", type: "choice" },
            { key: "bat_arrivee", label: "Batiment d'arrivee" },
            { key: "debit_souscrit", label: "Debit souscrit", type: "number" },
            { key: "cout_mensuel", label: "Cout mensuel", type: "currency" },
            { key: "payeur", label: "Payeur", type: "choice" },
            { key: "usage", label: "Usage", type: "multiChoice" },
            { key: "equipements", label: "Equipements", type: "multiChoice" }
          ]
        }]
      }]
    },
    {
      id: "fiber",
      title: "Fibre",
      icon: "fa-route",
      fields: [
        { key: "modH/fibre_proche", label: "Fibre a proximite", type: "boolean" },
        { key: "modH/infra_fibre", label: "Infrastructure visible", type: "choice" },
        { key: "modH/prop_fibre", label: "Proprietaire", type: "choice" },
        { key: "modH/mode_pose", label: "Mode de pose", type: "choice" },
        { key: "modH/dist_raccord", label: "Distance raccordement", type: "distance" },
        { key: "modH/voirie", label: "Etat voirie", type: "choice" },
        { key: "modH/ligne_vue", label: "Ligne de vue", type: "choice" },
        { key: "modH/gps_raccord", label: "Point raccordement", type: "gps" }
      ]
    },
    {
      id: "buildings",
      title: "Batiments",
      icon: "fa-house-chimney",
      type: "repeat",
      source: ["batiment", "batiment/batiment"],
      itemTitle: "bat_nom",
      itemNumber: "num_bat",
      fields: [
        { key: "num_bat", label: "Numero", type: "integer" },
        { key: "bat_nom", label: "Nom" },
        { key: "bat_statut", label: "Statut", type: "choice" },
        { key: "bat_occupants", label: "Occupants", type: "integer" },
        { key: "surface_bat", label: "Surface au sol", type: "area" },
        { key: "coins_bat", label: "Geometrie", type: "wktPolygon" },
        { key: "bat_elec", label: "Electricite", type: "choice" },
        { key: "cablage", label: "Cablage", type: "multiChoice" },
        { key: "pc_fixes", label: "PC fixes", type: "integer" },
        { key: "pc_portables", label: "Portables / tablettes", type: "integer" }
      ]
    },
    {
      id: "needs",
      title: "Besoins",
      icon: "fa-list-check",
      fields: [
        { key: "modK/appli_metier", label: "Applications metier", type: "multiChoice" },
        { key: "modK/appli_metier_autres", label: "Autres applications", type: "longText" },
        { key: "modK/appli_loc", label: "Localisation des applications", type: "choice" },
        { key: "modK/profil_usage", label: "Profil d'usage", type: "multiChoice" },
        { key: "modK/services_pub", label: "Services publics numeriques", type: "multiChoice" },
        { key: "modK/besoins_exprimes", label: "Besoins exprimes", type: "longText" },
        { key: "modK/type_co_souhait", label: "Connexion souhaitee", type: "choice" },
        { key: "modK/justif_souhait", label: "Justification", type: "longText" },
        { key: "modK/qos", label: "Qualite attendue", type: "choice" },
        { key: "modK/sensibilite", label: "Sensibilite", type: "choice" },
        { key: "modK/freins", label: "Freins", type: "multiChoice" },
        { key: "modN/solutions", label: "Solutions envisageables", type: "multiChoice" },
        { key: "modN/travaux", label: "Travaux recommandes", type: "multiChoice" },
        { key: "modN/priorite", label: "Priorite", type: "status" },
        { key: "modN/commentaire", label: "Commentaire final", type: "longText" }
      ]
    },
    {
      id: "risks",
      title: "Risques",
      icon: "fa-triangle-exclamation",
      fields: [
        { key: "modI/zone_inondable", label: "Zone inondable", type: "boolean" },
        { key: "modI/risques_clim", label: "Risques climatiques", type: "multiChoice" },
        { key: "modI/securite", label: "Niveau de securite", type: "choice" },
        { key: "modI/vol_vandalisme", label: "Vol ou vandalisme", type: "boolean" },
        { key: "modI/protection_foudre", label: "Protection foudre", type: "choice" },
        { key: "modI/obs_env", label: "Observations", type: "longText" }
      ]
    },
    {
      id: "media",
      title: "Medias",
      icon: "fa-images",
      type: "media"
    },
    {
      id: "validation",
      title: "Validation",
      icon: "fa-clipboard-check",
      fields: [
        { key: "_id", label: "Identifiant Kobo" },
        { key: "_uuid", label: "UUID" },
        { key: "__version__", label: "Version formulaire" },
        { key: "_submission_time", label: "Date soumission", type: "datetime" },
        { key: "_submitted_by", label: "Utilisateur Kobo" },
        { key: "_status", label: "Statut Kobo" },
        { key: "statut_validation", label: "Validation G2M", type: "status" }
      ],
      technicalFields: ["_id", "_uuid", "__version__", "_xform_id_string", "_status", "_submission_time", "_submitted_by"]
    }
  ],
  media: {
    categories: [
      { id: "site-entry", title: "Entree du site", fields: ["modB/photo_entree", "photo_entree"] },
      { id: "overview", title: "Vue d'ensemble", fields: ["modB/photo_vue_ensemble", "photo_vue_ensemble"] },
      { id: "fiber", title: "Raccordement", fields: ["modH/photo_raccord", "photo_raccord"] },
      { id: "environment", title: "Environnement", fields: ["modI/photo_env", "photo_env"] },
      { id: "building", title: "Batiments", fields: ["batiment/photo_bat", "photo_bat"] },
      { id: "electricity", title: "Tableaux electriques", fields: ["modD/photo_tableau", "photo_tableau"] },
      { id: "equipment", title: "Equipements", fields: ["modF/photo_equipement", "photo_equipement"] }
    ]
  },
  qualityRules: {
    sentinelValues: ["999", 999]
  }
};

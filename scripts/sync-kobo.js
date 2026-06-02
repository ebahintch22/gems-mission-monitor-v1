require("dotenv").config();

const { listKoboAssets, syncKoboSubmissions } = require("../services/koboSyncService");

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (options.listAssets) {
    const assets = await listKoboAssets({ limit: options.limit || 25 });
    assets.forEach((asset) => {
      console.log(`${asset.uid}\t${asset.name}`);
    });
    return;
  }

  const assetUid = options.asset || process.env.KOBO_ASSET_UID;
  const missionId = Number(options.mission || process.env.KOBO_MISSION_ID);

  const summary = await syncKoboSubmissions({
    assetUid,
    missionId,
    limit: options.limit || 100,
    since: options.since,
    dryRun: options.dryRun,
    gpsField: options.gpsField,
    agentCodeField: options.agentCodeField,
    formType: options.formType
  });

  console.log(`Formulaire Kobo: ${assetUid}`);
  console.log(`Mission G2M: ${summary.missionId} - ${summary.missionName}`);
  console.log(`Soumissions lues: ${summary.read}`);
  console.log(options.dryRun ? `Soumissions valides: ${summary.valid}` : `Soumissions inserees: ${summary.inserted}`);
  console.log(`Soumissions deja presentes: ${summary.skipped}`);
  console.log(`Soumissions en erreur: ${summary.errors.length}`);

  summary.errors.slice(0, 10).forEach((message) => console.warn(`- ${message}`));
}

function parseArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--list-assets":
        options.listAssets = true;
        break;
      case "--asset":
        options.asset = args[++index];
        break;
      case "--mission":
        options.mission = args[++index];
        break;
      case "--limit":
        options.limit = Number(args[++index]);
        break;
      case "--since":
        options.since = args[++index];
        break;
      case "--gps-field":
        options.gpsField = args[++index];
        break;
      case "--agent-code-field":
        options.agentCodeField = args[++index];
        break;
      case "--form-type":
        options.formType = args[++index];
        break;
      default:
        throw new Error(`Option inconnue: ${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`
Usage:
  npm run kobo:sync -- --list-assets
  npm run kobo:sync -- --asset <uid> --mission <id> --dry-run
  npm run kobo:sync -- --asset <uid> --mission <id>

Options:
  --limit <n>              Nombre maximal de soumissions a lire
  --since <date>           Ne lire que les soumissions posterieures a cette date
  --gps-field <path>       Nom ou chemin du champ GPS Kobo
  --agent-code-field <path> Nom ou chemin du champ code agent
  --form-type <label>      Libelle du type de formulaire stocke en base
`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

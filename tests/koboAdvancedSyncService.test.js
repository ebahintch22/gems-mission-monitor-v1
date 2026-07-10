const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildKoboDataParams,
  buildKoboFilterQuery
} = require("../services/koboAdvancedSyncService");

test("buildKoboFilterQuery construit le filtre date Kobo", () => {
  assert.deepEqual(
    buildKoboFilterQuery("dates", {
      date_from: "2026-07-01T00:00:00.000Z",
      date_to: "2026-07-09T23:59:59.000Z"
    }),
    {
      _submission_time: {
        $gte: "2026-07-01T00:00:00.000Z",
        $lte: "2026-07-09T23:59:59.000Z"
      }
    }
  );
});

test("buildKoboDataParams applique la pagination et le tri N dernieres", () => {
  const params = buildKoboDataParams({
    mode: "last_n",
    pageSize: 30,
    filters: {
      last_n: 50
    }
  });

  assert.equal(params.limit, 30);
  assert.equal(params.query, undefined);
  assert.equal(params.sort, JSON.stringify({ _submission_time: -1 }));
});

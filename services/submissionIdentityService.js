function displaySubmissionId(record) {
  const rawData = parseRawData(record?.raw_data_json);
  return valueAtPath(rawData, "modB/nom_officiel")
    || valueAtPath(rawData, "_id")
    || valueAtPath(rawData, "meta/_id")
    || record?.source_submission_id
    || "-";
}

function attachDisplaySubmissionId(record) {
  if (!record) {
    return record;
  }
  return {
    ...record,
    display_submission_id: displaySubmissionId(record)
  };
}

function attachDisplaySubmissionIds(records) {
  return records.map(attachDisplaySubmissionId);
}

function parseRawData(rawDataJson) {
  if (!rawDataJson) {
    return {};
  }
  try {
    return JSON.parse(rawDataJson);
  } catch {
    return {};
  }
}

function valueAtPath(source, path) {
  if (!source || !path) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(source, path)) {
    return source[path];
  }
  return String(path).split("/").reduce((current, part) => {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      return current[part];
    }
    return undefined;
  }, source);
}

module.exports = {
  attachDisplaySubmissionId,
  attachDisplaySubmissionIds,
  displaySubmissionId
};

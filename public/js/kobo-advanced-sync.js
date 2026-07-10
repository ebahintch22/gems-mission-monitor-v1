(function () {
  const form = document.querySelector("[data-kobo-advanced-sync-form]");
  if (!form) {
    return;
  }

  const modeInput = form.querySelector("[name='mode']");
  const statusNode = document.querySelector("[data-kobo-advanced-sync-status]");
  const manifestLink = document.querySelector("[data-kobo-advanced-sync-manifest-link]");
  const launchButton = form.querySelector("button[type='submit']");
  const fieldsByMode = {
    last_n: form.querySelectorAll("[data-kobo-advanced-field='last_n']"),
    dates: form.querySelectorAll("[data-kobo-advanced-field='dates']"),
    index: form.querySelectorAll("[data-kobo-advanced-field='index']")
  };
  let pollTimer = null;

  function updateEnabledFields() {
    const mode = modeInput.value;
    Object.entries(fieldsByMode).forEach(([fieldMode, fields]) => {
      fields.forEach((field) => {
        const active = mode === fieldMode;
        field.disabled = !active;
        field.closest("label")?.classList.toggle("is-disabled", !active);
      });
    });
  }

  async function launchJob(event) {
    event.preventDefault();
    setStatus("En cours de lancement...");
    launchButton.disabled = true;
    manifestLink.hidden = true;

    try {
      const response = await fetch("/parametrages/kobo/advanced-sync/jobs", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payloadFromForm())
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Lancement impossible.");
      }

      setStatus(`En cours (page ${payload.manifest.pages_read})`);
      pollJob(payload.job_id);
    } catch (error) {
      setStatus(`Échec: ${error.message}`);
      launchButton.disabled = false;
    }
  }

  function payloadFromForm() {
    const data = new FormData(form);
    return {
      asset_uid: data.get("asset_uid"),
      mission_id: data.get("mission_id"),
      mission_label: selectedMissionLabel(),
      mode: data.get("mode"),
      page_size: data.get("page_size"),
      gps_field: data.get("gps_field"),
      agent_code_field: data.get("agent_code_field"),
      form_type: data.get("form_type"),
      filters: {
        last_n: data.get("last_n"),
        date_from: data.get("date_from"),
        date_to: data.get("date_to"),
        index_from: data.get("index_from"),
        index_to: data.get("index_to")
      }
    };
  }

  function selectedMissionLabel() {
    const select = form.querySelector("[name='mission_id']");
    return select?.selectedOptions?.[0]?.textContent?.trim() || "";
  }

  async function pollJob(jobId) {
    clearTimeout(pollTimer);

    try {
      const response = await fetch(`/parametrages/kobo/advanced-sync/jobs/${encodeURIComponent(jobId)}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Statut indisponible.");
      }

      renderManifestStatus(payload.manifest);

      if (payload.manifest.status === "running") {
        pollTimer = setTimeout(() => pollJob(jobId), 1500);
      } else {
        launchButton.disabled = false;
      }
    } catch (error) {
      setStatus(`Échec: ${error.message}`);
      launchButton.disabled = false;
    }
  }

  function renderManifestStatus(manifest) {
    const labels = {
      running: `En cours (page ${manifest.pages_read}, ${manifest.submissions_read} soumission(s) lue(s))`,
      completed: `Terminé (${manifest.submissions_imported} nouvelle(s) soumission(s) importée(s))`,
      failed: `Échec (${manifest.errors.length} erreur(s))`
    };
    setStatus(labels[manifest.status] || "Idle");
    manifestLink.href = `/parametrages/kobo/advanced-sync/jobs/${encodeURIComponent(manifest.job_id)}/manifest`;
    manifestLink.hidden = false;
  }

  function setStatus(value) {
    statusNode.textContent = value;
  }

  modeInput.addEventListener("change", updateEnabledFields);
  form.addEventListener("submit", launchJob);
  updateEnabledFields();
}());

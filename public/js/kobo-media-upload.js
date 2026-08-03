(function () {
  const form = document.querySelector("[data-kobo-media-upload-form]");
  if (!form || typeof fetch !== "function") {
    return;
  }

  const statusNode = document.querySelector("[data-kobo-media-upload-status]");
  const manifestLink = document.querySelector("[data-kobo-media-upload-manifest-link]");
  const progress = form.querySelector("[data-kobo-media-upload-progress]");
  const progressBar = form.querySelector("[data-kobo-media-upload-progress-bar]");
  const progressText = form.querySelector("[data-kobo-media-upload-progress-text]");
  const submitButton = form.querySelector("button[type='submit']");
  const cancelButton = form.querySelector("[data-kobo-media-upload-cancel]");
  let pollTimer = null;
  let activeJobId = null;

  form.addEventListener("submit", launchUploadJob);
  cancelButton?.addEventListener("click", cancelUploadJob);

  async function launchUploadJob(event) {
    event.preventDefault();
    clearTimeout(pollTimer);
    activeJobId = null;
    setBusy(true);
    setCancelling(false);
    setStatus("Lancement...", "running");
    setProgress({ requested: 0, processed: 0, uploaded: 0, skipped: 0, errors: [] });
    if (manifestLink) {
      manifestLink.hidden = true;
    }

    try {
      const response = await fetch("/parametrages/kobo/media/upload-local/jobs", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(new FormData(form)).toString()
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Lancement impossible.");
      }

      renderManifest(payload.manifest);
      activeJobId = payload.job_id;
      setCancelling(false);
      pollJob(payload.job_id);
    } catch (error) {
      setStatus(`Echec: ${error.message}`, "failed");
      setBusy(false);
    }
  }

  async function cancelUploadJob() {
    if (!activeJobId) {
      return;
    }

    setCancelling(true);
    setStatus("Arret demande...", "running");
    try {
      const response = await fetch(`/parametrages/kobo/media/upload-local/jobs/${encodeURIComponent(activeJobId)}/cancel`, {
        method: "POST",
        headers: { Accept: "application/json" }
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Arret impossible.");
      }

      renderManifest(payload.manifest);
      pollJob(activeJobId);
    } catch (error) {
      setStatus(`Echec arret: ${error.message}`, "failed");
      setCancelling(false);
    }
  }

  async function pollJob(jobId) {
    clearTimeout(pollTimer);

    try {
      const response = await fetch(`/parametrages/kobo/media/upload-local/jobs/${encodeURIComponent(jobId)}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Statut indisponible.");
      }

      renderManifest(payload.manifest);

      if (payload.manifest.status === "running") {
        pollTimer = setTimeout(() => pollJob(jobId), 1200);
      } else {
        activeJobId = null;
        setBusy(false);
        setCancelling(false);
      }
    } catch (error) {
      setStatus(`Echec: ${error.message}`, "failed");
      setBusy(false);
    }
  }

  function renderManifest(manifest) {
    setProgress(manifest);
    if (manifestLink) {
      manifestLink.href = `/parametrages/kobo/media/upload-local/${encodeURIComponent(manifest.job_id)}/manifest`;
      manifestLink.hidden = false;
    }

    const errors = Array.isArray(manifest.errors) ? manifest.errors.length : 0;
    const labels = {
      running: `En cours (${manifest.processed || 0}/${manifest.requested || 0})`,
      completed: `Termine (${manifest.uploaded || 0} televerse(s))`,
      completed_with_errors: `Termine avec erreurs (${errors})`,
      cancelled: `Arrete (${manifest.processed || 0}/${manifest.requested || 0})`,
      failed: `Echec (${errors})`
    };
    setStatus(labels[manifest.status] || "Idle", manifest.status);
  }

  function setProgress(manifest) {
    const total = Number(manifest.requested) || 0;
    const processed = Number(manifest.processed) || 0;
    const uploaded = Number(manifest.uploaded) || 0;
    const skipped = Number(manifest.skipped) || 0;
    const errors = Array.isArray(manifest.errors) ? manifest.errors.length : 0;
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

    if (progress) {
      progress.hidden = false;
    }
    if (progressBar) {
      progressBar.value = percent;
    }
    if (progressText) {
      progressText.textContent = `Televersement realise a ${percent} % (${processed} fichier(s) sur ${total} traite(s), ${uploaded} televerse(s), ${skipped} ignore(s), ${errors} erreur(s))`;
    }
  }

  function setStatus(value, status) {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = value;
    statusNode.classList.toggle("status-actif", status === "running" || status === "completed");
    statusNode.classList.toggle("status-suspendu", status !== "running" && status !== "completed");
  }

  function setBusy(isBusy) {
    form.querySelectorAll("input, button").forEach((control) => {
      if (control === cancelButton) {
        return;
      }
      control.disabled = isBusy;
    });
    if (cancelButton) {
      cancelButton.hidden = !isBusy;
      cancelButton.disabled = !isBusy;
    }
    if (submitButton) {
      submitButton.setAttribute("aria-busy", String(isBusy));
    }
  }

  function setCancelling(isCancelling) {
    if (cancelButton) {
      cancelButton.disabled = isCancelling;
      cancelButton.setAttribute("aria-busy", String(isCancelling));
    }
  }
}());

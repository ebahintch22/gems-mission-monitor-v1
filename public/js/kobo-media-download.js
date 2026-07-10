(function () {
  const form = document.querySelector("[data-kobo-media-download-form]");
  if (!form || typeof fetch !== "function") {
    return;
  }

  const progress = form.querySelector("[data-kobo-media-progress]");
  const progressBar = form.querySelector("[data-kobo-media-progress-bar]");
  const progressText = form.querySelector("[data-kobo-media-progress-text]");
  const submitButton = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async function (event) {
    const selected = Array.from(form.querySelectorAll("input[name='selected_images']:checked"));
    if (!selected.length) {
      return;
    }

    event.preventDefault();
    setBusy(true);
    showProgress(0, selected.length, 0, 0);

    let completed = 0;
    let downloaded = 0;
    let failed = 0;
    const assetUid = form.querySelector("input[name='asset_uid']")?.value || "";

    for (const checkbox of selected) {
      const params = new URLSearchParams();
      params.set("asset_uid", assetUid);
      params.set("selected_images", checkbox.value);

      try {
        const response = await fetch("/parametrages/kobo/media/download-item", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: params.toString()
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          failed += 1;
          checkbox.closest("tr")?.classList.add("row-error");
        } else {
          downloaded += 1;
          checkbox.closest("tr")?.classList.add("row-success");
        }
      } catch (error) {
        failed += 1;
        checkbox.closest("tr")?.classList.add("row-error");
      }

      completed += 1;
      showProgress(completed, selected.length, downloaded, failed);
    }

    setBusy(false);
  });

  function showProgress(completed, total, downloaded, failed) {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    if (progress) {
      progress.hidden = false;
    }
    if (progressBar) {
      progressBar.value = percent;
    }
    if (progressText) {
      const imageLabel = total > 1 ? "images" : "image";
      const failureText = failed > 0 ? `, ${failed} erreur(s)` : "";
      progressText.textContent = `Téléchargement réalisé à ${percent} % (${downloaded} ${imageLabel} sur ${total} téléchargée(s)${failureText})`;
    }
  }

  function setBusy(isBusy) {
    form.querySelectorAll("input, button").forEach((control) => {
      control.disabled = isBusy;
    });
    if (submitButton) {
      submitButton.setAttribute("aria-busy", String(isBusy));
    }
  }
}());

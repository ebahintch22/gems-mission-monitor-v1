import { createJSONEditor, Mode } from "/vendor/vanilla-jsoneditor/standalone.js";

const panel = document.getElementById("kobo-json-panel");
const payloadScript = document.getElementById("kobo-debug-payload");
const editorTarget = document.getElementById("kobo-json-editor");

if (panel && payloadScript && editorTarget) {
  const payload = JSON.parse(payloadScript.textContent || "{}");
  const copyButton = document.getElementById("kobo-json-copy");
  const downloadButton = document.getElementById("kobo-json-download");
  const collapseButton = document.getElementById("kobo-json-collapse");
  const closeButton = document.getElementById("kobo-json-close");
  const feedback = document.getElementById("kobo-json-feedback");
  const copySuccessLabel = panel.dataset.copySuccessLabel || "JSON copié.";

  createJSONEditor({
    target: editorTarget,
    props: {
      content: { json: payload },
      mode: Mode.tree,
      readOnly: true,
      mainMenuBar: true,
      navigationBar: true,
      statusBar: true
    }
  });

  copyButton?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    showFeedback(copySuccessLabel);
  });

  downloadButton?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kobo-response-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  collapseButton?.addEventListener("click", () => {
    panel.classList.toggle("is-collapsed");
    const icon = collapseButton.querySelector("i");
    icon?.classList.toggle("fa-minus", !panel.classList.contains("is-collapsed"));
    icon?.classList.toggle("fa-plus", panel.classList.contains("is-collapsed"));
  });

  closeButton?.addEventListener("click", () => {
    panel.hidden = true;
  });

  function showFeedback(message) {
    if (!feedback) {
      return;
    }

    feedback.textContent = message;
    window.setTimeout(() => {
      feedback.textContent = "";
    }, 1800);
  }
}

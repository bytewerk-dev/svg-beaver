(function () {
  var exportButton = document.getElementById("exportButton");
  var generateButton = document.getElementById("generateButton");
  var copyButton = document.getElementById("copyButton");
  var documentName = document.getElementById("documentName");
  var selectionSummary = document.getElementById("selectionSummary");
  var resultLog = document.getElementById("resultLog");
  var outputCode = document.getElementById("outputCode");
  var targetMode = document.getElementById("targetMode");

  function getOptions() {
    return {
      coordinatePrecision: parseInt(document.getElementById("precision").value, 10),
      useCurrentColorFill: document.getElementById("fillCurrentColor").checked,
      useCurrentColorStroke: document.getElementById("strokeCurrentColor").checked,
      outlineText: document.getElementById("outlineText").checked,
      includeXmlns: document.getElementById("includeXmlns").checked,
      exportMode: document.getElementById("modeSeparate").checked ? "separate" : "combined",
      outputFormat: document.getElementById("outputDataUri").checked ? "dataUri" : "raw"
    };
  }

  function escapeForJsx(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function callHost(functionName, payload, callback) {
    if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) {
      callback({ ok: false, error: "CEP host bridge is not available." });
      return;
    }

    var arg = payload == null ? "" : "'" + escapeForJsx(JSON.stringify(payload)) + "'";
    var script = arg ? "SVGBeaverPanel." + functionName + "(" + arg + ")" : "SVGBeaverPanel." + functionName + "()";

    window.__adobe_cep__.evalScript(script, function (rawResult) {
      if (!rawResult || rawResult === "EvalScript error.") {
        callback({ ok: false, error: "Illustrator host call failed." });
        return;
      }

      try {
        callback(normalizeHostResponse(JSON.parse(rawResult)));
      } catch (error) {
        callback({ ok: false, error: String(rawResult) });
      }
    });
  }

  function normalizeHostResponse(result) {
    if (!result || typeof result !== "object") {
      return { ok: false, error: "Invalid host response." };
    }

    result.ok = result.ok === true || result.ok === "true";

    if (result.count != null) {
      result.count = parseInt(result.count, 10);
    }

    if (result.line != null && result.line !== "") {
      result.line = String(result.line);
    }

    if (result.path != null) {
      result.path = String(result.path);
    }

    if (result.folderPath != null) {
      result.folderPath = String(result.folderPath);
    }

    if (result.mode != null) {
      result.mode = String(result.mode);
    }

    if (result.error != null) {
      result.error = String(result.error);
    }

    if (result.output != null) {
      result.output = String(result.output);
    }

    if (result.outputFormat != null) {
      result.outputFormat = String(result.outputFormat);
    }

    return result;
  }

  function renderStatus(status) {
    if (!status.ok) {
      targetMode.textContent = "Error";
      documentName.textContent = status.error || "Host error";
      documentName.title = status.error || "Host error";
      selectionSummary.textContent = status.line ? "Line: " + status.line : "Status refresh failed.";
      return;
    }

    targetMode.textContent = status.targetMode === "selection" ? "Selection" : "Artboard";
    documentName.textContent = truncateDocumentName(status.documentName || "Untitled document");
    documentName.title = status.documentName || "Untitled document";

    if (status.selectionCount > 0) {
      selectionSummary.textContent = status.selectionCount + " top-level item(s) selected.";
    } else {
      selectionSummary.textContent = "No selection. Export uses the active artboard.";
    }
  }

  function truncateDocumentName(value) {
    var text = String(value || "");

    if (text.length <= 22) {
      return text;
    }

    return text.slice(0, 21) + "…";
  }

  function refreshStatus() {
    callHost("getStatus", null, renderStatus);
  }

  function renderExportResult(result) {
    if (!result.ok) {
      resultLog.textContent = result.line ? result.error + " (Line " + result.line + ")" : result.error;
      return;
    }

    if (result.count && result.folderPath) {
      resultLog.textContent = "Exported " + result.count + " SVG files to " + result.folderPath;
    } else {
      resultLog.textContent = "Exported " + result.mode + " to " + result.path;
    }
    refreshStatus();
  }

  function renderGeneratedOutput(result) {
    if (!result.ok) {
      outputCode.value = "";
      copyButton.disabled = true;
      resultLog.textContent = result.line ? result.error + " (Line " + result.line + ")" : result.error;
      return;
    }

    outputCode.value = result.output || "";
    copyButton.disabled = !outputCode.value;
    resultLog.textContent = result.outputFormat === "dataUri" ? "Generated Data URI from " + result.mode + "." : "Generated SVG code from " + result.mode + ".";
    refreshStatus();
  }

  function runExport() {
    resultLog.textContent = "Exporting...";
    callHost("exportCurrent", getOptions(), renderExportResult);
  }

  function runGenerate() {
    resultLog.textContent = "Generating...";
    callHost("generateOutput", getOptions(), renderGeneratedOutput);
  }

  function fallbackCopyText(text) {
    outputCode.removeAttribute("readonly");
    outputCode.focus();
    outputCode.select();

    var copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }

    outputCode.setAttribute("readonly", "readonly");
    return copied;
  }

  function copyGeneratedOutput() {
    var text = outputCode.value;

    if (!text) {
      resultLog.textContent = "Nothing to copy yet.";
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        resultLog.textContent = "Copied generated output to clipboard.";
      }, function () {
        if (fallbackCopyText(text)) {
          resultLog.textContent = "Copied generated output to clipboard.";
        } else {
          resultLog.textContent = "Copy failed. Select the generated output manually.";
        }
      });
      return;
    }

    if (fallbackCopyText(text)) {
      resultLog.textContent = "Copied generated output to clipboard.";
    } else {
      resultLog.textContent = "Copy failed. Select the generated output manually.";
    }
  }

  exportButton.addEventListener("click", function () {
    runExport();
  });

  generateButton.addEventListener("click", function () {
    runGenerate();
  });

  copyButton.addEventListener("click", function () {
    copyGeneratedOutput();
  });

  refreshStatus();
  window.setInterval(refreshStatus, 1500);
}());

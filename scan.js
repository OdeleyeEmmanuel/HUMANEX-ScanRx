(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const records = Array.isArray(window.NAfdacRecords) ? window.NAfdacRecords : [];

  const state = {
    stream: null,
    selectedFile: null,
    objectUrl: null,
    verifying: false
  };

  const normalize = (value) => String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const escapeHTML = (value) => {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  };

  const referenceMap = new Map();
  const nameMap = new Map();

  for (const record of records) {
    const nrn = normalize(record.nrn);
    if (nrn && nrn !== "NIL" && nrn !== "NOTINDICATED") {
      if (!referenceMap.has(nrn)) referenceMap.set(nrn, record);
    }
    const name = normalize(record.product_name);
    if (name && name.length >= 10 && !nameMap.has(name)) nameMap.set(name, record);
  }

  function findByRegistration(value) {
    return referenceMap.get(normalize(value)) || null;
  }

  function findNameFromOCR(text) {
    const compact = normalize(text);
    if (!compact) return null;

    for (const [name, record] of nameMap) {
      if (name.length >= 12 && compact.includes(name)) return record;
    }
    return null;
  }

  function extractRegistrationCandidates(text) {
    const source = String(text || "").toUpperCase();
    const candidates = new Set();

    // Standard forms such as 03-1450 and A3-101155.
    const patterns = [
      /\b[A-Z]\s*\d\s*[-–—]?\s*\d{3,6}[A-Z]?\b/g,
      /\b\d{2}\s*[-–—]\s*\d{4}\b/g,
      /\b\d{6,8}\b/g
    ];

    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const raw = match[0].trim();
        const compact = normalize(raw);
        if (compact.length >= 6) candidates.add(compact);
      }
    }

    // OCR often splits A3-101155 into separate tokens. Search the compact OCR too.
    const compact = normalize(source);
    for (const [nrn] of referenceMap) {
      if (nrn.length >= 7 && compact.includes(nrn)) candidates.add(nrn);
    }

    return [...candidates];
  }

  function findMatchingRegistration(text) {
    const candidates = extractRegistrationCandidates(text);

    for (const candidate of candidates) {
      const match = referenceMap.get(candidate);
      if (match) {
        return { record: match, candidate };
      }
    }

    return { record: null, candidate: candidates[0] || "" };
  }

  function setNotice(message, type = "warning") {
    const el = $("cameraNotice");
    el.textContent = message;
    el.dataset.type = type;
    el.hidden = !message;
  }

  function clearNotice() {
    $("cameraNotice").hidden = true;
    $("cameraNotice").textContent = "";
    delete $("cameraNotice").dataset.type;
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    const video = $("cameraVideo");
    video.srcObject = null;
    video.hidden = true;
  }

  function clearObjectUrl() {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
  }

  function resetScanner({ clearResult = false } = {}) {
    stopCamera();
    clearObjectUrl();
    state.selectedFile = null;
    $("fileInput").value = "";
    $("imagePreview").hidden = true;
    $("imagePreview").removeAttribute("src");
    $("cameraPlaceholder").hidden = false;
    $("cameraActions").hidden = false;
    $("scanNowButton").textContent = "SCAN NOW";
    $("capturedActions").hidden = true;
    clearNotice();

    if (clearResult) {
      $("resultSection").hidden = true;
      $("resultCard").innerHTML = "";
    }
  }

  function openCamera() {
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showCameraUnavailable("This browser does not provide camera access. You can upload a clear package image or enter the NAFDAC registration number manually.");
      return;
    }

    if (!window.isSecureContext) {
      showCameraUnavailable("Camera access requires a secure browser connection such as HTTPS. You can upload a clear package image or enter the NAFDAC registration number manually.");
      return;
    }

    try {
      resetScanner({ clearResult: false });
      state.stream = await openCamera();

      const video = $("cameraVideo");
      video.srcObject = state.stream;
      video.hidden = false;
      $("cameraPlaceholder").hidden = true;
      $("cameraActions").hidden = false;
      $("scanNowButton").textContent = "CAPTURE";
      setNotice("Camera ready. Position the product inside the frame, then press CAPTURE.", "success");
      await video.play();
    } catch (error) {
      stopCamera();
      showCameraUnavailable(
        "Camera access was not available. You can upload a clear photograph of the product or enter the NAFDAC registration number manually."
      );
    }
  }

  function showCameraUnavailable(message) {
    stopCamera();
    $("cameraPlaceholder").hidden = false;
    $("scanNowButton").textContent = "SCAN NOW";
    setNotice(message, "error");
  }

  function capturePhoto() {
    const video = $("cameraVideo");
    if (!state.stream || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setNotice("The camera is not ready yet. Please wait a moment and try again.", "warning");
      return;
    }

    const canvas = $("captureCanvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        setNotice("The camera frame could not be captured. Please try again.", "error");
        return;
      }

      const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
      setSelectedImage(file);
      stopCamera();
      setNotice("Image captured. Review it, then press VERIFY PRODUCT.", "success");
    }, "image/jpeg", 0.94);
  }

  function setSelectedImage(file) {
    clearObjectUrl();
    state.selectedFile = file;
    state.objectUrl = URL.createObjectURL(file);

    const image = $("imagePreview");
    image.src = state.objectUrl;
    image.hidden = false;

    $("cameraVideo").hidden = true;
    $("cameraPlaceholder").hidden = true;
    $("cameraActions").hidden = true;
    $("capturedActions").hidden = false;
  }

  function prepareImage(file, mode = "original") {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const sourceUrl = URL.createObjectURL(file);

      image.onload = () => {
        try {
          const maxDimension = 1800;
          const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));

          if (mode === "original") {
            resolve(file);
            return;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(image, 0, 0, width, height);

          const pixels = ctx.getImageData(0, 0, width, height);
          const data = pixels.data;

          for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(
              0.299 * data[i] +
              0.587 * data[i + 1] +
              0.114 * data[i + 2]
            );

            if (mode === "gray") {
              const contrast = Math.max(0, Math.min(255, ((gray - 128) * 1.45) + 128));
              data[i] = data[i + 1] = data[i + 2] = contrast;
            } else {
              const contrast = Math.max(0, Math.min(255, ((gray - 128) * 1.8) + 128));
              const value = contrast > 145 ? 255 : 0;
              data[i] = data[i + 1] = data[i + 2] = value;
            }
          }

          ctx.putImageData(pixels, 0, 0);

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("Image preprocessing failed."));
              return;
            }
            resolve(blob);
          }, "image/png");
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(sourceUrl);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(sourceUrl);
        reject(new Error("Image could not be decoded."));
      };

      image.src = sourceUrl;
    });
  }

  function setOCRStatus(title, message, progress = 0) {
    $("ocrStatus").hidden = false;
    $("ocrStatusTitle").textContent = title;
    $("ocrStatusText").textContent = message;
    $("ocrProgressBar").style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }

  function hideOCRStatus() {
    $("ocrStatus").hidden = true;
  }

  async function runOCR(file) {
    if (!window.Tesseract) {
      throw new Error("OCR library could not be loaded.");
    }

    const worker = await Tesseract.createWorker("eng", 1, {
      logger: (message) => {
        if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
          setOCRStatus(
            "Reading package",
            "OCR is analysing the package image.",
            Math.round(message.progress * 100)
          );
        }
      }
    });

    const texts = [];

    try {
      const original = await prepareImage(file, "original");
      const gray = await prepareImage(file, "gray");
      const threshold = await prepareImage(file, "threshold");

      const passes = [
        { image: original, label: "Original package image", whitelist: false },
        { image: gray, label: "Enhanced grayscale image", whitelist: true },
        { image: threshold, label: "High contrast image", whitelist: true }
      ];

      for (let index = 0; index < passes.length; index += 1) {
        const pass = passes[index];

        setOCRStatus(
          "Reading package",
          `OCR pass ${index + 1} of ${passes.length}: ${pass.label}.`,
          Math.round((index / passes.length) * 100)
        );

        if (pass.whitelist) {
          await worker.setParameters({
            tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/"
          });
        } else {
          await worker.setParameters({
            tessedit_char_whitelist: ""
          });
        }

        const result = await worker.recognize(pass.image);
        texts.push(result?.data?.text || "");
      }

      return texts.join("\n");
    } finally {
      await worker.terminate();
    }
  }

  async function verifyProduct() {
    if (!state.selectedFile || state.verifying) return;

    state.verifying = true;
    $("verifyProductButton").disabled = true;
    $("scanAgainButton").disabled = true;
    $("regInput").disabled = true;
    $("registrationForm").querySelector("button").disabled = true;
    $("resultSection").hidden = true;

    try {
      const ocrText = await runOCR(state.selectedFile);
      setOCRStatus("Checking reference records", "Comparing the OCR result with the supplied reference dataset.", 100);

      const lookup = findMatchingRegistration(ocrText);

      if (lookup.record) {
        renderVerified(lookup.record, {
          method: "Package image",
          extractedRegistration: lookup.candidate,
          extractedProduct: findNameFromOCR(ocrText)?.product_name || ""
        });
      } else {
        renderNotVerified({
          method: "Package image",
          extractedRegistration: lookup.candidate,
          extractedProduct: findNameFromOCR(ocrText)?.product_name || "",
          reason: lookup.candidate
            ? "The OCR found a possible registration number, but it did not match the supplied reference dataset."
            : "No usable NAFDAC registration number was read from the package image."
        });
      }
    } catch (error) {
      renderNotVerified({
        method: "Package image",
        reason: "The image could not be read reliably.",
        extra: "Try a clearer photo with the NAFDAC registration number visible, or use the manual registration lookup."
      });
    } finally {
      state.verifying = false;
      $("verifyProductButton").disabled = false;
      $("scanAgainButton").disabled = false;
      $("regInput").disabled = false;
      $("registrationForm").querySelector("button").disabled = false;
      hideOCRStatus();
    }
  }

  function verifyRegistration(value) {
    const cleaned = String(value || "").trim();

    if (!cleaned) {
      renderNotVerified({
        method: "Registration lookup",
        reason: "Enter a NAFDAC registration number to search the supplied reference dataset."
      });
      return;
    }

    const match = findByRegistration(cleaned);

    if (match) {
      renderVerified(match, { method: "Registration lookup" });
    } else {
      renderNotVerified({
        method: "Registration lookup",
        extractedRegistration: cleaned,
        reason: "No matching record was found in the supplied NAFDAC reference dataset."
      });
    }
  }

  function detail(label, value) {
    return `
      <div class="detail">
        <span class="detail-label">${escapeHTML(label)}</span>
        <span class="detail-value">${escapeHTML(value || "Not provided")}</span>
      </div>
    `;
  }

  function renderVerified(record, meta = {}) {
    const status = String(record.status || "Reference record");
    const source = String(record.source || "Supplied reference dataset");

    $("resultCard").innerHTML = `
      <article class="result-card verified-card">
        <div class="result-top">
          <div class="verdict verified">
            <span class="verdict-dot"></span>
            VERIFIED REFERENCE MATCH
          </div>
          <h2>${escapeHTML(record.product_name)}</h2>
          <p>A reference record was found for the supplied product information.</p>
        </div>

        <div class="result-body">
          ${detail("Product name", record.product_name)}
          ${detail("Product category", record.category)}
          ${detail("NAFDAC registration number", record.nrn)}
          ${detail("Status", status)}
          ${detail("Active ingredients / description", record.active_ingredients)}
          ${detail("Dosage form", record.form)}
          ${detail("Route of administration", record.roa)}
          ${record.batch_no ? detail("Batch number", record.batch_no) : ""}
          ${record.mfg_date ? detail("Manufacturing date", record.mfg_date) : ""}
          ${record.exp_date ? detail("Expiry date", record.exp_date) : ""}
          ${record.date_registered ? detail("Date registered", record.date_registered) : ""}
          ${record.date_expiry ? detail("Registration expiry", record.date_expiry) : ""}
          ${record.manufacturer ? detail("Manufacturer", record.manufacturer) : ""}
          ${record.applicant ? detail("Applicant", record.applicant) : ""}
          ${record.country ? detail("Country", record.country) : ""}
          ${detail("Reference source", source)}

          ${meta.extractedRegistration ? `
            <div class="match-note">
              <strong>OCR registration read</strong>
              <span>${escapeHTML(meta.extractedRegistration)}</span>
            </div>
          ` : ""}

          <div class="result-note">
            This is a reference-data match only. It does not independently certify the physical product,
            authenticity, quality, safety, storage condition, or current regulatory status.
          </div>

          <button type="button" class="button button-secondary wide result-reset" id="resetAfterResult">
            SCAN ANOTHER PRODUCT
          </button>
        </div>
      </article>
    `;

    $("resultSection").hidden = false;
    $("resetAfterResult").addEventListener("click", () => {
      resetScanner({ clearResult: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("resultSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderNotVerified(meta = {}) {
    $("resultCard").innerHTML = `
      <article class="result-card unverified-card">
        <div class="result-top">
          <div class="verdict unverified">
            <span class="verdict-dot"></span>
            NOT VERIFIED
          </div>
          <h2>NOT VERIFIED</h2>
          <p>No matching record was found in the available NAFDAC reference dataset.</p>
        </div>

        <div class="result-body">
          ${detail("Check method", meta.method || "Reference lookup")}
          ${meta.extractedRegistration ? detail("Registration read", meta.extractedRegistration) : ""}
          ${meta.extractedProduct ? detail("Product text read", meta.extractedProduct) : ""}
          ${detail("Reason", meta.reason || "No matching reference record was found.")}

          <div class="danger-callout">
            <strong>Do not use or purchase the product until its regulatory status has been independently confirmed.</strong>
            <span>A missing database match alone does not prove that a physical product is counterfeit.</span>
          </div>

          ${meta.extra ? `<div class="result-note">${escapeHTML(meta.extra)}</div>` : ""}

          <a class="report-button" href="https://greenbook.nafdac.gov.ng/report/sf" target="_blank" rel="noopener noreferrer">
            REPORT THE CASE
          </a>

          <button type="button" class="button button-secondary wide result-reset" id="resetAfterResult">
            SCAN ANOTHER PRODUCT
          </button>
        </div>
      </article>
    `;

    $("resultSection").hidden = false;
    $("resetAfterResult").addEventListener("click", () => {
      resetScanner({ clearResult: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("resultSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("scanNowButton").addEventListener("click", () => {
    if (state.stream) {
      capturePhoto();
    } else {
      startCamera();
    }
  });

  $("uploadButton").addEventListener("click", () => $("fileInput").click());

  $("fileInput").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Please choose an image of the product package.", "error");
      return;
    }

    stopCamera();
    setSelectedImage(file);
    setNotice("Image loaded. Reading the package and checking the reference dataset...", "success");
    // Uploaded images follow the same real OCR verification path automatically.
    // No fake result is shown: the result card is rendered only after OCR and reference lookup finish.
    verifyProduct();
  });

  $("scanAgainButton").addEventListener("click", () => {
    resetScanner({ clearResult: false });
    startCamera();
  });

  $("verifyProductButton").addEventListener("click", verifyProduct);

  $("registrationForm").addEventListener("submit", (event) => {
    event.preventDefault();
    verifyRegistration($("regInput").value);
  });

  window.addEventListener("beforeunload", stopCamera);

  // A ScanRx page always starts in the clean scanner state.
  resetScanner({ clearResult: true });
})();

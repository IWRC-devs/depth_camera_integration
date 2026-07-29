import "./style.css";
import { registerSW } from "virtual:pwa-register";
import {
  getNativeStatus,
  nativeBridgeAvailable,
  requestIntelUsbDevice,
  webUsbAvailable
} from "./nativeBridge";
import { clearCaptures, deleteCapture, listCaptures, saveCapture } from "./storage";
import type { BackgroundType, CaptureRecord, WeatherCondition } from "./types";

registerSW({ immediate: true });

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("App container was not found.");
}

app.innerHTML = `
  <header class="topbar">
    <div>
      <p class="eyebrow">Offline-first field collector</p>
      <h1>Weed Field Capture</h1>
      <p class="subtitle">Start with tablet images and metadata. Add the D435i through the Android native bridge later.</p>
    </div>
    <span id="onlineBadge" class="badge">Checking network…</span>
  </header>

  <main>
    <section class="panel">
      <div class="section-heading">
        <div>
          <h2>RealSense feasibility test</h2>
          <p>Use this screen to separate browser capability from the later APK/native SDK capability.</p>
        </div>
      </div>

      <div class="status-grid">
        <article class="status-card">
          <span>Native APK bridge</span>
          <strong id="nativeBridgeStatus">Checking…</strong>
          <small id="nativeBridgeDetail"></small>
        </article>
        <article class="status-card">
          <span>Browser WebUSB</span>
          <strong id="webUsbStatus">Checking…</strong>
          <small>Useful only as a diagnostic; not the planned streaming path.</small>
        </article>
      </div>

      <div class="button-row">
        <button id="checkNativeButton" class="button primary" type="button">Check native bridge</button>
        <button id="checkUsbButton" class="button secondary" type="button">Check Intel USB device</button>
      </div>
      <p id="connectionMessage" class="message" aria-live="polite"></p>
    </section>

    <section class="panel">
      <div class="section-heading">
        <div>
          <h2>New observation</h2>
          <p>Everything saves locally on the device so field collection can continue without service.</p>
        </div>
      </div>

      <form id="captureForm">
        <div class="field full">
          <label for="image">Image</label>
          <input id="image" name="image" type="file" accept="image/*" capture="environment" />
          <small>For the PWA prototype, this uses the tablet camera. The APK will replace this with RealSense RGB/depth capture.</small>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="observationDate">Date</label>
            <input id="observationDate" name="observationDate" type="date" required />
          </div>

          <div class="field">
            <label for="weedCommonName">Common weed name</label>
            <input id="weedCommonName" name="weedCommonName" type="text" placeholder="Palmer amaranth" required />
          </div>

          <div class="field">
            <label for="weedScientificName">Scientific name</label>
            <input id="weedScientificName" name="weedScientificName" type="text" placeholder="Amaranthus palmeri" />
          </div>

          <div class="field">
            <label for="background">Background</label>
            <select id="background" name="background" required>
              <option value="fallow">Fallow</option>
              <option value="crop-present">Crop present / non-fallow</option>
              <option value="bare-soil">Bare soil</option>
              <option value="crop-residue">Crop residue</option>
              <option value="grass-turf">Grass / turf</option>
              <option value="pasture">Pasture</option>
              <option value="roadside">Roadside</option>
              <option value="greenhouse-pot">Greenhouse / pot</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div class="field">
            <label for="weather">Weather condition</label>
            <select id="weather" name="weather" required>
              <option value="sunny">Sunny</option>
              <option value="partly-cloudy">Partly cloudy</option>
              <option value="cloudy">Cloudy</option>
              <option value="overcast">Overcast</option>
              <option value="light-rain">Light rain</option>
              <option value="after-rain">After rain</option>
              <option value="windy">Windy</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div class="field">
            <label for="monopodLengthM">Monopod length to camera center (m)</label>
            <input id="monopodLengthM" name="monopodLengthM" type="number" min="0" step="0.01" placeholder="1.85" />
          </div>

          <div class="field">
            <label for="tiltFromVerticalDeg">Tilt from vertical (degrees)</label>
            <input id="tiltFromVerticalDeg" name="tiltFromVerticalDeg" type="number" min="0" max="90" step="0.1" placeholder="20" />
          </div>

          <div class="field">
            <label for="calculatedHeight">Calculated vertical camera height (m)</label>
            <output id="calculatedHeight">—</output>
          </div>

          <div class="field">
            <label for="latitude">Latitude</label>
            <input id="latitude" name="latitude" type="number" step="any" placeholder="30.6187" />
          </div>

          <div class="field">
            <label for="longitude">Longitude</label>
            <input id="longitude" name="longitude" type="number" step="any" placeholder="-96.3365" />
          </div>

          <div class="field">
            <label for="gpsAccuracyM">GPS accuracy (m)</label>
            <input id="gpsAccuracyM" name="gpsAccuracyM" type="number" min="0" step="0.1" readonly />
          </div>

          <div class="field full">
            <button id="locationButton" class="button secondary" type="button">Use current location</button>
          </div>

          <div class="field full">
            <label for="notes">Notes</label>
            <textarea id="notes" name="notes" rows="3" placeholder="Growth stage, crop, plot, lighting, unusual conditions…"></textarea>
          </div>
        </div>

        <div class="button-row">
          <button class="button primary" type="submit">Save observation offline</button>
          <button id="resetButton" class="button secondary" type="reset">Reset</button>
        </div>
        <p id="saveMessage" class="message" aria-live="polite"></p>
      </form>
    </section>

    <section class="panel">
      <div class="section-heading split">
        <div>
          <h2>Saved observations</h2>
          <p id="captureCount">0 observations</p>
        </div>
        <div class="button-row compact">
          <button id="exportButton" class="button secondary" type="button">Export JSON</button>
          <button id="clearButton" class="button danger" type="button">Clear all</button>
        </div>
      </div>
      <div id="captureList" class="capture-list"></div>
    </section>
  </main>
`;

const form = document.querySelector<HTMLFormElement>("#captureForm")!;
const observationDate = document.querySelector<HTMLInputElement>("#observationDate")!;
const imageInput = document.querySelector<HTMLInputElement>("#image")!;
const lengthInput = document.querySelector<HTMLInputElement>("#monopodLengthM")!;
const tiltInput = document.querySelector<HTMLInputElement>("#tiltFromVerticalDeg")!;
const heightOutput = document.querySelector<HTMLOutputElement>("#calculatedHeight")!;
const latitudeInput = document.querySelector<HTMLInputElement>("#latitude")!;
const longitudeInput = document.querySelector<HTMLInputElement>("#longitude")!;
const gpsAccuracyInput = document.querySelector<HTMLInputElement>("#gpsAccuracyM")!;
const saveMessage = document.querySelector<HTMLParagraphElement>("#saveMessage")!;
const connectionMessage = document.querySelector<HTMLParagraphElement>("#connectionMessage")!;
const captureList = document.querySelector<HTMLDivElement>("#captureList")!;
const captureCount = document.querySelector<HTMLParagraphElement>("#captureCount")!;

observationDate.value = new Date().toISOString().slice(0, 10);

function setOnlineBadge(): void {
  const badge = document.querySelector<HTMLSpanElement>("#onlineBadge")!;
  badge.textContent = navigator.onLine ? "Online" : "Offline";
  badge.className = navigator.onLine ? "badge online" : "badge offline";
}

window.addEventListener("online", setOnlineBadge);
window.addEventListener("offline", setOnlineBadge);
setOnlineBadge();

function optionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function calculateHeight(): number | null {
  const length = optionalNumber(lengthInput.value);
  const tilt = optionalNumber(tiltInput.value);

  if (length === null || tilt === null) {
    heightOutput.value = "—";
    heightOutput.textContent = "—";
    return null;
  }

  const height = length * Math.cos((tilt * Math.PI) / 180);
  const formatted = height.toFixed(3);
  heightOutput.value = formatted;
  heightOutput.textContent = formatted;
  return height;
}

lengthInput.addEventListener("input", calculateHeight);
tiltInput.addEventListener("input", calculateHeight);

async function refreshConnectionStatus(): Promise<void> {
  const nativeStatus = document.querySelector<HTMLElement>("#nativeBridgeStatus")!;
  const nativeDetail = document.querySelector<HTMLElement>("#nativeBridgeDetail")!;
  const webUsbStatus = document.querySelector<HTMLElement>("#webUsbStatus")!;

  nativeStatus.textContent = nativeBridgeAvailable() ? "Available" : "Not present";
  nativeDetail.textContent = nativeBridgeAvailable()
    ? "Running inside an APK/native shell."
    : "Normal for a Railway-hosted browser PWA.";

  webUsbStatus.textContent = webUsbAvailable() ? "API present" : "Unavailable";
}

document.querySelector<HTMLButtonElement>("#checkNativeButton")!.addEventListener("click", async () => {
  connectionMessage.textContent = "Checking native RealSense bridge…";
  const status = await getNativeStatus();

  if (status.connected) {
    connectionMessage.textContent =
      `Connected: ${status.model || "RealSense camera"} · ` +
      `${status.serialNumber || "serial unavailable"} · ` +
      `${status.usbType || "USB type unavailable"}`;
  } else {
    connectionMessage.textContent =
      status.message ||
      "No RealSense camera was reported by the native bridge.";
  }
});

document.querySelector<HTMLButtonElement>("#checkUsbButton")!.addEventListener("click", async () => {
  connectionMessage.textContent = "Opening the browser USB chooser…";
  try {
    connectionMessage.textContent = await requestIntelUsbDevice();
  } catch (error) {
    connectionMessage.textContent =
      error instanceof Error ? error.message : "USB diagnostic failed.";
  }
});

document.querySelector<HTMLButtonElement>("#locationButton")!.addEventListener("click", () => {
  saveMessage.textContent = "Requesting location…";

  if (!navigator.geolocation) {
    saveMessage.textContent = "Geolocation is not available on this device.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      latitudeInput.value = String(position.coords.latitude);
      longitudeInput.value = String(position.coords.longitude);
      gpsAccuracyInput.value = String(position.coords.accuracy);
      saveMessage.textContent = `Location recorded with approximately ${position.coords.accuracy.toFixed(1)} m accuracy.`;
    },
    (error) => {
      saveMessage.textContent = `Location failed: ${error.message}`;
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000
    }
  );
});

function makeId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `capture-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveMessage.textContent = "Saving locally…";

  const formData = new FormData(form);
  const file = imageInput.files?.[0] || null;
  const calculatedHeight = calculateHeight();

  const record: CaptureRecord = {
    id: makeId(),
    createdAt: new Date().toISOString(),
    observationDate: String(formData.get("observationDate") || ""),
    latitude: optionalNumber(latitudeInput.value),
    longitude: optionalNumber(longitudeInput.value),
    gpsAccuracyM: optionalNumber(gpsAccuracyInput.value),
    weedCommonName: String(formData.get("weedCommonName") || "").trim(),
    weedScientificName: String(formData.get("weedScientificName") || "").trim(),
    background: String(formData.get("background")) as BackgroundType,
    weather: String(formData.get("weather")) as WeatherCondition,
    monopodLengthM: optionalNumber(lengthInput.value),
    tiltFromVerticalDeg: optionalNumber(tiltInput.value),
    calculatedCameraHeightM: calculatedHeight,
    notes: String(formData.get("notes") || "").trim(),
    imageName: file?.name || null,
    imageType: file?.type || null,
    imageBlob: file,
    cameraSource: file ? "tablet-camera" : "none"
  };

  try {
    await saveCapture(record);
    saveMessage.textContent = "Observation saved offline.";
    form.reset();
    observationDate.value = new Date().toISOString().slice(0, 10);
    heightOutput.value = "—";
    heightOutput.textContent = "—";
    await renderCaptures();
  } catch (error) {
    saveMessage.textContent =
      error instanceof Error ? error.message : "Could not save the observation.";
  }
});

document.querySelector<HTMLButtonElement>("#resetButton")!.addEventListener("click", () => {
  window.setTimeout(() => {
    observationDate.value = new Date().toISOString().slice(0, 10);
    heightOutput.value = "—";
    heightOutput.textContent = "—";
    saveMessage.textContent = "";
  }, 0);
});

async function renderCaptures(): Promise<void> {
  const captures = await listCaptures();
  captureCount.textContent = `${captures.length} observation${captures.length === 1 ? "" : "s"}`;

  if (captures.length === 0) {
    captureList.innerHTML = `<p class="empty-state">No observations saved yet.</p>`;
    return;
  }

  captureList.innerHTML = "";

  for (const capture of captures) {
    const item = document.createElement("article");
    item.className = "capture-item";
    const imageUrl = capture.imageBlob ? URL.createObjectURL(capture.imageBlob) : null;

    const imageElement = imageUrl
      ? `<img src="${imageUrl}" alt="Captured weed observation" />`
      : `<div class="image-placeholder">No image</div>`;

    item.innerHTML = `
      ${imageElement}
      <div class="capture-copy">
        <strong>${escapeHtml(capture.weedCommonName || "Unnamed weed")}</strong>
        <span>${escapeHtml(capture.weedScientificName || "Scientific name not entered")}</span>
        <small>${escapeHtml(capture.observationDate)} · ${escapeHtml(capture.background)} · ${escapeHtml(capture.weather)}</small>
        <small>Camera height: ${capture.calculatedCameraHeightM === null ? "—" : `${capture.calculatedCameraHeightM.toFixed(3)} m`}</small>
      </div>
      <button class="button danger small delete-capture" data-id="${capture.id}" type="button">Delete</button>
    `;

    item.querySelector<HTMLButtonElement>(".delete-capture")!.addEventListener("click", async () => {
      await deleteCapture(capture.id);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      await renderCaptures();
    });

    captureList.append(item);
  }
}

function escapeHtml(value: string): string {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

document.querySelector<HTMLButtonElement>("#exportButton")!.addEventListener("click", async () => {
  const captures = await listCaptures();
  const exportable = captures.map(({ imageBlob, ...capture }) => ({
    ...capture,
    imageStoredLocally: Boolean(imageBlob)
  }));

  const blob = new Blob([JSON.stringify(exportable, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `weed-field-captures-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

document.querySelector<HTMLButtonElement>("#clearButton")!.addEventListener("click", async () => {
  const confirmed = window.confirm("Delete every locally saved observation on this device?");
  if (!confirmed) return;
  await clearCaptures();
  await renderCaptures();
});

await refreshConnectionStatus();
await renderCaptures();

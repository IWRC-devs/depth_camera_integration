const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const { promisify } = require("util");

require("dotenv").config();

const cloudinary = require("cloudinary").v2;
const cors = require("cors");
const express = require("express");
const multer = require("multer");

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 500 } });
const execFileAsync = promisify(execFile);

const uploadsDir = path.join(__dirname, "uploads");
const publicDir = path.join(__dirname, "public");
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const collectionsDir = path.join(dataDir, "collections");
const depthCaptureDir = path.join(uploadsDir, "depth-camera");
const depthCaptureScript = path.join(__dirname, "scripts", "capture_depth_camera.py");

const hasCloudinary =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsDir));
app.use(
  express.static(publicDir, {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store");
    },
  })
);

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeName(value) {
  return String(value || `collection-${Date.now()}`).replace(/[^a-z0-9_-]/gi, "_");
}

async function ensureStorage() {
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(collectionsDir, { recursive: true });
  await fs.mkdir(depthCaptureDir, { recursive: true });
}

async function uploadImage(file, collectionName, index, req) {
  if (hasCloudinary) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `collections/${collectionName}`,
          resource_type: "image",
          public_id: `image-${index}-${Date.now()}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve({ url: result.secure_url, publicId: result.public_id, storage: "cloudinary" });
        }
      );
      stream.end(file.buffer);
    });
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const safeCollectionName = safeName(collectionName);
  const filename = `${safeCollectionName}-${Date.now()}-${index}.jpg`;
  await fs.writeFile(path.join(uploadsDir, filename), file.buffer);
  return {
    url: `${req.protocol}://${req.get("host")}/uploads/${filename}`,
    publicId: null,
    storage: "local",
  };
}

async function saveCollectionRecord(record) {
  await fs.mkdir(collectionsDir, { recursive: true });
  const filename = `${safeName(record.name)}-${record.id}.json`;
  const filePath = path.join(collectionsDir, filename);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2));
  return filePath;
}

app.get("/", (_req, res) => {
  const indexPath = path.join(publicDir, "index.html");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Clear-Site-Data", '"cache"');
  res.sendFile(indexPath, (err) => {
    if (!err) return;

    res.json({
      name: "Depth Camera App Backend",
      status: "ok",
      metadataStorage: "local-json",
      imageStorage: hasCloudinary ? "cloudinary" : "local",
    });
  });
});

app.get(["/sw.js", "/service-worker.js"], (_req, res) => {
  res.type("application/javascript");
  res.setHeader("Cache-Control", "no-store");
  res.send(`
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.unregister(),
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
    ])
  );
});
`);
});

app.get("/api", (_req, res) => {
  res.json({
    name: "Depth Camera App Backend",
    status: "ok",
    metadataStorage: "local-json",
    imageStorage: hasCloudinary ? "cloudinary" : "local",
  });
});

app.use((req, res, next) => {
  if (
    req.method !== "GET" ||
    req.path.startsWith("/api") ||
    req.path.startsWith("/uploads") ||
    req.path === "/health"
  ) {
    return next();
  }

  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(publicDir, "index.html"), (err) => {
    if (err) next();
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    metadataStorage: "local-json",
    imageStorage: hasCloudinary ? "cloudinary" : "local",
  });
});

app.get("/api/collections", async (_req, res) => {
  try {
    await fs.mkdir(collectionsDir, { recursive: true });
    const files = await fs.readdir(collectionsDir);
    const records = [];

    for (const file of files.filter((name) => name.endsWith(".json"))) {
      const content = await fs.readFile(path.join(collectionsDir, file), "utf8");
      records.push(JSON.parse(content));
    }

    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: "Unable to read collection records", details: err.message });
  }
});

app.get("/api/collections/:id", async (req, res) => {
  try {
    await fs.mkdir(collectionsDir, { recursive: true });
    const files = await fs.readdir(collectionsDir);
    const match = files.find((file) => file.endsWith(`${req.params.id}.json`));

    if (!match) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const content = await fs.readFile(path.join(collectionsDir, match), "utf8");
    res.json(JSON.parse(content));
  } catch (err) {
    res.status(500).json({ error: "Unable to read collection record", details: err.message });
  }
});

app.post("/api/depth-camera/capture", async (req, res) => {
  const collectionName = req.body.collectionName || req.body.batchName || `collection-${Date.now()}`;
  const safeCollectionName = safeName(collectionName);
  const outputDir = path.join(depthCaptureDir, safeCollectionName);

  try {
    await fs.mkdir(outputDir, { recursive: true });
    const { stdout } = await execFileAsync(
      process.env.PYTHON_BIN || "python",
      [depthCaptureScript, "--output-dir", outputDir, "--prefix", safeCollectionName],
      {
        timeout: Number(process.env.DEPTH_CAMERA_CAPTURE_TIMEOUT_MS || 30000),
        maxBuffer: 1024 * 1024,
      }
    );
    const capture = JSON.parse(stdout);

    if (!capture.success) {
      return res.status(500).json(capture);
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/depth-camera/${safeCollectionName}/${capture.filename}`;
    res.json({
      success: true,
      imageUrl,
      metadata: capture.metadata,
    });
  } catch (err) {
    if (err.stdout) {
      try {
        const capture = JSON.parse(err.stdout);
        return res.status(500).json(capture);
      } catch {
        // Fall through to generic SDK guidance.
      }
    }
    const stderr = err.stderr ? ` ${err.stderr}` : "";
    res.status(500).json({
      success: false,
      error:
        "Unable to capture from Intel depth camera. Confirm Intel RealSense SDK/librealsense and pyrealsense2 are installed on the backend host, and that the camera is connected." +
        stderr,
    });
  }
});

app.post(["/api/collections", "/api/upload-batch"], upload.array("images", 500), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const capturedImages = parseJsonArray(req.body.captured_image_urls)
      .filter((url) => typeof url === "string" && url.length > 0)
      .map((url) => ({ url, publicId: null, storage: "depth-camera" }));

    if (files.length === 0 && capturedImages.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const collectionName = req.body.name || `collection-${Date.now()}`;
    const metadata = {
      affiliationId: numberOrNull(req.body.affiliation_id),
      botanicalName: textOrNull(req.body.botanical_name),
      weedBackground: textOrNull(req.body.weed_background || req.body.size_class),
      growthStage: textOrNull(req.body.growth_stage || req.body.flower_answer),
      soilColor: textOrNull(req.body.soil_color || req.body.crop_answer),
      lightingId: numberOrNull(req.body.lighting_id || req.body.ground_cover_percent_id),
    };

    const uploadedImages = [
      ...capturedImages,
      ...(await Promise.all(files.map((file, index) => uploadImage(file, collectionName, index, req)))),
    ];

    const record = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: collectionName,
      metadata,
      images: uploadedImages,
      createdAt: new Date().toISOString(),
    };

    await saveCollectionRecord(record);

    res.json({
      success: true,
      collectionId: record.id,
      batchId: record.id,
      metadata,
      uploadedUrls: uploadedImages.map((image) => image.url),
      record,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

ensureStorage()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize local storage:", err);
    process.exit(1);
  });

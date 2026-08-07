# Depth Camera App

Depth Camera App is an Expo frontend and Node/Express backend for collecting image batches with field metadata.

## Project Layout

- `frontend/` - Expo Router mobile/web app.
- `backend/` - Express API for batch upload, local JSON metadata storage, and Cloudinary image storage.
- `railway.json` - Railway deploy config for the backend from the repo root.

## Image And Metadata Flow

1. User enters collection parameters:
   - botanical name
   - weed background
   - growth stage
   - soil color
   - lighting
2. User takes photos with the Intel depth camera.
3. App uploads immediately when online, or saves the batch locally and syncs later.
4. Backend stores images in Cloudinary when Cloudinary env vars exist. In local development, it falls back to `backend/uploads/`.
5. Backend stores collection metadata and image URLs in local JSON files.

## Backend Setup

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Optional metadata storage directory:

```bash
DATA_DIR=
```

Optional but recommended for production image storage:

```bash
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

By default, metadata JSON files are written to `backend/data/collections/`.

## Intel Depth Camera Capture

The `/api/depth-camera/capture` endpoint runs `backend/scripts/capture_depth_camera.py` on the backend host. That host must have the Intel RealSense SDK/librealsense installed, a supported Intel depth camera connected, and Python packages from `backend/requirements-depth-camera.txt`.

```bash
cd backend
pip install -r requirements-depth-camera.txt
```

If Python is not available as `python`, set:

```bash
PYTHON_BIN=python3
```

## Frontend Setup

```bash
cd frontend
cp .env.example .env
npm install
npm start
```

Set the backend URL:

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-railway-backend.up.railway.app
```

## Railway

This repo can deploy the backend from the root with:

```bash
npm --workspace backend start
```

If you prefer Railway's root directory setting, set the service root to `backend/` and use:

```bash
npm start
```

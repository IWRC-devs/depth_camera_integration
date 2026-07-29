# Architecture

## Phase 1: deployable PWA

The Railway-hosted PWA provides:

- Installable app shell
- Offline caching
- Tablet-camera image capture
- Date and weed metadata
- Background and weather fields
- GPS capture
- Manual monopod length and tilt
- Camera-height calculation
- IndexedDB offline storage
- JSON export
- Browser USB diagnostic
- Native RealSense bridge status

No server database is required for the first hardware feasibility test.

## Phase 2: native Android wrapper

Wrap the same web application with Capacitor. Add a custom Android plugin that uses the official RealSense Android wrapper.

Suggested native methods:

```text
getStatus()
requestUsbPermission()
startPreview()
stopPreview()
captureRgbDepth()
getLatestImu()
```

The web application should call the native plugin only when installed as an APK. In a normal browser it continues to use the tablet camera and manual tilt.

## Phase 3: Railway API and PostgreSQL

After field capture is stable:

- Add authenticated users and projects.
- Upload RGB, depth, and metadata.
- Store metadata in Railway PostgreSQL.
- Store large image/depth files in object storage.
- Add resumable background synchronization.
- Add taxonomy tables for controlled weed names.
- Add a review dashboard.

Do not upload full-resolution files synchronously during capture. Save locally first, then queue uploads.

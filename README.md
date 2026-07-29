# Weed Field Capture PWA

A minimal, Railway-ready, offline-first PWA for collecting weed images and field metadata.

## Current prototype capabilities

- Installable PWA
- Offline app shell
- Tablet/phone camera image input
- Date, GPS, weed, background, weather, monopod length, and tilt
- Automatic camera-height calculation:
  - `height = monopod length × cos(tilt from vertical)`
- Local IndexedDB storage
- JSON metadata export
- RealSense native-bridge readiness check
- WebUSB diagnostic only

## Important camera limitation

A browser PWA is not the planned D435i streaming driver. The D435i should first be tested with the official RealSense Android wrapper. After that succeeds, wrap this PWA with Capacitor and expose RealSense functions through a custom Android plugin.

See `docs/ANDROID_REALSENSE_TEST.md`.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm install
npm run build
npm start
```

The server reads Railway's `PORT` environment variable.

## Deploy to Railway

1. Put this project in a GitHub repository.
2. In Railway, choose **New Project**.
3. Choose **Deploy from GitHub repo**.
4. Select the repository.
5. Railway uses `railway.toml`:
   - Build: `npm run build`
   - Start: `npm start`
6. Generate a Railway domain.
7. Open the HTTPS domain on the Android device.
8. In Chrome, choose **Add to Home screen** or **Install app**.

HTTPS is required for service workers, location, and most device APIs.

## Next milestone

Build and install the official RealSense `examples:capture` APK on the exact tablet. Do not start the custom native bridge until RGB and depth streaming pass that hardware test.

# Depth Camera App 1.1.0 — Android test build

Install `depth-camera-1.1.0-test.apk` on your Android phone or tablet.

- Restores the dark interface, blue step headers, large parameter options, green selections, and Parameters / Take Photos tabs.
- Uses **Sunny** and **Cloudy** lighting labels and removes duplicate capture-screen branding.
- Includes camera selection for RealSense D435i (USB) and OAK-D PoE (network), RGB/depth previews, and local capture storage.
- OAK-D PoE requires the supplied DepthAI camera-side pipeline and a reachable Ethernet address. See `docs/oak-camera.md` in the tagged source. Physical OAK/RealSense camera operation has not been verified for this release.
- Bundled release APK: Expo/Metro is not required. Includes ARM64 and x86_64 libraries.
- Uses the project's existing test signing key, matching the previous Android test release. Version code 2; version name 1.1.0. Intended for testing, not Play Store distribution.

The APK is the native Android app. Browser-only sample captures, footer hints, and Saved collections navigation are not included.

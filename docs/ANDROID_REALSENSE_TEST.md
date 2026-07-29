# D435i Android hardware test

The PWA itself is not the RealSense driver. Use the official RealSense Android wrapper first to verify that the exact Android tablet, cable, powered hub, camera firmware, and SDK combination can stream RGB and depth.

## What to test first

Test only these items:

1. Android sees the D435i after USB permission is granted.
2. The official sample displays a 640 × 480 depth stream.
3. The official sample displays a 640 × 480 color stream.
4. The stream remains stable for at least five minutes.
5. Disconnecting and reconnecting the camera works.
6. Android reports USB 3 rather than USB 2 when possible.

Do not make the IMU a pass/fail requirement in the first test. Current RealSense release notes warn that Android is compilable but not fully validated and that IMU streaming has known limitations.

## Recommended official source

Use the RealSense SDK repository and open:

- Android project: `wrappers/android`
- Minimal example module: `examples:capture`
- Full camera tool: `tools:camera`

The minimal capture example initializes `RsContext`, queries attached devices, creates a `Pipeline`, enables depth and color streams, and repeatedly calls `waitForFrames()`.

## Build outline

1. Install Android Studio.
2. Install Android SDK Platform 35.
3. Install Android NDK `28.0.13004108`.
4. Install CMake from Android Studio's SDK Tools.
5. Clone the RealSense SDK repository.
6. Check out SDK tag `v2.58.3` or a newer compatible release.
7. Open the `wrappers/android` directory as the Android Studio project.
8. Select the `examples:capture` run configuration.
9. Connect the Android tablet with developer mode and USB debugging enabled.
10. Build and run on the physical tablet.
11. Connect the D435i through a powered USB-C hub or powered OTG adapter.
12. Accept the Android USB/camera permission prompts.

## Expected SDK configuration

The official Android library currently builds the native RealSense code with:

- `FORCE_RSUSB_BACKEND=TRUE`
- ABIs: `arm64-v8a` and `x86_64`
- Minimum Android SDK: 24
- Target/compile SDK: 35
- Java 17
- NDK: `28.0.13004108`

## Pass/fail log

Record:

- Tablet manufacturer and model
- Android version
- CPU architecture
- Hub/adapter model
- Cable model/length
- Whether external power is connected
- D435i firmware
- RealSense SDK version
- RGB pass/fail
- Depth pass/fail
- Five-minute stability pass/fail
- Reconnect pass/fail
- Any Logcat error text

Once this passes, the same RealSense library can be wrapped in a small Capacitor Android plugin and exposed to the web UI through a native bridge.

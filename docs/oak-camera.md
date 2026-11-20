# OAK-D W PoE with the Android APK

The capture screen offers **RealSense D435i** (existing native USB integration)
and **OAK-D PoE**. The choice and OAK address are remembered on the phone. Each
image records which camera produced it; both types can be saved in one batch.

## Connect the hardware

Use the existing PoE kit to power the camera and connect its Ethernet data path
to the phone's USB-C Ethernet adapter. The adapter alone does not supply PoE.
The phone and camera must have reachable IP addresses on the same network.
The handwritten camera address in the supplied photos is `10.95.76.11`; it is
only a starting value, not an address this app has verified or configured.
For example, a camera at `10.95.76.11/24` and phone at `10.95.76.12/24` can
communicate directly. Configure addressing in the phone/network settings;
the app does not change Ethernet settings. Internet access is unnecessary.

## Load the camera-side SDK pipeline

This implementation uses DepthAI v2 to run a small HTTP service **on the OAK**.
It is not the existing Express backend and does not require a server computer
for ongoing operation once installed as the startup application. A stock OAK
does not expose the app's HTTP endpoints until this setup is performed.

On a computer that can reach the powered camera, from the repository root:

```powershell
py -3 -m venv .venv-oak
.venv-oak/Scripts/python -m pip install -r tools/oak/requirements.txt
.venv-oak/Scripts/python tools/oak/setup_camera.py --ip 10.95.76.11
```

The temporary session detects the actual RGB sensor, prints capture dimensions,
and keeps the pipeline running until Ctrl+C or a disconnect. During this trial
the computer, camera, and phone need a shared network, such as an Ethernet switch.
Check `http://10.95.76.11:8080/health` from a device on that network.

For a direct phone-to-camera setup without a running computer, install the
pipeline as the startup application after testing. Stop the trial process,
then explicitly run the following using the sensor identified above:

```powershell
.venv-oak/Scripts/python tools/oak/setup_camera.py --ip 10.95.76.11 --sensor IMX378 --flash
```

**`--flash` replaces the camera's existing startup application.** Skip it if you
need to preserve an existing integration until that application is backed up.
No bootloader update or network configuration is performed by this script.
Power-cycle after installation and verify `/health` again. Existing bootloader
firmware must support PoE Script networking (Luxonis documents version 0.0.15+).
An OV9782 camera uses `--sensor OV9782` instead. The script never flashes unless
the flag is explicitly supplied. These steps have not yet been run on your camera.

## Use the APK

1. Install the updated APK and open **Step 2: Take Photos**.
2. Select **OAK-D PoE**, enter `http://<camera-ip>:8080`, and tap **Connect**.
3. Confirm the detected sensor/dimensions. Switch RGB/depth preview as needed.
4. Capture, review, and save the batch as before.

The IMX378 pipeline saves a **4032 × 3040 JPEG** (~12 MP), with a small horizontal
crop from its 4056-pixel sensor width. OV9782 saves **1280 × 800**. Preview is
1280 × 720 and refreshed by polling, independently of full-resolution stills.
The 16:9 preview is cropped differently from the full-resolution still, so the
saved image can include additional scene area above and below the preview.
Depth remains 1280 × 800, unsigned 16-bit **little-endian millimeters**; zero
means invalid/no depth. A grayscale PNG preview maps 0–3 m for display.

JPEG, raw depth, PNG preview and collection JSON are saved on Android under
`Documents/depth_camera_images/<collection>/`. OAK images do not depend on
remote image URLs and remain available when the camera is disconnected.

RGB and depth are **not pixel aligned or hardware synchronized**. Depth uses the
right stereo camera coordinate system. Metadata records device timestamps and
measured time skew; captures more than 250 ms apart fail for retry. Do not use
matching RGB/depth pixel indices as correspondences. Metric RGB mapping would
require a follow-up calibration/alignment implementation.

## Troubleshooting and implementation

- **Connect timeout:** check PoE power, IP/subnet, the Ethernet data cable, and
  whether this pipeline is running. USB-C Ethernet is networking, not USB camera
  transport. The IP can change if the existing setup uses DHCP.
- **Wrong service:** `/health` must report `protocol: depth-camera-oak-v1`.
  A camera running another application needs its protocol adapted or this pipeline.
- **Preview/capture timeout:** check the setup process logs during a temporary
  session. Preview retries; **Connect** checks the endpoint again.
- **Lower resolution than expected:** the OV9782 variant is 1 MP, even though
  its enclosure resembles the 12 MP IMX378 version.

The camera HTTP service is intended for a trusted local wired network. Android
cleartext HTTP is enabled to support its local address. No cloud, PWA, or Express
changes are needed for this integration.

Relevant SDK documentation:

- https://docs.luxonis.com/software/depthai/standalone
- https://docs.luxonis.com/software/depthai/examples/script_http_server
- https://docs.luxonis.com/hardware/products/OAK-D%20W%20PoE

## Verification status

TypeScript and targeted ESLint checks pass. Six client tests and six simulated
camera-server tests cover errors, data transport, local save dispatch, frame
skew and cancellation. Both sensor pipelines construct successfully with the
pinned DepthAI 2.30 SDK. Tests can be rerun from the repository root:

```powershell
node --test frontend/utils/__tests__/oakCamera.test.cjs
.venv-oak/Scripts/python tools/oak/test_camera_server.py -v
node node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json
```

For this Windows checkout, building with a shorter native staging directory
avoids the default Windows path-length failure:

```powershell
cd frontend/android
./gradlew.bat :app:assembleRelease --offline "-Pandroid.nativeBuildStagingDirectory=C:/Users/navjot.singh/Documents/depth_camera_app/.cxx-oak"
```

Use your own workspace path for the staging directory on other computers, and
omit `--offline` if build dependencies are not cached. End-to-end SDK
startup, sensor detection, still encoding, Ethernet routing, and phone storage
must additionally be tested against the physical camera/phone. A successful APK
build alone does not establish hardware compatibility.

"""Load the Android app's HTTP pipeline onto an RVC2 OAK-D PoE camera.

Default: temporary session, keep this process open. --flash explicitly installs
the pipeline as the camera's startup application (replacing any existing app).
"""
import argparse
import json
from pathlib import Path
import time


def build_pipeline(dai, sensor, port, device_id):
    pipeline = dai.Pipeline()
    color = pipeline.create(dai.node.ColorCamera)
    color.setBoardSocket(dai.CameraBoardSocket.CAM_A)
    color.setFps(10)
    if sensor == "IMX378":
        color.setResolution(dai.ColorCameraProperties.SensorResolution.THE_12_MP)
        # A small horizontal crop keeps the encoded width a multiple of 32.
        width, height = 4032, 3040
    elif sensor == "OV9782":
        color.setResolution(dai.ColorCameraProperties.SensorResolution.THE_800_P)
        width, height = 1280, 800
    else:
        raise ValueError("Unsupported RGB sensor: " + sensor)
    color.setStillSize(width, height)
    color.setVideoSize(1280, 720)

    left = pipeline.create(dai.node.MonoCamera)
    right = pipeline.create(dai.node.MonoCamera)
    for camera, socket in ((left, dai.CameraBoardSocket.CAM_B),
                           (right, dai.CameraBoardSocket.CAM_C)):
        camera.setBoardSocket(socket)
        camera.setResolution(dai.MonoCameraProperties.SensorResolution.THE_800_P)
        camera.setFps(10)
    stereo = pipeline.create(dai.node.StereoDepth)
    stereo.setDefaultProfilePreset(dai.node.StereoDepth.PresetMode.HIGH_DENSITY)
    stereo.setLeftRightCheck(True)
    stereo.setSubpixel(False)
    stereo.setDepthAlign(dai.CameraBoardSocket.CAM_C)
    left.out.link(stereo.left)
    right.out.link(stereo.right)

    server = pipeline.create(dai.node.Script)
    server.setProcessor(dai.ProcessorType.LEON_CSS)
    for name in ("preview", "still", "depth"):
        server.inputs[name].setQueueSize(1)
        server.inputs[name].setBlocking(False)
    stereo.depth.link(server.inputs["depth"])
    server.outputs["control"].link(color.inputControl)
    for source, name, quality in ((color.video, "preview", 60), (color.still, "still", 95)):
        encoder = pipeline.create(dai.node.VideoEncoder)
        encoder.setDefaultProfilePreset(10, dai.VideoEncoderProperties.Profile.MJPEG)
        encoder.setQuality(quality)
        encoder.input.setQueueSize(1)
        encoder.input.setBlocking(False)
        source.link(encoder.input)
        encoder.bitstream.link(server.inputs[name])

    info = {"protocol": "depth-camera-oak-v1", "sensor": sensor,
            "deviceId": device_id, "colorWidth": width, "colorHeight": height,
            "previewWidth": 1280, "previewHeight": 720,
            "depthWidth": 1280, "depthHeight": 800}
    script = Path(__file__).with_name("camera_server.py").read_text(encoding="utf-8")
    server.setScript("INFO = " + repr(info) + "\nPORT = " + str(port) + "\n" + script)
    return pipeline, info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ip", required=True, help="Reachable camera IP address")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--sensor", choices=("IMX378", "OV9782"), help="Required with --flash; otherwise auto-detected")
    parser.add_argument("--flash", action="store_true", help="Replace the existing camera startup application")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    import depthai as dai
    if not dai.__version__.startswith("2."):
        parser.error("Use DepthAI v2 from tools/oak/requirements.txt")
    device_info = dai.DeviceInfo(args.ip)
    if args.flash:
        if not args.sensor:
            parser.error("Run without --flash first to identify the sensor, then specify --sensor")
        pipeline, info = build_pipeline(dai, args.sensor, args.port, args.ip)
        with dai.DeviceBootloader(device_info) as bootloader:
            success, error = bootloader.flash(pipeline)
            if not success:
                raise RuntimeError(error)
        print("Startup application installed. Power-cycle the camera.")
        print(json.dumps(info, indent=2))
    else:
        with dai.Device(device_info) as device:
            sensor = device.getCameraSensorNames().get(dai.CameraBoardSocket.CAM_A, "")
            if args.sensor and args.sensor != sensor:
                raise RuntimeError("Selected sensor differs from detected sensor: " + sensor)
            pipeline, info = build_pipeline(dai, sensor, args.port, device.getMxId())
            device.startPipeline(pipeline)
            print(json.dumps(info, indent=2))
            print("Connect the APK to http://" + args.ip + ":" + str(args.port))
            print("Temporary session: keep this process running. Ctrl+C stops it.")
            while not device.isClosed():
                time.sleep(1)


if __name__ == "__main__":
    main()

import argparse
import json
import sys
import time
from pathlib import Path


def save_image(image, output_dir, prefix):
    timestamp = int(time.time() * 1000)

    try:
        import cv2

        filename = f"{prefix}-{timestamp}.jpg"
        output_path = output_dir / filename
        cv2.imwrite(str(output_path), image)
        return filename
    except Exception:
        pass

    try:
        from PIL import Image

        filename = f"{prefix}-{timestamp}.jpg"
        output_path = output_dir / filename
        rgb_image = image[:, :, ::-1]
        Image.fromarray(rgb_image).save(output_path, quality=92)
        return filename
    except Exception:
        pass

    filename = f"{prefix}-{timestamp}.ppm"
    output_path = output_dir / filename
    rgb_image = image[:, :, ::-1]
    height, width, _channels = rgb_image.shape
    with output_path.open("wb") as file:
        file.write(f"P6\n{width} {height}\n255\n".encode("ascii"))
        file.write(rgb_image.tobytes())
    return filename


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--prefix", default="depth-camera")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--warmup-frames", type=int, default=15)
    args = parser.parse_args()

    try:
        import numpy as np
        import pyrealsense2 as rs
    except Exception as exc:
        raise RuntimeError(
            "Intel RealSense SDK Python bindings are not installed. Install librealsense and pyrealsense2."
        ) from exc

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    pipeline = rs.pipeline()
    config = rs.config()
    config.enable_stream(rs.stream.color, args.width, args.height, rs.format.bgr8, args.fps)
    config.enable_stream(rs.stream.depth, args.width, args.height, rs.format.z16, args.fps)

    profile = pipeline.start(config)
    try:
        for _ in range(args.warmup_frames):
            pipeline.wait_for_frames()

        frames = pipeline.wait_for_frames()
        color_frame = frames.get_color_frame()
        depth_frame = frames.get_depth_frame()

        if not color_frame or not depth_frame:
            raise RuntimeError("Depth camera did not return both color and depth frames.")

        color_image = np.asanyarray(color_frame.get_data())
        filename = save_image(color_image, output_dir, args.prefix)

        device = profile.get_device()
        depth_sensor = device.first_depth_sensor()
        color_profile = color_frame.profile.as_video_stream_profile()
        depth_profile = depth_frame.profile.as_video_stream_profile()

        result = {
            "success": True,
            "filename": filename,
            "metadata": {
                "cameraName": device.get_info(rs.camera_info.name),
                "serialNumber": device.get_info(rs.camera_info.serial_number),
                "firmwareVersion": device.get_info(rs.camera_info.firmware_version),
                "depthScale": depth_sensor.get_depth_scale(),
                "colorWidth": color_profile.width(),
                "colorHeight": color_profile.height(),
                "depthWidth": depth_profile.width(),
                "depthHeight": depth_profile.height(),
                "fps": args.fps,
                "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        }
        print(json.dumps(result))
    finally:
        pipeline.stop()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}))
        sys.exit(1)

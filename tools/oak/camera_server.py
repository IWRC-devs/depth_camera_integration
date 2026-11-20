"""Runs on the OAK's LEON_CSS processor, not on the phone or setup computer.

The setup program prepends INFO and PORT. Frame processing/encoding stays in
DepthAI hardware; this script only transports frames over HTTP.
"""
import base64
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


def next_frame(name, timeout=8):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        frame = node.inputs[name].tryGet()
        if frame is not None:
            return frame
        time.sleep(0.01)
    raise RuntimeError("Timed out waiting for " + name)


def encoded(frame):
    return base64.b64encode(bytes(frame.getData())).decode("ascii")


def depth_payload(frame):
    return {"depth": encoded(frame), "depthWidth": frame.getWidth(),
            "depthHeight": frame.getHeight()}


class CameraHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, value):
        payload = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self):
        try:
            if self.path == "/health":
                self.reply(200, dict(INFO, success=True))
            elif self.path == "/preview/rgb":
                self.reply(200, {"success": True, "jpeg": encoded(next_frame("preview"))})
            elif self.path == "/preview/depth":
                self.reply(200, dict(depth_payload(next_frame("depth")), success=True))
            else:
                self.reply(404, {"success": False, "error": "Unknown endpoint"})
        except Exception as error:
            self.reply(503, {"success": False, "error": str(error)})

    def do_POST(self):
        if self.path != "/capture":
            self.reply(404, {"success": False, "error": "Unknown endpoint"})
            return
        try:
            # Discard an abandoned request's JPEG before triggering another still.
            while node.inputs["still"].tryGet() is not None:
                pass
            control = CameraControl()
            control.setCaptureStill(True)
            node.outputs["control"].send(control)
            color = next_frame("still")
            depth = next_frame("depth")
            skew_ms = (depth.getTimestampDevice() - color.getTimestampDevice()).total_seconds() * 1000
            if abs(skew_ms) > 250:
                raise RuntimeError("RGB/depth frames were too far apart; please capture again")
            metadata = dict(INFO)
            metadata.update({"colorFormat": "JPEG", "depthFormat": "Z16-LE",
                             "depthUnits": 0.001, "depthAlignedTo": "right-stereo",
                             "rgbDepthSynchronized": False, "rgbDepthSkewMs": skew_ms,
                             "colorSequence": color.getSequenceNum(),
                             "depthSequence": depth.getSequenceNum(),
                             "colorDeviceTimestampSeconds": color.getTimestampDevice().total_seconds(),
                             "depthDeviceTimestampSeconds": depth.getTimestampDevice().total_seconds()})
            self.reply(200, dict(depth_payload(depth), success=True,
                                 jpeg=encoded(color), metadata=metadata))
        except Exception as error:
            self.reply(503, {"success": False, "error": str(error)})


HTTPServer(("0.0.0.0", PORT), CameraHandler).serve_forever()

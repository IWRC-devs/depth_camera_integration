"""Protocol/error tests with simulated camera frames; no hardware required."""
import base64
from collections import deque
from datetime import timedelta
from pathlib import Path
import unittest
from unittest.mock import patch


class Frame:
    def __init__(self, data=b"\x01\x00\x02\x00", timestamp=1):
        self.data = data
        self.timestamp = timestamp

    def getData(self): return self.data
    def getWidth(self): return 2
    def getHeight(self): return 1
    def getTimestampDevice(self): return timedelta(seconds=self.timestamp)
    def getSequenceNum(self): return 42


class Queue:
    def __init__(self, *frames): self.frames = deque(frames)
    def tryGet(self): return self.frames.popleft() if self.frames else None


class Control:
    def setCaptureStill(self, value): self.capture = value


class Output:
    def send(self, value): self.value = value


class Node:
    def __init__(self):
        self.inputs = {"preview": Queue(), "still": Queue(), "depth": Queue()}
        self.outputs = {"control": Output()}


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.node = Node()
        self.scope = {"INFO": {"protocol": "depth-camera-oak-v1", "sensor": "IMX378"},
                      "PORT": 8080, "node": self.node, "CameraControl": Control}
        source = Path(__file__).with_name("camera_server.py")
        with patch("http.server.HTTPServer"):
            exec(compile(source.read_text(encoding="utf-8"), str(source), "exec"), self.scope)
        self.handler = self.scope["CameraHandler"].__new__(self.scope["CameraHandler"])
        self.handler.reply = lambda status, value: setattr(self, "response", (status, value))

    def test_health_identifies_protocol(self):
        self.handler.path = "/health"
        self.handler.do_GET()
        self.assertEqual(self.response[1]["protocol"], "depth-camera-oak-v1")

    def test_depth_preview_preserves_z16_bytes(self):
        self.node.inputs["depth"] = Queue(Frame())
        self.handler.path = "/preview/depth"
        self.handler.do_GET()
        self.assertEqual(base64.b64decode(self.response[1]["depth"]), b"\x01\x00\x02\x00")
        self.assertEqual(self.response[1]["depthWidth"], 2)

    def test_capture_discards_old_still_and_records_skew(self):
        self.node.inputs["still"] = Queue(Frame(b"stale"), None, Frame(b"fresh"))
        self.node.inputs["depth"] = Queue(Frame(timestamp=1.1))
        self.handler.path = "/capture"
        self.handler.do_POST()
        self.assertEqual(self.response[0], 200)
        self.assertEqual(base64.b64decode(self.response[1]["jpeg"]), b"fresh")
        self.assertTrue(self.node.outputs["control"].value.capture)
        self.assertAlmostEqual(self.response[1]["metadata"]["rgbDepthSkewMs"], 100)
        self.assertFalse(self.response[1]["metadata"]["rgbDepthSynchronized"])

    def test_capture_rejects_stale_depth(self):
        self.node.inputs["still"] = Queue(None, Frame())
        self.node.inputs["depth"] = Queue(Frame(timestamp=2))
        self.handler.path = "/capture"
        self.handler.do_POST()
        self.assertEqual(self.response[0], 503)
        self.assertFalse(self.response[1]["success"])

    def test_unknown_route(self):
        self.handler.path = "/other"
        self.handler.do_GET()
        self.assertEqual(self.response[0], 404)

    def test_missing_frame_times_out(self):
        with patch.object(self.scope["time"], "monotonic", side_effect=[0, 9]):
            with self.assertRaisesRegex(RuntimeError, "Timed out"):
                self.scope["next_frame"]("depth")


if __name__ == "__main__":
    unittest.main()

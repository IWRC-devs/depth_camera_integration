const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function client(fetch, native = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../oakCamera.ts"), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, fetch, AbortController, setTimeout, clearTimeout,
    require: () => ({ Platform: { OS: "android" }, NativeModules: { DepthCamera: native } }),
  });
  return exports;
}
const response = (body, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });

test("address validation rejects paths and credentials", () => {
  const api = client();
  assert.equal(api.oakBaseUrl(" http://10.95.76.11:8080/ "), "http://10.95.76.11:8080");
  for (const address of ["10.95.76.11", "http://camera/capture", "http://user@camera", "file://camera"]) {
    assert.throws(() => api.oakBaseUrl(address));
  }
});

test("connection rejects another camera service's health response", async () => {
  const api = client(async () => response({ success: true, protocol: "another-app" }));
  await assert.rejects(api.connectOakCamera("http://camera:8080"), /not running/);
});

test("capture persists both files locally and keeps native dimensions and paths", async () => {
  let saved;
  const api = client(async (url, options) => {
    assert.equal(url, "http://camera:8080/capture");
    assert.equal(options.method, "POST");
    return response({ success: true, jpeg: "jpeg", depth: "depth", depthWidth: 1280, depthHeight: 800,
      metadata: { sensor: "IMX378", colorWidth: 4056 } });
  }, { saveOakCapture: async (...args) => {
    saved = args;
    return { success: true, imageUrl: "content://color", depthRawUrl: "content://depth",
      metadata: { colorWidth: 4032, colorPath: "Documents/color.jpg" } };
  } });
  const result = await api.captureOakCamera("http://camera:8080", "batch");
  assert.deepEqual(Array.from(saved), ["batch", "jpeg", "depth", 1280, 800]);
  assert.equal(result.imageUrl, "content://color");
  assert.equal(result.metadata.colorWidth, 4032);
  assert.equal(result.metadata.sensor, "IMX378");
  assert.equal(result.metadata.cameraType, "oak-d");
});

test("incomplete capture and camera errors never write files", async () => {
  let saves = 0;
  const native = { saveOakCapture: async () => { saves++; } };
  const incomplete = client(async () => response({ success: true, jpeg: "jpeg" }), native);
  await assert.rejects(incomplete.captureOakCamera("http://camera", "batch"), /both color and depth/);
  const failed = client(async () => response({ success: false, error: "frames too far apart" }, false), native);
  await assert.rejects(failed.captureOakCamera("http://camera", "batch"), /frames too far apart/);
  assert.equal(saves, 0);
});

test("depth preview uses native Z16 conversion", async () => {
  const api = client(async () => response({ success: true, depth: "depth", depthWidth: 2, depthHeight: 1 }), {
    oakDepthPreview: async (...args) => {
      assert.deepEqual(args, ["depth", 2, 1]);
      return "data:image/png;base64,png";
    },
  });
  assert.equal(await api.previewOakCamera("http://camera", "depth", new AbortController().signal), "data:image/png;base64,png");
});

test("preview cancellation aborts the network request", async () => {
  const controller = new AbortController();
  const api = client((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  }));
  const request = api.previewOakCamera("http://camera", "rgb", controller.signal);
  controller.abort();
  await assert.rejects(request, /aborted/);
});

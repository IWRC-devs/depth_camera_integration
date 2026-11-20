import { NativeModules, Platform } from "react-native";
import type { DepthCameraCapture } from "./depthCamera";

export type OakInfo = { protocol: string; sensor: string; colorWidth: number; colorHeight: number };
type OakFrame = { success: boolean; jpeg?: string; depth?: string; depthWidth?: number; depthHeight?: number; metadata?: Record<string, unknown>; error?: string };
const storage = NativeModules.DepthCamera as {
  saveOakCapture?: (name: string, jpeg: string, depth: string, width: number, height: number) => Promise<DepthCameraCapture>;
  oakDepthPreview?: (depth: string, width: number, height: number) => Promise<string>;
};

export function oakBaseUrl(address: string) {
  const value = address.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s?#@]+$/i.test(value)) {
    throw new Error("Enter the camera address, including http:// and port, for example http://10.95.76.11:8080.");
  }
  return value;
}

async function request<T>(address: string, path: string, signal?: AbortSignal, method = "GET"): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, path === "/capture" ? 30000 : 10000);
  try {
    const response = await fetch(`${oakBaseUrl(address)}${path}`, { method, signal: controller.signal });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || `OAK request failed (${response.status}).`);
    return body;
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`OAK connection: ${error instanceof Error ? error.message : "request failed"} Check camera power, network, and the OAK pipeline setup.`);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function connectOakCamera(address: string, signal?: AbortSignal) {
  const info = await request<OakInfo>(address, "/health", signal);
  if (info.protocol !== "depth-camera-oak-v1") throw new Error("This address is not running the app's OAK pipeline. See docs/oak-camera.md.");
  return info;
}

export async function previewOakCamera(address: string, mode: "rgb" | "depth", signal: AbortSignal) {
  const frame = await request<OakFrame>(address, `/preview/${mode}`, signal);
  if (mode === "rgb" && frame.jpeg) return `data:image/jpeg;base64,${frame.jpeg}`;
  if (frame.depth && storage?.oakDepthPreview) {
    return storage.oakDepthPreview(frame.depth, frame.depthWidth!, frame.depthHeight!);
  }
  throw new Error("OAK preview data is unavailable. Install the updated Android APK.");
}

export async function captureOakCamera(address: string, name: string) {
  if (Platform.OS !== "android" || !storage?.saveOakCapture) throw new Error("OAK capture requires the updated Android APK.");
  const frame = await request<OakFrame>(address, "/capture", undefined, "POST");
  if (!frame.jpeg || !frame.depth) throw new Error("OAK capture did not include both color and depth data.");
  const saved = await storage.saveOakCapture(name, frame.jpeg, frame.depth, frame.depthWidth!, frame.depthHeight!);
  return { ...saved, metadata: { ...frame.metadata, ...saved.metadata, cameraType: "oak-d", cameraAddress: oakBaseUrl(address), capturedAt: new Date().toISOString() } };
}

import { DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";

export type DepthCameraCapture = {
  success: boolean;
  imageUrl: string;
  depthRawUrl?: string;
  depthPreviewUrl?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

type DepthCameraNativeModule = {
  capture: (collectionName?: string) => Promise<DepthCameraCapture>;
  preview?: (collectionName?: string) => Promise<DepthCameraCapture>;
  startPreview?: (collectionName?: string) => Promise<boolean>;
  stopPreview?: () => Promise<boolean>;
};

const nativeDepthCamera = NativeModules.DepthCamera as DepthCameraNativeModule | undefined;

export const hasNativeDepthCamera = () => Platform.OS === "android" && Boolean(nativeDepthCamera?.capture);

export async function requestDepthCameraPermission(
  message = "Camera permission is required for Intel RealSense capture."
) {
  if (Platform.OS !== "android") return;

  const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error(message);
  }
}

export async function captureNativeDepthCamera(collectionName?: string) {
  if (!nativeDepthCamera?.capture) {
    throw new Error("Native RealSense depth camera module is not available in this APK.");
  }

  await requestDepthCameraPermission();
  return nativeDepthCamera.capture(collectionName);
}

export async function previewNativeDepthCamera(collectionName?: string) {
  if (!nativeDepthCamera?.preview) {
    throw new Error("Native RealSense depth camera preview is not available in this APK.");
  }

  await requestDepthCameraPermission("Camera permission is required for Intel RealSense preview.");
  return nativeDepthCamera.preview(collectionName);
}

export async function startNativeDepthCameraPreview(collectionName?: string) {
  if (!nativeDepthCamera?.startPreview) {
    throw new Error("Native RealSense depth camera live view is not available in this APK.");
  }

  await requestDepthCameraPermission("Camera permission is required for Intel RealSense live view.");
  return nativeDepthCamera.startPreview(collectionName);
}

export async function stopNativeDepthCameraPreview() {
  if (nativeDepthCamera?.stopPreview) {
    await nativeDepthCamera.stopPreview();
  }
}

export function subscribeNativeDepthCameraPreview(
  onFrame: (uri: string) => void,
  onError: (message: string) => void
) {
  const frameSubscription = DeviceEventEmitter.addListener(
    "DepthCameraPreviewFrame",
    (event: { imageUrl?: string }) => {
      if (event.imageUrl) onFrame(event.imageUrl);
    }
  );
  const errorSubscription = DeviceEventEmitter.addListener(
    "DepthCameraPreviewError",
    (event: { error?: string }) => {
      onError(event.error || "Live camera preview stopped.");
    }
  );

  return () => {
    frameSubscription.remove();
    errorSubscription.remove();
  };
}

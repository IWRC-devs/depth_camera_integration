import { NativeModules, PermissionsAndroid, Platform } from "react-native";

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
};

const nativeDepthCamera = NativeModules.DepthCamera as DepthCameraNativeModule | undefined;

export const hasNativeDepthCamera = () => Platform.OS === "android" && Boolean(nativeDepthCamera?.capture);

export async function captureNativeDepthCamera(collectionName?: string) {
  if (!nativeDepthCamera?.capture) {
    throw new Error("Native RealSense depth camera module is not available in this APK.");
  }

  const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error("Camera permission is required for Intel RealSense capture.");
  }

  return nativeDepthCamera.capture(collectionName);
}

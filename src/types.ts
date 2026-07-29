export type BackgroundType =
  | "fallow"
  | "crop-present"
  | "bare-soil"
  | "crop-residue"
  | "grass-turf"
  | "pasture"
  | "roadside"
  | "greenhouse-pot"
  | "other";

export type WeatherCondition =
  | "sunny"
  | "partly-cloudy"
  | "cloudy"
  | "overcast"
  | "light-rain"
  | "after-rain"
  | "windy"
  | "other";

export interface CaptureRecord {
  id: string;
  createdAt: string;
  observationDate: string;
  latitude: number | null;
  longitude: number | null;
  gpsAccuracyM: number | null;
  weedCommonName: string;
  weedScientificName: string;
  background: BackgroundType;
  weather: WeatherCondition;
  monopodLengthM: number | null;
  tiltFromVerticalDeg: number | null;
  calculatedCameraHeightM: number | null;
  notes: string;
  imageName: string | null;
  imageType: string | null;
  imageBlob: Blob | null;
  cameraSource: "tablet-camera" | "realsense-native" | "none";
}

export interface RealSenseStatus {
  available: boolean;
  connected: boolean;
  model?: string;
  serialNumber?: string;
  firmware?: string;
  usbType?: string;
  message?: string;
}

export interface NativeCaptureResult {
  rgbFileUri: string;
  depthFileUri?: string;
  capturedAt: string;
  model?: string;
  serialNumber?: string;
}

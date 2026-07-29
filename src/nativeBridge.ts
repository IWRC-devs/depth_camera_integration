import type { NativeCaptureResult, RealSenseStatus } from "./types";

declare global {
  interface Window {
    RealSenseBridge?: {
      getStatus: () => Promise<RealSenseStatus>;
      requestUsbPermission?: () => Promise<RealSenseStatus>;
      capture?: () => Promise<NativeCaptureResult>;
    };
  }

  interface Navigator {
    usb?: {
      requestDevice: (options: {
        filters: Array<{ vendorId?: number; productId?: number }>;
      }) => Promise<{
        manufacturerName?: string;
        productName?: string;
        serialNumber?: string;
        vendorId: number;
        productId: number;
      }>;
    };
  }
}

export function nativeBridgeAvailable(): boolean {
  return typeof window.RealSenseBridge?.getStatus === "function";
}

export async function getNativeStatus(): Promise<RealSenseStatus> {
  if (!nativeBridgeAvailable()) {
    return {
      available: false,
      connected: false,
      message: "Native bridge is not present. This is expected in the browser/PWA."
    };
  }

  try {
    return await window.RealSenseBridge!.getStatus();
  } catch (error) {
    return {
      available: true,
      connected: false,
      message: error instanceof Error ? error.message : "Native bridge failed."
    };
  }
}

export function webUsbAvailable(): boolean {
  return typeof navigator.usb?.requestDevice === "function";
}

export async function requestIntelUsbDevice(): Promise<string> {
  if (!webUsbAvailable()) {
    throw new Error("WebUSB is unavailable in this browser.");
  }

  const device = await navigator.usb!.requestDevice({
    filters: [{ vendorId: 0x8086 }]
  });

  const label =
    device.productName ||
    `${device.vendorId.toString(16)}:${device.productId.toString(16)}`;

  return `Browser detected: ${label}. Detection does not mean RealSense streaming is supported.`;
}

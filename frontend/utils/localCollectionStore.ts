import * as FileSystem from "expo-file-system/legacy";
import { NativeModules, Platform } from "react-native";

const collectionsDir = `${FileSystem.documentDirectory ?? ""}collections`;

type NativeJsonSaveResult = {
  success: boolean;
  uri?: string;
  path?: string;
  saveFolder?: string;
};

type DepthCameraNativeModule = {
  saveCollectionJson?: (collectionName: string, json: string) => Promise<NativeJsonSaveResult>;
};

const nativeDepthCamera = NativeModules.DepthCamera as DepthCameraNativeModule | undefined;

async function ensureCollectionsDir() {
  if (!FileSystem.documentDirectory) {
    throw new Error("Local document storage is not available on this device.");
  }

  const info = await FileSystem.getInfoAsync(collectionsDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(collectionsDir, { intermediates: true });
  }
}

export async function saveCollectionJson(record: Record<string, unknown>) {
  const id = String(record.id ?? record.name ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const publicSaveFolder = `Documents/depth_camera_images/${safeName(id)}`;
  const publicJsonPath = `${publicSaveFolder}/${safeName(id)}.json`;
  const savedRecord = {
    ...record,
    id,
    savedAt: new Date().toISOString(),
    storage: "tablet-local-json",
    saveFolder: publicSaveFolder,
    jsonPath: publicJsonPath,
  };

  if (Platform.OS === "android" && nativeDepthCamera?.saveCollectionJson) {
    const savedJson = JSON.stringify(
      {
        ...savedRecord,
        storage: "documents-depth-camera-images",
      },
      null,
      2
    );
    const nativeResult = await nativeDepthCamera.saveCollectionJson(id, savedJson);
    return {
      id,
      uri: nativeResult.uri,
      path: nativeResult.path ?? publicJsonPath,
      saveFolder: nativeResult.saveFolder ?? publicSaveFolder,
      record: {
        ...savedRecord,
        storage: "documents-depth-camera-images",
        jsonUri: nativeResult.uri,
        jsonPath: nativeResult.path ?? publicJsonPath,
        saveFolder: nativeResult.saveFolder ?? publicSaveFolder,
      },
    };
  }

  await ensureCollectionsDir();
  const path = `${collectionsDir}/${id}.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(savedRecord, null, 2));
  return { id, path, saveFolder: collectionsDir, record: savedRecord };
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-") || "collection";
}

import * as FileSystem from "expo-file-system/legacy";

const collectionsDir = `${FileSystem.documentDirectory ?? ""}collections`;

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
  await ensureCollectionsDir();
  const id = String(record.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const savedRecord = {
    ...record,
    id,
    savedAt: new Date().toISOString(),
    storage: "tablet-local-json",
  };
  const path = `${collectionsDir}/${id}.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(savedRecord, null, 2));
  return { id, path, record: savedRecord };
}

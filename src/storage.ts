import { openDB } from "idb";
import type { CaptureRecord } from "./types";

const DATABASE_NAME = "weed-field-capture";
const STORE_NAME = "captures";
const DATABASE_VERSION = 1;

const databasePromise = openDB(DATABASE_NAME, DATABASE_VERSION, {
  upgrade(database) {
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    }
  }
});

export async function saveCapture(record: CaptureRecord): Promise<void> {
  const database = await databasePromise;
  await database.put(STORE_NAME, record);
}

export async function listCaptures(): Promise<CaptureRecord[]> {
  const database = await databasePromise;
  const records = await database.getAll(STORE_NAME);
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteCapture(id: string): Promise<void> {
  const database = await databasePromise;
  await database.delete(STORE_NAME, id);
}

export async function clearCaptures(): Promise<void> {
  const database = await databasePromise;
  await database.clear(STORE_NAME);
}

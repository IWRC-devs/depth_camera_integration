import botanicalName from "@/assets/data/botanical-name.json";
import * as FileSystem from "expo-file-system/legacy";

export type PlantNameOption = {
  id: number;
  name: string;
};

const plantNamesPath = `${FileSystem.documentDirectory ?? ""}plant-names.json`;

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function dedupeNames(names: PlantNameOption[]) {
  const seen = new Set<string>();
  return names.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getPlantNames() {
  const builtInNames = botanicalName as PlantNameOption[];
  if (!FileSystem.documentDirectory) {
    return builtInNames;
  }

  try {
    const info = await FileSystem.getInfoAsync(plantNamesPath);
    if (!info.exists) {
      return builtInNames;
    }

    const stored = JSON.parse(await FileSystem.readAsStringAsync(plantNamesPath)) as PlantNameOption[];
    return dedupeNames([...builtInNames, ...stored]);
  } catch {
    return builtInNames;
  }
}

export async function savePlantName(name: string, currentNames: PlantNameOption[] = []) {
  const normalized = normalizeName(name);
  if (!normalized || !FileSystem.documentDirectory) {
    return currentNames;
  }

  const existing = currentNames.some((item) => item.name.toLowerCase() === normalized.toLowerCase());
  const nextNames = existing
    ? currentNames
    : [...currentNames, { id: Date.now(), name: normalized }];

  await FileSystem.writeAsStringAsync(plantNamesPath, JSON.stringify(dedupeNames(nextNames), null, 2));
  return nextNames;
}

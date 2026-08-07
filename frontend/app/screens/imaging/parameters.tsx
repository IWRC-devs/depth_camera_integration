import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { ActivityIndicator, ScrollView, useColorScheme, View, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createNewCollection, useCollection } from "@/context/CollectionContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { getLightingFromFile } from "@/data/lighting";
import { getPlantNames, savePlantName, PlantNameOption } from "@/utils/plantNameStore";

export default function ParametersScreen() {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === "dark" ? "#1D3D47" : "#A1CEDC";
  const router = useRouter();
  const { collectionData, setCollectionData } = useCollection();

  const weedBackgroundOptions = ["Soil", "Crop", "Weeds"];
  const growthStageOptions = ["Vegetative", "Flowering", "Matured"];
  const soilColorOptions = ["Black", "Brown", "Grey", "Pale Bleached", "Red", "Yellow Brown"];
  const [weedBackground, setWeedBackground] = useState<string | null>(null);
  const [growthStage, setGrowthStage] = useState<string | null>(null);
  const [soilColor, setSoilColor] = useState<string | null>(null);
  const [botanicalName, setBotanicalName] = useState("");
  const [botanicalOptions, setBotanicalOptions] = useState<PlantNameOption[]>([]);
  const [lighting, setLighting] = useState<{ id: number; name: string }[]>([]);
  const [selectedLightingId, setSelectedLighting] = useState<number | null>(
    collectionData?.lightingId ?? null
  );
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [plantNameData, lightingData] = await Promise.all([
          getPlantNames(),
          getLightingFromFile(),
        ]);
        setBotanicalOptions(plantNameData);
        setLighting(lightingData);
      } catch (err) {
        console.error("Error loading parameter options:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // =========================
  // FILTERED LIST (AUTOCOMPLETE)
  // =========================
  const filteredOptions =
    botanicalName.length === 0
      ? botanicalOptions
      : botanicalOptions.filter((item) =>
        item.name.toLowerCase().includes(botanicalName.toLowerCase())
      );


  // =========================
  // SELECT OPTION
  // =========================
  const selectBotanical = (name: string) => {
    setBotanicalName(name);
    setShowDropdown(false);
  };

  const ensureBotanicalExists = async (name: string) => {
    const updated = await savePlantName(name, botanicalOptions);
    setBotanicalOptions(updated);
  };

  // =========================
  // CONTINUE
  // =========================
  const onContinue = async () => {
    if (!weedBackground || !growthStage || !soilColor || !botanicalName || selectedLightingId === null) {
      return;
    }

    await ensureBotanicalExists(botanicalName);

    setCollectionData({
      ...(collectionData ?? createNewCollection()),
      weedBackground,
      growthStage,
      soilColor,
      botanicalName,
      lightingId: selectedLightingId,
    });
    router.push("../../screens/imaging/capture-image");
  };

  const renderList = (
    items: string[],
    selected: string | null,
    onSelect: (item: string) => void
  ) => {
    return items.map((item) => (
      <TouchableOpacity
        key={item}
        style={[styles.item, selected === item && styles.selectedItem]}
        onPress={() => onSelect(item)}
      >
        <ThemedText style={[styles.itemText, selected === item && styles.selectedText]}>
          {item}
        </ThemedText>
        {selected === item && (
          <Ionicons
            name="checkmark-circle"
            size={30}
            color="black"
            style={{ marginLeft: 8 }}
          />
        )}
      </TouchableOpacity>
    ));
  };

  // =========================
  // UI
  // =========================
  if (loading) {
    return (
      <ActivityIndicator
        size="large"
        color="#ffffff"
        style={{ flex: 1, justifyContent: "center" }}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ThemedView style={[styles.titleContainer, { backgroundColor }]}>
        <ThemedText type="title" style={styles.title}>
          Step 1: Parameters
        </ThemedText>
      </ThemedView>
      <View style={{ flex: 1, padding: 16 }}>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 60, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}>
          {/* ================= PLANT NAME ================= */}
          <ThemedText style={styles.label}>Plant Name</ThemedText>

          <TextInput
            value={botanicalName}
            onChangeText={(text) => {
              setBotanicalName(text);
              setShowDropdown(true);
            }}
            placeholder="What are you imaging?"
            placeholderTextColor="#6B7280"
            style={styles.input}
            onFocus={() => setShowDropdown(true)}
            onEndEditing={() => ensureBotanicalExists(botanicalName)}
          />

          {showDropdown && filteredOptions.length > 0 && (
            <View style={styles.dropdown}>
              {filteredOptions.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.dropdownItem}
                  onPress={() => selectBotanical(item.name)}
                >
                  <ThemedText>{item.name}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.container}>
            <ThemedText style={[styles.label, { marginTop: 20 }]}>Background of targeted plant</ThemedText>
            {renderList(weedBackgroundOptions, weedBackground, setWeedBackground)}

            {/* ================= Growth Stage ================= */}
            <ThemedText style={[styles.label, { marginTop: 20 }]}>
              Growth Stage
            </ThemedText>
            {renderList(growthStageOptions, growthStage, setGrowthStage)}

            {/* ================= Soil Color ================= */}
            <ThemedText style={[styles.label, { marginTop: 20 }]}>
              Soil Color
            </ThemedText>
            {renderList(soilColorOptions, soilColor, setSoilColor)}

            <ThemedText style={[styles.label, { marginTop: 20 }]}>
              Lighting
            </ThemedText>
            {lighting.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.item, selectedLightingId === opt.id && styles.selectedItem]}
                onPress={() => setSelectedLighting(opt.id)}
              >
                <ThemedText
                  style={[
                    styles.itemText,
                    selectedLightingId === opt.id && styles.selectedText,
                  ]}
                >
                  {opt.name}
                </ThemedText>
                {selectedLightingId === opt.id && (
                  <Ionicons
                    name="checkmark-circle"
                    size={30}
                    color="black"
                    style={{ marginLeft: 8 }}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        {(weedBackground && growthStage && soilColor && botanicalName && selectedLightingId !== null) && (
          <SafeAreaView
            edges={[]}
            style={{ paddingHorizontal: 0, paddingTop: 20, paddingBottom: 12 }}>
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => onContinue()}
            >
              <ThemedText style={styles.continueButtonText}>Continue to Take Photos</ThemedText>
            </TouchableOpacity>
          </SafeAreaView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 5,
  },
  container: { padding: 0, flexGrow: 1 },
  titleContainer: { padding: 10, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 16, marginBottom: 5 },
  item: {
    padding: 16,
    marginVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between", // pushes icon to the right
  },
  selectedItem: { backgroundColor: "#607D8B" }, // red variant
  itemText: { fontSize: 18, color: "#333" },
  selectedText: { color: "#fff", fontWeight: "bold" },
  continueButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    color: "#111827",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    fontSize: 16,
  },

  dropdown: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginTop: 5,
    maxHeight: 180,
  },

  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
});

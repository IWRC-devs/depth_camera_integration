import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { API_BASE_URL } from "@/constants/Config";
import { createNewCollection, ImageItem, useCollection } from "@/context/CollectionContext";
import { captureNativeDepthCamera, hasNativeDepthCamera } from "@/utils/depthCamera";
import { saveCollectionJson } from "@/utils/localCollectionStore";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import uuid from "react-native-uuid";

export default function CaptureImageScreen() {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === "dark" ? "#1D3D47" : "#A1CEDC";
  const { collectionData, setCollectionData } = useCollection();
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const capturedImages = collectionData?.images ?? [];

  if (!collectionData) return <ThemedText>No metadata available. Please go back.</ThemedText>;

  const handleCapture = async () => {
    try {
      setCapturing(true);
      const result = hasNativeDepthCamera()
        ? await captureNativeDepthCamera(collectionData.name)
        : await captureViaBackend(collectionData.name);

      if (!result.success) {
        throw new Error(result.error || "Depth camera capture failed.");
      }

      const newImage: ImageItem = {
        id: uuid.v4() as string,
        uri: result.imageUrl,
        source: "depth-camera",
        metadata: {
          ...(result.metadata ?? {}),
          depthRawUrl: result.depthRawUrl,
          depthPreviewUrl: result.depthPreviewUrl,
        },
      };
      setCollectionData({
        ...collectionData,
        images: [...capturedImages, newImage].slice(0, 500),
      });
    } catch (err: any) {
      Alert.alert("Depth Camera", err.message || "Unable to capture image.");
    } finally {
      setCapturing(false);
    }
  };

  const removeImage = (id: string) => {
    setCollectionData({
      ...collectionData,
      images: capturedImages.filter((img) => img.id !== id),
    });
  };

  const clearAll = () => {
    setCollectionData({ ...collectionData, images: [] });
  };

  const handleSaveCollection = async () => {
    if (capturedImages.length === 0) {
      Alert.alert("Please take at least one photo.");
      return;
    }

    try {
      setSaving(true);
      if (capturedImages.some((img) => img.source === "depth-camera")) {
        const saved = await saveCollectionJson({
          name: collectionData.name,
          metadata: {
            affiliationId: collectionData.affiliationId ?? null,
            botanicalName: collectionData.botanicalName ?? null,
            weedBackground: collectionData.weedBackground ?? null,
            growthStage: collectionData.growthStage ?? null,
            soilColor: collectionData.soilColor ?? null,
            lightingId: collectionData.lightingId ?? null,
          },
          images: capturedImages,
        });
        Alert.alert("Saved", `Collection saved locally: ${saved.id}`);
        setCollectionData(createNewCollection());
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/collections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: collectionData.name,
          affiliation_id: collectionData.affiliationId ?? "",
          botanical_name: collectionData.botanicalName ?? "",
          weed_background: collectionData.weedBackground ?? "",
          growth_stage: collectionData.growthStage ?? "",
          soil_color: collectionData.soilColor ?? "",
          lighting_id: collectionData.lightingId ?? "",
          captured_image_urls: JSON.stringify(capturedImages.map((img) => img.uri)),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to save collection.");
      }

      Alert.alert("Saved", `Collection saved locally with ID: ${result.collectionId}`);
      setCollectionData(createNewCollection());
    } catch (err: any) {
      Alert.alert("Save Failed", err.message || "Server or network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={[styles.titleContainer, { backgroundColor }]}>
        <ThemedText type="title" style={styles.title}>
          Step 2: Take Photos
        </ThemedText>
      </ThemedView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <TouchableOpacity
          style={[styles.cameraButton, capturing && styles.disabledButton]}
          onPress={handleCapture}
          disabled={capturing}
        >
          {capturing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <MaterialIcons name="linked-camera" size={56} color="#fff" />
          )}
          <ThemedText style={styles.cameraButtonText}>
            {capturing ? "Capturing..." : "Take Depth Camera Photo"}
          </ThemedText>
        </TouchableOpacity>

        {capturedImages.length > 0 && (
          <>
            <ThemedText style={styles.heading}>Photos ({capturedImages.length})</ThemedText>
            <View style={styles.grid}>
              {capturedImages.map((item) => (
                <View key={item.id} style={styles.imageWrapper}>
                  <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                  <TouchableOpacity style={styles.removeButton} onPress={() => removeImage(item.id)}>
                    <Ionicons name="close-circle" size={24} color="red" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.continueButton, saving && styles.disabledButton]}
              onPress={handleSaveCollection}
              disabled={saving}
            >
              <ThemedText style={styles.continueButtonText}>
                {saving ? "Saving..." : "Save Collection"}
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.clearButton} onPress={clearAll}>
              <ThemedText style={styles.clearButtonText}>Clear All</ThemedText>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  cameraButton: {
    minHeight: 150,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "grey",
    borderStyle: "dashed",
    backgroundColor: "#1F6F8B",
    padding: 16,
  },
  disabledButton: {
    opacity: 0.7,
  },
  cameraButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  heading: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  imageWrapper: {
    position: "relative",
    width: 100,
    height: 100,
    margin: 6,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  removeButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "white",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  continueButton: {
    marginTop: 12,
    backgroundColor: "#4CAF50",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  continueButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  clearButton: {
    borderColor: "red",
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  clearButtonText: {
    color: "red",
    fontWeight: "bold",
  },
});

async function captureViaBackend(collectionName: string) {
  const response = await fetch(`${API_BASE_URL}/api/depth-camera/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collectionName }),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Depth camera capture failed.");
  }

  return result;
}

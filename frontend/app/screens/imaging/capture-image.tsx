import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { API_BASE_URL } from "@/constants/Config";
import { createNewCollection, ImageItem, useCollection } from "@/context/CollectionContext";
import {
  captureNativeDepthCamera,
  hasNativeDepthCamera,
  startNativeDepthCameraPreview,
  stopNativeDepthCameraPreview,
  subscribeNativeDepthCameraPreview,
} from "@/utils/depthCamera";
import { saveCollectionJson } from "@/utils/localCollectionStore";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
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
  const [streaming, setStreaming] = useState(false);
  const [livePreviewUri, setLivePreviewUri] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [featuredImageUri, setFeaturedImageUri] = useState<string | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const featuredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturedImages = collectionData?.images ?? [];

  useEffect(() => {
    if (!collectionData || !hasNativeDepthCamera()) {
      return;
    }

    let active = true;
    const unsubscribe = subscribeNativeDepthCameraPreview(
      (uri) => {
        if (active) {
          setLivePreviewUri(uri);
          setPreviewError(null);
          setStreaming(true);
        }
      },
      (message) => {
        if (active) {
          setPreviewError(message);
          setStreaming(false);
        }
      }
    );

    const startStream = async () => {
      try {
        await startNativeDepthCameraPreview(collectionData.name);
        if (active) {
          setStreaming(true);
        }
      } catch (err: any) {
        if (active) {
          setPreviewError(err.message || "Live camera preview is unavailable.");
          setStreaming(false);
        }
      }
    };

    startStream();

    return () => {
      active = false;
      unsubscribe();
      stopNativeDepthCameraPreview().catch(() => {});
    };
  }, [collectionData?.name]);

  useEffect(() => {
    return () => {
      if (featuredTimer.current) {
        clearTimeout(featuredTimer.current);
      }
    };
  }, []);

  if (!collectionData) return <ThemedText>No metadata available. Please go back.</ThemedText>;

  const showFeaturedCapture = (uri: string) => {
    setFeaturedImageUri(uri);
    if (featuredTimer.current) {
      clearTimeout(featuredTimer.current);
    }
    featuredTimer.current = setTimeout(() => {
      setFeaturedImageUri(null);
    }, 2000);
  };

  const handleCapture = async () => {
    try {
      setCapturing(true);
      if (hasNativeDepthCamera()) {
        await stopNativeDepthCameraPreview();
        setStreaming(false);
      }
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
      showFeaturedCapture(result.imageUrl);
    } catch (err: any) {
      Alert.alert("Depth Camera", err.message || "Unable to capture image.");
    } finally {
      setCapturing(false);
      if (hasNativeDepthCamera()) {
        startNativeDepthCameraPreview(collectionData.name).catch((err: any) => {
          setPreviewError(err.message || "Live camera preview is unavailable.");
          setStreaming(false);
        });
      }
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
        Alert.alert("Saved", buildSaveMessage(saved.path, capturedImages));
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

      Alert.alert("Saved", `Batch saved locally with ID: ${result.collectionId}`);
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

      <View style={styles.container}>
        <View style={styles.previewPanel}>
          {featuredImageUri ? (
            <Image source={{ uri: featuredImageUri }} style={styles.previewImage} resizeMode="cover" />
          ) : livePreviewUri ? (
            <Image source={{ uri: livePreviewUri }} style={styles.previewImage} resizeMode="cover" />
          ) : (
            <View style={styles.previewPlaceholder}>
              {streaming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <MaterialIcons name="linked-camera" size={52} color="#fff" />
              )}
              <ThemedText style={styles.previewPlaceholderText}>
                {previewError || "Live camera view"}
              </ThemedText>
            </View>
          )}
          <View style={styles.previewBadge}>
            <ThemedText style={styles.previewBadgeText}>
              {featuredImageUri ? "Captured" : streaming ? "Live View" : "Starting Live View"}
            </ThemedText>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.captureButton, capturing && styles.disabledButton]}
          onPress={handleCapture}
          disabled={capturing}
        >
          {capturing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="camera" size={28} color="#fff" />
          )}
          <ThemedText style={styles.captureButtonText}>
            {capturing ? "Capturing..." : "Capture Image"}
          </ThemedText>
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, capturedImages.length === 0 && styles.disabledButton]}
            onPress={() => setReviewOpen(true)}
            disabled={capturedImages.length === 0}
          >
            <ThemedText style={styles.secondaryButtonText}>Preview All Images</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, (saving || capturedImages.length === 0) && styles.disabledButton]}
            onPress={handleSaveCollection}
            disabled={saving || capturedImages.length === 0}
          >
            <ThemedText style={styles.saveButtonText}>{saving ? "Saving..." : "Save"}</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.thumbnailSection}>
          <View style={styles.thumbnailHeader}>
            <ThemedText style={styles.heading}>Images ({capturedImages.length})</ThemedText>
            {capturedImages.length > 0 && (
              <TouchableOpacity onPress={clearAll}>
                <ThemedText style={styles.clearButtonText}>Clear All</ThemedText>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailStrip}
          >
            {capturedImages.length === 0 ? (
              <ThemedText style={styles.emptyText}>Captured images will appear here.</ThemedText>
            ) : (
              capturedImages.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.imageWrapper}
                  onPress={() => setSelectedImageUri(item.uri)}
                >
                  <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                  <View style={styles.indexBadge}>
                    <ThemedText style={styles.indexBadgeText}>{index + 1}</ThemedText>
                  </View>
                  <Pressable style={styles.removeButton} onPress={() => removeImage(item.id)}>
                    <Ionicons name="close-circle" size={24} color="#E53935" />
                  </Pressable>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>

      <ImageModal uri={selectedImageUri} onClose={() => setSelectedImageUri(null)} />
      <ReviewModal
        images={capturedImages}
        visible={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onSelect={(uri) => setSelectedImageUri(uri)}
      />
    </SafeAreaView>
  );
}

function ImageModal({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalClose} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        {uri && <Image source={{ uri }} style={styles.modalImage} resizeMode="contain" />}
      </View>
    </Modal>
  );
}

function ReviewModal({
  images,
  visible,
  onClose,
  onSelect,
}: {
  images: ImageItem[];
  visible: boolean;
  onClose: () => void;
  onSelect: (uri: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.reviewContainer}>
        <View style={styles.reviewHeader}>
          <ThemedText style={styles.reviewTitle}>Preview All Images</ThemedText>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#111" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.reviewGrid}>
          {images.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={styles.reviewItem}
              onPress={() => onSelect(item.uri)}
            >
              <Image source={{ uri: item.uri }} style={styles.reviewImage} />
              <ThemedText style={styles.reviewLabel}>Image {index + 1}</ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  container: {
    flex: 1,
    padding: 14,
    gap: 12,
  },
  previewPanel: {
    flex: 1,
    minHeight: 300,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1F2933",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  previewPlaceholderText: {
    marginTop: 12,
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
  },
  previewBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewBadgeText: {
    color: "#fff",
    fontWeight: "700",
  },
  captureButton: {
    minHeight: 58,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#1F6F8B",
    paddingHorizontal: 16,
  },
  disabledButton: {
    opacity: 0.55,
  },
  captureButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1F6F8B",
    borderRadius: 8,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#1F6F8B",
    fontWeight: "700",
    textAlign: "center",
  },
  saveButton: {
    minWidth: 104,
    backgroundColor: "#4CAF50",
    borderRadius: 8,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  thumbnailSection: {
    minHeight: 122,
  },
  thumbnailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  heading: {
    fontWeight: "bold",
    fontSize: 16,
  },
  thumbnailStrip: {
    minHeight: 92,
    alignItems: "center",
    paddingRight: 16,
  },
  emptyText: {
    opacity: 0.65,
  },
  imageWrapper: {
    position: "relative",
    width: 88,
    height: 88,
    marginRight: 10,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  indexBadge: {
    position: "absolute",
    left: 5,
    bottom: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
  },
  indexBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  removeButton: {
    position: "absolute",
    top: -7,
    right: -7,
    backgroundColor: "#fff",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonText: {
    color: "#E53935",
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalClose: {
    position: "absolute",
    top: 42,
    right: 18,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalImage: {
    width: "96%",
    height: "86%",
  },
  reviewContainer: {
    flex: 1,
    backgroundColor: "#F7FAFC",
  },
  reviewHeader: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#DDE5ED",
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  reviewGrid: {
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  reviewItem: {
    width: "50%",
    padding: 6,
  },
  reviewImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  reviewLabel: {
    marginTop: 6,
    fontWeight: "600",
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

function buildSaveMessage(jsonPath: string, images: ImageItem[]) {
  const firstImagePath = images.find((item) => typeof item.metadata?.colorPath === "string")?.metadata
    ?.colorPath as string | undefined;
  const imageFolder = firstImagePath ? firstImagePath.replace(/[\\/][^\\/]+$/, "") : "Saved with batch JSON";

  return [
    "Batch saved locally.",
    `Batch JSON: ${jsonPath}`,
    `Images: ${imageFolder}`,
  ].join("\n");
}

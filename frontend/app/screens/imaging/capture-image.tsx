import { DepthCameraPreview } from "@/components/DepthCameraPreview";
import { OakCameraPreview } from "@/components/OakCameraPreview";
import { captureOakCamera, connectOakCamera, OakInfo } from "@/utils/oakCamera";
import * as FileSystem from "expo-file-system/legacy";
import { useIsFocused } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { API_BASE_URL } from "@/constants/Config";
import { createNewCollection, ImageItem, useCollection } from "@/context/CollectionContext";
import {
  captureNativeDepthCamera,
  hasNativeDepthCamera,
  requestDepthCameraPermission,
} from "@/utils/depthCamera";
import { saveCollectionJson } from "@/utils/localCollectionStore";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
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
  TextInput,
  View,
} from "react-native";
import uuid from "react-native-uuid";

export default function CaptureImageScreen() {
  const isFocused = useIsFocused();
  const { collectionData, setCollectionData } = useCollection();
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"rgb" | "depth">("rgb");
  const [previewReady, setPreviewReady] = useState(!hasNativeDepthCamera());
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [featuredImageUri, setFeaturedImageUri] = useState<string | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [cameraType, setCameraType] = useState<"realsense" | "oak-d">("realsense");
  const [oakAddress, setOakAddress] = useState("http://10.95.76.11:8080");
  const [oakInfo, setOakInfo] = useState<OakInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const connectionAttempt = useRef(0);
  const oakPreviewError = useCallback((message: string) => setPreviewError(message), []);
  const oakPreviewReady = useCallback(() => setPreviewError(null), []);
  const featuredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturedImages = collectionData?.images ?? [];

  useEffect(() => {
    let mounted = true;
    const path = `${FileSystem.documentDirectory}camera-settings.json`;
    void (async () => {
      try {
        if ((await FileSystem.getInfoAsync(path)).exists) {
          const settings = JSON.parse(await FileSystem.readAsStringAsync(path));
          if (mounted) {
            setCameraType(settings.cameraType === "oak-d" ? "oak-d" : "realsense");
            if (typeof settings.oakAddress === "string") setOakAddress(settings.oakAddress);
          }
        }
      } catch { /* Use defaults if settings cannot be read. */ }
      finally { if (mounted) setSettingsReady(true); }
    })();
    return () => { mounted = false; connectionAttempt.current += 1; };
  }, []);

  useEffect(() => {
    if (!settingsReady || !FileSystem.documentDirectory) return;
    const timer = setTimeout(() => {
      void FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}camera-settings.json`, JSON.stringify({ cameraType, oakAddress })).catch(console.warn);
    }, 400);
    return () => clearTimeout(timer);
  }, [cameraType, oakAddress, settingsReady]);

  const connectOak = async () => {
    const attempt = ++connectionAttempt.current;
    setConnecting(true);
    setOakInfo(null);
    setPreviewError(null);
    try {
      const info = await connectOakCamera(oakAddress);
      if (attempt === connectionAttempt.current) setOakInfo(info);
    } catch (error) {
      if (attempt === connectionAttempt.current) setPreviewError(error instanceof Error ? error.message : "Unable to connect to OAK.");
    } finally {
      if (attempt === connectionAttempt.current) setConnecting(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function preparePreview() {
      setPreviewError(null);
      setPreviewReady(false);
      if (!settingsReady || cameraType === "oak-d") return;
      if (!hasNativeDepthCamera()) {
        setPreviewReady(true);
        return;
      }

      try {
        await requestDepthCameraPermission("Camera permission is required to start the live RealSense view.");
        if (mounted) {
          setPreviewError(null);
          setPreviewReady(true);
        }
      } catch (err: any) {
        if (mounted) {
          setPreviewReady(false);
          setPreviewError(err.message || "Camera permission was not granted.");
        }
      }
    }

    preparePreview();

    return () => {
      mounted = false;
      if (featuredTimer.current) {
        clearTimeout(featuredTimer.current);
      }
    };
  }, [cameraType, settingsReady]);

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
    if (capturedImages.length >= 500) {
      Alert.alert("Batch full", "Save this batch before capturing more images.");
      return;
    }
    try {
      setCapturing(true);
      const nativeCamera = hasNativeDepthCamera();
      const result = cameraType === "oak-d"
        ? await captureOakCamera(oakAddress, collectionData.name)
        : nativeCamera
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
          cameraType,
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
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.titleContainer}>
          <ThemedText type="title" style={styles.title}>Step 2: Take Photos</ThemedText>
      </ThemedView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.cameraSettings}>
          <ThemedText style={styles.cameraLabel}>Camera</ThemedText>
          <View style={styles.actionsRow}>
            {(["realsense", "oak-d"] as const).map((type) => (
              <TouchableOpacity key={type} disabled={capturing || saving || !settingsReady}
                accessibilityRole="radio" accessibilityState={{ checked: cameraType === type }}
                style={[styles.cameraOption, cameraType === type && styles.cameraSelected]}
                onPress={() => {
                  connectionAttempt.current += 1;
                  setConnecting(false); setOakInfo(null); setFeaturedImageUri(null); setPreviewError(null); setCameraType(type);
                }}>
                <ThemedText style={styles.cameraOptionText}>{type === "realsense" ? "RealSense D435i" : "OAK-D PoE"}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          {cameraType === "oak-d" && <>
            <ThemedText style={styles.cameraHelp}>Camera network address</ThemedText>
            <View style={styles.actionsRow}>
              <TextInput accessibilityLabel="OAK camera network address" value={oakAddress} editable={!capturing && !connecting}
                autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.addressInput}
                onChangeText={(value) => { connectionAttempt.current += 1; setOakAddress(value); setOakInfo(null); setPreviewError(null); }} />
              <TouchableOpacity style={styles.cameraOption} onPress={connectOak} disabled={connecting || capturing}>
                <ThemedText style={styles.cameraOptionText}>{connecting ? "Connecting…" : "Connect"}</ThemedText>
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.cameraHelp}>{oakInfo ? `${oakInfo.sensor} · ${oakInfo.colorWidth} × ${oakInfo.colorHeight}` : "Requires the OAK app pipeline and a reachable PoE network."}</ThemedText>
          </>}
        </View>
        <View style={styles.previewPanel}>
          <View style={styles.previewTopBar}>
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[styles.segmentButton, previewMode === "rgb" && styles.segmentButtonActive]}
                onPress={() => setPreviewMode("rgb")}
              >
                <Ionicons name="color-filter" size={16} color={previewMode === "rgb" ? "#08111F" : "#D8E2EA"} />
                <ThemedText style={[styles.segmentText, previewMode === "rgb" && styles.segmentTextActive]}>RGB</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, previewMode === "depth" && styles.segmentButtonActive]}
                onPress={() => setPreviewMode("depth")}
              >
                <MaterialIcons name="layers" size={16} color={previewMode === "depth" ? "#08111F" : "#D8E2EA"} />
                <ThemedText style={[styles.segmentText, previewMode === "depth" && styles.segmentTextActive]}>Depth</ThemedText>
              </TouchableOpacity>
            </View>
            <View style={styles.liveStatus}>
              <View style={[styles.liveDot, (previewError || (cameraType === "oak-d" && !oakInfo)) ? { backgroundColor: "#F59E0B" } : undefined]} />
              <ThemedText style={styles.liveStatusText}>{featuredImageUri ? "Captured" : cameraType === "oak-d" ? oakInfo && !previewError ? "Preview" : "Disconnected" : previewReady ? "Live" : "Preparing"}</ThemedText>
            </View>
          </View>

          {featuredImageUri ? (
            <Image source={{ uri: featuredImageUri }} style={styles.previewImage} resizeMode="cover" />
          ) : cameraType === "oak-d" && oakInfo && !capturing && isFocused ? (
            <OakCameraPreview address={oakAddress} mode={previewMode} style={styles.previewImage} onError={oakPreviewError} onReady={oakPreviewReady} />
          ) : cameraType === "realsense" && hasNativeDepthCamera() && previewReady && isFocused ? (
            <DepthCameraPreview mode={previewMode} style={styles.previewImage} />
          ) : (
            <View style={styles.previewPlaceholder}>
              <MaterialIcons name="linked-camera" size={52} color="#fff" />
              <ThemedText style={styles.previewPlaceholderText}>
                {previewError ?? (cameraType === "oak-d" ? capturing ? "Capturing from OAK…" : "Connect your OAK-D PoE camera above" : "Preparing live RealSense view")}
              </ThemedText>
            </View>
          )}
          {cameraType === "oak-d" && oakInfo && previewError && <ThemedText style={styles.previewError}>{previewError}</ThemedText>}
          <View style={styles.previewBadge}>
            <ThemedText style={styles.previewBadgeText}>
              {featuredImageUri ? "Captured Preview" : previewMode === "depth" ? "Depth Stream" : "RGB Stream"}
            </ThemedText>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.captureButton, capturing && styles.disabledButton]}
          onPress={handleCapture}
          disabled={capturing || !settingsReady || (cameraType === "oak-d" && (!oakInfo || connecting))}
        >
          {capturing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="radio-button-on" size={28} color="#fff" />
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
            <View>
              <ThemedText style={styles.heading}>Captured Images</ThemedText>
              <ThemedText style={styles.subheading}>{capturedImages.length} saved in this batch</ThemedText>
            </View>
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
      </ScrollView>

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
            <Ionicons name="close" size={28} color="#ECEEF0" />
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
  cameraSettings: { gap: 8 },
  cameraLabel: { color: "#ECEEF0", fontWeight: "700" },
  cameraHelp: { color: "#A6ADB2", fontSize: 12 },
  cameraOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#465057", backgroundColor: "#fff" },
  cameraSelected: { backgroundColor: "#4CAF50", borderColor: "#4CAF50" },
  cameraOptionText: { color: "#222222", fontSize: 13, fontWeight: "700" },
  addressInput: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: "#465057", borderRadius: 8, paddingHorizontal: 8, color: "#222222", backgroundColor: "#fff" },
  previewError: { position: "absolute", top: 65, left: 12, right: 12, color: "#FECACA", backgroundColor: "#08111F", padding: 8, fontSize: 12 },
  safeArea: {
    flex: 1,
    backgroundColor: "#151718",
  },
  titleContainer: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1D3D47",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1F4546",
  },
  eyebrow: {
    color: "#A7F3D0",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "600",
    marginTop: 2,
  },
  batchPill: {
    maxWidth: 158,
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "rgba(217,249,157,0.12)",
    borderWidth: 1,
    borderColor: "rgba(217,249,157,0.28)",
  },
  batchPillText: {
    color: "#ECEEF0",
    fontSize: 12,
    fontWeight: "800",
  },
  container: {
    flexGrow: 1,
    padding: 12,
    gap: 12,
    backgroundColor: "#151718",
  },
  previewPanel: {
    height: 360,
    minHeight: 330,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#08111F",
    borderWidth: 1,
    borderColor: "#465057",
    elevation: 6,
    shadowColor: "#0F172A",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewTopBar: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    minHeight: 42,
    zIndex: 3,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  segmentedControl: {
    flexDirection: "row",
    alignItems: "center",
    padding: 3,
    borderRadius: 8,
    backgroundColor: "rgba(8,17,31,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  segmentButton: {
    minWidth: 82,
    height: 34,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  segmentButtonActive: {
    backgroundColor: "#4CAF50",
  },
  segmentText: {
    color: "#D8E2EA",
    fontSize: 13,
    fontWeight: "800",
  },
  segmentTextActive: {
    color: "#08111F",
  },
  liveStatus: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(8,17,31,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#34D399",
  },
  liveStatusText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
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
    bottom: 12,
    left: 12,
    backgroundColor: "rgba(8,17,31,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  previewBadgeText: {
    color: "#fff",
    fontWeight: "700",
  },
  captureButton: {
    minHeight: 62,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#4CAF50",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#4CAF50",
    elevation: 3,
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
    borderColor: "#A9C7BC",
    borderRadius: 8,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: {
    color: "#145A4A",
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
    minHeight: 132,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#151718",
    borderWidth: 1,
    borderColor: "#333B40",
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
    color: "#ECEEF0",
  },
  subheading: {
    marginTop: 2,
    color: "#A6ADB2",
    fontSize: 12,
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
    backgroundColor: "#151718",
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
  const imageFolder =
    (images.find((item) => typeof item.metadata?.saveFolder === "string")?.metadata?.saveFolder as
      | string
      | undefined) ?? "Documents/depth_camera_images";

  return [
    "Batch saved locally.",
    `Batch JSON: ${jsonPath}`,
    `Images: ${imageFolder}`,
  ].join("\n");
}

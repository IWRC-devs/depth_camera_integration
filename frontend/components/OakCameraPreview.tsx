import { useEffect, useState } from "react";
import { AppState, Image, ImageStyle, StyleProp } from "react-native";
import { previewOakCamera } from "@/utils/oakCamera";

export function OakCameraPreview({ address, mode, style, onError, onReady }: {
  address: string; mode: "rgb" | "depth"; style?: StyleProp<ImageStyle>;
  onError: (message: string) => void; onReady: () => void;
}) {
  const [uri, setUri] = useState<string>();
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setUri(undefined);
    const poll = async () => {
      try {
        const next = await previewOakCamera(address, mode, controller.signal);
        if (!controller.signal.aborted) { setUri(next); onReady(); }
      } catch (error) {
        if (!controller.signal.aborted) onError(error instanceof Error ? error.message : "OAK preview unavailable.");
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 500);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [address, mode, onError, onReady, active]);
  return <Image source={uri ? { uri } : undefined} style={style} resizeMode="contain" />;
}

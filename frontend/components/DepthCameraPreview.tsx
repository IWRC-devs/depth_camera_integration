import { Platform, requireNativeComponent, StyleProp, View, ViewStyle } from "react-native";

type Props = {
  mode?: "rgb" | "depth";
  style?: StyleProp<ViewStyle>;
};

const NativeDepthCameraPreview =
  Platform.OS === "android" ? requireNativeComponent<Props>("DepthCameraPreview") : null;

export function DepthCameraPreview({ mode = "rgb", style }: Props) {
  if (!NativeDepthCameraPreview) {
    return <View style={style} />;
  }

  return <NativeDepthCameraPreview mode={mode} style={style} />;
}

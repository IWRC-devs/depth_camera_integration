import { Platform, requireNativeComponent, StyleProp, View, ViewStyle } from "react-native";

type Props = {
  style?: StyleProp<ViewStyle>;
};

const NativeDepthCameraPreview =
  Platform.OS === "android" ? requireNativeComponent<Props>("DepthCameraPreview") : null;

export function DepthCameraPreview({ style }: Props) {
  if (!NativeDepthCameraPreview) {
    return <View style={style} />;
  }

  return <NativeDepthCameraPreview style={style} />;
}

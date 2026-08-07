import { Platform } from "react-native";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || (Platform.OS === "web" ? "" : "http://localhost:3000");

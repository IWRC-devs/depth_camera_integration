import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...Ionicons.font,
  });

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <Stack>
        <Stack.Screen
          name="index"
          options={{ headerShown: false, title: "Depth Camera App" }}
        />
        <Stack.Screen
          name="screens/imaging"
          options={{ headerShown: false }}
        />
      </Stack>
    </ThemeProvider>
  );
}

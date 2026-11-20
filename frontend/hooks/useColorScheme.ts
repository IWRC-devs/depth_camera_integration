// Keep the approved field-collection theme consistent across Android devices.
export function useColorScheme(): 'light' | 'dark' {
  return 'dark' as const;
}

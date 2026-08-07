import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Ionicons } from '@expo/vector-icons';
import { CollectionProvider } from '@/context/CollectionContext';

export default function ImagingLayout() {
  return (
    <CollectionProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#4CAF50',
          headerTitle: 'Depth Camera App',
          headerTitleAlign: 'center',
          headerShown: true,
          tabBarButton: HapticTab,
          tabBarBackground: TabBarBackground,
          tabBarStyle: Platform.select({
            ios: {
              // Use a transparent background on iOS to show the blur effect
              position: 'absolute',
            },
            default: {},
          }),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            href: null,
          }} />
        <Tabs.Screen
          name="parameters"
          options={{
            title: 'Parameters',
            tabBarIcon: ({ color }) => <Ionicons size={28} name="options-outline" color={color} />
          }} />
        <Tabs.Screen
          name="capture-image"
          options={{
            title: 'Take Photos',
            tabBarIcon: ({ color }) => <Ionicons size={28} name="camera" color={color} />,
          }} />
      </Tabs>
    </CollectionProvider>
  );
}

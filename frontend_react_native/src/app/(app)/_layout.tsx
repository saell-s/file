import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="folder/[id]" />
      <Stack.Screen name="search" />
      <Stack.Screen name="trash" />
      <Stack.Screen name="storage" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="settings/security" />
    </Stack>
  );
}

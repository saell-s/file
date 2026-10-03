import { useEffect, useMemo } from 'react';
import { AppState, StyleSheet, View, useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Ionicons } from '@expo/vector-icons';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { LockScreen } from '@/components/lock-screen';
import { ToastHost } from '@/components/toast';
import { useSecurity } from '@/store/security';
import { setUploadCompleteListener } from '@/store/uploads';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const locked = useSecurity((state) => state.locked);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: false },
          mutations: { retry: 0 },
        },
      }),
    [],
  );

  useEffect(() => {
    // Preload the icon font so the first render never shows tofu boxes.
    void Ionicons.loadFont();
  }, []);

  useEffect(() => {
    void useSecurity.getState().init();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') useSecurity.getState().lock();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setUploadCompleteListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['nodes'] });
      void queryClient.invalidateQueries({ queryKey: ['storage'] });
      void queryClient.invalidateQueries({ queryKey: ['recent'] });
    });
    return () => setUploadCompleteListener(null);
  }, [queryClient]);

  const background = colorScheme === 'dark' ? DarkTheme.colors.background : DefaultTheme.colors.background;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(app)" />
            <Stack.Screen name="preview/[id]" options={{ presentation: 'modal' }} />
          </Stack>
          {locked ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]}>
              <LockScreen />
            </View>
          ) : null}
          <ToastHost />
          <StatusBar style="auto" />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

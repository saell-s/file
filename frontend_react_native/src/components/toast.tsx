import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { Icon, type IconName } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

type ToastState = {
  current: ToastItem | null;
  show: (message: string, kind?: ToastKind) => void;
  clear: () => void;
};

let nextId = 1;

const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (message, kind = 'info') => {
    if (kind === 'success') haptics.success();
    else if (kind === 'error') haptics.error();
    set({ current: { id: nextId++, message, kind } });
  },
  clear: () => set({ current: null }),
}));

/** Imperative toast API: `toast.success('Renamed')`. */
export const toast = {
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  error: (message: string) => useToastStore.getState().show(message, 'error'),
  info: (message: string) => useToastStore.getState().show(message, 'info'),
};

const ICONS: Record<ToastKind, IconName> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const current = useToastStore((state) => state.current);
  const clear = useToastStore((state) => state.clear);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(clear, 2600);
    return () => clearTimeout(timer);
  }, [current, clear]);

  if (!current) return null;

  const tone =
    current.kind === 'success' ? theme.success : current.kind === 'error' ? theme.danger : theme.tint;

  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 84 }]}>
      <Animated.View
        key={current.id}
        entering={FadeInDown.springify().damping(18)}
        exiting={FadeOutUp.duration(180)}
        style={[
          styles.toast,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <Icon name={ICONS[current.kind]} size={18} color={tone} />
        <Animated.Text entering={FadeInDown.delay(60)} style={[styles.label, { color: theme.text }]}>
          {current.message}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 420,
    marginHorizontal: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 10px 26px rgba(15, 17, 21, 0.18)',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
});
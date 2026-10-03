/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B0B0F',
    background: '#FFFFFF',
    backgroundElement: '#F2F3F7',
    backgroundSelected: '#E4E6EC',
    textSecondary: '#6B6B76',
    tint: '#2F7CF6',
    tintSoft: '#2F7CF61F',
    border: '#E3E4EA',
    danger: '#DC2F36',
    dangerSoft: '#DC2F361F',
    success: '#1B9E63',
    successSoft: '#1B9E631F',
    warning: '#E08700',
    star: '#F0A500',
    overlay: 'rgba(15, 17, 21, 0.35)',
    scrim: 'rgba(12, 12, 16, 0.06)',
    onTint: '#FFFFFF',
  },
  dark: {
    text: '#FFFFFF',
    background: '#000000',
    backgroundElement: '#161618',
    backgroundSelected: '#26262A',
    textSecondary: '#9C9CA6',
    tint: '#4C93FF',
    tintSoft: '#4C93FF26',
    border: '#2A2A2F',
    danger: '#FF5A60',
    dangerSoft: '#FF5A6026',
    success: '#35D48A',
    successSoft: '#35D48A26',
    warning: '#FFC53D',
    star: '#FFC53D',
    overlay: 'rgba(0, 0, 0, 0.55)',
    scrim: 'rgba(255, 255, 255, 0.06)',
    onTint: '#FFFFFF',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'normal',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Cross-platform elevation via `boxShadow` (RN 0.76+ / web). */
export const Shadows = {
  none: {},
  sm: { boxShadow: '0 1px 2px rgba(15, 17, 21, 0.08)' },
  md: { boxShadow: '0 6px 16px rgba(15, 17, 21, 0.10)' },
  lg: { boxShadow: '0 14px 34px rgba(15, 17, 21, 0.18)' },
  tint: { boxShadow: '0 10px 22px rgba(47, 124, 246, 0.35)' },
} as const;

export const Duration = {
  fast: 140,
  normal: 220,
  slow: 320,
} as const;
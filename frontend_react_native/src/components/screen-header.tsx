import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  large = false,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  /** Large, screen-level title used at the root of a tab. */
  large?: boolean;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={{
        paddingTop: insets.top + (large ? Spacing.three : Spacing.two),
        paddingHorizontal: Spacing.three,
        paddingBottom: Spacing.two,
        backgroundColor: theme.background,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.border,
        gap: Spacing.two,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={() => {
              haptics.light();
              router.back();
            }}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Icon name="chevron-back" size={20} color={theme.tint} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <ThemedText
            type={large ? 'title' : 'smallBold'}
            numberOfLines={1}
            style={large ? undefined : { fontSize: 20, lineHeight: 26, letterSpacing: -0.2 }}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
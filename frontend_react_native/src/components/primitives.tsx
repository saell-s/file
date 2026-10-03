import type { ReactNode } from 'react';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon, IconTile, type IconName } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Duration, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[{ flex: 1, backgroundColor: theme.background }, style]}>{children}</View>;
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.backgroundElement,
          borderRadius: Radius.lg,
          padding: padded ? Spacing.three : 0,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/** Rounded container for grouped list rows (iOS-style inset lists). */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.backgroundElement,
          borderRadius: Radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          overflow: 'hidden',
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      {action}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  size = 'md',
  style,
}: ButtonProps) {
  const theme = useTheme();
  const background: Record<ButtonVariant, string> = {
    primary: theme.tint,
    secondary: theme.backgroundElement,
    ghost: 'transparent',
    danger: theme.danger,
  };
  const label: Record<ButtonVariant, string> = {
    primary: theme.onTint,
    secondary: theme.text,
    ghost: theme.tint,
    danger: '#ffffff',
  };
  const isDisabled = disabled || loading;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      onPress={() => {
        if (variant === 'danger') haptics.warning();
        onPress?.();
      }}
      style={[
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: background[variant] },
        variant === 'secondary' && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
        isDisabled && { opacity: 0.5 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={label[variant]} size="small" />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} color={label[variant]} /> : null}
          <Text style={{ color: label[variant], fontWeight: '600', fontSize: size === 'sm' ? 13 : 15 }}>
            {title}
          </Text>
        </View>
      )}
    </PressScale>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 38,
  tone,
  variant = 'filled',
  disabled,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  size?: number;
  tone?: string;
  variant?: 'filled' | 'plain';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        haptics.light();
        onPress?.();
      }}
      scaleTo={0.9}
      hitSlop={6}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: variant === 'filled' ? theme.backgroundElement : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}>
      <Icon name={icon} size={size * 0.46} color={tone ?? theme.text} />
    </PressScale>
  );
}

/** Pressable that scales down slightly while held. */
export function PressScale({
  children,
  scaleTo = 0.97,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & {
  children: ReactNode;
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
  }));

  return (
    <AnimatedPressable
      onPressIn={(event) => {
        pressed.value = withTiming(1, { duration: 90 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = withTiming(0, { duration: Duration.normal });
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}

export type SettingRowProps = {
  icon?: IconName;
  iconColor?: string;
  label: string;
  hint?: string;
  value?: string;
  onPress?: () => void;
  toggle?: { value: boolean; onChange: (next: boolean) => void; disabled?: boolean };
  danger?: boolean;
  last?: boolean;
};

export function SettingRow({
  icon,
  iconColor,
  label,
  hint,
  value,
  onPress,
  toggle,
  danger,
  last,
}: SettingRowProps) {
  const theme = useTheme();
  const tint = danger ? theme.danger : (iconColor ?? theme.tint);
  const body = (
    <View style={[styles.settingRow, !last && styles.settingRowBorder, { borderBottomColor: theme.border }]}>
      {icon ? <IconTile name={icon} color={tint} size={30} radius={Radius.sm} /> : null}
      <View style={{ flex: 1 }}>
        <ThemedText
          type="small"
          themeColor={danger ? 'danger' : 'text'}
          style={{ fontSize: 15 }}>
          {label}
        </ThemedText>
        {hint ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
      {value ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {value}
        </ThemedText>
      ) : null}
      {toggle ? (
        <Switch
          value={toggle.value}
          disabled={toggle.disabled}
          onValueChange={(next) => {
            haptics.selection();
            toggle.onChange(next);
          }}
          trackColor={{ true: theme.tint, false: theme.backgroundSelected }}
          thumbColor="#fff"
        />
      ) : onPress ? (
        <Icon name="chevron-forward" size={16} color={theme.textSecondary} />
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={({ pressed }) => ({ backgroundColor: pressed ? theme.scrim : 'transparent' })}>
      {body}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  containerStyle,
  style,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string | null;
  /** Extra styling for the wrapper (not the input itself). */
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[{ gap: Spacing.one }, containerStyle]}>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        {...props}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            color: theme.text,
            borderColor: error ? theme.danger : theme.border,
          },
          style,
        ]}
      />
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: theme.tintSoft, borderColor: theme.border },
        ]}>
        <Icon name={icon} size={30} color={theme.tint} />
      </View>
      <ThemedText type="smallBold" style={{ textAlign: 'center', fontSize: 17, marginTop: Spacing.three }}>
        {title}
      </ThemedText>
      {message ? (
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={{ textAlign: 'center', marginTop: Spacing.one, maxWidth: 320 }}>
          {message}
        </ThemedText>
      ) : null}
      {action ? <View style={{ marginTop: Spacing.three }}>{action}</View> : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
      ]}>
      <Icon name="alert-circle" size={18} color={theme.danger} />
      <ThemedText type="small" themeColor="danger" style={{ flex: 1 }}>
        {message}
      </ThemedText>
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.spinner}>
      <ActivityIndicator color={theme.tint} />
      {label ? (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Pulsing placeholder block used while lists load. */
export function Skeleton({ height = 16, width = '100%', radius = Radius.sm }: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
}) {
  const theme = useTheme();
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700 }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { height, width, borderRadius: radius, backgroundColor: theme.backgroundSelected },
        animatedStyle,
      ]}
    />
  );
}

/** Placeholder rows that mirror the NodeRow layout. */
export function SkeletonRows({ count = 6, grid = false }: { count?: number; grid?: boolean }) {
  return (
    <View style={{ padding: Spacing.three, gap: Spacing.two }}>
      {Array.from({ length: count }).map((_, index) =>
        grid ? (
          <View key={index} style={{ gap: Spacing.one }}>
            <Skeleton height={120} radius={Radius.md} />
            <Skeleton height={11} width="70%" />
          </View>
        ) : (
          <View key={index} style={styles.skeletonRow}>
            <Skeleton height={44} width={44} radius={Radius.md} />
            <View style={{ flex: 1, gap: Spacing.one }}>
              <Skeleton height={13} width={`${58 + ((index * 13) % 32)}%`} />
              <Skeleton height={11} width={`${28 + ((index * 7) % 20)}%`} />
            </View>
          </View>
        ),
      )}
    </View>
  );
}

export function ProgressBar({
  value,
  tone,
  height = 8,
}: {
  value: number;
  tone?: string;
  height?: number;
}) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: theme.backgroundSelected,
        overflow: 'hidden',
      }}>
      <View
        style={{
          width: `${Math.max(clamped * 100, clamped > 0 ? 2 : 0)}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: tone ?? theme.tint,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  buttonSm: {
    minHeight: 36,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  sectionTitle: {
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    minHeight: 52,
  },
  settingRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.three,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  spinner: {
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
});

export { type ThemeColor };
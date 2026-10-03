import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import type { FileCategory } from '@/lib/format';
import { useTheme } from '@/hooks/use-theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: ComponentProps<typeof Ionicons>['style'];
}) {
  const theme = useTheme();
  return <Ionicons name={name} size={size} color={color ?? theme.text} style={style} />;
}

const CATEGORY_ICONS: Record<FileCategory, IconName> = {
  folder: 'folder',
  image: 'image',
  video: 'videocam',
  audio: 'musical-notes',
  pdf: 'document-text',
  text: 'document-text',
  code: 'code-slash',
  archive: 'archive',
  file: 'document-outline',
};

export function iconForCategory(category: FileCategory): IconName {
  return CATEGORY_ICONS[category];
}

/** Rounded, tinted icon tile used for list rows and settings entries. */
export function IconTile({
  name,
  color,
  size = 34,
  radius = Radius.sm + 2,
  background,
}: {
  name: IconName;
  color: string;
  size?: number;
  radius?: number;
  background?: string;
}) {
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: background ?? `${color}1F`,
        },
      ]}>
      <Ionicons name={name} size={size * 0.52} color={color} />
    </View>
  );
}

/** App logo tile (folder glyph on a tinted rounded square). */
export function AppMark({ size = 64 }: { size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size * 0.26,
          backgroundColor: theme.tint,
        },
      ]}>
      <Ionicons name="folder" size={size * 0.5} color={theme.onTint} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
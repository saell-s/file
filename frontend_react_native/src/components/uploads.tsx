import { Pressable, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { Icon } from '@/components/icons';
import { AppButton, ProgressBar } from '@/components/primitives';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useUploads, type PickedFile } from '@/store/uploads';

export async function pickDocuments(multiple = true): Promise<PickedFile[]> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets) return [];
    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size ?? 0,
      file: asset.file,
    }));
  } catch (error) {
    toast.error(errorMessage(error));
    return [];
  }
}

export async function pickMedia(): Promise<PickedFile[]> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Allow photo library access in Settings to add photos.');
      return [];
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 1,
      videoMaxDuration: 600,
    });
    if (result.canceled || !result.assets) return [];
    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName ?? `media-${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
      mimeType: asset.mimeType,
      size: asset.fileSize ?? 0,
    }));
  } catch (error) {
    toast.error(errorMessage(error));
    return [];
  }
}

export function UploadTracker({ bottom = 96 }: { bottom?: number }) {
  const theme = useTheme();
  const items = useUploads((state) => state.items);
  const expanded = useUploads((state) => state.expanded);
  const setExpanded = useUploads((state) => state.setExpanded);
  const retry = useUploads((state) => state.retry);
  const dismiss = useUploads((state) => state.dismiss);
  const clearFinished = useUploads((state) => state.clearFinished);

  if (!items.length) return null;

  const active = items.filter((item) => item.status !== 'done');
  const finished = items.length - active.length;
  const visible = expanded ? items : active.slice(0, 3);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom, backgroundColor: theme.backgroundElement, borderColor: theme.border },
        Shadows.md,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse uploads' : 'Expand uploads'}
        onPress={() => {
          haptics.light();
          setExpanded(!expanded);
        }}
        style={styles.header}>
        <Icon
          name={active.length ? 'cloud-upload-outline' : 'checkmark-circle-outline'}
          size={17}
          color={active.length ? theme.tint : theme.success}
        />
        <ThemedText type="small" style={{ flex: 1, fontWeight: '600' }}>
          {active.length
            ? `Saving ${active.length} file${active.length > 1 ? 's' : ''}`
            : `${finished} file${finished > 1 ? 's' : ''} added`}
        </ThemedText>
        <Icon name={expanded ? 'chevron-down' : 'chevron-up'} size={16} color={theme.textSecondary} />
      </Pressable>

      {visible.map((item) => (
        <View key={item.id} style={[styles.item, { borderTopColor: theme.border }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <ThemedText type="small" numberOfLines={1}>
              {item.name}
            </ThemedText>
            <ProgressBar
              value={item.progress}
              height={4}
              tone={
                item.status === 'error'
                  ? theme.danger
                  : item.status === 'done'
                    ? theme.success
                    : theme.tint
              }
            />
            <ThemedText type="caption" themeColor={item.status === 'error' ? 'danger' : 'textSecondary'}>
              {item.status === 'error'
                ? (item.error ?? 'Failed')
                : item.status === 'done'
                  ? 'Added to FileBox'
                  : `${formatBytes(Math.round(item.size * item.progress))} of ${formatBytes(item.size)}`}
            </ThemedText>
          </View>
          {item.status === 'error' ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => retry(item.id)}>
              <Icon name="refresh" size={18} color={theme.tint} />
            </Pressable>
          ) : null}
          {item.status === 'done' ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => dismiss(item.id)}>
              <Icon name="close" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {finished && expanded ? (
        <AppButton title="Clear finished" size="sm" variant="ghost" onPress={clearFinished} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.one,
  },
});
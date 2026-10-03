import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PreviewContent, PreviewMeta, saveNode } from '@/components/preview';
import { Card, EmptyState, ErrorBanner, IconButton, Skeleton } from '@/components/primitives';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useNode, useToggleStar } from '@/hooks/use-api';
import { errorMessage } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PreviewModal() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useNode(id ?? null);
  const star = useToggleStar();
  const node = query.data;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View
        style={[
          styles.header,
          { borderBottomColor: theme.border, paddingTop: insets.top + Spacing.two },
        ]}>
        <IconButton icon="close" label="Close preview" size={34} onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 15 }}>
            {node?.name ?? 'Preview'}
          </ThemedText>
          {node ? (
            <ThemedText type="caption" themeColor="textSecondary">
              {node.type === 'file' ? formatBytes(node.size) : 'Folder'}
            </ThemedText>
          ) : null}
        </View>

        {node?.type === 'file' ? (
          <>
            <IconButton
              icon={node.is_starred ? 'star' : 'star-outline'}
              label={node.is_starred ? 'Remove star' : 'Star this file'}
              size={34}
              variant="plain"
              tone={node.is_starred ? theme.star : undefined}
              onPress={() => {
                star.mutate(node.id, {
                  onSuccess: () =>
                    toast.success(node.is_starred ? 'Removed from starred' : 'Added to starred'),
                  onError: (err) => toast.error(errorMessage(err)),
                });
              }}
            />
            <IconButton
              icon="share-outline"
              label="Share this file"
              size={34}
              variant="plain"
              onPress={() => {
                haptics.light();
                void saveNode(node)
                  .then(() => toast.success('Ready to share'))
                  .catch((err: unknown) => toast.error(errorMessage(err)));
              }}
            />
          </>
        ) : null}
      </View>

      {query.isLoading ? (
        <View style={{ padding: Spacing.three, gap: Spacing.two }}>
          <Skeleton height={200} radius={Radius.lg} />
          <Skeleton height={14} width="70%" />
          <Skeleton height={14} width="55%" />
        </View>
      ) : query.isError || !node ? (
        <View style={{ padding: Spacing.three }}>
          <ErrorBanner message="This file is no longer available." />
          <View style={{ height: Spacing.three }} />
          <EmptyState
            icon="alert-circle-outline"
            title="Nothing to preview"
            message="It may have been deleted from this device."
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: Spacing.four }}>
          <View style={{ minHeight: 320 }}>
            <PreviewContent node={node} />
          </View>
          <View style={{ padding: Spacing.three }}>
            <Card>
              <PreviewMeta node={node} />
            </Card>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
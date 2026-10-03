import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons';
import { NodeIcon } from '@/components/nodes';
import { EmptyState, ErrorBanner, SkeletonRows } from '@/components/primitives';
import { ScreenHeader } from '@/components/screen-header';
import { ConfirmDialog } from '@/components/sheets';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  useEmptyTrash,
  usePurgeNode,
  useRestoreNode,
  useTrash,
  type NodeItem,
} from '@/hooks/use-api';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { haptics } from '@/lib/haptics';

export default function TrashScreen() {
  const theme = useTheme();
  const query = useTrash();
  const restore = useRestoreNode();
  const purge = usePurgeNode();
  const emptyTrash = useEmptyTrash();
  const [confirmPurge, setConfirmPurge] = useState<NodeItem | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const items = query.data?.items ?? [];

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Trash"
        showBack
        subtitle={items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'Empty'}
        right={
          items.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                haptics.warning();
                setConfirmEmpty(true);
              }}
              style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.6 : 1 }]}>
              <ThemedText type="smallBold" themeColor="danger">
                Empty
              </ThemedText>
            </Pressable>
          ) : null
        }
      />

      {query.isLoading ? (
        <SkeletonRows count={5} />
      ) : query.isError ? (
        <View style={{ padding: Spacing.three }}>
          <ErrorBanner message="Could not load trash." />
        </View>
      ) : !items.length ? (
        <EmptyState
          icon="trash-outline"
          title="Trash is empty"
          message="Deleted items stay here until you remove them forever."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: Spacing.two, gap: Spacing.two }}
          refreshing={query.isFetching && !query.isLoading}
          onRefresh={() => void query.refetch()}
          renderItem={({ item }) => (
            <View
              style={[
                styles.item,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <NodeIcon node={item} size={38} />
              <View style={{ flex: 1, gap: 1 }}>
                <ThemedText type="small" numberOfLines={1} style={{ fontWeight: '600' }}>
                  {item.name}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  Deleted {formatDate(item.deleted_at ?? item.updated_at)}
                </ThemedText>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Restore ${item.name}`}
                hitSlop={6}
                onPress={() => {
                  haptics.light();
                  restore.mutate(item.id, {
                    onSuccess: () => toast.success('Restored'),
                    onError: (err) => toast.error(errorMessage(err)),
                  });
                }}
                style={({ pressed }) => [
                  styles.action,
                  { backgroundColor: theme.tintSoft, opacity: pressed ? 0.6 : 1 },
                ]}>
                <Icon name="arrow-undo-outline" size={17} color={theme.tint} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.name} forever`}
                hitSlop={6}
                onPress={() => {
                  haptics.warning();
                  setConfirmPurge(item);
                }}
                style={({ pressed }) => [
                  styles.action,
                  { backgroundColor: theme.dangerSoft, opacity: pressed ? 0.6 : 1 },
                ]}>
                <Icon name="trash-outline" size={17} color={theme.danger} />
              </Pressable>
            </View>
          )}
        />
      )}

      <ConfirmDialog
        visible={!!confirmPurge}
        onClose={() => setConfirmPurge(null)}
        title="Delete forever?"
        message={`"${confirmPurge?.name ?? ''}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete forever"
        destructive
        onConfirm={async () => {
          if (confirmPurge) await purge.mutateAsync(confirmPurge.id);
        }}
        onSuccessMessage="Deleted forever"
      />

      <ConfirmDialog
        visible={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        title="Empty trash?"
        message={`${items.length} item${items.length === 1 ? '' : 's'} will be permanently deleted. This cannot be undone.`}
        confirmLabel="Empty trash"
        destructive
        onConfirm={async () => {
          await emptyTrash.mutateAsync();
        }}
        onSuccessMessage="Trash emptied"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  action: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
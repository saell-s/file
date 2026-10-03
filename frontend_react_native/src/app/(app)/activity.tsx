import { ScrollView, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { IconTile, type IconName } from '@/components/icons';
import { ConfirmDialog } from '@/components/sheets';
import { EmptyState, ErrorBanner, Group, SkeletonRows } from '@/components/primitives';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActivity, useClearActivity, type SecurityEvent } from '@/hooks/use-api';
import { formatDate } from '@/lib/format';

const ACTION_META: Record<string, { label: string; icon: IconName; danger?: boolean }> = {
  'folder.create': { label: 'Created a folder', icon: 'folder-outline' },
  'file.import': { label: 'Added a file', icon: 'document-outline' },
  'node.rename': { label: 'Renamed an item', icon: 'pencil-outline' },
  'node.move': { label: 'Moved an item', icon: 'folder-outline' },
  'node.trash': { label: 'Moved to trash', icon: 'trash-outline', danger: true },
  'node.restore': { label: 'Restored from trash', icon: 'arrow-undo-outline' },
  'node.purge': { label: 'Permanently deleted', icon: 'close-circle-outline', danger: true },
  'trash.empty': { label: 'Emptied trash', icon: 'trash-outline', danger: true },
  'app.lock': { label: 'App locked', icon: 'lock-closed-outline' },
  'app.unlock': { label: 'App unlocked', icon: 'lock-open-outline' },
};

function fallbackMeta(action: string) {
  return { label: action, icon: 'ellipse-outline' as IconName };
}

function ActivityRow({ event, last }: { event: SecurityEvent; last: boolean }) {
  const theme = useTheme();
  const meta = ACTION_META[event.action] ?? fallbackMeta(event.action);

  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}>
      <IconTile
        name={meta.icon}
        color={meta.danger ? theme.danger : theme.tint}
        size={30}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <ThemedText type="small" themeColor={meta.danger ? 'danger' : 'text'} style={{ fontWeight: '600' }}>
          {meta.label}
          {event.detail ? ` · ${event.detail}` : ''}
        </ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
          <ThemedText type="caption" themeColor="textSecondary">
            {formatDate(event.created_at)}
          </ThemedText>
          {event.ip ? (
            <ThemedText type="caption" themeColor="textSecondary">
              · {event.ip}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function ActivityScreen() {
  const query = useActivity();
  const clear = useClearActivity();
  const [confirm, setConfirm] = useState(false);

  const events = query.data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Security log"
        showBack
        subtitle="Unlocks and important actions"
        right={
          events.length ? (
            <ThemedText
              type="smallBold"
              themeColor="tint"
              onPress={() => setConfirm(true)}
              suppressHighlighting
              style={{ paddingHorizontal: Spacing.two }}>
              Clear
            </ThemedText>
          ) : null
        }
      />

      {query.isLoading ? (
        <SkeletonRows count={6} />
      ) : query.isError ? (
        <View style={{ padding: Spacing.three }}>
          <ErrorBanner message="Could not load the security log." />
        </View>
      ) : !events.length ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="No activity yet"
          message="Unlocks and changes will appear here."
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.three }}>
          <Group>
            {events.map((event, index) => (
              <ActivityRow key={event.id} event={event} last={index === events.length - 1} />
            ))}
          </Group>
        </ScrollView>
      )}

      <ConfirmDialog
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Clear security log?"
        message="All activity entries will be removed. This cannot be undone."
        confirmLabel="Clear log"
        destructive
        onConfirm={async () => {
          await clear.mutateAsync();
        }}
        onSuccessMessage="Security log cleared"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
});
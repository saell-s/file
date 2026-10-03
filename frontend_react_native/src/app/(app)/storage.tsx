import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon, iconForCategory } from '@/components/icons';
import { Card, EmptyState, Group, ProgressBar, Skeleton } from '@/components/primitives';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStorage } from '@/hooks/use-api';
import { formatBytes, tintFor, type FileCategory } from '@/lib/format';

export default function StorageScreen() {
  const theme = useTheme();
  const query = useStorage();

  if (query.isError || (!query.isLoading && !query.data)) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Storage" showBack />
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load storage"
          message="Restart the app and try again."
        />
      </View>
    );
  }

  const data = query.data;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Storage" showBack subtitle="Stored on this device" />

      {!data ? (
        <View style={{ padding: Spacing.three, gap: Spacing.three }}>
          <Skeleton height={44} width="60%" />
          <Skeleton height={12} radius={Radius.pill} />
          <Skeleton height={160} radius={Radius.lg} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
          <View style={{ alignItems: 'center', gap: Spacing.one }}>
            <ThemedText style={{ fontSize: 42, fontWeight: '700', letterSpacing: -1 }}>
              {formatBytes(data.used_bytes)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              used by FileBox
              {data.limit_bytes ? ` · ${formatBytes(data.free_bytes)} free on device` : ''}
            </ThemedText>
          </View>

          <ProgressBar
            value={data.limit_bytes ? data.used_bytes / data.limit_bytes : 0}
            height={12}
            tone={data.percent_used > 90 ? theme.danger : theme.tint}
          />

          <Group>
            {Object.keys(data.by_type).length === 0 ? (
              <View style={{ padding: Spacing.three }}>
                <ThemedText type="small" themeColor="textSecondary">
                  Nothing stored yet.
                </ThemedText>
              </View>
            ) : (
              Object.entries(data.by_type)
                .sort((a, b) => b[1].bytes - a[1].bytes)
                .map(([type, stats], index, all) => {
                  const category = type as FileCategory;
                  return (
                    <View
                      key={type}
                      style={[
                        styles.row,
                        index < all.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: theme.border,
                        },
                      ]}>
                      <Icon name={iconForCategory(category)} size={18} color={tintFor(category)} />
                      <ThemedText type="small" style={{ flex: 1, textTransform: 'capitalize' }}>
                        {type}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {stats.count} file{stats.count === 1 ? '' : 's'} ·{' '}
                        {formatBytes(stats.bytes)}
                      </ThemedText>
                    </View>
                  );
                })
            )}
          </Group>

          <Card style={{ backgroundColor: theme.tintSoft, borderColor: theme.tint }}>
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <Icon name="lock-closed-outline" size={18} color={theme.tint} />
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1, lineHeight: 20 }}>
                Everything lives inside FileBox&apos;s private folder on this device — no cloud, no
                server. Removing the app deletes these files.
              </ThemedText>
            </View>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
});
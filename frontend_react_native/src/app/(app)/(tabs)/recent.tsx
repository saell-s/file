import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { NodeList } from '@/components/nodes';
import { EmptyState, ErrorBanner, SkeletonRows } from '@/components/primitives';
import { ScreenHeader } from '@/components/screen-header';
import { NodeActionsSheet } from '@/components/sheets';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useRecent, type NodeItem } from '@/hooks/use-api';

export default function RecentScreen() {
  const router = useRouter();
  const query = useRecent();
  const [actionsNode, setActionsNode] = useState<NodeItem | null>(null);

  const open = (node: NodeItem) => {
    if (node.type === 'folder') {
      router.push({ pathname: '/(app)/folder/[id]', params: { id: node.id } });
    } else {
      router.push({ pathname: '/preview/[id]', params: { id: node.id } });
    }
  };

  const items = query.data?.items ?? [];

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Recent" large subtitle="Items you touched lately" />

      {query.isLoading ? (
        <SkeletonRows count={6} />
      ) : query.isError ? (
        <View style={{ padding: Spacing.three }}>
          <ErrorBanner message="Could not load recent activity." />
        </View>
      ) : !items.length ? (
        <EmptyState
          icon="time-outline"
          title="No recent activity"
          message="Files you add or edit will show up here."
        />
      ) : (
        <NodeList
          nodes={items}
          viewMode="list"
          onPress={open}
          onLongPress={setActionsNode}
          refreshing={query.isFetching && !query.isLoading}
          onRefresh={() => void query.refetch()}
          contentInsetBottom={BottomTabInset + Spacing.four}
        />
      )}

      <NodeActionsSheet
        node={actionsNode}
        visible={!!actionsNode}
        onClose={() => setActionsNode(null)}
        onOpen={open}
      />
    </View>
  );
}
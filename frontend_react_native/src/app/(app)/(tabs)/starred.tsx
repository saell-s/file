import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { NodeList } from '@/components/nodes';
import { EmptyState, ErrorBanner, SkeletonRows } from '@/components/primitives';
import { ScreenHeader } from '@/components/screen-header';
import { NodeActionsSheet } from '@/components/sheets';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useStarred, type NodeItem } from '@/hooks/use-api';

export default function StarredScreen() {
  const router = useRouter();
  const query = useStarred();
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
      <ScreenHeader title="Starred" large subtitle="Pinned for quick access" />

      {query.isLoading ? (
        <SkeletonRows count={5} />
      ) : query.isError ? (
        <View style={{ padding: Spacing.three }}>
          <ErrorBanner message="Could not load starred items." />
        </View>
      ) : !items.length ? (
        <EmptyState
          icon="star-outline"
          title="Nothing starred yet"
          message="Long-press any file or folder and choose Star to pin it here."
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
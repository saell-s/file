import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { NodeList } from '@/components/nodes';
import { EmptyState, Field, SkeletonRows } from '@/components/primitives';
import { ScreenHeader } from '@/components/screen-header';
import { NodeActionsSheet } from '@/components/sheets';
import { useSearch, type NodeItem } from '@/hooks/use-api';

export default function SearchScreen() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const query = useSearch(debounced);
  const [actionsNode, setActionsNode] = useState<NodeItem | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(handle);
  }, [term]);

  const open = (node: NodeItem) => {
    if (node.type === 'folder') {
      router.push({ pathname: '/(app)/folder/[id]', params: { id: node.id } });
    } else {
      router.push({ pathname: '/preview/[id]', params: { id: node.id } });
    }
  };

  const results = query.data?.items ?? [];
  const searching = debounced.trim().length > 0;
  const showEmpty = searching && !query.isLoading && results.length === 0;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Search" showBack>
        <Field
          placeholder="Search files and folders"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          value={term}
          onChangeText={setTerm}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </ScreenHeader>

      {query.isLoading && searching ? (
        <SkeletonRows count={5} />
      ) : showEmpty ? (
        <EmptyState
          icon="search-outline"
          title="No matches"
          message={`Nothing found for "${debounced.trim()}".`}
        />
      ) : results.length ? (
        <NodeList
          nodes={results}
          viewMode="list"
          onPress={open}
          onLongPress={setActionsNode}
          refreshing={query.isFetching && !query.isLoading}
          onRefresh={() => void query.refetch()}
        />
      ) : (
        <EmptyState
          icon="search-outline"
          title="Find anything"
          message="Type a name to search files and folders on this device."
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
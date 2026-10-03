import { useLocalSearchParams } from 'expo-router';

import { Explorer } from '@/components/explorer';
import { Spinner } from '@/components/primitives';
import { useNode } from '@/hooks/use-api';

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const nodeQuery = useNode(id ?? null);

  if (nodeQuery.isLoading) return <Spinner label="Opening folder…" />;

  return <Explorer parentId={id ?? null} title={nodeQuery.data?.name ?? 'Folder'} showBack />;
}

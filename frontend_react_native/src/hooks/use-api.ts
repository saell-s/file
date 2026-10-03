import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  clearActivity,
  createFolder,
  emptyTrash,
  getBreadcrumbs,
  getNode,
  importFile,
  listActivity,
  listChildren,
  listRecent,
  listStarred,
  listTrash,
  moveNode,
  purgeNode,
  renameNode,
  restoreNode,
  searchNodes,
  storageStats,
  toggleStar,
  trashNode,
  type Breadcrumb,
  type NodeListOut,
  type NodeItem,
  type Order,
  type SecurityEvent,
  type Sort,
  type StorageOut,
} from '@/lib/db';

export type { Breadcrumb, NodeListOut, NodeItem, Order, SecurityEvent, Sort, StorageOut };

export function useNodes(parentId: string | null, sort: Sort = 'name', order: Order = 'asc') {
  return useQuery({
    queryKey: ['nodes', parentId, sort, order],
    queryFn: () => listChildren(parentId, sort, order),
  });
}

export function useNode(nodeId: string | null) {
  return useQuery({
    enabled: !!nodeId,
    queryKey: ['node', nodeId],
    queryFn: () => getNode(nodeId!),
  });
}

export function useBreadcrumbs(nodeId: string | null) {
  return useQuery({
    enabled: !!nodeId,
    queryKey: ['breadcrumbs', nodeId],
    queryFn: () => getBreadcrumbs(nodeId!),
  });
}

export function useStarred() {
  return useQuery({
    queryKey: ['starred'],
    queryFn: listStarred,
  });
}

export function useRecent() {
  return useQuery({
    queryKey: ['recent'],
    queryFn: () => listRecent(),
  });
}

export function useSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    enabled: trimmed.length > 0,
    queryKey: ['search', trimmed],
    queryFn: () => searchNodes(trimmed),
  });
}

export function useTrash() {
  return useQuery({
    queryKey: ['trash'],
    queryFn: listTrash,
  });
}

export function useStorage() {
  return useQuery({
    queryKey: ['storage'],
    queryFn: storageStats,
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: listActivity,
  });
}

function useInvalidate(keys: string[]) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['nodes'] });
    for (const key of keys) void client.invalidateQueries({ queryKey: [key] });
  };
}

export function useCreateFolder() {
  const invalidate = useInvalidate(['starred', 'recent']);
  return useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) =>
      createFolder(input.name, input.parentId),
    onSuccess: invalidate,
  });
}

export function useRenameNode() {
  const invalidate = useInvalidate(['breadcrumbs', 'starred', 'recent', 'search']);
  return useMutation({
    mutationFn: (input: { id: string; name: string }) => renameNode(input.id, input.name),
    onSuccess: invalidate,
  });
}

export function useMoveNode() {
  const invalidate = useInvalidate(['breadcrumbs', 'starred', 'recent']);
  return useMutation({
    mutationFn: (input: { id: string; parentId: string | null }) =>
      moveNode(input.id, input.parentId),
    onSuccess: invalidate,
  });
}

export function useToggleStar() {
  const invalidate = useInvalidate(['starred', 'recent', 'search']);
  return useMutation({
    mutationFn: (id: string) => toggleStar(id),
    onSuccess: invalidate,
  });
}

export function useTrashNode() {
  const invalidate = useInvalidate(['trash', 'starred', 'recent', 'search']);
  return useMutation({
    mutationFn: (id: string) => trashNode(id),
    onSuccess: invalidate,
  });
}

export function useRestoreNode() {
  const invalidate = useInvalidate(['trash', 'nodes', 'storage']);
  return useMutation({
    mutationFn: (id: string) => restoreNode(id),
    onSuccess: invalidate,
  });
}

export function usePurgeNode() {
  const invalidate = useInvalidate(['trash', 'storage', 'nodes']);
  return useMutation({
    mutationFn: (id: string) => purgeNode(id),
    onSuccess: invalidate,
  });
}

export function useEmptyTrash() {
  const invalidate = useInvalidate(['trash', 'storage', 'nodes']);
  return useMutation({
    mutationFn: () => emptyTrash(),
    onSuccess: invalidate,
  });
}

export function useImportFile() {
  const invalidate = useInvalidate(['nodes', 'storage', 'recent']);
  return useMutation({
    mutationFn: (input: {
      sourceUri: string;
      name: string;
      mimeType?: string | null;
      parentId: string | null;
    }) => importFile(input),
    onSuccess: invalidate,
  });
}

export function useClearActivity() {
  const invalidate = useInvalidate(['activity']);
  return useMutation({
    mutationFn: () => clearActivity(),
    onSuccess: invalidate,
  });
}

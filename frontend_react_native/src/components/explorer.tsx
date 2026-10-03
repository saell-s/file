import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon, type IconName } from '@/components/icons';
import { Breadcrumbs, NodeList } from '@/components/nodes';
import {
  AppButton,
  EmptyState,
  ErrorBanner,
  IconButton,
  ProgressBar,
  SkeletonRows,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/screen-header';
import { ActionSheet, NodeActionsSheet, PromptDialog, type SheetAction } from '@/components/sheets';
import { UploadTracker, pickDocuments, pickMedia } from '@/components/uploads';
import { BottomTabInset, Radius, Shadows, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useCreateFolder, useNodes, useStorage, type NodeItem } from '@/hooks/use-api';
import { formatBytes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { usePreferences } from '@/store/preferences';
import { useUploads } from '@/store/uploads';

type SortKey = 'name' | 'name-desc' | 'newest' | 'oldest' | 'largest' | 'smallest';

const SORTS: Record<SortKey, { sort: 'name' | 'date' | 'size'; order: 'asc' | 'desc'; label: string }> = {
  name: { sort: 'name', order: 'asc', label: 'Name (A to Z)' },
  'name-desc': { sort: 'name', order: 'desc', label: 'Name (Z to A)' },
  newest: { sort: 'date', order: 'desc', label: 'Newest first' },
  oldest: { sort: 'date', order: 'asc', label: 'Oldest first' },
  largest: { sort: 'size', order: 'desc', label: 'Largest first' },
  smallest: { sort: 'size', order: 'asc', label: 'Smallest first' },
};

const QUICK_LINKS: { label: string; icon: IconName; href: '/recent' | '/starred' | '/trash' }[] = [
  { label: 'Recent', icon: 'time-outline', href: '/recent' },
  { label: 'Starred', icon: 'star-outline', href: '/starred' },
  { label: 'Trash', icon: 'trash-outline', href: '/trash' },
];

function StorageStrip() {
  const theme = useTheme();
  const router = useRouter();
  const { data } = useStorage();
  if (!data) return null;

  const usedRatio = data.limit_bytes ? data.used_bytes / data.limit_bytes : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatBytes(data.used_bytes)} used of ${formatBytes(data.limit_bytes)}`}
      onPress={() => {
        haptics.light();
        router.push('/storage');
      }}
      style={({ pressed }) => [
        styles.storageStrip,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <View style={styles.storageHead}>
        <View style={styles.storageLabel}>
          <Icon name="pie-chart-outline" size={15} color={theme.tint} />
          <ThemedText type="caption" style={{ fontWeight: '700' }}>
            {formatBytes(data.used_bytes)} used
          </ThemedText>
        </View>
        <View style={styles.storageLabel}>
          <ThemedText type="caption" themeColor="textSecondary">
            {formatBytes(data.free_bytes)} free
          </ThemedText>
          <Icon name="chevron-forward" size={13} color={theme.textSecondary} />
        </View>
      </View>
      <ProgressBar value={usedRatio} tone={usedRatio > 0.9 ? theme.danger : theme.tint} />
    </Pressable>
  );
}

function QuickChips() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}>
      {QUICK_LINKS.map((chip) => (
        <Pressable
          key={chip.label}
          accessibilityRole="button"
          onPress={() => {
            haptics.light();
            router.push(chip.href);
          }}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}>
          <Icon name={chip.icon} size={14} color={theme.tint} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>{chip.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function Explorer({
  parentId,
  title,
  showBack = false,
  showStorage = false,
  emptyTitle = 'This folder is empty',
  emptyMessage = 'Add files or create a folder to get started.',
}: {
  parentId: string | null;
  title: string;
  showBack?: boolean;
  showStorage?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
}) {
  const theme = useTheme();
  const router = useRouter();

  const viewMode = usePreferences((state) => state.viewMode);
  const setViewMode = usePreferences((state) => state.setViewMode);
  const storedSort = usePreferences((state) => state.sortKey);
  const setSortKey = usePreferences((state) => state.setSortKey);
  const sortKey: SortKey = storedSort in SORTS ? (storedSort as SortKey) : 'name';

  const [sortMenu, setSortMenu] = useState(false);
  const [createMenu, setCreateMenu] = useState(false);
  const [folderPrompt, setFolderPrompt] = useState(false);
  const [actionsNode, setActionsNode] = useState<NodeItem | null>(null);

  useEffect(() => {
    void usePreferences.getState().hydrate();
  }, []);

  const createFolder = useCreateFolder();
  const enqueue = useUploads((state) => state.enqueue);
  const activeUploads = useUploads((state) =>
    state.items.filter((item) => item.status !== 'done').length,
  );

  const sort = SORTS[sortKey];
  const query = useNodes(parentId, sort.sort, sort.order);
  const nodes = query.data?.items ?? [];
  const breadcrumbs = parentId ? (query.data?.breadcrumbs ?? []) : [];

  const openNode = (node: NodeItem) => {
    if (node.type === 'folder') {
      router.push({ pathname: '/(app)/folder/[id]', params: { id: node.id } });
    } else {
      router.push({ pathname: '/preview/[id]', params: { id: node.id } });
    }
  };

  const sortActions: SheetAction[] = (Object.keys(SORTS) as SortKey[]).map((key) => ({
    key,
    label: SORTS[key].label,
    icon: key === sortKey ? 'checkmark' : 'swap-vertical-outline',
    onPress: () => setSortKey(key),
  }));

  const createActions: SheetAction[] = [
    {
      key: 'files',
      label: 'Files from this device',
      hint: 'Documents, downloads, anything',
      icon: 'document-outline',
      onPress: () => {
        void pickDocuments(true).then((files) => {
          if (files.length) enqueue(files, parentId);
        });
      },
    },
    {
      key: 'photos',
      label: 'Photos and videos',
      hint: 'From your library',
      icon: 'images-outline',
      onPress: () => {
        void pickMedia().then((files) => {
          if (files.length) enqueue(files, parentId);
        });
      },
    },
    {
      key: 'folder',
      label: 'New folder',
      icon: 'folder-open-outline',
      onPress: () => setFolderPrompt(true),
    },
  ];

  const listHeader = breadcrumbs.length ? (
    <Breadcrumbs
      items={breadcrumbs}
      onNavigate={(id) => router.push({ pathname: '/(app)/folder/[id]', params: { id } })}
    />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScreenHeader
        title={title}
        showBack={showBack}
        large={!showBack}
        subtitle={
          query.data && !query.isLoading
            ? `${query.data.total} item${query.data.total === 1 ? '' : 's'}`
            : undefined
        }
        right={
          <View style={styles.headerActions}>
            <IconButton
              icon="search"
              label="Search"
              variant="plain"
              size={32}
              onPress={() => router.push('/search')}
            />
            <IconButton
              icon="swap-vertical"
              label="Sort"
              variant="plain"
              size={32}
              onPress={() => setSortMenu(true)}
            />
            <IconButton
              icon={viewMode === 'list' ? 'grid-outline' : 'list'}
              label={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
              variant="plain"
              size={32}
              onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            />
          </View>
        }
      />

      {parentId === null ? (
        <View style={{ gap: Spacing.two }}>
          <QuickChips />
          {showStorage ? (
            <View style={{ paddingHorizontal: Spacing.three }}>
              <StorageStrip />
            </View>
          ) : null}
        </View>
      ) : null}

      {query.isError ? (
        <View style={{ padding: Spacing.three, gap: Spacing.two }}>
          <ErrorBanner message="Could not load this folder." />
          <AppButton
            title="Retry"
            size="sm"
            variant="secondary"
            onPress={() => void query.refetch()}
          />
        </View>
      ) : query.isLoading ? (
        <SkeletonRows count={7} grid={viewMode === 'grid'} />
      ) : nodes.length === 0 ? (
        <EmptyState
          icon="folder-open-outline"
          title={emptyTitle}
          message={emptyMessage}
          action={
            <AppButton title="Add files" icon="add" size="sm" onPress={() => setCreateMenu(true)} />
          }
        />
      ) : (
        <NodeList
          nodes={nodes}
          viewMode={viewMode}
          header={listHeader}
          onPress={openNode}
          onLongPress={setActionsNode}
          refreshing={query.isFetching && !query.isLoading}
          onRefresh={() => void query.refetch()}
          contentInsetBottom={BottomTabInset + 72}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add items"
        onPress={() => {
          haptics.light();
          setCreateMenu(true);
        }}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: activeUploads ? theme.success : theme.tint,
            bottom: BottomTabInset + Spacing.three,
            transform: [{ scale: pressed ? 0.93 : 1 }],
          },
          Shadows.tint,
        ]}>
        <Icon name={activeUploads ? 'cloud-upload-outline' : 'add'} size={26} color="#fff" />
      </Pressable>

      <UploadTracker bottom={BottomTabInset + 78} />

      <ActionSheet
        visible={createMenu}
        onClose={() => setCreateMenu(false)}
        title="Add to this folder"
        actions={createActions}
      />
      <ActionSheet
        visible={sortMenu}
        onClose={() => setSortMenu(false)}
        title="Sort by"
        actions={sortActions}
      />
      <PromptDialog
        visible={folderPrompt}
        onClose={() => setFolderPrompt(false)}
        title="New folder"
        label="Folder name"
        placeholder="Untitled folder"
        defaultValue="Untitled folder"
        confirmLabel="Create"
        onSubmit={async (name) => {
          await createFolder.mutateAsync({ name, parentId });
        }}
      />
      <NodeActionsSheet
        node={actionsNode}
        visible={!!actionsNode}
        onClose={() => setActionsNode(null)}
        onOpen={openNode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  storageStrip: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  storageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  storageLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 3,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fab: {
    position: 'absolute',
    right: Spacing.three,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
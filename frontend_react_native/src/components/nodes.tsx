import type { ReactNode } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';

import { Icon, iconForCategory } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Breadcrumb, NodeItem } from '@/hooks/use-api';
import { categoryFromMime, formatBytes, formatDate, tintFor } from '@/lib/format';
import { haptics } from '@/lib/haptics';

export function NodeIcon({ node, size = 44, rounded = true }: { node: NodeItem; size?: number; rounded?: boolean }) {
  const theme = useTheme();
  const category = categoryFromMime(node.mime_type, node.type);
  const showThumb = node.type === 'file' && (category === 'image' || category === 'video') && !!node.uri;
  const tint = tintFor(category);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: rounded ? Radius.md : Radius.sm,
        overflow: 'hidden',
        backgroundColor: showThumb ? theme.backgroundSelected : `${tint}1F`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {showThumb ? (
        <>
          <Image
            source={{ uri: node.uri! }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
          />
          {category === 'video' ? (
            <View
              style={[
                styles.thumbBadge,
                { backgroundColor: 'rgba(0,0,0,0.55)' },
              ]}>
              <Icon name="play" size={rounded ? 12 : 14} color="#fff" />
            </View>
          ) : null}
        </>
      ) : (
        <Icon name={iconForCategory(category)} size={size * 0.5} color={tint} />
      )}
    </View>
  );
}

export function NodeRow({
  node,
  onPress,
  onLongPress,
  trailing,
}: {
  node: NodeItem;
  onPress: () => void;
  onLongPress?: () => void;
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  const meta: string[] = [];
  if (node.type === 'file') meta.push(formatBytes(node.size));
  meta.push(formatDate(node.updated_at));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${node.name}, ${node.type === 'folder' ? 'folder' : formatBytes(node.size)}`}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      onLongPress={() => {
        haptics.medium();
        onLongPress?.();
      }}
      delayLongPress={280}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.scrim : 'transparent' },
      ]}>
      <NodeIcon node={node} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.nameLine}>
          <ThemedText type="small" numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', flexShrink: 1 }}>
            {node.name}
          </ThemedText>
          {node.is_starred ? <Icon name="star" size={13} color={theme.star} /> : null}
        </View>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {meta.join(' · ')}
        </ThemedText>
      </View>
      {trailing ?? <Icon name="chevron-forward" size={16} color={theme.textSecondary} />}
    </Pressable>
  );
}

export function NodeCard({
  node,
  onPress,
  onLongPress,
}: {
  node: NodeItem;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
  const category = categoryFromMime(node.mime_type, node.type);
  const hasThumb = node.type === 'file' && (category === 'image' || category === 'video') && !!node.uri;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={node.name}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      onLongPress={() => {
        haptics.medium();
        onLongPress?.();
      }}
      delayLongPress={280}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <View style={styles.cardThumb}>
        {hasThumb ? (
          <Image
            source={{ uri: node.uri! }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <Icon
            name={iconForCategory(category)}
            size={30}
            color={tintFor(category)}
          />
        )}
        {node.is_starred ? (
          <View style={styles.cardStar}>
            <Icon name="star" size={12} color="#fff" />
          </View>
        ) : null}
      </View>
      <ThemedText type="small" numberOfLines={1} style={{ fontWeight: '600', fontSize: 13 }}>
        {node.name}
      </ThemedText>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
        {node.type === 'file' ? formatBytes(node.size) : 'Folder'}
      </ThemedText>
    </Pressable>
  );
}

export function NodeList({
  nodes,
  viewMode,
  onPress,
  onLongPress,
  header,
  refreshing,
  onRefresh,
  contentInsetBottom = 0,
}: {
  nodes: NodeItem[];
  viewMode: 'list' | 'grid';
  onPress: (node: NodeItem) => void;
  onLongPress?: (node: NodeItem) => void;
  header?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentInsetBottom?: number;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const refresh = onRefresh ? (
    <RefreshControl
      refreshing={!!refreshing}
      onRefresh={onRefresh}
      tintColor={theme.textSecondary}
      colors={[theme.tint]}
      progressBackgroundColor={theme.backgroundElement}
    />
  ) : undefined;

  if (viewMode === 'grid') {
    const numColumns = width >= 1100 ? 4 : width >= 700 ? 3 : 2;
    return (
      <FlatList
        data={nodes}
        key={`grid-${numColumns}`}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        refreshControl={refresh}
        ListHeaderComponent={header ? <>{header}</> : null}
        columnWrapperStyle={{ gap: Spacing.two }}
        contentContainerStyle={{
          paddingHorizontal: Spacing.three,
          paddingTop: Spacing.two,
          paddingBottom: Spacing.four + contentInsetBottom,
          gap: Spacing.two,
        }}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / numColumns, maxWidth: `${100 / numColumns}%` }}>
            <NodeCard
              node={item}
              onPress={() => onPress(item)}
              onLongPress={onLongPress ? () => onLongPress(item) : undefined}
            />
          </View>
        )}
      />
    );
  }

  return (
    <FlatList
      data={nodes}
      keyExtractor={(item) => item.id}
      refreshControl={refresh}
      ListHeaderComponent={header ? <>{header}</> : null}
      contentContainerStyle={{
        paddingHorizontal: Spacing.two,
        paddingBottom: Spacing.four + contentInsetBottom,
      }}
      ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
      renderItem={({ item }) => (
        <NodeRow
          node={item}
          onPress={() => onPress(item)}
          onLongPress={onLongPress ? () => onLongPress(item) : undefined}
        />
      )}
    />
  );
}

export function Breadcrumbs({
  items,
  onNavigate,
}: {
  items: Breadcrumb[];
  onNavigate: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.crumbs}>
      {items.map((crumb, index) => {
        const isLast = index === items.length - 1;
        return (
          <View key={crumb.id} style={styles.crumbItem}>
            <Pressable onPress={() => onNavigate(crumb.id)} hitSlop={6}>
              <ThemedText type="small" themeColor={isLast ? 'text' : 'tint'} style={{ fontWeight: '600' }}>
                {crumb.name}
              </ThemedText>
            </Pressable>
            {isLast ? null : <Icon name="chevron-forward" size={12} color="#9C9CA6" />}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  card: {
    gap: 2,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardThumb: {
    height: 92,
    borderRadius: Radius.sm,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardStar: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240, 165, 0, 0.95)',
  },
  thumbBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  crumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
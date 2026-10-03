import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';

import { Icon, iconForCategory } from '@/components/icons';
import { AppButton, Card, EmptyState, Screen, Skeleton } from '@/components/primitives';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NodeItem } from '@/hooks/use-api';
import { errorMessage } from '@/lib/errors';
import { categoryFromMime, formatBytes, formatDate, tintFor } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { readText } from '@/lib/storage';

export async function saveNode(node: NodeItem): Promise<void> {
  if (!node.uri) throw new Error('This file has no local copy');
  if (Platform.OS === 'web') {
    const anchor = document.createElement('a');
    anchor.href = node.uri;
    anchor.download = node.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(node.uri, {
      dialogTitle: node.name,
      mimeType: node.mime_type ?? undefined,
    });
  }
}

function LocalImage({ node }: { node: NodeItem }) {
  return (
    <Image
      source={{ uri: node.uri ?? undefined }}
      style={{ flex: 1, backgroundColor: '#00000010' }}
      contentFit="contain"
      transition={150}
    />
  );
}

function MediaPreview({ node, kind }: { node: NodeItem; kind: 'video' | 'audio' }) {
  const theme = useTheme();
  const player = useVideoPlayer({ uri: node.uri ?? undefined }, (instance) => {
    instance.loop = false;
  });

  if (kind === 'audio') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three }}>
        <View
          style={[
            styles.audioBadge,
            { backgroundColor: theme.tintSoft, borderColor: theme.border },
          ]}>
          <Icon name="musical-notes" size={44} color={theme.tint} />
        </View>
        <ThemedText type="smallBold" numberOfLines={1} style={{ maxWidth: '80%', textAlign: 'center' }}>
          {node.name}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {formatBytes(node.size)}
        </ThemedText>
        <View style={styles.audioPlayer}>
          <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls
        contentFit="contain"
      />
    </View>
  );
}

function TextPreview({ node }: { node: NodeItem }) {
  const theme = useTheme();
  const query = useQuery({
    queryKey: ['file-text', node.id],
    staleTime: Infinity,
    queryFn: async () => {
      if (!node.uri) throw new Error('This file has no local copy');
      return readText(node.uri);
    },
  });

  if (query.isLoading) {
    return (
      <View style={{ padding: Spacing.three, gap: Spacing.two }}>
        <Skeleton height={14} width="100%" />
        <Skeleton height={14} width="92%" />
        <Skeleton height={14} width="78%" />
        <Skeleton height={14} width="86%" />
      </View>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Could not load the text"
        message={errorMessage(query.error)}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.three }}>
      <Text
        selectable
        style={{
          fontFamily: 'monospace',
          fontSize: 13,
          lineHeight: 20,
          color: theme.text,
        }}>
        {query.data}
      </Text>
    </ScrollView>
  );
}

function FallbackPreview({ node, onOpen }: { node: NodeItem; onOpen?: () => void }) {
  const theme = useTheme();
  const category = categoryFromMime(node.mime_type, node.type);
  const tint = tintFor(category);

  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
      <View style={{ alignItems: 'center', paddingVertical: Spacing.four, gap: Spacing.two }}>
        <View
          style={[
            styles.fileBadge,
            { backgroundColor: `${tint}1F`, borderColor: theme.border },
          ]}>
          <Icon name={iconForCategory(category)} size={46} color={tint} />
        </View>
        <ThemedText type="smallBold" style={{ textAlign: 'center' }}>
          {node.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatBytes(node.size)}
          {node.mime_type ? ` · ${node.mime_type}` : ''}
        </ThemedText>
      </View>

      <Card>
        <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.two }}>
          Preview is not available for this file type. Share it to open in another app.
        </ThemedText>
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <AppButton
            title="Share"
            size="sm"
            icon="share-outline"
            onPress={() => {
              haptics.light();
              void saveNode(node)
                .then(() => toast.success('Ready to share'))
                .catch((err: unknown) => toast.error(errorMessage(err)));
            }}
          />
          {onOpen && category === 'pdf' ? (
            <AppButton title="Open" size="sm" variant="secondary" onPress={onOpen} />
          ) : null}
        </View>
      </Card>
    </ScrollView>
  );
}

export function PreviewContent({ node }: { node: NodeItem }) {
  const category = categoryFromMime(node.mime_type, node.type);

  if (!node.uri) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="File not found on this phone"
        message="The stored copy may have been removed."
      />
    );
  }

  switch (category) {
    case 'image':
      return <LocalImage node={node} />;
    case 'video':
      return <MediaPreview node={node} kind="video" />;
    case 'audio':
      return <MediaPreview node={node} kind="audio" />;
    case 'text':
    case 'code':
      return <TextPreview node={node} />;
    default:
      return <FallbackPreview node={node} />;
  }
}

/** Compact metadata block shown under previews. */
export function PreviewMeta({ node }: { node: NodeItem }) {
  const category = categoryFromMime(node.mime_type, node.type);
  const rows: [string, string][] = [
    ['Type', node.type === 'folder' ? 'Folder' : (node.mime_type ?? 'File')],
    ['Category', category],
    ['Size', node.type === 'file' ? formatBytes(node.size) : '—'],
    ['Added', formatDate(node.created_at)],
    ['Updated', formatDate(node.updated_at)],
  ];

  return (
    <View style={{ gap: Spacing.one }}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.metaRow}>
          <ThemedText type="small" themeColor="textSecondary">
            {label}
          </ThemedText>
          <ThemedText type="small" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
            {value}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

export function PreviewScreen({ node }: { node: NodeItem }) {
  return (
    <Screen>
      <PreviewContent node={node} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  audioBadge: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  audioPlayer: {
    width: '85%',
    aspectRatio: 16 / 5,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  fileBadge: {
    width: 118,
    height: 118,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
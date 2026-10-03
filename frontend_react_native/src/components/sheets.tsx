import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons';
import { AppButton, ErrorBanner, Field, Spinner } from '@/components/primitives';
import { saveNode } from '@/components/preview';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  useBreadcrumbs,
  useMoveNode,
  useNodes,
  useRenameNode,
  useToggleStar,
  useTrashNode,
  type NodeItem,
} from '@/hooks/use-api';
import { errorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
};

function Sheet({ visible, onClose, title, subtitle, children }: SheetProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />
        {title ? (
          <View style={{ gap: 2, marginBottom: Spacing.two }}>
            <ThemedText type="smallBold" style={{ fontSize: 17 }}>
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
        {children}
      </View>
    </Modal>
  );
}

export type SheetAction = {
  key: string;
  label: string;
  hint?: string;
  icon?: IconName;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function ActionSheet({
  visible,
  onClose,
  title,
  subtitle,
  actions,
}: SheetProps & { actions: SheetAction[] }) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <View style={{ gap: 2 }}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            disabled={action.disabled}
            onPress={() => {
              haptics.selection();
              onClose();
              setTimeout(action.onPress, 180);
            }}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor: pressed ? theme.scrim : 'transparent',
                opacity: action.disabled ? 0.4 : 1,
              },
            ]}>
            {action.icon ? (
              <Icon
                name={action.icon}
                size={19}
                color={action.destructive ? theme.danger : theme.tint}
                style={{ width: 24 }}
              />
            ) : (
              <View style={{ width: 24 }} />
            )}
            <View style={{ flex: 1 }}>
              <ThemedText
                type="small"
                themeColor={action.destructive ? 'danger' : 'text'}
                style={{ fontSize: 15 }}>
                {action.label}
              </ThemedText>
              {action.hint ? (
                <ThemedText type="caption" themeColor="textSecondary">
                  {action.hint}
                </ThemedText>
              ) : null}
            </View>
            {action.icon === 'checkmark' ? (
              <Icon name="checkmark" size={18} color={theme.tint} />
            ) : null}
          </Pressable>
        ))}
      </View>
      <AppButton title="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: Spacing.one }} />
    </Sheet>
  );
}

export function PromptDialog({
  visible,
  onClose,
  title,
  label,
  placeholder,
  defaultValue = '',
  confirmLabel = 'Save',
  onSubmit,
  onSuccessMessage,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => Promise<void> | void;
  onSuccessMessage?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [syncKey, setSyncKey] = useState(`${visible}:${defaultValue}`);
  const nextKey = `${visible}:${defaultValue}`;
  if (nextKey !== syncKey) {
    setSyncKey(nextKey);
    if (visible) {
      setValue(defaultValue);
      setError(null);
      setBusy(false);
    }
  }

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('This field is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      haptics.success();
      if (onSuccessMessage) toast.success(onSuccessMessage);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptics.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Field
        label={label}
        placeholder={placeholder}
        value={value}
        autoFocus
        onChangeText={setValue}
        onSubmitEditing={() => void submit()}
        returnKeyType="done"
        error={error}
      />
      <View style={styles.dialogActions}>
        <AppButton title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <AppButton
          title={confirmLabel}
          loading={busy}
          onPress={() => void submit()}
          style={{ flex: 1 }}
        />
      </View>
    </Sheet>
  );
}

export function ConfirmDialog({
  visible,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onSuccessMessage,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
  onSuccessMessage?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      if (destructive) {
        haptics.success();
      } else {
        haptics.light();
      }
      if (onSuccessMessage) toast.success(onSuccessMessage);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptics.error();
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {message ? (
        <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.two }}>
          {message}
        </ThemedText>
      ) : null}
      <ErrorBanner message={error} />
      <View style={styles.dialogActions}>
        <AppButton title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <AppButton
          title={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          loading={busy}
          onPress={() => void confirm()}
          style={{ flex: 1 }}
        />
      </View>
    </Sheet>
  );
}

export function NodeActionsSheet({
  node,
  visible,
  onClose,
  onOpen,
}: {
  node: NodeItem | null;
  visible: boolean;
  onClose: () => void;
  onOpen?: (node: NodeItem) => void;
}) {
  const [sub, setSub] = useState<'rename' | 'move' | 'delete' | null>(null);
  const rename = useRenameNode();
  const move = useMoveNode();
  const star = useToggleStar();
  const trash = useTrashNode();

  if (!node) return null;

  const shareNode = () => {
    void saveNode(node)
      .then(() => toast.success('Ready to share'))
      .catch((err: unknown) => toast.error(errorMessage(err)));
  };

  const actions: SheetAction[] = [
    {
      key: 'open',
      label: node.type === 'folder' ? 'Open' : 'Preview',
      icon: node.type === 'folder' ? 'folder-open-outline' : 'eye-outline',
      onPress: () => onOpen?.(node),
    },
    ...(node.type === 'file'
      ? [
          {
            key: 'share',
            label: 'Share',
            hint: 'Send with any app',
            icon: 'share-outline' as IconName,
            onPress: shareNode,
          },
        ]
      : []),
    {
      key: 'rename',
      label: 'Rename',
      icon: 'pencil-outline',
      onPress: () => setSub('rename'),
    },
    {
      key: 'star',
      label: node.is_starred ? 'Remove star' : 'Add to starred',
      icon: node.is_starred ? 'star' : 'star-outline',
      onPress: () => {
        star.mutate(node.id, {
          onSuccess: () =>
            toast.success(node.is_starred ? 'Removed from starred' : 'Added to starred'),
        });
      },
    },
    {
      key: 'move',
      label: 'Move to another folder',
      icon: 'folder-outline',
      onPress: () => setSub('move'),
    },
    {
      key: 'delete',
      label: 'Move to trash',
      icon: 'trash-outline',
      destructive: true,
      onPress: () => setSub('delete'),
    },
  ];

  return (
    <>
      <ActionSheet
        visible={visible && !sub}
        onClose={onClose}
        title={node.name}
        subtitle={node.type === 'folder' ? 'Folder' : (node.mime_type ?? 'File')}
        actions={actions}
      />
      <PromptDialog
        visible={sub === 'rename'}
        onClose={() => setSub(null)}
        title="Rename"
        label="Name"
        defaultValue={node.name}
        confirmLabel="Rename"
        onSubmit={async (name) => {
          await rename.mutateAsync({ id: node.id, name });
        }}
      />
      <MoveSheet
        visible={sub === 'move'}
        onClose={() => setSub(null)}
        currentNodeId={node.id}
        onMove={(target) => {
          move.mutate(
            { id: node.id, parentId: target },
            {
              onSuccess: () => toast.success('Moved'),
              onError: (err) => toast.error(errorMessage(err)),
            },
          );
        }}
      />
      <ConfirmDialog
        visible={sub === 'delete'}
        onClose={() => setSub(null)}
        title="Move to trash"
        message={`"${node.name}" will be moved to trash. You can restore it later.`}
        confirmLabel="Move to trash"
        destructive
        onConfirm={async () => {
          await trash.mutateAsync(node.id);
        }}
        onSuccessMessage="Moved to trash"
      />
    </>
  );
}

export function MoveSheet({
  visible,
  onClose,
  onMove,
  currentNodeId,
  title = 'Move to',
}: {
  visible: boolean;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
  currentNodeId: string | null;
  title?: string;
}) {
  const theme = useTheme();
  const [folderId, setFolderId] = useState<string | null>(null);
  const query = useNodes(folderId);
  const crumbs = useBreadcrumbs(folderId);
  const parentId =
    crumbs.data && crumbs.data.length > 1 ? crumbs.data[crumbs.data.length - 2].id : null;
  const folders = (query.data?.items ?? []).filter((node) => node.type === 'folder');
  const currentName = folderId
    ? (crumbs.data?.find((crumb) => crumb.id === folderId)?.name ?? 'this folder')
    : 'My files';

  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setFolderId(null);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={currentName}>
      {folderId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setFolderId(parentId)}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: pressed ? theme.scrim : 'transparent' },
          ]}>
          <Icon name="arrow-up-circle-outline" size={19} color={theme.tint} style={{ width: 24 }} />
          <ThemedText type="small" style={{ fontSize: 15 }}>
            Go up
          </ThemedText>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setFolderId(null)}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: pressed ? theme.scrim : 'transparent' },
          ]}>
          <Icon name="folder-open-outline" size={19} color={theme.tint} style={{ width: 24 }} />
          <ThemedText type="small" style={{ fontSize: 15 }}>
            My files (root)
          </ThemedText>
        </Pressable>
      )}

      <ScrollView style={{ maxHeight: 300 }}>
        {query.isLoading ? <Spinner label="Loading folders" /> : null}
        {folders.map((folder) => (
          <Pressable
            key={folder.id}
            accessibilityRole="button"
            disabled={folder.id === currentNodeId}
            onPress={() => {
              haptics.selection();
              setFolderId(folder.id);
            }}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor: pressed ? theme.scrim : 'transparent',
                opacity: folder.id === currentNodeId ? 0.4 : 1,
              },
            ]}>
            <Icon name="folder-outline" size={19} color={theme.tint} style={{ width: 24 }} />
            <ThemedText type="small" style={{ fontSize: 15, flex: 1 }} numberOfLines={1}>
              {folder.name}
            </ThemedText>
            <Icon name="chevron-forward" size={16} color={theme.textSecondary} />
          </Pressable>
        ))}
        {!query.isLoading && folders.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={{ padding: Spacing.two }}>
            No subfolders here
          </ThemedText>
        ) : null}
      </ScrollView>

      <View style={styles.dialogActions}>
        <AppButton title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <AppButton
          title="Move here"
          onPress={() => {
            onMove(folderId);
            onClose();
          }}
          style={{ flex: 1 }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
    ...Shadows.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.one,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.sm,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
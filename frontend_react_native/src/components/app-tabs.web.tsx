import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet } from 'react-native';

import { Icon, type IconName } from './icons';
import { ThemedText } from './themed-text';

import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export default function AppTabs() {
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="folder-outline" label="Files" />
          </TabTrigger>
          <TabTrigger name="recent" href="/recent" asChild>
            <TabButton icon="time-outline" label="Recent" />
          </TabTrigger>
          <TabTrigger name="starred" href="/starred" asChild>
            <TabButton icon="star-outline" label="Starred" />
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton icon="settings-outline" label="Settings" />
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

function TabButton({
  icon,
  label,
  isFocused,
  ...props
}: TabTriggerSlotProps & { icon: IconName; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      {...props}
      onPress={(event) => {
        haptics.selection();
        props.onPress?.(event);
      }}
      style={({ pressed }) => [
        styles.tabButton,
        {
          backgroundColor: isFocused ? theme.backgroundSelected : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Icon name={icon} size={19} color={isFocused ? theme.tint : theme.textSecondary} />
      <ThemedText
        type="small"
        themeColor={isFocused ? 'text' : 'textSecondary'}
        style={styles.tabLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function CustomTabList(props: TabListProps) {
  const theme = useTheme();
  return (
    <View
      {...props}
      style={[
        styles.tabListContainer,
        { backgroundColor: theme.background, borderTopColor: theme.border },
      ]}>
      <View
        style={[
          styles.innerContainer,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        {props.children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    width: '100%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Radius.pill,
    maxWidth: 560,
    width: '100%',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    flex: 1,
    justifyContent: 'center',
  },
  tabLabel: {
    fontWeight: '600',
    fontSize: 13,
  },
});
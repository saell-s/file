import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppMark } from '@/components/icons';
import { Card, Group, ProgressBar, Screen, SectionHeader, SettingRow } from '@/components/primitives';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStorage } from '@/hooks/use-api';
import { formatBytes } from '@/lib/format';
import { useSecurity } from '@/store/security';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const storage = useStorage();
  const lockEnabled = useSecurity((state) => state.lockEnabled);
  const supported = useSecurity((state) => state.supported);

  const data = storage.data;
  const usedRatio = data?.limit_bytes ? data.used_bytes / data.limit_bytes : 0;

  return (
    <Screen>
      <ScreenHeader title="Settings" large subtitle="Everything stays on this phone" />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.three,
          paddingBottom: BottomTabInset + Spacing.four,
          gap: Spacing.two,
        }}>
        <View style={{ alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.three }}>
          <AppMark size={84} />
          <ThemedText type="smallBold" style={{ fontSize: 19, marginTop: Spacing.one }}>
            FileBox
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            Private file manager · on-device
          </ThemedText>
        </View>

        <Card>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: Spacing.two,
            }}>
            <ThemedText type="small" themeColor="textSecondary">
              Used by FileBox
            </ThemedText>
            <ThemedText type="small" style={{ fontWeight: '600' }}>
              {data
                ? `${formatBytes(data.used_bytes)}${data.limit_bytes ? ` of ${formatBytes(data.limit_bytes)}` : ''}`
                : '—'}
            </ThemedText>
          </View>
          <ProgressBar value={usedRatio} tone={usedRatio > 0.9 ? theme.danger : theme.tint} />
        </Card>

        <SectionHeader title="Library" />
        <Group>
          <SettingRow
            icon="star-outline"
            label="Starred"
            hint="Pinned items"
            onPress={() => router.push('/starred')}
          />
          <SettingRow
            icon="trash-outline"
            label="Trash"
            hint="Recently deleted"
            onPress={() => router.push('/trash')}
          />
          <SettingRow
            icon="pie-chart-outline"
            label="Storage"
            value={data ? formatBytes(data.used_bytes) : undefined}
            onPress={() => router.push('/storage')}
            last
          />
        </Group>

        <SectionHeader title="Security" />
        <Group>
          <SettingRow
            icon="lock-closed-outline"
            label="App lock"
            hint={
              supported
                ? lockEnabled
                  ? 'Biometrics or passcode required to open'
                  : 'Lock is off'
                : 'Set a passcode or biometrics in system settings'
            }
            value={supported ? (lockEnabled ? 'On' : 'Off') : undefined}
            onPress={() => router.push('/settings/security')}
          />
          <SettingRow
            icon="shield-checkmark-outline"
            label="Security log"
            hint="Unlocks and important actions"
            onPress={() => router.push('/activity')}
            last
          />
        </Group>

        <View style={{ paddingTop: Spacing.three }}>
          <ThemedText
            type="caption"
            themeColor="textSecondary"
            style={{ textAlign: 'center', lineHeight: 18 }}>
            No account, no cloud, no passwords.{'\n'}Everything is stored locally on this device.
          </ThemedText>
        </View>
      </ScrollView>
    </Screen>
  );
}
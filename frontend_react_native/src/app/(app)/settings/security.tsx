import { ScrollView, View } from 'react-native';

import { AppButton, Card, Group, Screen, SettingRow } from '@/components/primitives';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { toast } from '@/components/toast';
import { haptics } from '@/lib/haptics';
import { useSecurity } from '@/store/security';

const BEHAVIOURS = [
  'FileBox locks automatically when you switch away from it.',
  'Unlock with Face ID or fingerprint, or fall back to your device passcode.',
  'There is no FileBox password to forget — your device lock is the only key.',
  'Files stay on this phone, behind your device lock.',
];

export default function SecurityScreen() {
  const supported = useSecurity((state) => state.supported);
  const lockEnabled = useSecurity((state) => state.lockEnabled);
  const setLockEnabled = useSecurity((state) => state.setLockEnabled);
  const lock = useSecurity((state) => state.lock);

  const lockNow = () => {
    haptics.warning();
    lock();
    toast.info('FileBox locked');
  };

  return (
    <Screen>
      <ScreenHeader title="App lock" showBack subtitle="Protect your files on this device" />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
        <Group>
          <SettingRow
            icon="lock-closed-outline"
            label="Lock with device security"
            hint={
              supported
                ? 'Requires Face ID, fingerprint or your device passcode every time FileBox opens.'
                : 'No screen lock detected on this device.'
            }
            toggle={{
              value: lockEnabled && supported,
              disabled: !supported,
              onChange: (next) => {
                setLockEnabled(next);
                toast.success(next ? 'App lock enabled' : 'App lock disabled');
              },
            }}
            last
          />
        </Group>

        {supported ? (
          <Card>
            <ThemedText type="smallBold" style={{ marginBottom: Spacing.two }}>
              How it works
            </ThemedText>
            {BEHAVIOURS.map((line) => (
              <View key={line} style={{ paddingVertical: Spacing.one }}>
                <ThemedText type="small" themeColor="textSecondary" style={{ lineHeight: 20 }}>
                  {line}
                </ThemedText>
              </View>
            ))}
            <AppButton
              title="Lock now"
              variant="secondary"
              icon="lock-closed-outline"
              onPress={lockNow}
              style={{ marginTop: Spacing.three, alignSelf: 'flex-start' }}
            />
          </Card>
        ) : (
          <Card>
            <ThemedText type="smallBold" style={{ marginBottom: Spacing.two }}>
              Set up a screen lock first
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ lineHeight: 20 }}>
              Open your phone&apos;s Settings, set up a passcode or biometrics (Face ID &amp;
              Passcode on iPhone, Security and screen lock on Android), then return here to enable
              the FileBox lock.
            </ThemedText>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
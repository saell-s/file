import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppMark } from '@/components/icons';
import { AppButton, Screen } from '@/components/primitives';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSecurity } from '@/store/security';
import { haptics } from '@/lib/haptics';

export function LockScreen() {
  const unlock = useSecurity((state) => state.unlock);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    const run = async () => {
      setBusy(true);
      const ok = await unlock();
      setFailed(!ok);
      setBusy(false);
    };
    void run();
  }, [unlock]);

  const onUnlock = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await unlock();
    setFailed(!ok);
    setBusy(false);
  };

  return (
    <Screen>
      <View style={styles.container}>
        <AppMark size={88} />
        <ThemedText type="title" style={{ marginTop: Spacing.three }}>
          FileBox is locked
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Use Face ID, your fingerprint or device passcode to unlock your files.
        </ThemedText>

        {failed ? (
          <View style={styles.error}>
            <ThemedText type="small" themeColor="danger" style={{ textAlign: 'center' }}>
              Could not verify it is you. Try again.
            </ThemedText>
          </View>
        ) : null}

        <AppButton
          title={busy ? 'Waiting…' : 'Unlock FileBox'}
          icon="lock-open-outline"
          loading={busy}
          onPress={() => {
            haptics.light();
            void onUnlock();
          }}
          style={{ alignSelf: 'stretch', marginTop: Spacing.three }}
        />

        <ThemedText type="caption" themeColor="textSecondary" style={styles.hint}>
          Your files never leave this phone.
        </ThemedText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 21,
  },
  error: {
    paddingVertical: Spacing.two,
  },
  hint: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
});
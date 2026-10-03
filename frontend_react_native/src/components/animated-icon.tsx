import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { Easing, FadeOut, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppMark } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const DURATION = 520;

/** Branded launch overlay shown until the first screen is laid out. */
export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const fadeKeyframe = new Keyframe({
    0: { opacity: 1, transform: [{ scale: 1 }] },
    60: { opacity: 1 },
    100: {
      opacity: 0,
      transform: [{ scale: 1.06 }],
      easing: Easing.quad,
    },
  });

  const markKeyframe = new Keyframe({
    0: { transform: [{ scale: 0.86 }], opacity: 0 },
    40: { transform: [{ scale: 1 }], opacity: 1 },
    100: { transform: [{ scale: 1 }], opacity: 1 },
  });

  const content = (
    <View style={styles.content}>
      <Animated.View entering={markKeyframe.duration(DURATION)}>
        <AppMark size={92} />
      </Animated.View>
      <Animated.View entering={markKeyframe.delay(80).duration(DURATION)}>
        <ThemedText type="subtitle" style={{ marginTop: Spacing.three }}>
          FileBox
        </ThemedText>
      </Animated.View>
      <Animated.View entering={markKeyframe.delay(140).duration(DURATION)}>
        <ThemedText type="caption" themeColor="textSecondary">
          Your files, on this phone
        </ThemedText>
      </Animated.View>
    </View>
  );

  if (!animate) {
    return (
      <View
        onLayout={() => {
          void SplashScreen.hideAsync().finally(() => setAnimate(true));
        }}
        style={styles.overlay}>
        {content}
      </View>
    );
  }

  return (
    <Animated.View
      entering={fadeKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      exiting={FadeOut.duration(120)}
      style={styles.overlay}>
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  content: {
    alignItems: 'center',
  },
});
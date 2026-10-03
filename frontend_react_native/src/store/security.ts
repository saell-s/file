import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { logActivity } from '@/lib/db';
import { readToken, writeToken } from '@/lib/secure-storage';

const LOCK_KEY = 'filebox.lockEnabled';

type SecurityState = {
  initialized: boolean;
  locked: boolean;
  supported: boolean;
  lockEnabled: boolean;
  init: () => Promise<void>;
  unlock: () => Promise<boolean>;
  lock: () => void;
  setLockEnabled: (value: boolean) => void;
};

function isWeb(): boolean {
  return Platform.OS === 'web';
}

async function detectSupport(): Promise<boolean> {
  if (isWeb()) return false;
  try {
    return await LocalAuthentication.isEnrolledAsync();
  } catch {
    return false;
  }
}

export const useSecurity = create<SecurityState>((set, get) => ({
  initialized: false,
  locked: false,
  supported: false,
  lockEnabled: true,

  init: async () => {
    if (get().initialized) return;
    const stored = await readToken(LOCK_KEY);
    const lockEnabled = stored !== 'false';
    const supported = await detectSupport();
    set({
      initialized: true,
      lockEnabled,
      supported,
      locked: lockEnabled && supported,
    });
    if (lockEnabled && supported) void logActivity('app.lock', 'FileBox locked on launch');
  },

  unlock: async () => {
    if (isWeb() || !get().supported) {
      set({ locked: false });
      return true;
    }
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock FileBox',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
        disableDeviceFallback: false,
      });
      if (result.success) {
        set({ locked: false });
        void logActivity('app.unlock', 'Face ID / fingerprint / passcode accepted');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  lock: () => {
    if (!get().supported || !get().lockEnabled) return;
    if (get().locked) return;
    set({ locked: true });
    void logActivity('app.lock', 'FileBox locked (app sent to background)');
  },

  setLockEnabled: (value: boolean) => {
    set({ lockEnabled: value });
    void writeToken(LOCK_KEY, String(value));
    set({ locked: value && get().supported });
  },
}));

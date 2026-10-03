import { Platform } from 'react-native';

import * as SecureStore from 'expo-secure-store';

const memory = new Map<string, string>();

const available = Platform.OS !== 'web';

export async function readToken(key: string): Promise<string | null> {
  if (available) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return memory.get(key) ?? null;
    }
  }
  try {
    return globalThis.localStorage?.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export async function writeToken(key: string, value: string): Promise<void> {
  if (available) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      memory.set(key, value);
      return;
    }
  }
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

export async function clearToken(key: string): Promise<void> {
  if (available) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      memory.delete(key);
    }
    return;
  }
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    memory.delete(key);
  }
}

import { create } from 'zustand';

import { readToken, writeToken } from '@/lib/secure-storage';

const VIEW_KEY = 'filebox.viewMode';
const SORT_KEY = 'filebox.sortKey';

type PreferencesState = {
  hydrated: boolean;
  viewMode: 'list' | 'grid';
  sortKey: string;
  hydrate: () => Promise<void>;
  setViewMode: (value: 'list' | 'grid') => void;
  setSortKey: (value: string) => void;
};

export const usePreferences = create<PreferencesState>((set) => ({
  hydrated: false,
  viewMode: 'list',
  sortKey: 'name',

  hydrate: async () => {
    const [viewMode, sortKey] = await Promise.all([
      readToken(VIEW_KEY),
      readToken(SORT_KEY),
    ]);
    set({
      hydrated: true,
      viewMode: viewMode === 'grid' ? 'grid' : 'list',
      sortKey: sortKey ?? 'name',
    });
  },

  setViewMode: (value) => {
    set({ viewMode: value });
    void writeToken(VIEW_KEY, value);
  },

  setSortKey: (value) => {
    set({ sortKey: value });
    void writeToken(SORT_KEY, value);
  },
}));

import { create } from 'zustand';

import { errorMessage } from '@/lib/errors';
import { importFile } from '@/lib/db';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error';

export type PickedFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  file?: File;
};

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: UploadStatus;
  error?: string;
  parentId: string | null;
  file: PickedFile;
};

type UploadState = {
  items: UploadItem[];
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  enqueue: (files: PickedFile[], parentId?: string | null) => void;
  retry: (id: string) => void;
  dismiss: (id: string) => void;
  clearFinished: () => void;
};

let completionListener: (() => void) | null = null;
export function setUploadCompleteListener(listener: (() => void) | null) {
  completionListener = listener;
}

const MAX_PARALLEL = 2;
let running = 0;
const pending: string[] = [];
let counter = 0;

function patchItem(id: string, patch: Partial<UploadItem>) {
  useUploads.setState((state) => ({
    items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));
}

function pump() {
  while (running < MAX_PARALLEL && pending.length) {
    const id = pending.shift();
    if (!id) break;
    const item = useUploads.getState().items.find((entry) => entry.id === id);
    if (!item || item.status === 'done') continue;
    running += 1;
    importItem(item).finally(() => {
      running -= 1;
      pump();
    });
  }
}

async function importItem(item: UploadItem) {
  patchItem(item.id, { status: 'uploading', progress: 0.1, error: undefined });
  try {
    await importFile({
      sourceUri: item.file.uri,
      name: item.file.name,
      mimeType: item.file.mimeType ?? null,
      parentId: item.parentId,
    });
    patchItem(item.id, { status: 'done', progress: 1 });
    completionListener?.();
  } catch (error) {
    patchItem(item.id, { status: 'error', error: errorMessage(error, 'Could not save the file') });
  }
}

export const useUploads = create<UploadState>((set) => ({
  items: [],
  expanded: true,

  setExpanded: (value) => set({ expanded: value }),

  enqueue: (files, parentId = null) => {
    const created: UploadItem[] = files.map((file) => ({
      id: `up-${Date.now()}-${counter++}`,
      name: file.name,
      size: file.size ?? 0,
      progress: 0,
      status: 'queued',
      parentId,
      file,
    }));
    set((state) => ({ items: [...state.items, ...created], expanded: true }));
    pending.push(...created.map((entry) => entry.id));
    pump();
  },

  retry: (id) => {
    patchItem(id, { status: 'queued', progress: 0, error: undefined });
    pending.push(id);
    pump();
  },

  dismiss: (id) => {
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
  },

  clearFinished: () => {
    set((state) => ({
      items: state.items.filter((item) => item.status === 'queued' || item.status === 'uploading'),
    }));
  },
}));

export function activeUploadCount(state: UploadState): number {
  return state.items.filter((item) => item.status !== 'done').length;
}

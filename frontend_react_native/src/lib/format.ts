export type FileCategory =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'code'
  | 'archive'
  | 'file';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function categoryFromMime(mime: string | null | undefined, type?: string): FileCategory {
  if (type === 'folder') return 'folder';
  const value = (mime ?? '').toLowerCase();
  if (value.startsWith('image/')) return 'image';
  if (value.startsWith('video/')) return 'video';
  if (value.startsWith('audio/')) return 'audio';
  if (value === 'application/pdf') return 'pdf';
  if (value.startsWith('text/')) return 'text';
  if (
    value.includes('json') ||
    value.includes('xml') ||
    value.includes('javascript') ||
    value.includes('typescript') ||
    value.includes('yaml') ||
    value.includes('x-python')
  ) {
    return 'code';
  }
  if (value.includes('zip') || value.includes('tar') || value.includes('gzip') || value.includes('rar') || value.includes('7z')) {
    return 'archive';
  }
  return 'file';
}

const TINTS: Record<FileCategory, string> = {
  folder: '#F0A500',
  image: '#1B9E63',
  video: '#E5484D',
  audio: '#8B5CF6',
  pdf: '#E08700',
  text: '#2F7CF6',
  code: '#0EA5B7',
  archive: '#F2762C',
  file: '#8E8E96',
};

export function tintFor(category: FileCategory): string {
  return TINTS[category];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

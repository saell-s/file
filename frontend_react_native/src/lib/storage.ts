import { Directory, File, Paths } from 'expo-file-system';

const LIBRARY_DIR = 'filebox';

export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function extensionOf(name: string): string {
  const match = name.match(/\.[A-Za-z0-9]+$/);
  return match ? match[0].toLowerCase() : '';
}

export function contentDirectory(): Directory {
  const dir = new Directory(Paths.document, LIBRARY_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function contentFile(id: string, name: string): File {
  return new File(contentDirectory(), `${id}${extensionOf(name)}`);
}

/** Copies a picked file (cache/local uri) into the app's private storage. */
export async function writeContent(
  sourceUri: string,
  id: string,
  name: string,
): Promise<{ uri: string; size: number }> {
  const destination = contentFile(id, name);
  if (destination.exists) destination.delete();
  const source = new File(sourceUri);
  await source.copy(destination, { overwrite: true });
  return { uri: destination.uri, size: destination.size ?? 0 };
}

export async function deleteContent(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // best effort — orphaned content is ignored
  }
}

export async function readText(uri: string): Promise<string> {
  return new File(uri).text();
}

export async function writeTextFile(
  id: string,
  name: string,
  text: string,
): Promise<{ uri: string; size: number }> {
  const file = contentFile(id, name);
  if (file.exists) file.delete();
  file.create({ intermediates: true });
  file.write(text);
  return { uri: file.uri, size: file.size ?? text.length };
}

export function diskTotal(): number {
  try {
    return Paths.totalDiskSpace;
  } catch {
    return 0;
  }
}

export function diskFree(): number {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return 0;
  }
}

import * as SQLite from 'expo-sqlite';

import { categoryFromMime, type FileCategory } from '@/lib/format';
import { deleteContent, diskFree, diskTotal, uid, writeContent, writeTextFile } from '@/lib/storage';

export type NodeType = 'folder' | 'file';

export type NodeItem = {
  id: string;
  name: string;
  type: NodeType;
  parent_id: string | null;
  size: number;
  mime_type: string | null;
  is_starred: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  uri: string | null;
};

export type Breadcrumb = { id: string; name: string };

export type NodeListOut = {
  items: NodeItem[];
  total: number;
  breadcrumbs: Breadcrumb[];
};

export type StorageOut = {
  used_bytes: number;
  limit_bytes: number;
  free_bytes: number;
  percent_used: number;
  by_type: Record<string, { count: number; bytes: number }>;
  tier: string;
};

export type SecurityEvent = {
  id: string;
  action: string;
  detail: string | null;
  ip: string | null;
  created_at: string;
};

export type Sort = 'name' | 'size' | 'date' | 'created';
export type Order = 'asc' | 'desc';

type NodeRow = {
  id: string;
  parent_id: string | null;
  name: string;
  type: NodeType;
  mime_type: string | null;
  size: number;
  uri: string | null;
  is_starred: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  uri TEXT,
  is_starred INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id, deleted_at);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
`;

const SORT_COLUMNS: Record<Sort, string> = {
  name: 'name COLLATE NOCASE',
  size: 'size',
  date: 'updated_at',
  created: 'created_at',
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function toItem(row: NodeRow): NodeItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    parent_id: row.parent_id,
    size: row.size,
    mime_type: row.mime_type,
    is_starred: !!row.is_starred,
    is_deleted: !!row.deleted_at,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    uri: row.uri,
  };
}

async function seed(db: SQLite.SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();
  const folders = ['Documents', 'Photos'];
  for (const name of folders) {
    const id = uid();
    await db.runAsync(
      `INSERT INTO nodes (id, parent_id, name, type, mime_type, size, uri, is_starred, deleted_at, created_at, updated_at)
       VALUES (?, NULL, ?, 'folder', NULL, 0, NULL, 0, NULL, ?, ?)`,
      id,
      name,
      now,
      now,
    );
  }
  const fileId = uid();
  const welcome = await writeTextFile(
    fileId,
    'Welcome.txt',
    'Welcome to FileBox!\n\nEverything here is stored on this phone only.\nNo account, no cloud - unlock with Face ID / fingerprint / passcode.\n',
  );
  await db.runAsync(
    `INSERT INTO nodes (id, parent_id, name, type, mime_type, size, uri, is_starred, deleted_at, created_at, updated_at)
     VALUES (?, NULL, 'Welcome.txt', 'file', 'text/plain', ?, ?, 1, NULL, ?, ?)`,
    fileId,
    welcome.size,
    welcome.uri,
    now,
    now,
  );
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version < 1) {
    await db.execAsync(SCHEMA);
    await seed(db);
    await db.execAsync('PRAGMA user_version = 1');
  }
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('filebox.db');
    await migrate(db);
    return db;
  })();
  return dbPromise;
}

export async function logActivity(action: string, detail: string): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO activity (action, detail, created_at) VALUES (?, ?, ?)',
      action,
      detail,
      new Date().toISOString(),
    );
  } catch {
    // logging must never break the flow
  }
}

export async function listActivity(): Promise<SecurityEvent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; action: string; detail: string | null; created_at: string }>(
    'SELECT id, action, detail, created_at FROM activity ORDER BY created_at DESC, id DESC LIMIT 500',
  );
  return rows.map((row) => ({
    id: String(row.id),
    action: row.action,
    detail: row.detail,
    ip: null,
    created_at: row.created_at,
  }));
}

export async function clearActivity(): Promise<{ message: string }> {
  const db = await getDb();
  await db.runAsync('DELETE FROM activity');
  return { message: 'Security log cleared' };
}

async function breadcrumbsOf(db: SQLite.SQLiteDatabase, id: string): Promise<Breadcrumb[]> {
  const crumbs: Breadcrumb[] = [];
  let current = id;
  for (let depth = 0; depth < 64; depth += 1) {
    const row = await db.getFirstAsync<{ id: string; name: string; parent_id: string | null }>(
      'SELECT id, name, parent_id FROM nodes WHERE id = ?',
      current,
    );
    if (!row) break;
    crumbs.unshift({ id: row.id, name: row.name });
    if (!row.parent_id) break;
    current = row.parent_id;
  }
  return crumbs;
}

export async function listChildren(
  parentId: string | null,
  sort: Sort = 'name',
  order: Order = 'asc',
): Promise<NodeListOut> {
  const db = await getDb();
  const column = SORT_COLUMNS[sort] ?? SORT_COLUMNS.name;
  const direction = order === 'desc' ? 'DESC' : 'ASC';
  const params = [parentId];
  const where = parentId ? 'parent_id = ?' : 'parent_id IS NULL';
  const [items, totalRow, breadcrumbs] = await Promise.all([
    db.getAllAsync<NodeRow>(
      `SELECT * FROM nodes WHERE ${where} AND deleted_at IS NULL ORDER BY type DESC, ${column} ${direction}`,
      params,
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM nodes WHERE ${where} AND deleted_at IS NULL`,
      params,
    ),
    parentId ? breadcrumbsOf(db, parentId) : Promise.resolve([] as Breadcrumb[]),
  ]);
  return {
    items: items.map(toItem),
    total: totalRow?.total ?? items.length,
    breadcrumbs,
  };
}

export async function getNode(id: string): Promise<NodeItem | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<NodeRow>('SELECT * FROM nodes WHERE id = ?', id);
  return row ? toItem(row) : null;
}

export async function getBreadcrumbs(id: string): Promise<Breadcrumb[]> {
  const db = await getDb();
  return breadcrumbsOf(db, id);
}

export async function listStarred(): Promise<NodeListOut> {
  const db = await getDb();
  const items = await db.getAllAsync<NodeRow>(
    'SELECT * FROM nodes WHERE is_starred = 1 AND deleted_at IS NULL ORDER BY updated_at DESC',
  );
  return { items: items.map(toItem), total: items.length, breadcrumbs: [] };
}

export async function listRecent(limit = 50): Promise<NodeListOut> {
  const db = await getDb();
  const items = await db.getAllAsync<NodeRow>(
    'SELECT * FROM nodes WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?',
    limit,
  );
  return { items: items.map(toItem), total: items.length, breadcrumbs: [] };
}

export async function searchNodes(query: string): Promise<NodeListOut> {
  const db = await getDb();
  const pattern = `%${query.replace(/[%_]/g, '')}%`;
  const items = await db.getAllAsync<NodeRow>(
    "SELECT * FROM nodes WHERE deleted_at IS NULL AND name LIKE ? ORDER BY updated_at DESC LIMIT 100",
    pattern,
  );
  return { items: items.map(toItem), total: items.length, breadcrumbs: [] };
}

export async function listTrash(): Promise<NodeListOut> {
  const db = await getDb();
  const items = await db.getAllAsync<NodeRow>(
    'SELECT * FROM nodes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC',
  );
  return { items: items.map(toItem), total: items.length, breadcrumbs: [] };
}

export async function storageStats(): Promise<StorageOut> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ type: NodeType; size: number; mime_type: string | null }>(
    'SELECT type, size, mime_type FROM nodes WHERE deleted_at IS NULL',
  );
  const by_type: Record<string, { count: number; bytes: number }> = {};
  let used = 0;
  for (const row of rows) {
    const category: FileCategory =
      row.type === 'folder' ? 'folder' : categoryFromMime(row.mime_type, row.type);
    const bucket = (by_type[category] ??= { count: 0, bytes: 0 });
    bucket.count += 1;
    bucket.bytes += row.size;
    used += row.size;
  }
  const limit = diskTotal();
  const free = diskFree();
  return {
    used_bytes: used,
    limit_bytes: limit,
    free_bytes: free,
    percent_used: limit > 0 ? (used / limit) * 100 : 0,
    by_type,
    tier: 'On-device',
  };
}

async function assertUniqueName(
  db: SQLite.SQLiteDatabase,
  parentId: string | null,
  name: string,
  excludeId?: string,
): Promise<void> {
  const row = parentId
    ? await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL AND name = ? COLLATE NOCASE',
        parentId,
        name,
      )
    : await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL AND name = ? COLLATE NOCASE',
        name,
      );
  if (row && row.id !== excludeId) {
    throw new Error(`"${name}" already exists here. Choose another name.`);
  }
}

export async function createFolder(
  name: string,
  parentId: string | null,
): Promise<NodeItem> {
  const db = await getDb();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name is required');
  await assertUniqueName(db, parentId, trimmed);
  const id = uid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO nodes (id, parent_id, name, type, mime_type, size, uri, is_starred, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, 'folder', NULL, 0, NULL, 0, NULL, ?, ?)`,
    id,
    parentId,
    trimmed,
    now,
    now,
  );
  await logActivity('folder.create', trimmed);
  const created = await getNode(id);
  if (!created) throw new Error('Could not create the folder');
  return created;
}

export async function renameNode(id: string, name: string): Promise<NodeItem> {
  const db = await getDb();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required');
  const node = await getNode(id);
  if (!node) throw new Error('Item not found');
  await assertUniqueName(db, node.parent_id, trimmed, id);
  await db.runAsync('UPDATE nodes SET name = ?, updated_at = ? WHERE id = ?', trimmed, new Date().toISOString(), id);
  await logActivity('node.rename', `${node.name} → ${trimmed}`);
  const updated = await getNode(id);
  if (!updated) throw new Error('Item not found');
  return updated;
}

async function isDescendant(
  db: SQLite.SQLiteDatabase,
  candidateParentId: string,
  folderId: string,
): Promise<boolean> {
  let current: string | null = candidateParentId;
  for (let depth = 0; depth < 64 && current; depth += 1) {
    if (current === folderId) return true;
    const row: { parent_id: string | null } | null = await db.getFirstAsync<{
      parent_id: string | null;
    }>('SELECT parent_id FROM nodes WHERE id = ?', current);
    current = row?.parent_id ?? null;
  }
  return false;
}

export async function moveNode(id: string, parentId: string | null): Promise<NodeItem> {
  const db = await getDb();
  const node = await getNode(id);
  if (!node) throw new Error('Item not found');
  if (node.type === 'folder' && parentId) {
    if (parentId === id) throw new Error('Cannot move a folder into itself');
    if (await isDescendant(db, parentId, id)) throw new Error('Cannot move a folder into its own subfolder');
  }
  if (parentId === node.parent_id) return node;
  await assertUniqueName(db, parentId, node.name, id);
  await db.runAsync('UPDATE nodes SET parent_id = ?, updated_at = ? WHERE id = ?', parentId, new Date().toISOString(), id);
  await logActivity('node.move', node.name);
  const updated = await getNode(id);
  if (!updated) throw new Error('Item not found');
  return updated;
}

export async function toggleStar(id: string): Promise<NodeItem> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE nodes SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1, updated_at = ? WHERE id = ?',
    new Date().toISOString(),
    id,
  );
  const updated = await getNode(id);
  if (!updated) throw new Error('Item not found');
  return updated;
}

export async function trashNode(id: string): Promise<{ message: string }> {
  const db = await getDb();
  const node = await getNode(id);
  if (!node) throw new Error('Item not found');
  const now = new Date().toISOString();
  await db.runAsync(
    `WITH RECURSIVE subtree(id) AS (
       SELECT id FROM nodes WHERE id = ?
       UNION ALL
       SELECT n.id FROM nodes n JOIN subtree ON n.parent_id = subtree.id
     )
     UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NULL`,
    id,
    now,
    now,
  );
  await logActivity('node.trash', node.name);
  return { message: `"${node.name}" moved to trash` };
}

export async function restoreNode(id: string): Promise<{ message: string }> {
  const db = await getDb();
  const node = await getNode(id);
  if (!node) throw new Error('Item not found');
  const now = new Date().toISOString();
  await db.runAsync(
    `WITH RECURSIVE subtree(id) AS (
       SELECT id FROM nodes WHERE id = ?
       UNION ALL
       SELECT n.id FROM nodes n JOIN subtree ON n.parent_id = subtree.id
     )
     UPDATE nodes SET deleted_at = NULL, updated_at = ? WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NOT NULL`,
    id,
    now,
  );
  await logActivity('node.restore', node.name);
  return { message: `"${node.name}" restored` };
}

async function subtreeNodes(db: SQLite.SQLiteDatabase, id: string): Promise<NodeItem[]> {
  const rows = await db.getAllAsync<NodeRow>(
    `WITH RECURSIVE subtree(id) AS (
       SELECT id FROM nodes WHERE id = ?
       UNION ALL
       SELECT n.id FROM nodes n JOIN subtree ON n.parent_id = subtree.id
     )
     SELECT * FROM nodes WHERE id IN (SELECT id FROM subtree)`,
    id,
  );
  return rows.map(toItem);
}

export async function purgeNode(id: string): Promise<{ message: string }> {
  const db = await getDb();
  const node = await getNode(id);
  if (!node) throw new Error('Item not found');
  const subtree = await subtreeNodes(db, id);
  await db.runAsync(
    `WITH RECURSIVE subtree(id) AS (
       SELECT id FROM nodes WHERE id = ?
       UNION ALL
       SELECT n.id FROM nodes n JOIN subtree ON n.parent_id = subtree.id
     )
     DELETE FROM nodes WHERE id IN (SELECT id FROM subtree)`,
    id,
  );
  for (const entry of subtree) {
    if (entry.type === 'file') await deleteContent(entry.uri);
  }
  await logActivity('node.purge', `"${node.name}" deleted forever`);
  return { message: `"${node.name}" deleted forever` };
}

export async function emptyTrash(): Promise<{ message: string }> {
  const db = await getDb();
  const trashed = await db.getAllAsync<NodeRow>(
    'SELECT * FROM nodes WHERE deleted_at IS NOT NULL',
  );
  if (!trashed.length) return { message: 'Trash is already empty' };
  for (const row of trashed) {
    const subtree = await subtreeNodes(db, row.id);
    if (!subtree.length) continue;
    await db.runAsync(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM nodes WHERE id = ?
         UNION ALL
         SELECT n.id FROM nodes n JOIN subtree ON n.parent_id = subtree.id
       )
       DELETE FROM nodes WHERE id IN (SELECT id FROM subtree)`,
      row.id,
    );
    for (const entry of subtree) {
      if (entry.type === 'file') await deleteContent(entry.uri);
    }
  }
  await logActivity('trash.empty', `${trashed.length} item(s) purged`);
  return { message: 'Trash emptied' };
}

export async function importFile(input: {
  sourceUri: string;
  name: string;
  mimeType?: string | null;
  parentId: string | null;
}): Promise<NodeItem> {
  const db = await getDb();
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error('File name is required');
  await assertUniqueName(db, input.parentId, trimmed);
  const id = uid();
  const { uri, size } = await writeContent(input.sourceUri, id, trimmed);
  const now = new Date().toISOString();
  try {
    await db.runAsync(
      `INSERT INTO nodes (id, parent_id, name, type, mime_type, size, uri, is_starred, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, 'file', ?, ?, ?, 0, NULL, ?, ?)`,
      id,
      input.parentId,
      trimmed,
      input.mimeType ?? null,
      size,
      uri,
      now,
      now,
    );
  } catch (error) {
    await deleteContent(uri);
    throw error;
  }
  await logActivity('file.import', `${trimmed} (${size} bytes)`);
  const created = await getNode(id);
  if (!created) throw new Error('Could not save the file');
  return created;
}

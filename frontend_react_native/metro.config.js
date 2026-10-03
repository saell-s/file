const fs = require('node:fs');
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/** Directories that never contain app source we would import. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'build',
  'coverage',
  'ios',
  'android',
  'web-build',
  '.next',
]);

/** Extensions that must stay resolvable as source/code, never as a binary asset. */
const RESERVED = new Set([
  ...config.resolver.sourceExts.map((ext) => ext.toLowerCase()),
  'json',
  'jsonc',
  'mjs',
  'cjs',
  'map',
  'tsbuildinfo',
  'flow',
]);

/** Every extension used by a file in this project. */
function collectExtensions(dir, found = new Set(), depth = 0) {
  if (depth > 8) return found;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectExtensions(full, found, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (ext) found.add(ext);
  }

  return found;
}

const assetExts = new Set(config.resolver.assetExts.map((ext) => ext.toLowerCase()));

// Any file type used inside the project can be imported and bundled as an asset.
for (const ext of collectExtensions(__dirname)) {
  if (!RESERVED.has(ext)) assetExts.add(ext);
}

// Binary containers that only exist inside node_modules (expo-sqlite ships wa-sqlite).
for (const ext of ['wasm', 'sqlite', 'sqlite3', 'db', 'zip', 'woff', 'woff2', 'ttf', 'otf']) {
  assetExts.add(ext);
}

config.resolver.assetExts = [...assetExts];

module.exports = config;
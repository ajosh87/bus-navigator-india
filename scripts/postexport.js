#!/usr/bin/env node
/**
 * Vercel silently refuses to serve any path containing `node_modules`, and
 * `expo export` writes vendored assets (the icon fonts) to
 * `dist/assets/node_modules/...`. Requests for them 404, so every Feather glyph
 * renders as a blank box.
 *
 * Move the directory somewhere servable; `vercel.json` rewrites the original
 * URLs — still baked into the JS bundle — onto the new location.
 */

const fs   = require('fs');
const path = require('path');

const DIST = path.resolve(__dirname, '..', 'dist');
const FROM = path.join(DIST, 'assets', 'node_modules');
const TO   = path.join(DIST, 'assets', 'vendor');

if (!fs.existsSync(DIST)) {
  console.error('No dist/ — run `expo export --platform web` first.');
  process.exit(1);
}

if (!fs.existsSync(FROM)) {
  console.log('· assets/node_modules not present, nothing to relocate');
  process.exit(0);
}

fs.rmSync(TO, { recursive: true, force: true });

// Windows throws EPERM on a directory rename whenever anything still holds a
// handle inside it (indexer, antivirus, a watcher from the export). Copying is
// slower but doesn't need exclusive access.
try {
  fs.renameSync(FROM, TO);
} catch (err) {
  if (err.code !== 'EPERM' && err.code !== 'EACCES' && err.code !== 'EBUSY') throw err;
  fs.cpSync(FROM, TO, { recursive: true });
  fs.rmSync(FROM, { recursive: true, force: true });
}

console.log('✓ assets/node_modules → assets/vendor');

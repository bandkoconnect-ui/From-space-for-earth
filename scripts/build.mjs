#!/usr/bin/env node
// Assembles the two apps into dist/. No bundler and no dependencies: each app is plain ES
// modules plus the shared packages and the vendored Leaflet.
//
//   node scripts/build.mjs            build both
//   node scripts/build.mjs desktop    build only the desktop renderer
//   node scripts/build.mjs mobile     build only the phone app
//
// dist/<app>/
//   index.html, app code           (from apps/<app>/...)
//   shared/core, map, ui           (from packages/*)
//   vendor/leaflet                 (from vendor/leaflet)
//   assets/                        (from assets/)

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const TARGETS = {
  desktop: { source: 'apps/desktop/renderer' },
  mobile: { source: 'apps/mobile/www' }
};

const wanted = process.argv[2] && process.argv[2] !== 'all' ? [process.argv[2]] : Object.keys(TARGETS);
for (const name of wanted) {
  if (!TARGETS[name]) { console.error(`Unknown target "${name}". Use desktop, mobile or all.`); process.exit(1); }
}

const skip = (path) => !/(^|[\\/])(test|node_modules|\.DS_Store)([\\/]|$)/.test(path);

for (const name of wanted) {
  const target = TARGETS[name];
  const out = join(root, 'dist', name);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const sourceDir = join(root, target.source);
  if (!existsSync(sourceDir)) { console.error(`Missing ${target.source}`); process.exit(1); }
  cpSync(sourceDir, out, { recursive: true, filter: skip });

  cpSync(join(root, 'packages/core/src'), join(out, 'shared/core/src'), { recursive: true });
  cpSync(join(root, 'packages/map'), join(out, 'shared/map'), { recursive: true, filter: skip });
  cpSync(join(root, 'packages/ui'), join(out, 'shared/ui'), { recursive: true, filter: skip });
  cpSync(join(root, 'vendor/leaflet'), join(out, 'vendor/leaflet'), { recursive: true });
  if (existsSync(join(root, 'assets'))) cpSync(join(root, 'assets'), join(out, 'assets'), { recursive: true });

  writeFileSync(join(out, 'version.json'), JSON.stringify({ name: pkg.productName || pkg.name, version: pkg.version, target: name }, null, 2));
  console.log(`built dist/${name}`);
}

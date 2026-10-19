#!/usr/bin/env node
// Vendors Leaflet as native ES modules, with no bundler and no npm install.
//
// Leaflet's source imports files without extensions ("./core/index"), which browsers
// cannot resolve. This script copies Leaflet's `src/` tree and appends the missing
// ".js" / "/index.js", replaces the package.json import with a tiny version module,
// and adds an entry file that registers `window.L` the way Leaflet's own build does.
//
// Usage:
//   git clone --depth 1 --branch v1.9.4 https://github.com/Leaflet/Leaflet /tmp/leaflet
//   node scripts/vendor-leaflet.mjs /tmp/leaflet
//
// Output: vendor/leaflet/  (committed to the repository)

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] || '');
if (!process.argv[2] || !existsSync(join(source, 'src', 'Leaflet.js'))) {
  console.error('Usage: node scripts/vendor-leaflet.mjs <path-to-Leaflet-checkout>');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
const out = join(root, 'vendor', 'leaflet');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'src'), { recursive: true });

const importPattern = /(\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2/g;

function resolveSpecifier(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  if (spec.endsWith('package.json')) return null;
  if (existsSync(base + '.js')) return spec + '.js';
  if (existsSync(base) && statSync(base).isDirectory() && existsSync(join(base, 'index.js'))) return spec.replace(/\/$/, '') + '/index.js';
  if (existsSync(base) && statSync(base).isFile()) return spec;
  throw new Error(`Cannot resolve ${spec} from ${fromFile}`);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let files = 0;
for (const file of walk(join(source, 'src'))) {
  if (!file.endsWith('.js')) continue;
  let code = readFileSync(file, 'utf8');
  code = code.replace(importPattern, (match, keyword, quote, spec) => {
    if (spec.endsWith('package.json')) return `${keyword}${quote}./version.js${quote}`;
    return `${keyword}${quote}${resolveSpecifier(file, spec)}${quote}`;
  });
  // Bare side-effect imports like `import './Renderer.getRenderer';`
  code = code.replace(/(^|\n)(import\s+)(['"])(\.{1,2}\/[^'"]+)\3/g, (match, lead, keyword, quote, spec) =>
    `${lead}${keyword}${quote}${resolveSpecifier(file, spec)}${quote}`);
  const dest = join(out, 'src', relative(join(source, 'src'), file));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, code);
  files += 1;
}

writeFileSync(join(out, 'src', 'version.js'), `export const version = ${JSON.stringify(pkg.version)};\n`);

writeFileSync(join(out, 'leaflet.js'), `// Leaflet ${pkg.version} (BSD-2-Clause) loaded as native ES modules.
// Registers window.L exactly like Leaflet's own distribution build does.
import * as L from './src/Leaflet.js';

const previous = window.L;
const namespace = { ...L, noConflict() { window.L = previous; return namespace; } };
window.L = namespace;
export default namespace;
`);

cpSync(join(source, 'dist', 'leaflet.css'), join(out, 'leaflet.css'));
cpSync(join(source, 'dist', 'images'), join(out, 'images'), { recursive: true });
cpSync(join(source, 'LICENSE'), join(out, 'LICENSE'));

const commit = process.env.LEAFLET_COMMIT || 'see tag';
writeFileSync(join(out, 'VENDOR.md'), `# Vendored Leaflet

- Project: https://github.com/Leaflet/Leaflet
- Version: ${pkg.version} (tag \`v${pkg.version}\`, commit ${commit})
- License: BSD-2-Clause (see LICENSE)
- Changes: none to the logic. Only import specifiers were rewritten by \`scripts/vendor-leaflet.mjs\`
  (added \`.js\` / \`/index.js\`) so the source runs as native ES modules without a bundler.
- Why: the apps must work offline and must not load code from a CDN at runtime.
`);

console.log(`Vendored Leaflet ${pkg.version}: ${files} modules -> ${relative(root, out)}`);

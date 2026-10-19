#!/usr/bin/env node
// Minimal static server for development: node scripts/serve.mjs [desktop|mobile] [port]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = ['desktop', 'mobile'].includes(process.argv[2]) ? process.argv[2] : 'desktop';
const port = Number(process.argv[3] || process.env.PORT || (target === 'desktop' ? 5173 : 5174));
const base = join(root, 'dist', target);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8'
};

if (!existsSync(base)) { console.error(`dist/${target} not found. Run: node scripts/build.mjs ${target}`); process.exit(1); }

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = normalize(join(base, decodeURIComponent(url.pathname)));
  if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end('Forbidden'); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`ECHO ${target} → http://localhost:${port}`));

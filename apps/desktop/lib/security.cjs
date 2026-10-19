'use strict';
// Decisions about which URLs and which callers the desktop app trusts.

const APP_SCHEME = 'app:';
const APP_HOST = 'echo';
const APP_ORIGIN = `app://${APP_HOST}`;

/** Only http(s) links may be handed to the operating system's browser. */
function isSafeExternalUrl(value) {
  try {
    const url = new URL(String(value));
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * True for pages served by the app's own protocol.
 * Node's URL reports origin "null" for non-special schemes such as app:, so the parts are compared directly.
 */
function isAppUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === APP_SCHEME && url.hostname === APP_HOST && url.port === '' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** IPC calls are only honoured from the app's own pages (never a remote page that navigated in). */
function isTrustedSender(event) {
  const url = event && (event.senderFrame ? event.senderFrame.url : event.sender && event.sender.getURL && event.sender.getURL());
  return isAppUrl(url);
}

/** Maps a request path on app://echo to a file inside `root`, or null if it escapes the root. */
function resolveAppPath(root, pathname, pathModule = require('node:path')) {
  let relative;
  try {
    relative = decodeURIComponent(pathname === '/' || pathname === '' ? '/index.html' : pathname);
  } catch {
    return null;
  }
  if (relative.includes('\0')) return null;
  const resolved = pathModule.normalize(pathModule.join(root, relative));
  const base = pathModule.normalize(root);
  return resolved === base || resolved.startsWith(base + pathModule.sep) ? resolved : null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

/** Content type for a file served by the app protocol. Module scripts are rejected without a JavaScript type. */
function mimeFor(file, pathModule = require('node:path')) {
  return MIME_TYPES[pathModule.extname(String(file)).toLowerCase()] || 'application/octet-stream';
}

module.exports = { APP_ORIGIN, isSafeExternalUrl, isAppUrl, isTrustedSender, resolveAppPath, mimeFor };

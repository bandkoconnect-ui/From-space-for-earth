'use strict';
// The handler behind app://echo/…: serves the renderer's files from the dist folder.
//
// Files are read with fs (which Electron makes aware of the app.asar archive in packaged
// builds) and returned with an explicit content type: module scripts are refused by the
// browser engine without a JavaScript type. Anything outside the root is refused.

const fs = require('node:fs/promises');
const { mimeFor, resolveAppPath } = require('./security.cjs');

function createAppProtocolHandler({ root, readFile = fs.readFile }) {
  return async function handleAppRequest(request) {
    let pathname;
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    const file = resolveAppPath(root, pathname);
    if (!file) return new Response('Forbidden', { status: 403 });
    try {
      const data = await readFile(file);
      return new Response(data, {
        status: 200,
        headers: { 'content-type': mimeFor(file), 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' }
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  };
}

module.exports = { createAppProtocolHandler };

'use strict';
// Durable storage for the desktop app: one JSON file in the user's data folder.
//
// Writes are atomic (write a temp file, then rename over the real one) and the previous good
// copy is kept as a .bak. If the main file is ever damaged or half-written, read() falls back
// to the backup instead of losing the person's investigations.

const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_BYTES = 25 * 1024 * 1024;

function createStorage(directory, fileName = 'echo-data.json') {
  const file = path.join(directory, fileName);
  const temp = `${file}.tmp`;
  const backup = `${file}.bak`;
  let queue = Promise.resolve();

  async function readValid(target) {
    try {
      const text = await fs.readFile(target, 'utf8');
      JSON.parse(text); // reject truncated / corrupt files
      return text;
    } catch {
      return null;
    }
  }

  return {
    file,

    async read() {
      return (await readValid(file)) ?? (await readValid(backup));
    },

    /** Serialised: concurrent writes happen one after another, in call order. */
    write(text) {
      if (typeof text !== 'string') return Promise.reject(new TypeError('Storage expects a string.'));
      if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) return Promise.reject(new RangeError('That is too much data to save.'));
      queue = queue.then(async () => {
        JSON.parse(text); // never persist something we could not read back
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(temp, text, 'utf8');
        if (await readValid(file)) await fs.copyFile(file, backup);
        await fs.rename(temp, file);
      });
      const result = queue;
      queue = queue.catch(() => {}); // a failed write must not block later ones
      return result;
    }
  };
}

module.exports = { createStorage, MAX_BYTES };

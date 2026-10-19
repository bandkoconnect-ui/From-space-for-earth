# Vendored Leaflet

- Project: https://github.com/Leaflet/Leaflet
- Version: 1.9.4 (tag `v1.9.4`, commit d15112c9e8ac339f0f74f563959d0423d291308d)
- License: BSD-2-Clause (see LICENSE)
- Changes: none to the logic. Only import specifiers were rewritten by `scripts/vendor-leaflet.mjs`
  (added `.js` / `/index.js`) so the source runs as native ES modules without a bundler.
- Why: the apps must work offline and must not load code from a CDN at runtime.

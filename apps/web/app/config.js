// Settings for the web app that you might want to change when you deploy it.
// Nothing secret belongs here: everything in this folder is public once it is on GitHub Pages.

import { DEFAULT_PROVIDERS } from './geocode.js';

export const CONFIG = {
  // How many open events to request from NASA EONET. EONET usually lists 50 to 200.
  eventsLimit: 150,

  // Place search services, tried in order. Both are free, keyless and rate-limited. To use
  // your own Photon server, change its url here (see docs/WEB_APP.md).
  geocoders: DEFAULT_PROVIDERS
};

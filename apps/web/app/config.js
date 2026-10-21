// Settings for the web app that you might want to change when you deploy it.
// Nothing secret belongs here: everything in this folder is public once it is on GitHub Pages.

import { DEFAULT_PROVIDERS } from './geocode.js';

export const CONFIG = {
  // How many open events to request from NASA EONET. EONET usually lists 50 to 200.
  eventsLimit: 150,

  // Place search services, tried in order. Both are free, keyless and rate-limited. To use
  // your own Photon server, change its url here (see docs/WEB_APP.md).
  geocoders: DEFAULT_PROVIDERS,

  // Accounts (see docs/ACCOUNTS.md).
  // 'device': accounts are kept in each visitor's browser. Works with no server, but an account
  //           does not follow someone to another browser or device. Good for a preview.
  // 'supabase': real accounts. Create a free project at supabase.com, then paste its Project URL
  //           and its public "anon" key below. The anon key is designed to be public; never put
  //           the "service_role" key here.
  auth: {
    provider: 'device',
    supabaseUrl: '',
    supabaseAnonKey: ''
  }
};

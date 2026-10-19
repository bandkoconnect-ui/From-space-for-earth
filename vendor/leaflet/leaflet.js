// Leaflet 1.9.4 (BSD-2-Clause) loaded as native ES modules.
// Registers window.L exactly like Leaflet's own distribution build does.
import * as L from './src/Leaflet.js';

const previous = window.L;
const namespace = { ...L, noConflict() { window.L = previous; return namespace; } };
window.L = namespace;
export default namespace;

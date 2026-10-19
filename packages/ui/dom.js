// Tiny DOM helpers. Everything user-supplied goes through textContent, never innerHTML,
// so investigation titles, notes and event names can never inject markup.

/**
 * h('button', { class: 'btn', onClick: fn, 'aria-label': 'Close' }, 'Label', child, ...)
 * - `class` / `className` set the class; `style` may be an object; `dataset` an object
 * - keys starting with "on" + capital letter add event listeners
 * - children may be strings, numbers, nodes, arrays (flattened); null / false are skipped
 */
export function h(tag, attrs, ...children) {
  const el = typeof tag === 'string' && tag.startsWith('svg:')
    ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4))
    : document.createElement(tag);
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') el.setAttribute('class', value);
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (/^on[A-Z]/.test(key) && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  } else if (attrs !== undefined && attrs !== null) {
    children.unshift(attrs);
  }
  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** Builds an inline SVG icon from path data. Icons are 24x24, stroked, and use currentColor. */
export function icon(paths, { size = 20, stroke = 1.7, className = 'icon' } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(stroke));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  for (const d of Array.isArray(paths) ? paths : [paths]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Path data for the icon set used by both apps. */
export const ICONS = {
  home: ['M4 11 12 4l8 7', 'M6 10v9h12v-9', 'M10 19v-5h4v5'],
  explore: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm15.5 8.5-2 5-5 2 2-5z'],
  list: ['M8 6h12M8 12h12M8 18h12', 'M4 6h.01M4 12h.01M4 18h.01'],
  bookmark: ['M6 4.5h12v16l-6-3.8-6 3.8z'],
  pulse: ['M3 12h4l2.5-6 4 12 2.5-6H21'],
  chat: ['M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z'],
  sparkle: ['M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5M12 7.5h.01'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  close: ['M6 6l12 12M18 6 6 18'],
  chevronRight: ['m9 5 7 7-7 7'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronUp: ['m6 15 6-6 6 6'],
  layers: ['m12 3 9 5-9 5-9-5z', 'm3 13 9 5 9-5', 'm3 17.5 9 5 9-5'],
  compare: ['M12 3v18', 'M8 8 4 12l4 4', 'M16 8l4 4-4 4'],
  play: ['M8 5v14l11-7z'],
  pause: ['M8 5v14M16 5v14'],
  locate: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 2v3M12 19v3M2 12h3M19 12h3', 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  crosshair: ['M12 3v6M12 15v6M3 12h6M15 12h6'],
  send: ['M12 19V5', 'm6 11 6-6 6 6'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'm13.5 6.5 4 4'],
  copy: ['M9 9h10v11H9z', 'M5 15V4h10'],
  download: ['M12 4v11', 'm7 11 5 5 5-5', 'M5 20h14'],
  upload: ['M12 16V5', 'm7 9 5-5 5 5', 'M5 20h14'],
  external: ['M14 4h6v6', 'M20 4 10 14', 'M18 14v5H5V6h5'],
  note: ['M5 4h14v16H5z', 'M8 9h8M8 13h8M8 17h4'],
  pin: ['M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Z', 'M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm20 20-4-4'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  wifiOff: ['M2 8.8a15 15 0 0 1 4-2.3', 'M10 5.1A15 15 0 0 1 22 8.8', 'M5 12.5a10 10 0 0 1 3-1.9', 'M14.5 10.8a10 10 0 0 1 4.5 1.7', 'M8.5 16.4a5 5 0 0 1 7 0', 'M12 20h.01', 'M3 3l18 18']
};

export function ic(name, options) {
  return icon(ICONS[name] || ICONS.info, options);
}

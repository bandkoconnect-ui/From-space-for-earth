// Ask ECHO: a live AI endpoint when one is configured, built-in research guidance otherwise.
//
// The live endpoint is a server you control (see netlify/functions/echo-chat.js). API keys
// never live in the apps. When the endpoint is missing, slow or failing, the person still
// gets useful, honest guidance and is told which mode they are in.

import { formatDateLong } from './dates.js';
import { hashString, clampText } from './text.js';
import { topicInfo } from './topics.js';

export const SUGGESTIONS = [
  'What do we know for sure?',
  'How would I map the extent?',
  'What should I check next?'
];

const MAX_HISTORY = 12;

export function buildChatPayload({ investigation, notes = [], dateIso, messages }) {
  return {
    investigation: {
      title: clampText(investigation.title, 120),
      topic: investigation.topic,
      date: dateIso || '',
      sourceText: clampText(investigation.summary, 1500),
      evidence: investigation.evidence.slice(0, 8).map((e) => ({ title: e.title, url: e.url })),
      notes: notes.slice(0, 5).map((n) => clampText(n.text, 300))
    },
    messages: messages.slice(-MAX_HISTORY).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clampText(m.content, 3000) }))
  };
}

export async function askLive({ endpoint, payload, fetchImpl = globalThis.fetch, timeoutMs = 25000 }) {
  if (!endpoint) throw new Error('No AI endpoint configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`AI endpoint responded with ${response.status}`);
    const data = await response.json();
    if (!data || typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('AI endpoint returned no reply');
    return { mode: 'live', title: 'ECHO', text: data.reply.trim(), links: [] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Main entry point. `history` is the conversation so far, including the new user message
 * as its last item. Never throws: failures degrade to the built-in guide.
 */
export async function ask({ question, history, investigation, notes = [], dateIso, endpoint, fetchImpl, timeoutMs }) {
  if (endpoint) {
    try {
      const payload = buildChatPayload({ investigation, notes, dateIso, messages: history });
      return await askLive({ endpoint, payload, fetchImpl, timeoutMs });
    } catch (error) {
      const answer = guide(question, { investigation, dateIso, turn: history.length });
      return { ...answer, mode: 'guide', fallbackReason: error?.name === 'AbortError' ? 'The AI service took too long to respond.' : 'The AI service could not be reached.' };
    }
  }
  return { ...guide(question, { investigation, dateIso, turn: history.length }), mode: 'guide' };
}

/* ------------------------------------------------------------------ */
/* Built-in guidance                                                    */
/* ------------------------------------------------------------------ */

const METHODS = {
  flood: 'Compare Sentinel-1 radar scenes from before and after the event (radar sees through cloud), mask permanent water and steep terrain, and use cloud-free Sentinel-2 images as supporting evidence. Validate the extent against reference data before reporting any area.',
  forest: 'Use comparable Sentinel-2 scenes from the same season, check cloud cover, then compare like-for-like periods. Validate any suspected loss against a trusted reference dataset such as Global Forest Watch.',
  fire: 'Look at MODIS or VIIRS thermal detections across the dates, then compare imagery before and after for the burn scar, allowing for smoke and cloud. Fire agencies publish official perimeters worth checking.',
  urban: 'Daily MODIS imagery cannot resolve buildings. Use Sentinel-2 (10 m) or finer imagery, pick the same season in each year, and confirm what changed against OpenStreetMap or official records.',
  storm: 'Follow the recorded positions through the timeline, add the precipitation layer for rain-rate estimates, and compare with the forecasts and warnings from the national weather service.',
  volcano: 'Compare imagery and thermal detections across the dates, and read the Smithsonian Global Volcanism Program weekly reports, which summarise observatory data.',
  environment: 'Define a measurable signal, choose comparable scenes (same season, similar conditions), record every acquisition date, and validate with a second independent source.',
  other: 'Write down the question and what would change your mind, collect comparable imagery with its dates, and check a second source before reporting anything.'
};

const GUIDES = [
  {
    keys: ['sure', 'know', 'evidence', 'fact', 'confirmed', 'established', 'what happened', 'summary', 'summar'],
    build: ({ investigation }) => ({
      title: 'What the sources support',
      text: investigation.kind === 'custom'
        ? `For “${investigation.title}” nothing is established yet. You have defined an area and ECHO can show daily NASA imagery for it, but no change detection has been run. Treat anything you see as a question to check.`
        : `${investigation.summary}\n\nEverything beyond that is a hypothesis until it is checked against another source.`
    })
  },
  {
    keys: ['extent', 'map', 'delineat', 'boundary', 'measure', 'detect', 'method', 'workflow', 'approach'],
    build: ({ investigation }) => ({ title: 'A defensible workflow', text: METHODS[investigation.topic] || METHODS.other })
  },
  {
    keys: ['season', 'forest', 'tree', 'deforest', 'vegetation', 'land cover'],
    build: () => ({ title: 'Seasonality versus change', text: METHODS.forest })
  },
  {
    keys: ['exposed', 'road', 'building', 'village', 'impact', 'damage', 'people', 'settlement'],
    build: () => ({
      title: 'Exposure needs a validated footprint',
      text: 'Once the area affected has been validated, intersect it with roads, buildings or settlement data. Treat intersections as potentially affected assets, not confirmed damage, and note how complete the map data is.'
    })
  },
  {
    keys: ['rain', 'precip', 'weather', 'cause', 'why', 'trigger'],
    build: () => ({
      title: 'Rainfall is context, not proof of cause',
      text: 'Turn on the Precipitation layer to see satellite rain-rate estimates for the selected date. Pair it with local gauges and official reports. A cause needs more evidence than a coincidence in time.'
    })
  },
  {
    keys: ['compare', 'before', 'after', 'date', 'timeline', 'when', 'swipe'],
    build: ({ dateLabel }) => ({
      title: `Reading the timeline · ${dateLabel}`,
      text: `The timeline is set to ${dateLabel}. Use Compare to swipe the first date against the selected one. Check cloud cover first: a gap or a smear in the imagery is a limit of the data, not a finding. Record each date you rely on.`
    })
  },
  {
    keys: ['resolution', 'modis', 'viirs', 'sentinel', 'planet', 'commercial', 'landsat', 'satellite', 'source', 'data'],
    build: () => ({
      title: 'Which satellite for which question',
      text: 'The imagery in ECHO is daily NASA MODIS or VIIRS: roughly 250 m per pixel, good for regional context and fast events. Sentinel-2 (10 m) and Landsat (30 m) show finer detail but revisit less often and are blocked by cloud. Radar (Sentinel-1) sees through cloud. None of them is ground truth on its own.'
    })
  },
  {
    keys: ['note', 'record', 'document', 'log'],
    build: () => ({
      title: 'Keep a field log',
      text: 'Use Notes to record what you saw, the date shown and where on the map. Pinning a note to the map centre makes it easy to find later and to share with someone who needs to check your work.'
    })
  },
  {
    keys: ['next', 'start', 'begin', 'step', 'check', 'should i'],
    build: ({ investigation }) => ({
      title: 'A practical next step',
      text: `${investigation.steps[0] ? `Start with “${investigation.steps[0].title}”: ${investigation.steps[0].detail} ` : ''}Then ${investigation.steps[1] ? `“${investigation.steps[1].title}”` : 'compare comparable scenes'}. Which outcome are you trying to establish?`
    })
  }
];

function greeting(question) {
  return /^(hi|hello|hey|good (morning|afternoon|evening))\b/i.test(question.trim());
}

/** Pure, deterministic guidance. Exported for tests and as the offline experience. */
export function guide(question, { investigation, dateIso, turn = 0 }) {
  const q = question.toLowerCase();
  const dateLabel = dateIso ? formatDateLong(dateIso) : 'the selected date';
  const links = investigation.evidence.slice(0, 2).map((e) => [e.title, e.url]);
  const ctx = { investigation, dateLabel };

  if (greeting(question)) {
    return { title: 'Hello, field investigator.', text: `I’m ready to help with “${investigation.title}”. We can start with what the sources show, choose a method, or work out what is still missing. What are you curious about?`, links };
  }
  const found = GUIDES.find((g) => g.keys.some((key) => q.includes(key)));
  if (found) return { ...found.build(ctx), links };

  const topic = topicInfo(investigation.topic).label.toLowerCase();
  const variants = [
    `For “${question.trim()}”, separate the observation from the interpretation. In ${investigation.title}, record what is visible, which source and date support it, and what else could produce the same pattern.`,
    `To investigate “${question.trim()}”, define a measurable signal, a comparison period and a validation source. This is a ${topic} investigation, so start from the checklist in the report and tell me which step you’re on.`,
    `Let’s split “${question.trim()}” into evidence and uncertainty. Start with a source image and its date, compare like with like, and note what the imagery cannot show. ECHO has not run automated analysis on ${investigation.title}.`
  ];
  return { title: 'Let’s investigate that', text: variants[(hashString(question) + turn) % variants.length], links };
}

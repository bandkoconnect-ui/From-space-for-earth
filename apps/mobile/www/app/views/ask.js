// Ask ECHO: a full-screen conversation about the active investigation.

import { h, ic, mount } from '../../shared/ui/dom.js';
import { SUGGESTIONS, describeInvestigation } from '../../shared/core/src/index.js';

const MAX_INPUT_HEIGHT = 120;

export function createAskView(app) {
  const { store, session, ui, platform } = app;
  const st = { sending: false, visible: false };

  const root = h('section', { class: 'view ask', 'aria-label': 'Ask ECHO', hidden: true });

  const topicChip = h('button', { type: 'button', class: 'inv-chip', 'aria-label': 'Choose which investigation to ask about', onClick: () => app.sheets.switcher() });
  const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
  const scroller = h('div', { class: 'chat-scroll scroll-y' }, log);
  const suggestions = h('div', { class: 'chip-row suggestions' }, SUGGESTIONS.map((text) => h('button', { type: 'button', class: 'chip', onClick: () => send(text) }, text)));
  const input = h('textarea', { class: 'textarea chat-input', rows: '1', maxlength: '1000', placeholder: 'Ask about this investigation…', 'aria-label': 'Question for ECHO', enterkeyhint: 'send' });
  const sendButton = h('button', { type: 'button', class: 'send-btn', 'aria-label': 'Send', onClick: () => send() }, ic('send', { size: 20 }));
  const modeNote = h('p', { class: 'mode-note' });
  const dock = h('div', { class: 'chat-dock' }, suggestions, h('div', { class: 'chat-compose' }, input, sendButton), modeNote);

  const empty = h('div', { class: 'empty-card inline', hidden: true },
    ic('sparkle', { size: 32 }), h('h2', null, 'Nothing to ask about yet'),
    h('p', { class: 'muted' }, 'Ask ECHO answers questions about an investigation: what the sources support, how to map the extent, what to check next.'),
    h('button', { type: 'button', class: 'btn btn-primary', onClick: () => app.sheets.newInvestigation() }, 'New investigation'));

  root.append(
    h('header', { class: 'page-head' },
      h('div', { class: 'page-title' }, h('h1', null, 'Ask ECHO'),
        h('div', { class: 'head-actions' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Settings', onClick: () => app.sheets.settings() }, ic('settings')))),
      topicChip),
    scroller, empty, dock);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
  });
  input.addEventListener('input', fitInput);
  input.addEventListener('focus', () => setTimeout(scrollToEnd, 320)); // after the keyboard has opened

  function fitInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(MAX_INPUT_HEIGHT, input.scrollHeight)}px`;
  }

  const current = () => store.active();

  function scrollToEnd() { requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; }); }

  const userBubble = (m) => h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, h('p', null, m.content)));
  const botBubble = (m) => h('div', { class: 'msg' }, h('span', { class: 'avatar' }, ic('sparkle', { size: 14 })),
    h('div', { class: 'bubble' },
      h('strong', null, m.title || 'ECHO'),
      h('p', null, m.content),
      m.links?.length ? h('div', { class: 'links' }, m.links.map(([title, url]) => ui.link(url, `${title} ↗`))) : null,
      m.fallbackReason ? h('p', { class: 'mode-note' }, `${m.fallbackReason} Showing the built-in guide instead.`) : null));

  function renderChat(inv, thinking = false) {
    const history = session.history(inv.id);
    if (!history.length && !thinking) {
      mount(log, h('div', { class: 'chat-empty' }, ic('sparkle', { size: 22 }), h('strong', null, 'Ask ECHO'),
        h('p', null, 'Ask what the sources support, how to map the extent, or what to check next. ECHO knows this investigation’s summary, evidence and your notes.')));
      return;
    }
    mount(log, ...history.map((m) => (m.role === 'user' ? userBubble(m) : botBubble(m))),
      thinking ? h('div', { class: 'msg thinking' }, h('span', { class: 'avatar' }, ic('sparkle', { size: 14 })), h('div', { class: 'bubble' }, h('strong', null, 'ECHO'), h('p', null, 'Thinking…'))) : null);
  }

  function render() {
    const inv = current();
    empty.hidden = Boolean(inv);
    scroller.hidden = !inv;
    dock.hidden = !inv;
    topicChip.hidden = !inv;
    if (!inv) return;
    mount(topicChip, h('span', { class: 'inv-chip-text' }, h('small', null, 'About'), h('strong', null, inv.title)), ic('chevronDown', { size: 16 }));
    topicChip.title = describeInvestigation(inv);
    const live = Boolean(store.settings().chatEndpoint);
    modeNote.className = `mode-note${live ? ' live' : ''}`;
    modeNote.textContent = live
      ? 'Connected to your AI service. Answers can be wrong, so check them against the sources.'
      : 'Using the built-in research guide. It gives method advice, not measurements. Add an AI service in Settings for live answers.';
    renderChat(inv, st.sending);
    scrollToEnd();
  }

  async function send(preset) {
    const inv = current();
    const text = String(preset ?? input.value).trim();
    if (!inv || !text || st.sending) return;
    st.sending = true;
    sendButton.disabled = true;
    const promise = session.send(inv.id, text, { dateIso: app.currentDate?.() });
    input.value = '';
    fitInput();
    platform.haptic();
    renderChat(inv, true);
    scrollToEnd();
    try {
      await promise;
    } catch (error) {
      ui.toast(error.message, { error: true });
    } finally {
      st.sending = false;
      sendButton.disabled = false;
      if (current()?.id === inv.id && st.visible) { renderChat(inv); scrollToEnd(); }
    }
  }

  store.subscribe((event) => {
    if (!st.visible) return;
    if (['load', 'add', 'remove', 'active', 'settings', 'update'].includes(event.type)) render();
  });

  return {
    el: root,
    name: 'ask',
    show() { st.visible = true; render(); },
    hide() { st.visible = false; input.blur(); },
    back() { return false; }
  };
}

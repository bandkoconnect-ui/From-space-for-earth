// A chat session per investigation. The UI renders history(); send() does the rest.

import { ask } from './chat.js';

const MAX_TURNS = 60;

export function createChatSession({ store, fetchImpl, timeoutMs } = {}) {
  const histories = new Map();

  function history(id) {
    return (histories.get(id) || []).slice();
  }

  return {
    history,
    reset(id) { histories.delete(id); },

    /**
     * Sends a question about an investigation. Resolves with the assistant message
     * ({ role: 'assistant', content, title, links, mode, fallbackReason }). Never rejects for
     * network problems: those fall back to the built-in guide.
     */
    async send(id, question, { dateIso } = {}) {
      const investigation = store.get(id);
      const text = String(question ?? '').trim();
      if (!investigation) throw new Error('That investigation no longer exists.');
      if (!text) throw new Error('Type a question first.');

      const messages = [...(histories.get(id) || []), { role: 'user', content: text.slice(0, 3000) }];
      histories.set(id, messages);

      const answer = await ask({
        question: text,
        history: messages,
        investigation,
        notes: store.notes(id),
        dateIso,
        endpoint: store.settings().chatEndpoint,
        fetchImpl,
        timeoutMs
      });
      const reply = { role: 'assistant', content: answer.text, title: answer.title, links: answer.links || [], mode: answer.mode, fallbackReason: answer.fallbackReason };
      // The investigation may have been deleted while we waited; do not resurrect its history.
      if (histories.has(id)) histories.set(id, [...histories.get(id), reply].slice(-MAX_TURNS));
      return reply;
    }
  };
}

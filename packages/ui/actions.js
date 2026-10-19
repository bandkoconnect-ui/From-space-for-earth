// Actions shared by the desktop and phone apps: exports, imports, investigating an event.
//
// `app` supplies { store, platform, ui, openInvestigation }. `platform` is each app's door to the
// operating system (saveFile, pickFile, openExternal), so this file has no platform-specific code.

import { ValidationError, createFromEvent, exportFileName, toMarkdownReport } from '../core/src/index.js';

export function createActions(app) {
  const { store, platform, ui } = app;

  function fail(error, fallback) {
    if (!(error instanceof ValidationError)) console.error(error); // a person's mistake is not a bug
    ui.toast(error?.message || fallback, { error: true });
  }

  return {
    async exportReport(id = store.active()?.id) {
      const investigation = store.get(id);
      if (!investigation) { ui.toast('Open an investigation first.', { error: true }); return; }
      try {
        const content = toMarkdownReport(investigation, { notes: store.notes(id) });
        const result = await platform.saveFile({
          name: exportFileName(investigation, 'md'),
          content,
          mime: 'text/markdown',
          filters: [{ name: 'Markdown', extensions: ['md'] }]
        });
        if (!result.canceled) ui.toast('Field report saved.');
      } catch (error) {
        fail(error, 'The report could not be saved.');
      }
    },

    async exportWorkspace() {
      try {
        const bundle = store.exportBundle();
        const stamp = new Date().toISOString().slice(0, 10);
        const result = await platform.saveFile({
          name: `echo-workspace-${stamp}.json`,
          content: JSON.stringify(bundle, null, 2),
          mime: 'application/json',
          filters: [{ name: 'ECHO workspace', extensions: ['json'] }]
        });
        if (!result.canceled) ui.toast(`Backup saved (${bundle.investigations.length} investigations).`);
      } catch (error) {
        fail(error, 'The backup could not be saved.');
      }
    },

    async importWorkspace() {
      try {
        const file = await platform.pickFile({ accept: '.json,application/json', filters: [{ name: 'ECHO workspace', extensions: ['json'] }] });
        if (!file) return;
        let bundle;
        try { bundle = JSON.parse(file.content); } catch { throw new ValidationError('That file is not valid JSON.'); }
        const result = store.importBundle(bundle);
        const skipped = result.skipped.length ? ` ${result.skipped.length} skipped (${result.skipped.map((s) => s.reason).filter((r, i, all) => all.indexOf(r) === i).join('; ')}).` : '';
        ui.toast(result.added ? `Imported ${result.added} investigation${result.added === 1 ? '' : 's'}.${skipped}` : `Nothing was imported.${skipped}`, { error: !result.added });
      } catch (error) {
        fail(error, 'That file could not be imported.');
      }
    },

    /** Opens the investigation already made for an event, or creates one. */
    investigateEvent(event) {
      try {
        const existing = store.list().find((inv) => inv.event?.id === event.id);
        if (existing) {
          app.openInvestigation(existing.id);
          ui.toast('You already have an investigation for this event. Opened it.');
          return existing;
        }
        const investigation = store.add(createFromEvent(event));
        app.openInvestigation(investigation.id);
        ui.toast('Investigation created. Use the timeline to step through NASA imagery.');
        return investigation;
      } catch (error) {
        fail(error, 'That event could not be investigated.');
        return null;
      }
    }
  };
}

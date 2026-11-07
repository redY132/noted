import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeAIActivity, type AIActivity } from './ai-activity-ui.ts';
const activity: AIActivity = { noteId: 'synthetic', title: '<script>Synthetic note</script>', goal: 'format', requestId: 'request', phase: 'running', message: 'Nothing applies automatically.' };
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(resume: () => Promise<void> = async () => {}) {
  const dom = new JSDOM('<div id="host"></div><dialog></dialog>'), host = dom.window.document.querySelector<HTMLElement>('#host')!;
  let opened = 0, dismissed = 0; const errors: unknown[] = [];
  const ui = initializeAIActivity(host, { resume: async () => { opened++; await resume(); }, dismiss: () => { dismissed++; ui.update(null); }, error: reason => errors.push(reason) });
  return { dom, host, ui, errors, opened: () => opened, dismissed: () => dismissed, $: <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!, close() { ui.destroy(); dom.window.close(); } };
}
test('activity renders only explicit metadata, phase labels and safe text', () => {
  const h = setup();
  try {
    h.ui.update(null); assert.equal(h.$('section').hidden, true);
    for (const phase of ['starting', 'running', 'cancelling', 'cancelled', 'unknown', 'ready', 'failed'] as const) {
      h.ui.update({ ...activity, phase }); assert.equal(h.$('section').hidden, false); assert.equal(h.host.querySelector('script'), null);
      assert.equal(h.$('[data-activity-note]').textContent, activity.title);
      assert.equal(h.$('[data-activity-dismiss]').hidden, !['ready', 'failed', 'cancelled'].includes(phase));
      if (phase === 'ready') assert.equal(h.$('[data-activity-open]').textContent, 'Review proposal');
    }
  } finally { h.close(); }
});
test('resume coalesces clicks, respects another modal and surfaces an opening failure', async () => {
  let reject!: (reason: Error) => void; const h = setup(() => new Promise((_resolve, fail) => { reject = fail; }));
  try {
    h.ui.update(activity); const button = h.$<HTMLButtonElement>('[data-activity-open]'); button.click(); button.click();
    assert.equal(h.opened(), 1); assert.equal(button.disabled, true);
    reject(new Error('Synthetic draft must be saved first.')); await settle();
    assert.equal(h.errors.length, 1); assert.match(h.$('[data-activity-message]').textContent!, /saved first/); assert.equal(button.disabled, false);
    h.dom.window.document.querySelector('dialog')!.setAttribute('open', ''); button.click(); assert.equal(h.opened(), 1);
  } finally { h.close(); }
});
test('only terminal status can be dismissed; preparing work cannot resume twice', () => {
  const h = setup();
  try {
    h.ui.update(activity, true); h.$('[data-activity-open]').click(); h.$('[data-activity-dismiss]').click(); assert.equal(h.opened(), 0); assert.equal(h.dismissed(), 0);
    h.ui.update(activity); h.$('[data-activity-dismiss]').click(); assert.equal(h.dismissed(), 0);
    h.ui.update({ ...activity, phase: 'ready' }); h.$('[data-activity-dismiss]').click(); assert.equal(h.dismissed(), 1); assert.equal(h.$('section').hidden, true);
  } finally { h.close(); }
});
test('destroying the view during a pending resume ignores late completion', async () => {
  let release!: () => void; const h = setup(() => new Promise<void>(resolve => { release = resolve; }));
  h.ui.update(activity); h.$('[data-activity-open]').click(); h.ui.destroy(); release(); await settle(); assert.equal(h.host.children.length, 0); h.dom.window.close();
});
test('unchanged local polls do not mutate the live status text repeatedly', () => {
  const h = setup(); try {
    h.ui.update(activity); const observer = new h.dom.window.MutationObserver(() => {});
    observer.observe(h.$('[role="status"]'), { subtree: true, childList: true, characterData: true });
    h.ui.update({ ...activity }); assert.equal(observer.takeRecords().length, 0); observer.disconnect();
  } finally { h.close(); }
});
test('focus and resize reveal a clipped control by scrolling only its status strip', () => {
  const h = setup(); try {
    h.ui.update(activity); const root = h.$('section'), button = h.$('[data-activity-open]');
    root.getBoundingClientRect = () => ({ top: 10, bottom: 110 }) as DOMRect;
    button.getBoundingClientRect = () => ({ top: 150, bottom: 194 }) as DOMRect;
    button.focus(); assert.equal(root.scrollTop, 84); assert.equal(h.dom.window.document.body.scrollTop, 0);
    root.scrollTop = 0; h.dom.window.dispatchEvent(new h.dom.window.Event('resize')); assert.equal(root.scrollTop, 84);
  } finally { h.close(); }
});

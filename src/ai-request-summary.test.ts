import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { describeAIRequest, initializeAIRequestSummary, type AIRequestScope } from './ai-request-summary.ts';
const scope: AIRequestScope = { title: 'Synthetic field notes', goal: 'format', includeGuide: false, allowed: true, native: true, busy: false, running: false };
const schema = { name: 'Field layout', version: 2, guide: { title: 'Synthetic full guide' } };
test('the summary distinguishes schema rules from per-use full-document guidance', () => {
  const rules = describeAIRequest({ ...scope, goal: 'schema', schema });
  assert.match(rules.contents, /Field layout v2 rules/); assert.match(rules.contents, /full document guide is not included/);
  const guide = describeAIRequest({ ...scope, goal: 'schema', schema, includeGuide: true });
  assert.match(guide.contents, /full document guide \(Synthetic full guide\)/); assert.match(guide.destination, /only when you choose Generate proposal/);
  const ordinary = describeAIRequest({ ...scope, schema, includeGuide: true });
  assert.doesNotMatch(ordinary.contents, /Field layout|Synthetic full guide/);
});
test('component and unavailable modes do not imply a guide grant or an automatic transmission', () => {
  const component = describeAIRequest({ ...scope, goal: 'component', schema, includeGuide: true });
  assert.match(component.contents, /inserted disabled/); assert.doesNotMatch(component.contents, /Synthetic full guide/);
  const denied = describeAIRequest({ ...scope, allowed: false });
  assert.doesNotMatch(JSON.stringify(denied), /Synthetic field notes/); assert.match(denied.contents, /Nothing will be sent/);
  const preview = describeAIRequest({ ...scope, native: false });
  assert.match(preview.contents, /preview sends no request/); assert.equal(preview.destination, '');
});
test('rendering treats note titles as text and hides future-request scope during an active job', () => {
  const dom = new JSDOM('<div><p class="ai-consent">Existing details</p></div>');
  try {
    const consent = dom.window.document.querySelector<HTMLElement>('.ai-consent')!, ui = initializeAIRequestSummary(consent);
    ui.update({ ...scope, title: '<img src=x onerror=alert(1)>' });
    assert.equal(dom.window.document.querySelector('img'), null); assert.match(dom.window.document.querySelector('[data-request-note]')!.textContent!, /<img/);
    assert.equal(consent.parentElement?.tagName, 'DETAILS'); assert.equal(dom.window.document.querySelector('summary')!.textContent, 'Data and usage details');
    ui.update({ ...scope, running: true }); assert.equal(dom.window.document.querySelector<HTMLElement>('.ai-request-summary')!.hidden, true);
    ui.update(scope); assert.equal(dom.window.document.querySelector<HTMLElement>('.ai-request-summary')!.hidden, false);
  } finally { dom.window.close(); }
});

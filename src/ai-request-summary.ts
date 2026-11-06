export interface AIRequestScope {
  title: string;
  goal: 'format' | 'schema' | 'component';
  schema?: { name: string; version: number; guide?: { title?: string } };
  includeGuide: boolean;
  allowed: boolean;
  native: boolean;
  busy: boolean;
  running: boolean;
}
export function describeAIRequest(scope: AIRequestScope) {
  if (!scope.allowed) return { note: 'AI access is disabled for this note.', contents: 'Nothing will be sent. You can keep editing locally.', destination: '' };
  const note = scope.title || 'Untitled';
  if (!scope.native) return { note, contents: 'Generate proposals in the desktop app. This preview sends no request.', destination: '' };
  let contents = 'This note and your instructions';
  if (scope.goal === 'schema') {
    contents += scope.schema ? `, plus ${scope.schema.name} v${scope.schema.version} rules` : '. Select a schema before generating';
    if (scope.schema?.guide && scope.includeGuide) contents += ` and the full document guide (${scope.schema.guide.title || 'Untitled guide'})`;
    else if (scope.schema?.guide) contents += '. The full document guide is not included';
  }
  if (scope.goal === 'component') contents += '. The proposal can add one sandboxed component, inserted disabled';
  return { note, contents: contents + '.', destination: 'Your draft is saved first. Sent to OpenAI through your ChatGPT-signed-in Codex client only when you choose Generate proposal. Uses your account’s Codex limits. Review the proposal before Apply.' };
}
export function initializeAIRequestSummary(consent: HTMLElement) {
  const document = consent.ownerDocument, section = document.createElement('section');
  section.className = 'ai-request-summary'; section.setAttribute('aria-label', 'Before generating');
  section.innerHTML = '<h3>Before generating</h3><p><strong>Note: </strong><span data-request-note></span></p><p data-request-contents></p><p data-request-destination></p>';
  consent.before(section);
  const details = document.createElement('details'), summary = document.createElement('summary');
  details.className = 'ai-data-details'; summary.textContent = 'Data and usage details';
  consent.before(details); details.append(summary, consent);
  return { update(scope: AIRequestScope) {
    const text = describeAIRequest(scope); section.hidden = scope.busy || scope.running;
    section.querySelector('[data-request-note]')!.textContent = text.note;
    section.querySelector('[data-request-contents]')!.textContent = text.contents;
    section.querySelector<HTMLElement>('[data-request-destination]')!.hidden = !text.destination;
    section.querySelector('[data-request-destination]')!.textContent = text.destination;
  } };
}

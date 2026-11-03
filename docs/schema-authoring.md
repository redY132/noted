# Document schemas

A schema is a reusable set of deterministic presentation rules. It never rewrites words, follows a link, executes a component, changes an asset, or changes logical reading order. The **Schemas** editor includes a visual form and an editable JSON definition. The JSON Schema is [`document-schema.schema.json`](document-schema.schema.json); the matching TypeScript types and validation are in [`src/document-schema.ts`](../src/document-schema.ts).

Definitions have an immutable `id` and integer `version`. Saving edits publishes a new version. Existing notes remain pinned to their selected version; **Use this version** explicitly updates only the open note. A missing version keeps the note's already saved presentation and shows a recovery message.

```json
{
  "formatVersion": 1,
  "id": "study-notes",
  "version": 1,
  "name": "Study notes",
  "rules": {
    "body": { "fontFamily": "system", "fontSize": 16, "lineHeight": 1.7, "spacing": 12, "indent": 0 },
    "heading1": { "fontFamily": "system", "fontSize": 28, "lineHeight": 1.3, "spacing": 20 },
    "heading2": { "fontSize": 22, "spacing": 16 }
  }
}
```

Omitted properties inherit the note's existing presentation. `color: null` uses its default text color. Heading rules are independent; an omitted heading rule does not turn that heading into body text. Typeface choices are `system`, `serif`, and `mono`. Sizes are 10–96 pixels; line height is 1–3; spacing is 0–96 pixels; indentation is 0–8 levels. Arbitrary CSS, URLs, HTML, and executable definitions are rejected.

## Suggestions and automatic rules

Suggestion mode is the default. **Preview suggestions** shows the changes without editing. **Apply preview** makes one editor transaction, so one Undo restores its previous presentation. If the note changes after preview, applying fails safely and requires a fresh preview. Inline text colors and other explicit marks remain unchanged. Explicit indentation and typography without schema provenance take precedence.

Automatic enforcement requires opting in and selecting individual rules. Only those rules are enforced on edited text blocks. Choosing a schema or enabling automatic rules does not rewrite the entire note; preview and apply to update existing blocks. Automatic normalization joins the corresponding typing transaction's history and does not run during Undo/Redo. Unknown schema definitions remain inert.

The editor projection records its pinned `schemaReference` and per-note `schemaPolicy` on the document root. Generated block presentation is stored separately in `schemaStyle` and `schemaRef`. This makes selection changes, previews, and typing independent of schema-library persistence. The canonical document adapter maps the root reference into the versioned document's `schemaRef`.

## JavaScript authoring

```ts
import { SchemaRegistry, previewSchema, applySchema } from '../src/document-schema.ts';

const registry = new SchemaRegistry(savedDefinitions, persistDefinitions);
await registry.publish(definition); // rejects changing an existing id/version
const pinned = registry.get({ id: 'study-notes', version: 1 });
if (pinned) {
  const original = editor.state.doc;
  const changes = previewSchema(editor, pinned); // read-only
  // After user approval, original verifies that the preview is still current.
  applySchema(editor, pinned, { mode: 'suggest', enabledRules: [] }, original);
}
```

Pass a trusted persistence callback to `SchemaRegistry`. It validates the entire batch before publishing and only exposes a new version after persistence succeeds. Browser preview uses a separate local schema library. Desktop definitions belong in the workspace and must accompany workspace backup/export. Schema preference and presentation changes do not require model inference or network access.

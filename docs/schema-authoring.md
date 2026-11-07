# Document schemas

A schema is a reusable set of deterministic presentation rules. It never rewrites words, follows a link, executes a component, changes an asset, or changes logical reading order. The **Schemas** editor includes a visual form and an editable JSON definition. The JSON Schema is [`document-schema.schema.json`](document-schema.schema.json); the matching TypeScript types and validation are in `src/document-schema.ts` in the source checkout.

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


## Free Placement and whole-document guides (format 2)

The earlier schema contract covered typography only; free panels already existed as a manual layout tool. **Schemas & layout → Free Placement v1** now provides an explicit reusable layout schema. Preview renders the actual candidate in the current, narrow and wide layouts, in light and dark themes. Apply wraps flow blocks in independent movable panels without changing content IDs, wording or reading order. One Undo restores the previous layout. Existing free-positioned objects retain their positions. Layout is applied on request, never continuously rearranged while writing. A long or complex note that cannot fit safely is rejected rather than clipped.

Choose **Use this whole document as guidance** on an example note. This creates a local draft containing its entire static Noted document, including its layout and formatting. Save the new immutable version. On the target note, select that saved version and choose **Use this version**, then **AI adherence suggestions**. Capturing, saving and selecting do not transmit anything or modify the source note. Editing the original example later does not silently change an existing schema version.

Format 2 extends the existing schema with optional `layout: "free"` and `guide: {title, document}`. The document uses the complete Noted v2 wire format. Typography-only format 1 definitions remain compatible. Static document guidance is limited to 128 KiB serialized; oversized guides are rejected whole, never truncated. Executable components are rejected; images contribute metadata and alt text, never image bytes. Existing Markdown import can produce a Noted guidance document. Direct Word/PDF guide parsing is not implemented.

**AI adherence** displays local formal mismatches, then sends the selected rules only when Generate is pressed. The separate **Allow sending the full guidance document… for this request** box is unchecked on every open and reset after submission or closing. Without that consent, both frontend and native boundary strip the entire guide before saving the request or invoking Codex. Advanced external-agent requests use the same per-request consent and bridge access rules.

A guide is a presentation example, not automatically inferred strict rules. The agent may suggest a layout inspired by it while preserving the target wording. Formal body/heading styles, explicit inline-color conflicts and free-placement policy are checked in native proposal submission/read and again in the visual review. Geometry, readability and contrast must also pass the rendered validator before Apply. Subjective resemblance to a guide still requires human review. There is no background generation, automatic application or expansion of folder access.

Request identity includes the exact schema context, so a rules-only request cannot accidentally reuse a proposal generated with a full guide. The immutable approved snapshot stays with that request for external retrieval until cancellation/removal or its 24-hour read expiry. Expiry prevents future retrieval; it does not securely delete existing files or recall data already processed by a provider. Apply or Reject removes the request and its returned proposal. Closing a review preserves it for later.

Immutable-version comparisons ignore JSON object key order, so a library saved and reopened through native serialization remains compatible. Changing any rule, guide content, array order or other value still requires a new version.

# Local agent integration and optional formatting

Current UI: **Format with AI → Describe change → Generate proposal → visual comparison → Apply / Reject**, with visible Undo. External requests and technical JSON are under Advanced. See [current AI workflow](ai-formatting.md), which supersedes earlier control labels and the two-preview sequence below.

Updated November 3, 2026. The local stdio MCP server has now been exercised by a real **GPT-6.1 Sol** call through the installed official Codex CLI, using the existing **ChatGPT sign-in** and medium reasoning effort. Model inference ran at OpenAI; the client, folder policy, note files and MCP bridge ran on this computer. This is the supported signed-in Codex route, not ChatGPT subscription credits being used as an API key. Account Codex access and limits apply. No credential was created or copied.

Only a disposable synthetic note was transmitted. The model searched/read its selected folder, was refused an unselected synthetic note, fetched a formatting request and queued a bold proposal. Its first malformed operation was rejected; it corrected the field and submitted a valid proposal. The canonical note stayed unchanged until the native preview/Apply/Undo smoke test. Rendered acceptance and Undo preserved the exact wording. The opt-in reproduction script is `scripts/live-subscription-smoke.mjs --run` with `NOTED_CODEX_TEST_CLI` explicitly pointing at the official client; this invokes a hosted model and uses account limits. `scripts/live-model-accept.js` checks the resulting proposal in the native fixture.

The existing personal-workspace MCP registration is separate from this isolated test. No personal note was read or shared, and its default-off policy remains disabled. **This hosted chat is not connected.** There is no tunnel, runtime credential or installed hosted Noted plugin. Explicit in-app subscription send controls are now available after scope clarification; the existing explicit request/reply workflow remains available through a connected agent.

## Connect and choose access

1. Build the desktop app with `npm run desktop:build`, and the companion with `npm run agent:build`. Keep `noted.exe` and `noted-agent.exe` together. The companion needs no Node runtime or network listener.
2. Show folder navigation using the upper-left toggle. Open **Agent access**. Each checkbox names a full folder path. Select exact folders, then enable the local bridge and save. Descendants are separate selections. Empty selection exposes no library notes, but explicit one-note formatting requests can still be read while the bridge is enabled.
3. The dialog supplies a `[mcp_servers.noted]` configuration with the executable and absolute workspace path. Review and add it in a local client's MCP settings, then restart that client. Noted does not change the client's configuration, create credentials, accept agreements or select a paid provider.
4. Ask that agent to search or read Noted when needed. It can retrieve future saved notes in the selected folders. **Revoke all access** stops future reads and formatting-queue access without needing to restart the MCP process.

The supported host mechanism is documented in [official OpenAI MCP documentation](https://developers.openai.com/codex/mcp): local clients can launch stdio servers, while hosted web chats use plugins/remote tools. A hosted Dot chat cannot be connected merely by copying a local Codex configuration. A separate approved plugin/remote adapter remains a distinct integration task. No remote listener or tunnel is created here.

## What the agent can do

| Tool | Behavior |
| --- | --- |
| `list_folders` | Names and IDs of explicitly selected folders only. |
| `search_notes` | Saved text/title/tags, 40 bounded excerpts per page, stable note citations. |
| `get_note` | Saved logical text, 16,000 Unicode scalar values per chunk, revision token and `noted://note/ID` citation. Continue with `expectedRevisionToken` to reject a changed snapshot. |
| `get_formatting_requests` | Up to three live explicit requests with the revision-bound static document. Includes unshared notes only when their user created a one-note request. |
| `submit_formatting_proposal` | Validates and queues presentation operations for an explicit request. Never saves canonical notes or grants acceptance. |

No tool enables sharing, creates requests, changes notes, downloads assets, executes components, reads arbitrary files, or calls a model. Note contents are untrusted data, not agent instructions. Retrieval includes authored rich text, image descriptions and saved component fallback text, excluding binary assets and component source/properties/state.

The server rereads access on every call and before returning output. Trashed and moved-out notes fail subsequent reads. Removing a selection or disabling access cannot erase content an agent already received or revoke filesystem access the agent independently possesses. The selected agent may send tool results to its model provider; choosing that client, its privacy policy and its spending controls remains the user's decision. Noted makes no automatic external request.

## Agent-assisted formatting

Open a static note, choose **Ask agent for layout**, describe the desired presentation and click **Create request**. This flushes the note and creates explicit access to that one saved revision for 24 hours. Tell the connected agent to check Noted formatting requests. It proposes `format`, `style` or `arrange` operations under formatting/arrangement scope. Words, task state, links, IDs and logical reading order must be preserved.

Use **Check for proposal**, then **Preview proposal**. The existing document-operation pipeline checks revisions, content invariants, actual inert rendering, contrast and geometry before **Apply preview** can accept it. Acceptance uses the trusted renderer's digest-bound token. A single Undo restores the previous editor projection. The agent does not receive render-token or acceptance commands.

Requests survive app restarts and can be selected, rejected or cancelled in the dialog. Changed notes make requests stale; cancel and recreate them. Replies never apply automatically. Static rendering still refuses interactive components and motion, including otherwise valid agent proposals. Requests are below 512 KiB of document JSON, prompts below 4,000 bytes, replies below 1 MiB and 1,000 operations. Native validation remains authoritative.

## Storage and limits

`agent-access.json` is disabled by default. Its independent `allowHosted` flag also defaults to false; hosted transports must launch with `--audience hosted`, which enforces that second permission on every tool call. Local folder selection alone does not authorize a future hosted connection. `agent-requests/` and `agent-replies/` contain local transient work. They are deliberately omitted from portable backups, so restoring a workspace cannot reactivate agent access. Canonical note files remain authoritative and atomically published. The agent process does not acquire the app writer lock or write canonical data; its sole write operation publishes a reply sidecar for user review.

The bridge supports at most 20,000 files / 256 MiB in a search scan, 8 MiB per note, 1,000 selected folders and 2 MiB per MCP message. It fails with an explicit size error instead of silently claiming to have searched an oversized library. This initial scan-based adapter has no independent full-text cache and is outside the keystroke path. Paths must be absolute ordinary paths, with no symlinks or Windows junctions. Do not expose the executable as an unauthenticated remote server.

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features`: selection, descendant privacy, revocation, Trash exclusion, explicit request scope, stale/content proposal rejection.
- `node scripts/agent-smoke.mjs [path-to-noted-agent.exe]`: real JSON-RPC initialization/catalog/calls over stdio; private canary never returned, Unicode chunking, moved-note rejection, malformed/disabled policy fails closed, proposal queued with canonical bytes unchanged. Uses a temporary fixture and no model.
- Native disposable-workspace sequence: `agent-native-prepare.js`, `agent-native-submit.mjs`, `agent-native-finish.js`. The submit helper uses `output/alpha-native-state.json` and the preparation log; use it only in the documented disposable smoke setup. It tests the native UI through request, real transport reply, rendered preview, acceptance, shared Undo, cancellation and revocation.

Remaining choices: which local agent to connect, exact folders to share, that agent's provider/account and spending policy. An in-app provider client, automatic agent wake-up, hosted-chat plugin, remote sync and external end-to-end model generation are not implemented or implicitly authorized.


## Hosted-chat follow-up

Redley also requested this hosted chat. The same server now supports `--audience hosted`, guarded by a separate default-off UI permission. No tunnel or custom plugin has been activated. [Hosted setup and exact readiness boundaries](hosted-chat-setup.md) records the supported path and remaining account actions. Local desktop registration does not itself install tools into a hosted thread.


### Subscription controls resumed after scope clarification

The later deferral applied to Afterglow, not Noted. The authorized Noted controls are now implemented: explicit **Send this saved note using ChatGPT**, existing official Codex ChatGPT sign-in only, fixed GPT-6.1 Sol/medium, one temporary static-note snapshot (64 KiB maximum), one running job, cancellation and a three-minute timeout. The model has only the temporary formatting-request/proposal tools; no other notes or personal sharing policy are copied. No API-key fallback, credentials or hosted-chat access is added. Proposals still require rendered preview and explicit acceptance; nothing auto-applies.

Passive polling checks local job/proposal status while its dialog is open and does not initiate model calls. Transport heartbeat is separate from sharing policy and never claims this hosted chat is verified. Hosted-chat activation still requires its separate account/tunnel/plugin setup and approval. Earlier references to deferral describe the prior checkpoint, superseded by this clarification.

Current validation: 160 frontend tests and 83 desktop/native tests pass (four optional model/corpus tests skipped). The Windows release and matching agent companion build successfully. Live native subscription evidence is retained in ignored `output/subscription-live-start.log` and `output/subscription-live-finish.log`.

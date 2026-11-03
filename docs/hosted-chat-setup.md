# Hosted-chat connection: prepared, not live

Redley selected local Codex/ChatGPT desktop and additionally requested this hosted chat. The local `noted` MCP entry has been registered using the installed client's supported command. Its existing default workspace was identified by directory metadata only; no personal note was opened or shared. The local entry is enabled as a client connection, while Noted's access policy remains absent/default-disabled. A client restart/refresh and tool discovery remain unverified; the running chat was not restarted.

## Supported hosted path

[OpenAI's Secure MCP Tunnel documentation](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) supports forwarding private stdio MCP to supported ChatGPT surfaces. It requires an associated tunnel, runtime key and the relevant Platform/ChatGPT permissions. Adding the custom plugin includes a user risk/approval step. The documentation describes these capabilities; availability for Redley's particular organization/workspace has not been established. No key, tunnel, account association or plugin was created here.

The app is ready to serve that transport using:

```text
noted-agent.exe --workspace ABSOLUTE_WORKSPACE_PATH --audience hosted
```

This command starts only a stdio process; it opens no listener and makes no model/network request. A tunnel client would forward approved requests to it. **A local Codex configuration alone does not connect this hosted chat.** Desktop-only plugins are [limited to local execution and approved submission routes](https://developers.openai.com/plugins/deploy/desktop-only), so packaging one must not be presented as a live hosted connection.

## Implemented scope and revocation

- `enabled` plus exact `folderIds` continues to control saved-text access. Descendants require separate selection. Unselected notes, assets, scripts and Trash are outside retrieval.
- The additional `allowHosted` flag defaults to false, including old policies without that field. The UI says **Also allow these folders and active formatting requests through an approved hosted-chat connection**. Do not enable it until the hosted connection and destination account are reviewed.
- `--audience hosted` rejects all tool calls unless both flags permit it. Revoking hosted permission leaves local access intact; **Revoke all access** disables both. Call-time policy rereads and post-call revalidation still apply. Previously received content cannot be recalled.
- Hosted configuration must always include the hosted audience argument. This policy is an application boundary, not an OS sandbox; someone who independently controls the process command/filesystem already has broader access.
- Formatting remains an explicit revision-bound one-note request and queued proposal. Neither transport can create requests, change access choices or invoke trusted rendering/acceptance. The user previews and accepts in Noted and can Undo.

## Readiness checker

Run `node scripts/hosted-bridge-readiness.mjs --workspace ABSOLUTE_PATH --server ABSOLUTE_NOTED_AGENT_EXE --codex ABSOLUTE_CODEX_EXE` locally. Optional `--tunnel-client ABSOLUTE_EXE` identifies an existing client. The checker performs initialization/catalog discovery only: **no `tools/call`, note reads, network requests, secret inspection, key creation, downloads or configuration writes**. Its JSON distinguishes registered local configuration from verified live session discovery and hosted connection state.

The observed check on this computer found the local entry registered, the companion's five-tool catalog available, zero selected folders, and both access flags off. No `tunnel-client` executable was found on PATH. Tunnel identity/runtime credentials and target account permissions were not inspected. This is readiness evidence, not an end-to-end hosted test.

## Remaining user/account actions

1. Choose the intended Platform organization and ChatGPT workspace; check whether a suitable private tunnel and restricted runtime credential already exist.
2. If needed, create/provide the restricted runtime credential through the official account interface or secure local environment, never in chat, Git, generated configuration text or logs. Do not reuse a broad unrelated key.
3. Review the exact tunnel association, plugin destination and permissions. The user completes any required risk/connection approval. Follow the current official setup UI/CLI; this repository does not fabricate a tunnel identity or bypass an approval screen.
4. Configure the forwarder with the hosted-audience command above. Only then explicitly enable hosted permission for selected folders in Noted.
5. Verify a disposable synthetic note from **this hosted chat**, an unselected-note refusal and revocation while connected. Until an actual tool call succeeds in this chat, report it as unconnected.

No available tool in this task can install a new custom MCP plugin into the hosted conversation. Plugin catalogue search is also not exposed here; no claim is made about the full directory. The remaining actions are **not attempted/pending user account setup**, not a denied or uncertain deployment. No external endpoint has been published and no third-party access is enabled. If the account cannot use private tunnels/custom plugins, an authenticated hosted service is a separate architecture, consent, hosting and cost decision; do not fall back to a public unauthenticated proxy.

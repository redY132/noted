# Native draft recovery verification

The tested application is the unchanged `eafab90` portable GUI, SHA-256
`429e420bc50d89ea0b78ca1984eb9d9413205ec02824ac36415d488158169fe5`.
This delivery changes only test harnesses and documentation, not export behavior.

## Run

With Node.js, Python 3 and an already installed Playwright CLI:

```powershell
./scripts/Test-NativeDraft.ps1 -PlaywrightCLI C:\path\to\playwright-cli.js
python -B scripts/test_native_draft_verifier.py
```

The runner verifies the existing portable archive, copies only its GUI to a
fresh generated fixture, isolates its WebView/client directories and disables
the subscription runner. Sharing must be disabled and the exact generated
workspace must match before test reads or mutations. No model client or companion
runs. Original process environment variables are restored; only the owned app
is closed. The runner never installs dependencies.

A genuine native revision conflict leaves the local draft mounted while a newer
external version stays saved. Download draft must preserve mounted title/content,
the external version, one-step Undo, Redo and restoration of the original body.
All existing responsive recovery/Keep both assertions remain. Expected Unicode
is ASCII-escaped in the returned evidence because Windows shell capture can
otherwise corrupt non-ASCII log output. File JSON itself remains Unicode.

After the owned app closes, the separate artifact gate opens only its known
profile History database in read-only immutable mode. It obtains a target for
the exact generated UUID, validates it against that fixture's expected identity,
and reads that one proven synthetic file. It never lists Downloads. Redirected,
missing, oversized, incomplete or mismatched files fail. It compares projected
editor structure (ignoring null defaults), title, identity, Unicode and V2
presence. It compares every canonical field of the saved external file; the
transport-only revision token and projected editor content are checked in the
native API comparison instead. No source database, original asset or personal
workspace is involved.

`output/native-draft-state.json` records UI/provenance/closure. Only a successful
artifact gate adds `artifactVerified`; UI success alone is insufficient.
`output/native-draft-verification.json` records the actual artifact digest and
remaining coverage gaps. Generated fixtures and downloads are retained for
review; filenames are unique synthetic UUIDs. The verifier never writes them.

## Measured result

The integrated fresh-fixture runner passed 180 recovery checks across twelve
profiles plus the 2,064-byte artifact gate. The preceding cache regression passed
ten checks across six layouts. The saved external version, mounted draft,
Unicode and document structure, Undo/Redo and Keep both were preserved. The owned
app closed. Seven inert verifier tests passed, covering valid Unicode transport,
missing files, changed structure, changed external version, interrupted transfer,
incomplete UI evidence and an arbitrary fixture root. These failure tests use
only newly generated temporary files; they are not native Save As tests.

Initial event-based attempts timed out. Read-only reconciliation subsequently
proved the default attempt had successfully written its exact synthetic JSON;
the CDP-directed attempt had zero received bytes and an absent requested target.
The missing Playwright event was an observation failure, not an established app
defect. A later artifact comparison caught shell-log Unicode corruption; ASCII
transport fixed the harness and the full integrated run passed afterward.

Native dialog cancellation, explicit destination choice, destination sentinel
safety and native write-failure recovery remain UNVERIFIED. The required
computer-use node_repl route is unavailable; no other UI route was substituted.
No product fix is justified by these observations. A JSON draft references
note-owned assets and definitions; it is not a self-contained workspace backup.
Use Backup and restore for that purpose. Full frontend/native suites were not
rerun because application code and executable were unchanged. No hardware,
release, hosted-integration or deployment certification is implied.

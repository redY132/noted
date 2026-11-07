# Portable release verification

`scripts/Build-Portable.ps1` requires a clean committed source tree. It type-checks and rebuilds the frontend, then builds the GUI and both matching companions with the desktop custom protocol enabled. A second source check refuses packaging if files or HEAD changed during the build. Build failure stops publication of a package.

The private Windows x64 alpha ZIP contains the three executables, curated feature/privacy/recovery documents, a README and a manifest identifying the source commit. No notes, source imports, profiles, credentials or access policy are bundled. The package remains unsigned and is not certified on inexpensive hardware.

Every payload has a size and SHA-256 in the manifest. The ZIP has a separate `.sha256` file. Packaging invokes `Test-Portable.ps1` before updating `output/portable-latest.json`.

The verifier is also bundled for use after extraction. Its result includes the verified GUI hash so the reference-test kit can prove it copied that same executable, rather than a stale build output.

Hashing and ZIP creation/inspection use .NET streams and explicitly loaded compression assemblies. They do not depend on `Get-FileHash` or the PowerShell Archive module being available in a child shell.

```powershell
./scripts/Build-Portable.ps1
./scripts/Test-Portable.ps1 -Archive ./output/Noted-alpha-<stamp>-<commit>.zip
```

The verifier reads the ZIP without extracting or launching its files. It rejects checksum mismatches, unsafe/duplicate paths, multiple roots, missing/extra payloads, invalid manifests and inconsistent source commits. These integrity checks detect corruption and packaging mistakes; they do not authenticate an unsigned download.

The component manifest JSON Schema is included with its authoring guide. Local
Markdown links must resolve to listed payloads in the flat archive; source-only
paths are described as checkout paths rather than broken archive links.
Document reads are capped at 1 MiB and link scans have a two-second timeout.

`Test-Portable-Fixtures.ps1` passed 18 synthetic archive cases: valid package and local/encoded/fragment/external links; missing or escaping local links; oversized documents; bad outer checksum, wrong source commit, changed size/digest, invalid size, missing required file, unlisted file, duplicate ZIP/manifest entries, unsafe path, multiple roots, unsupported certification and root/commit mismatch. Fixture payloads are inert text, including the three `.exe` names; none are launched.

After packaging, extract a new disposable copy into a path containing spaces. Set `NOTED_WORKSPACE` and `WEBVIEW2_USER_DATA_FOLDER` to new separate temporary directories, then check first-run Help, save/reopen and the optional companion handshake without generation. Never smoke-test a release against a personal note workspace. A working WebView2 runtime is required. Only stop the exact process launched by that fixture; do not terminate a user's running app or agent to replace locked binaries.

For synthetic native UI tests, also set `NOTED_DISABLE_SUBSCRIPTION_RUNNER=1`
in the launched process and use an empty `CODEX_HOME` and isolated
`LOCALAPPDATA`. Remove API credentials from that child environment and omit the
agent companion unless its handshake is specifically under test. The native
runner fuse refuses generation before note lookup or request creation; it does
not alter saved account preferences or another running Noted instance.

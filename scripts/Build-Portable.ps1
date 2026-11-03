$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $repoRoot
try {
 $sourceCommit=(& git rev-parse HEAD).Trim()
 if($LASTEXITCODE -ne 0){throw 'Cannot identify source commit'}
 if((& git status --porcelain)){throw 'Commit and verify source before packaging a reproducible portable build'}
 $stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
 $destination=Join-Path $repoRoot ('output\portable-'+$stamp+'-'+$sourceCommit.Substring(0,7))
 if(Test-Path -LiteralPath $destination){throw 'Package destination exists'}
 New-Item -ItemType Directory -Path $destination | Out-Null
 foreach($name in @('noted.exe','noted-agent.exe')){
  $binary=Join-Path $repoRoot ('src-tauri\target\release\'+$name)
  if(-not(Test-Path -LiteralPath $binary -PathType Leaf)){throw "Build $name before packaging"}
  Copy-Item -LiteralPath $binary -Destination (Join-Path $destination $name)
 }
 $readme=@'
Noted Windows portable alpha

Extract this entire archive into a local folder. Windows x64 and an installed Microsoft Edge WebView2 runtime are required. Launch noted.exe; keep noted-agent.exe beside it for optional MCP use. This build is unsigned; no installer or automatic update is included. No license, signing certificate or public distribution decision is made by generating this private test package.

The app uses the ordinary Noted workspace under this Windows account. Back up existing notes first using Workspace details. For a disposable trial, launch with NOTED_WORKSPACE pointing to a new absolute folder and WEBVIEW2_USER_DATA_FOLDER pointing to a separate new profile folder. Do not run multiple writers against the same workspace. Imported and restored copies open separately and start unshared.

Workspace details offers checksummed backups and staged imports from exported Markdown folders, Obsidian vault copies and Logseq file graphs. Review the complete loss report before accepting. Originals remain archived; DB/EDN/Mirror, generic attachment opening, source-app history and live transclusion are not supported. Keep your original export.

AI is optional. The local agent companion reads only explicitly selected saved folders or explicit formatting requests. Model inference in a connected Codex/ChatGPT client is hosted and subject to that account's limits. There is no hosted-chat connection or new in-app subscription send button in this build. The optional local semantic model needs its separately installed pack; no model pack is bundled or downloaded automatically.

This is a developer alpha, not a certified public release. Real inexpensive-hardware acceptance, signed installer, final license/distribution choice, and hosted plugin/account setup remain pending. See the included verification and migration documents. No personal notes, profiles, credentials or agent policy are bundled.
'@
 $readme | Set-Content -LiteralPath (Join-Path $destination 'README.txt') -Encoding utf8
 foreach($name in @('migration-plan.md','milestone-verification.md','backup-restore.md','agent-integration.md','hosted-chat-setup.md','reference-benchmark.md')){Copy-Item -LiteralPath (Join-Path $repoRoot ('docs\'+$name)) -Destination (Join-Path $destination $name)}
 $files=Get-ChildItem -LiteralPath $destination -File | ForEach-Object {@{path=$_.Name;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}
 @{formatVersion=1;sourceCommit=$sourceCommit;createdAt=(Get-Date).ToUniversalTime().ToString('o');signed=$false;hardwareCertified=$false;files=@($files)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $destination 'manifest.json') -Encoding utf8
 $zip=Join-Path $repoRoot ('output\Noted-alpha-'+$stamp+'-'+$sourceCommit.Substring(0,7)+'.zip')
 Compress-Archive -LiteralPath $destination -DestinationPath $zip
 $digest=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
 "$digest  $([IO.Path]::GetFileName($zip))" | Set-Content -LiteralPath ($zip+'.sha256') -Encoding ascii
 @{path=$zip;sha256=$digest;sourceCommit=$sourceCommit} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $repoRoot 'output\portable-latest.json') -Encoding utf8
 Write-Output $zip
} finally {Pop-Location}

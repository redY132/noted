param([Parameter(Mandatory=$true)][string]$PlaywrightCLI,[switch]$WritingCustomization)
$ErrorActionPreference='Stop'
$notedRepo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$notedNode=(Get-Command node -ErrorAction Stop).Source
$notedCLI=(Resolve-Path -LiteralPath $PlaywrightCLI).Path
$notedLatest=Get-Content -LiteralPath (Join-Path $notedRepo 'output\portable-latest.json') -Raw | ConvertFrom-Json
$notedHead=(& git -C $notedRepo rev-parse HEAD).Trim()
if($notedLatest.sourceCommit -ne $notedHead -or (& git -C $notedRepo status --porcelain)){throw 'MATCHING_CLEAN_PORTABLE_REQUIRED'}
$notedArchive=[IO.Path]::GetFullPath($notedLatest.path)
if(-not $notedArchive.StartsWith((Join-Path $notedRepo 'output')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'OWNED_PACKAGE_REQUIRED'}
& (Join-Path $notedRepo 'scripts\Test-Portable.ps1') -Archive $notedArchive -ExpectedSourceCommit $notedLatest.sourceCommit
$notedTrial=Join-Path ([IO.Path]::GetTempPath()) ('noted cached proposal trial-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $notedTrial | Out-Null
Push-Location -LiteralPath $notedTrial
try { & $notedNode (Join-Path $notedRepo 'scripts\create-ai-formatting-fixture.mjs') --long-title; if($LASTEXITCODE -ne 0){throw 'GENERATED_FIXTURE_FAILED'} } finally { Pop-Location }
$notedFixture=Get-Content -LiteralPath (Join-Path $notedTrial 'output\simple-ai-state.json') -Raw | ConvertFrom-Json
$notedRoot=[IO.Path]::GetFullPath($notedFixture.root)
$notedTemp=[IO.Path]::GetTempPath().TrimEnd('\')+'\'
if(-not $notedRoot.StartsWith($notedTemp,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($notedRoot) -notmatch '^noted-simple-ai-[A-Za-z0-9]+$' -or [IO.Path]::GetFullPath($notedFixture.workspace) -ne (Join-Path $notedRoot 'workspace')){throw 'EXACT_FRESH_FIXTURE_REQUIRED'}
$notedBin=Join-Path $notedRoot 'bin'; $notedScreenshots=Join-Path $notedRoot 'ui-evidence'; New-Item -ItemType Directory -Path $notedBin,$notedScreenshots | Out-Null
$notedBinary=Join-Path $notedBin 'noted.exe'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$notedZip=[IO.Compression.ZipFile]::OpenRead($notedArchive)
try {
 $notedEntries=@($notedZip.Entries | Where-Object { $_.FullName.EndsWith('/noted.exe',[StringComparison]::OrdinalIgnoreCase) })
 if($notedEntries.Count -ne 1){throw 'VERIFIED_GUI_ENTRY_REQUIRED'}
 $notedInput=$notedEntries[0].Open();$notedOutput=[IO.File]::Open($notedBinary,[IO.FileMode]::CreateNew)
 try {$notedInput.CopyTo($notedOutput)} finally {$notedInput.Dispose();$notedOutput.Dispose()}
} finally {$notedZip.Dispose()}
$notedListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$notedListener.Start();$notedPort=$notedListener.LocalEndpoint.Port;$notedListener.Stop()
$notedSession='noted-cached-'+[guid]::NewGuid().ToString('N').Substring(0,10)
$notedKeys=@('NOTED_WORKSPACE','WEBVIEW2_USER_DATA_FOLDER','WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','NOTED_DISABLE_SUBSCRIPTION_RUNNER','CODEX_HOME','LOCALAPPDATA','OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_BASE_URL','OPENAI_API_BASE')
$notedSaved=@{};foreach($notedKey in $notedKeys){$notedSaved[$notedKey]=[Environment]::GetEnvironmentVariable($notedKey,'Process')}
$notedApp=$null;$notedAttached=$false
$notedState=@{syntheticOnly=$true;status='starting';passed=$false;trial=$notedTrial;fixture=$notedRoot;workspace=$notedFixture.workspace;binary=$notedBinary;sourceCommit=$notedLatest.sourceCommit;session=$notedSession;port=$notedPort;noModelFuse=$true;screenshots=$notedScreenshots;longTitle=$true}
$notedStatePath=Join-Path $notedRepo 'output\progressive-native-state.json'
$notedState | ConvertTo-Json | Set-Content -LiteralPath $notedStatePath -Encoding utf8
try {
 $env:NOTED_WORKSPACE=$notedFixture.workspace;$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $notedRoot 'fresh-webview-profile';$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-address=127.0.0.1 --remote-debugging-port=$notedPort"
 $env:NOTED_DISABLE_SUBSCRIPTION_RUNNER='1';$env:CODEX_HOME=Join-Path $notedRoot 'empty-codex-home';$env:LOCALAPPDATA=Join-Path $notedRoot 'isolated-localappdata'
 New-Item -ItemType Directory -Path $env:CODEX_HOME,$env:LOCALAPPDATA | Out-Null
 foreach($notedKey in 'OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_BASE_URL','OPENAI_API_BASE'){[Environment]::SetEnvironmentVariable($notedKey,$null,'Process')}
 $notedApp=Start-Process -FilePath $notedBinary -WorkingDirectory $notedRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $notedTrial 'app.log') -RedirectStandardError (Join-Path $notedTrial 'app-error.log')
 $notedState.pid=$notedApp.Id;$notedState.status='running';$notedState | ConvertTo-Json | Set-Content -LiteralPath $notedStatePath -Encoding utf8
 $notedClock=[Diagnostics.Stopwatch]::StartNew();$notedReady=$false
 while(-not $notedReady){if($notedApp.HasExited){throw 'OWNED_APP_EXITED'};if($notedClock.Elapsed.TotalSeconds -gt 60){throw 'OWNED_ENDPOINT_TIMEOUT'};try{Invoke-RestMethod -Uri "http://127.0.0.1:$notedPort/json/version" -TimeoutSec 1 | Out-Null;$notedReady=$true}catch{Start-Sleep -Milliseconds 100}}
 & $notedNode $notedCLI "-s=$notedSession" attach "--cdp=http://127.0.0.1:$notedPort" *> (Join-Path $notedTrial 'attach.log');if($LASTEXITCODE -ne 0){throw 'OWNED_ATTACH_FAILED'};$notedAttached=$true
 $notedOptions=@{workspace=$notedFixture.workspace;noteId=$notedFixture.noteId;requestId=$notedFixture.requestId} | ConvertTo-Json -Compress
 $notedSetup=Join-Path $notedTrial 'set-fixture.js';[IO.File]::WriteAllText($notedSetup,"async page=>{await page.waitForFunction(()=>document.querySelector('#header-connection-handle button'));await page.evaluate(expected=>window.notedCachedFixture=expected,$notedOptions);return{syntheticOnly:true};}")
 & $notedNode $notedCLI "-s=$notedSession" run-code --filename $notedSetup *> (Join-Path $notedTrial 'setup.log');if($LASTEXITCODE -ne 0){throw 'OWNED_SETUP_FAILED'}
 Push-Location -LiteralPath $notedRepo
 try {$notedResult=& $notedNode $notedCLI "-s=$notedSession" run-code --filename scripts\ai-activity-cache-smoke.js 2>&1;$notedExit=$LASTEXITCODE}finally{Pop-Location}
 $notedLog=Join-Path $notedTrial 'cached-proposal.log';$notedResult | Set-Content -LiteralPath $notedLog -Encoding utf8
 $notedJSON=$notedResult | Where-Object {$_ -match '^\{"passed":'} | Select-Object -First 1
 if($notedExit -ne 0 -or -not $notedJSON){$notedResult | Select-Object -First 12 | Write-Output;throw 'CACHED_PROPOSAL_CHECK_INCOMPLETE'}
 $notedChecked=$notedJSON | ConvertFrom-Json;if(-not $notedChecked.passed){throw 'CACHED_PROPOSAL_CHECK_FAILED'}
 $notedState.cachePassed=$true
  Push-Location -LiteralPath $notedRepo
  try {$seed=& $notedNode $notedCLI "-s=$notedSession" run-code --filename scripts\progressive-explorer-seed-native.js 2>&1;$seedExit=$LASTEXITCODE}finally{Pop-Location}
  $seed|Set-Content -LiteralPath (Join-Path $notedTrial 'explorer-seed.log') -Encoding utf8
  if($seedExit -ne 0 -or -not ($seed|Where-Object {$_ -match '"fixtureReady":true'})){throw 'OWNED_EXPLORER_SEED_FAILED'}
  & $notedNode $notedCLI "-s=$notedSession" run-code --filename $notedSetup *> (Join-Path $notedTrial 'explorer-guard-setup.log')
  if($LASTEXITCODE -ne 0){throw 'OWNED_EXPLORER_GUARD_SETUP_FAILED'}

  Push-Location -LiteralPath $notedRepo
  try{$notedExplorerResult=& $notedNode $notedCLI "-s=$notedSession" run-code --filename scripts\progressive-explorer-smoke.js 2>&1;$notedExplorerExit=$LASTEXITCODE}finally{Pop-Location}
  $notedExplorerLog=Join-Path $notedTrial 'progressive-explorer.log';$notedExplorerResult|Set-Content -LiteralPath $notedExplorerLog -Encoding utf8
  $notedState.explorerLog=$notedExplorerLog
  $notedExplorerJSON=$notedExplorerResult|Where-Object {$_ -match '^\{"passed":'}|Select-Object -First 1
  if($notedExplorerExit -ne 0 -or -not $notedExplorerJSON){$notedExplorerResult|Select-Object -First 12|Write-Output;throw 'NATIVE_EXPLORER_CHECK_INCOMPLETE'}
  $notedExplorerChecked=$notedExplorerJSON|ConvertFrom-Json;if(-not $notedExplorerChecked.passed -or -not $notedExplorerChecked.native){throw 'NATIVE_EXPLORER_CHECK_FAILED'}
  $notedState.explorerPassed=$true;$notedState.explorerChecks=$notedExplorerChecked.checks.Count;$notedState.explorerProfiles=$notedExplorerChecked.profiles.Count
 if($WritingCustomization){
  Push-Location -LiteralPath $notedRepo
  try{$writingResult=& $notedNode $notedCLI "-s=$notedSession" run-code --filename scripts\writing-customization-smoke.js 2>&1;$writingExit=$LASTEXITCODE}finally{Pop-Location}
  $writingLog=Join-Path $notedTrial 'writing-customization.log';$writingResult|Set-Content -LiteralPath $writingLog -Encoding utf8;$notedState.writingLog=$writingLog
  $writingJSON=$writingResult|Where-Object {$_ -match '^\{"passed":'}|Select-Object -First 1
  if($writingExit -ne 0 -or -not $writingJSON){throw 'WRITING_CHECK_INCOMPLETE'}
  $writingChecked=$writingJSON|ConvertFrom-Json;if(-not $writingChecked.passed -or -not $writingChecked.native){throw 'WRITING_CHECK_FAILED'}
  $notedState.writingPassed=$true;$notedState.writingChecks=$writingChecked.checks.Count;$notedState.writingProfiles=$writingChecked.profiles.Count
 }
 $notedState.status='completed';$notedState.passed=$true;$notedState.log=$notedLog;$notedState.checks=$notedChecked.checks.Count;$notedState.profiles=$notedChecked.profiles.Count
 @{passed=$true;syntheticOnly=$true;native=$true;noModelFuse=$true;sourceCommit=$notedLatest.sourceCommit;cacheChecks=$notedChecked.checks.Count;explorerChecks=$notedExplorerChecked.checks.Count;explorerProfiles=$notedExplorerChecked.profiles.Count;log=$notedExplorerLog} | ConvertTo-Json -Compress
} catch {$notedState.status='failed-or-incomplete';throw} finally {
 if($notedAttached){& $notedNode $notedCLI "-s=$notedSession" detach *> (Join-Path $notedTrial 'detach.log')}
 if($notedApp -and -not $notedApp.HasExited){$notedCurrent=Get-Process -Id $notedApp.Id -ErrorAction SilentlyContinue;if($notedCurrent -and $notedCurrent.Path -eq $notedBinary){[void]$notedApp.CloseMainWindow();if(-not $notedApp.WaitForExit(10000)){Stop-Process -Id $notedApp.Id};$notedState.ownedAppClosed=$true}}
 foreach($notedKey in $notedSaved.Keys){[Environment]::SetEnvironmentVariable($notedKey,$notedSaved[$notedKey],'Process')}
 $notedState | ConvertTo-Json | Set-Content -LiteralPath $notedStatePath -Encoding utf8
}

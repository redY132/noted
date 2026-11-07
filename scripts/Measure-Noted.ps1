[CmdletBinding()]
param(
 [ValidateRange(0,60)][int]$Minutes=5,
 [ValidateRange(1,8)][double]$CpuSlowdown=1,
 [string]$PlaywrightCLI,
 [ValidateRange(1024,65535)][int]$Port=1431,
 [switch]$CheckMediaLifetime,
 [switch]$ResourceOnly,
 [ValidateSet('full','components','text','images','mixed')][string]$ResourceCase='full',
 [ValidateRange(20,3600)][int]$ResourceSeconds=180,
 [switch]$ResourceDebuggerAttached
)
$ErrorActionPreference='Stop'
if($ResourceOnly -and $CpuSlowdown -ne 1){throw 'Resource mode uses native CPU speed. Run timing sensitivity checks separately.'}
if($ResourceDebuggerAttached -and -not $ResourceOnly){throw 'ResourceDebuggerAttached requires ResourceOnly.'}
function Get-NotedSha256([string]$Path){
 $stream=[IO.File]::OpenRead($Path);$algorithm=[Security.Cryptography.SHA256]::Create()
 try {return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant()} finally {$algorithm.Dispose();$stream.Dispose()}
}
$kitRoot=$PSScriptRoot
$node=(Get-Command node -ErrorAction Stop).Source
if(-not $PlaywrightCLI){
 $launcher=Get-Command playwright-cli -ErrorAction SilentlyContinue
 if($launcher){$PlaywrightCLI=Join-Path (Split-Path $launcher.Source) 'node_modules\@playwright\cli\playwright-cli.js'}
}
if(-not $PlaywrightCLI -or -not(Test-Path -LiteralPath $PlaywrightCLI -PathType Leaf)){throw 'Install Node.js 24+ and @playwright/cli 0.1.22, or pass -PlaywrightCLI with the full path to playwright-cli.js. This runner never downloads dependencies automatically.'}
$PlaywrightCLI=(Resolve-Path -LiteralPath $PlaywrightCLI).Path
if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw "Port $Port is occupied. Choose an unused port; existing processes will not be stopped."}
$manifest=Get-Content -LiteralPath (Join-Path $kitRoot 'kit-manifest.json') -Raw|ConvertFrom-Json
$kitPrefix=[IO.Path]::GetFullPath($kitRoot).TrimEnd('\')+'\'
foreach($item in $manifest.files){
 if(-not($item.path -is [string]) -or $item.path.Contains(':') -or $item.path -match '(^[/\\])|(^|[/\\])\.\.([/\\]|$)'){throw 'Unsafe kit manifest path'}
 $file=[IO.Path]::GetFullPath((Join-Path $kitRoot $item.path));if(-not $file.StartsWith($kitPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Kit payload escaped its root'}
 $cursor=$kitRoot;foreach($part in ($item.path -split '[/\\]')){$cursor=Join-Path $cursor $part;if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Kit payload links are not supported'}}
 if((Get-NotedSha256 $file) -ne $item.sha256){throw 'Kit checksum mismatch'}
}
$runs=Join-Path $kitRoot 'runs';New-Item -ItemType Directory -Path $runs -Force|Out-Null
$run=Join-Path $runs ((Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8));New-Item -ItemType Directory -Path $run|Out-Null
$workspace=Join-Path $run 'workspace';New-Item -ItemType Directory -Path $workspace|Out-Null
# Copy only checksummed generated payloads. Extra files in fixtures are never read.
foreach($item in $manifest.files){if($item.path.StartsWith('fixtures/')){$target=Join-Path $workspace $item.path.Substring(9);New-Item -ItemType Directory -Path (Split-Path $target) -Force|Out-Null;Copy-Item -LiteralPath (Join-Path $kitRoot $item.path) -Destination $target}}
$webViewProfile=Join-Path $run 'webview-profile'
$oldEnvironment=@{};foreach($name in 'NOTED_WORKSPACE','WEBVIEW2_USER_DATA_FOLDER','WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','NOTED_DISABLE_SUBSCRIPTION_RUNNER','CODEX_HOME','LOCALAPPDATA','OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_BASE_URL','OPENAI_API_BASE'){$oldEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$session='noted-bench-'+[guid]::NewGuid().ToString('N').Substring(0,10)
$app=$null;$worker=$null;$sessionAttached=$false;$memory=[Collections.Generic.List[object]]::new()
function Read-TreeMemory([int]$RootId){
 $all=@(Get-CimInstance Win32_Process);$ids=[Collections.Generic.HashSet[int]]::new();[void]$ids.Add($RootId)
 do{$added=$false;foreach($process in $all){if($ids.Contains([int]$process.ParentProcessId)-and $ids.Add([int]$process.ProcessId)){$added=$true}}}while($added)
 $private=0L;$working=0L;$count=0;$roles=@{};$metadata=@{}
 foreach($entry in $all){$metadata[[int]$entry.ProcessId]=$entry}
 foreach($processId in $ids){
  $item=Get-Process -Id $processId -ErrorAction SilentlyContinue
  if($item){
   $role=if($processId -eq $RootId){'app'}else{'browser'}
   if($processId -ne $RootId -and [string]$metadata[$processId].CommandLine -match '(?:^|\s)--type="?([a-z-]+)'){
    $role=if($Matches[1] -in @('renderer','gpu-process','utility','crashpad-handler')){$Matches[1]}else{'other'}
   }
   if(-not $roles.ContainsKey($role)){$roles[$role]=@{processes=0;privateBytes=0L;workingSetBytes=0L}}
   $roles[$role].processes++;$roles[$role].privateBytes+=$item.PrivateMemorySize64;$roles[$role].workingSetBytes+=$item.WorkingSet64
   $private+=$item.PrivateMemorySize64;$working+=$item.WorkingSet64;$count++
  }
 }
 # Only allowlisted role labels and byte counts are recorded, never command lines or paths.
 [pscustomobject]@{elapsedMs=$clock.ElapsedMilliseconds;processes=$count;sumPrivateBytes=$private;sumWorkingSetBytes=$working;byRole=$roles}
}
try{
 $cpu=Get-CimInstance Win32_Processor|Select-Object -First 1;$system=Get-CimInstance Win32_ComputerSystem;$os=Get-CimInstance Win32_OperatingSystem
 $hardware=[pscustomobject]@{cpu=$cpu.Name;cores=$cpu.NumberOfCores;logicalProcessors=$cpu.NumberOfLogicalProcessors;ramBytes=$system.TotalPhysicalMemory;os=$os.Caption;version=$os.Version;powerStatus=(Get-CimInstance Win32_Battery|Select-Object BatteryStatus,EstimatedChargeRemaining);physicalReferenceVerified=$false}
 $env:NOTED_WORKSPACE=$workspace;$env:WEBVIEW2_USER_DATA_FOLDER=$webViewProfile;$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$Port --remote-debugging-address=127.0.0.1"
 $env:NOTED_DISABLE_SUBSCRIPTION_RUNNER='1';$env:CODEX_HOME=Join-Path $run 'empty-codex-home';$env:LOCALAPPDATA=Join-Path $run 'isolated-localappdata'
 New-Item -ItemType Directory -Path $env:CODEX_HOME,$env:LOCALAPPDATA|Out-Null
 foreach($key in 'OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_BASE_URL','OPENAI_API_BASE'){[Environment]::SetEnvironmentVariable($key,$null,'Process')}
 $launchEpochMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$clock=[Diagnostics.Stopwatch]::StartNew()
 $app=Start-Process -FilePath (Join-Path $kitRoot 'Noted.exe') -WorkingDirectory $run -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $run 'app.log') -RedirectStandardError (Join-Path $run 'app-error.log')
 $endpoint=$null
 while(-not $endpoint){if($app.HasExited){throw 'Noted exited before the test started. Read app-error.log.'};if($clock.Elapsed.TotalSeconds -gt 60){throw 'The test WebView endpoint did not become ready.'};try{$endpoint=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 1}catch{Start-Sleep -Milliseconds 100}}
 $endpointReadyMs=$clock.ElapsedMilliseconds
 & $node $PlaywrightCLI "-s=$session" attach "--cdp=http://127.0.0.1:$Port" *> (Join-Path $run 'attach.log');if($LASTEXITCODE -ne 0){throw 'Playwright attachment failed. Read attach.log.'}
 $sessionAttached=$true
 $options=@{minutes=$Minutes;cpuSlowdown=$CpuSlowdown;fixtureWorkspace=$workspace;resourceCase=$ResourceCase;resourceSeconds=$ResourceSeconds}|ConvertTo-Json -Compress
 $optionScript=Join-Path $run 'set-options.js';[IO.File]::WriteAllText($optionScript,"async page=>{await page.waitForFunction(()=>document.querySelector('#header-connection-handle button'));await page.evaluate(options=>window.notedBenchmarkOptions=options,$options);return true;}")
 & $node $PlaywrightCLI "-s=$session" run-code --filename $optionScript *> (Join-Path $run 'ready.log');if($LASTEXITCODE -ne 0){throw 'The editor did not become ready. Read ready.log.'}
 $editorReadyMs=$clock.ElapsedMilliseconds
 if($ResourceOnly){
  & $node $PlaywrightCLI "-s=$session" run-code --filename (Join-Path $kitRoot 'resource-workloads.js') *> (Join-Path $run 'resource-start.log')
  if($LASTEXITCODE -ne 0){throw 'Resource fixture setup failed. Read resource-start.log.'}
  $disconnectedEpochMs=$null
  if(-not $ResourceDebuggerAttached){& $node $PlaywrightCLI "-s=$session" detach *> (Join-Path $run 'resource-detach.log');if($LASTEXITCODE -ne 0){throw 'Resource debugger disconnect failed.'};$sessionAttached=$false;$disconnectedEpochMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
  $sampleStarted=$clock.ElapsedMilliseconds
  while($clock.ElapsedMilliseconds-$sampleStarted -lt ($ResourceSeconds+45)*1000){if($app.HasExited){throw 'The disposable app exited during resource sampling.'};$memory.Add((Read-TreeMemory $app.Id));Start-Sleep -Milliseconds 1500}
  $mode=if($ResourceDebuggerAttached){'resource diagnostic; automation attached comparison'}else{'resource diagnostic; automation disconnected during workload'}
  $report=[pscustomobject]@{formatVersion=1;source=$manifest.source;hardware=$hardware;classification=$mode;launchEpochMs=$launchEpochMs;automationDisconnectedEpochMs=$disconnectedEpochMs;disconnectPrecededPreparation=$false;sampleStartedElapsedMs=$sampleStarted;sampledMemory=$memory.ToArray();maxSampledPrivateBytes=($memory|Measure-Object sumPrivateBytes -Maximum).Maximum;resourceResult=$null;postCollectionMemory=$null;workloadPassed=$false;allRequestedChecksPassed=$false;mediaLifetimeRequested=[bool]$CheckMediaLifetime;mediaLifetime=$null;acceptance='NOT CERTIFIED: review actual reference hardware and budgets separately. DOM-driven generated edits are not physical-input latency measurements.'}
  $report|ConvertTo-Json -Depth 30|Set-Content -LiteralPath (Join-Path $run 'report.json') -Encoding utf8
  & $node (Join-Path $kitRoot 'read-resource-result.mjs') "http://127.0.0.1:$Port" $workspace *> (Join-Path $run 'resource-result.json')
  if($LASTEXITCODE -ne 0){throw 'Resource result collection failed; completed samples are preserved.'}
  $report.resourceResult=Get-Content -LiteralPath (Join-Path $run 'resource-result.json') -Raw|ConvertFrom-Json
  # This separate sample follows result collection/forced GC, outside the interval above.
  $report.postCollectionMemory=Read-TreeMemory $app.Id
  $r=$report.resourceResult.resource
  $report.disconnectPrecededPreparation=-not $ResourceDebuggerAttached -and $null -ne $disconnectedEpochMs -and $r.preparationStartedAt -ge $disconnectedEpochMs
  $report.workloadPassed=$r.phase -eq 'complete' -and $r.sharingDisabled -and $r.componentWorkers.active -eq 0 -and $r.edits -eq $r.restoredEdits -and ($ResourceDebuggerAttached -or $report.disconnectPrecededPreparation)
  $report|ConvertTo-Json -Depth 30|Set-Content -LiteralPath (Join-Path $run 'report.json') -Encoding utf8
  if(-not $report.workloadPassed){throw 'Resource workload did not complete its scope/restore/worker checks. Read report.json.'}
  if($CheckMediaLifetime){
   if(-not $sessionAttached){& $node $PlaywrightCLI "-s=$session" attach "--cdp=http://127.0.0.1:$Port" *> (Join-Path $run 'media-attach.log');if($LASTEXITCODE -ne 0){throw 'Post-sampling media attachment failed.'};$sessionAttached=$true}
   & $node $PlaywrightCLI "-s=$session" run-code --filename (Join-Path $kitRoot 'media-lifetime-smoke.js') *> (Join-Path $run 'media-lifetime.log')
   if($LASTEXITCODE -ne 0){throw 'Post-sampling media diagnostic failed; resource results are preserved.'}
   $text=[IO.File]::ReadAllText((Join-Path $run 'media-lifetime.log'));$match=[regex]::Match($text,'### Result\s*([\s\S]*?)\r?\n### Ran Playwright code');if(-not $match.Success){throw 'Media diagnostic result missing.'}
   $report.mediaLifetime=$match.Groups[1].Value|ConvertFrom-Json
   if(-not $report.mediaLifetime.passed){throw 'Media diagnostic did not pass.'}
  }
  $report.allRequestedChecksPassed=$true;$report|ConvertTo-Json -Depth 30|Set-Content -LiteralPath (Join-Path $run 'report.json') -Encoding utf8
  Write-Host "Report saved: $(Join-Path $run 'report.json')";Write-Host $mode;return
 }
 $arguments='"'+$PlaywrightCLI+'" -s='+$session+' run-code --filename "'+(Join-Path $kitRoot 'reference-workloads.js')+'"'
 $worker=Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $run -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $run 'workloads.log') -RedirectStandardError (Join-Path $run 'workloads-error.log')
 while(-not $worker.HasExited){$memory.Add((Read-TreeMemory $app.Id));Start-Sleep -Milliseconds 750;$worker.Refresh()}
 if($worker.ExitCode -ne 0){throw 'A writing or component check failed. Read workloads.log and workloads-error.log.'}
 $output=[IO.File]::ReadAllText((Join-Path $run 'workloads.log'));$match=[regex]::Match($output,'### Result\s*([\s\S]*?)\r?\n### Ran Playwright code')
 if(-not $match.Success){throw 'No benchmark result was returned. Read workloads.log.'}
 $browser=$match.Groups[1].Value|ConvertFrom-Json
 $report=[pscustomobject]@{formatVersion=1;source=$manifest.source;hardware=$hardware;classification=$browser.classification;startupProxy=@{endpointReadyMs=$endpointReadyMs;automatedEditorReadyMs=$editorReadyMs;instrumented=$true};sampledMemory=$memory.ToArray();maxSampledPrivateBytes=($memory|Measure-Object sumPrivateBytes -Maximum).Maximum;maxSummedWorkingSetBytes=($memory|Measure-Object sumWorkingSetBytes -Maximum).Maximum;browser=$browser;mediaLifetimeRequested=[bool]$CheckMediaLifetime;mediaLifetime=$null;acceptance='NOT CERTIFIED: confirm actual reference hardware and perform physical key-to-paint/cold-start acceptance separately.'}
 # Preserve completed timing/memory evidence even if an optional diagnostic fails.
 $report|ConvertTo-Json -Depth 30|Set-Content -LiteralPath (Join-Path $run 'report.json') -Encoding utf8
 if($CheckMediaLifetime){
  & $node $PlaywrightCLI "-s=$session" run-code --filename (Join-Path $kitRoot 'media-lifetime-smoke.js') *> (Join-Path $run 'media-lifetime.log')
  if($LASTEXITCODE -ne 0){throw 'The synthetic media-lifetime diagnostic failed. Read media-lifetime.log.'}
  $mediaOutput=[IO.File]::ReadAllText((Join-Path $run 'media-lifetime.log'));$mediaMatch=[regex]::Match($mediaOutput,'### Result\s*([\s\S]*?)\r?\n### Ran Playwright code')
  if(-not $mediaMatch.Success){throw 'No media-lifetime diagnostic result was returned.'}
  $report.mediaLifetime=$mediaMatch.Groups[1].Value|ConvertFrom-Json
  if(-not $report.mediaLifetime.passed){throw 'The media-lifetime diagnostic did not pass.'}
 }
 $report|ConvertTo-Json -Depth 30|Set-Content -LiteralPath (Join-Path $run 'report.json') -Encoding utf8
 Write-Host "Report saved: $(Join-Path $run 'report.json')"
 Write-Host $report.classification
 foreach($group in $browser.results|Group-Object workload){$p95=@($group.Group.inputToNextFrameMs.p95|Sort-Object);Write-Host ("{0}: median run p95 {1:N1} ms ({2} runs)" -f $group.Name,$p95[[int][math]::Floor($p95.Count/2)],$p95.Count)}
}finally{
 if($app -and -not $app.HasExited){[void]$app.CloseMainWindow();if(-not $app.WaitForExit(10000)){Write-Warning 'The disposable test window is still open. Close it normally after checking the saved note.'}}
 if($sessionAttached){& $node $PlaywrightCLI "-s=$session" detach *> (Join-Path $run 'detach.log')}
 foreach($name in $oldEnvironment.Keys){[Environment]::SetEnvironmentVariable($name,$oldEnvironment[$name],'Process')}
}

# Verify the sampler's privacy boundary without querying any actual processes.
$ErrorActionPreference='Stop'
$parseErrors=$null;$tokens=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Measure-Noted.ps1'),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'RUNNER_PARSE_FAILED'}
$definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Read-TreeMemory'},$true)
if(-not $definition){throw 'SAMPLER_MISSING'}
. ([scriptblock]::Create($definition.Extent.Text))
$clock=[Diagnostics.Stopwatch]::StartNew()
$queried=[Collections.Generic.List[int]]::new()
function Get-CimInstance {
 param($ClassName,$Filter,$Property)
 if($ClassName -ne 'Win32_Process' -or -not $Filter){throw 'BROAD_QUERY_REJECTED'}
 if($Filter -match '^ParentProcessId=(\d+)$'){
  if($Property -contains 'CommandLine'){throw 'DESCENDANT_DISCOVERY_READ_COMMAND_LINE'}
  switch([int]$Matches[1]){
   100 {[pscustomobject]@{ProcessId=101;ParentProcessId=100}}
   101 {[pscustomobject]@{ProcessId=102;ParentProcessId=101}}
   # Cycle/PID reuse must not cause repeated discovery or double-counting.
   102 {[pscustomobject]@{ProcessId=100;ParentProcessId=102}}
  }
 } elseif($Filter -match '^ProcessId=(\d+) AND ParentProcessId=(\d+)$'){
  $pidValue=[int]$Matches[1];$parentValue=[int]$Matches[2]
  if(($pidValue -ne 101 -or $parentValue -ne 100) -and ($pidValue -ne 102 -or $parentValue -ne 101)){throw 'ROLE_QUERY_OUTSIDE_VERIFIED_DESCENDANTS'}
  $queried.Add($pidValue)
  [pscustomobject]@{ProcessId=$pidValue;ParentProcessId=$parentValue;CommandLine='inert --type=renderer'}
 } else {throw 'UNSCOPED_QUERY_REJECTED'}
}
function Get-Process {
 param([int]$Id,$ErrorAction)
 if($Id -notin @(100,101,102)){throw 'UNOWNED_PROCESS_READ'}
 [pscustomobject]@{PrivateMemorySize64=1048576L;WorkingSet64=2097152L;CPU=0.5}
}
$result=Read-TreeMemory 100
if($result.processes -ne 3 -or $result.sumPrivateBytes -ne 3145728 -or $result.sumWorkingSetBytes -ne 6291456 -or $result.byRole.app.processes -ne 1 -or $result.byRole.renderer.processes -ne 2 -or $result.byRole.renderer.cpuSeconds -ne 1 -or $queried.Count -ne 2){throw 'OWNED_AGGREGATION_FAILED'}
if(($result|ConvertTo-Json -Depth 6) -match 'CommandLine|inert'){throw 'PRIVATE_METADATA_SERIALIZED'}
'PASS: scoped descendant discovery, verified role lookup, cycle safety, CPU/memory aggregation and metadata exclusion'

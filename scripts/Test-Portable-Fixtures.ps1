$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
function Get-FixtureSha256([string]$Path){
 $stream=[IO.File]::OpenRead($Path);$algorithm=[Security.Cryptography.SHA256]::Create()
 try {return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant()} finally {$algorithm.Dispose();$stream.Dispose()}
}
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('noted-package-verify-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$sourceCommit='a'*40
$archiveRoot='portable-20261107-000000-aaaaaaa'
$required=@('noted.exe','noted-agent.exe','noted-private-import.exe','README.txt','ai-privacy.md','help-and-shortcuts.md','backup-restore.md','evening-session-2026-11-06.md','component-manifest.schema.json')
# Read the builder's explicit source-only document allowlist; never execute it.
$builder=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Build-Portable.ps1') -Raw
$listMatch=[regex]::Match($builder,'foreach\(\$name in @\((?<names>''ai-privacy\.md''.*?)\)\)\{Copy-Item')
if(-not $listMatch.Success){throw 'CURATED_DOCUMENT_LIST_NOT_FOUND'}
$curated=@([regex]::Matches($listMatch.Groups['names'].Value,"'(?<name>[^']+)'")|ForEach-Object {$_.Groups['name'].Value})
$curated+=@([regex]::Matches($builder,"docs\\(?<name>[^'\\/]+)'")|ForEach-Object {$_.Groups['name'].Value})
$curated=@($curated|Select-Object -Unique)
if($curated.Count -lt 20 -or @($curated|Where-Object {$_ -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*$'}).Count){throw 'CURATED_DOCUMENT_LIST_INVALID'}
function Write-Entry($zip,[string]$path,[string]$content){
 $entry=$zip.CreateEntry($path);$writer=[IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false))
 try {$writer.Write($content)} finally {$writer.Dispose()}
}
function New-Archive([string]$name,[string]$mutation){
 $payloads=@{};$files=@()
 $paths=$required
 if($mutation -like 'curated*'){$paths=@($required+$curated|Select-Object -Unique)}
 if($mutation -eq 'curated-missing-navigation'){$paths=@($paths|Where-Object {$_ -ne 'navigation-memory-soak.md'})}
 foreach($path in $paths){
  $payloads[$path]='synthetic package verification: '+$path
  if($path -eq 'ai-privacy.md'){
   if($mutation -eq 'valid-links'){$payloads[$path]='[Guide](./help%2Dand%2Dshortcuts.md#writing) [Web](https://example.invalid/guide) [Section](#writing)'}
   if($mutation -eq 'missing-link'){$payloads[$path]='[Guide](missing-guide.md)'}
   if($mutation -eq 'invalid-link'){$payloads[$path]='[Guide](%2e%2e/outside.md)'}
   if($mutation -eq 'oversize-document'){$payloads[$path]='x'*1048577}
  }
  if($mutation -like 'curated*' -and $path -in $curated){$payloads[$path]=Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot) ('docs\'+$path)) -Raw}
  $bytes=[Text.Encoding]::UTF8.GetBytes($payloads[$path]);$hasher=[Security.Cryptography.SHA256]::Create()
  try {$hash=([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()} finally {$hasher.Dispose()}
  $files+=@{path=$path;bytes=$bytes.Length;sha256=$hash}
 }
 if($mutation -eq 'size'){$files[0].bytes++}
 if($mutation -eq 'digest'){$files[0].sha256='0'*64}
 if($mutation -eq 'invalid-size'){$files[0].bytes=$false}
 if($mutation -eq 'missing-required'){$files=@($files | Where-Object path -ne 'noted-agent.exe');$payloads.Remove('noted-agent.exe')}
 if($mutation -eq 'manifest-duplicate'){$files+= $files[0]}
 $manifest=@{formatVersion=1;sourceCommit=$sourceCommit;signed=$false;hardwareCertified=$false;files=$files}
 if($mutation -eq 'certification'){$manifest.hardwareCertified=$true}
 if($mutation -eq 'root-commit'){$manifest.sourceCommit='b'*40}
 $archive=Join-Path $fixtureRoot ($name+'.zip');$zip=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
 try {
  foreach($path in $payloads.Keys){Write-Entry $zip ($archiveRoot+'/'+$path) $payloads[$path]}
  Write-Entry $zip ($archiveRoot+'/manifest.json') ($manifest | ConvertTo-Json -Depth 5)
  if($mutation -eq 'extra'){Write-Entry $zip ($archiveRoot+'/extra.txt') 'synthetic extra'}
  if($mutation -eq 'duplicate'){Write-Entry $zip ($archiveRoot+'/README.TXT') 'synthetic duplicate'}
  if($mutation -eq 'unsafe'){Write-Entry $zip ($archiveRoot+'/../outside.txt') 'synthetic unsafe path'}
  if($mutation -eq 'multiple-roots'){Write-Entry $zip 'portable-20261107-000001-aaaaaaa/extra.txt' 'synthetic second root'}
 } finally {$zip.Dispose()}
 $digest=Get-FixtureSha256 $archive
 if($mutation -eq 'sidecar'){$digest='0'*64}
 "$digest  $([IO.Path]::GetFileName($archive))" | Set-Content -LiteralPath ($archive+'.sha256') -Encoding ascii
 return $archive
}
$cases=@(
 @{name='valid';mutation='';error=$null},
 @{name='actual-curated-documents';mutation='curated';error=$null},
 @{name='actual-curated-missing-navigation';mutation='curated-missing-navigation';error='PACKAGE_DOCUMENT_LINK_MISSING'},
 @{name='valid-document-links';mutation='valid-links';error=$null},
 @{name='missing-document-link';mutation='missing-link';error='PACKAGE_DOCUMENT_LINK_MISSING'},
 @{name='invalid-document-link';mutation='invalid-link';error='PACKAGE_DOCUMENT_LINK_INVALID'},
 @{name='oversize-document';mutation='oversize-document';error='PACKAGE_DOCUMENT_TOO_LARGE'},
 @{name='bad-sidecar';mutation='sidecar';error='PACKAGE_ARCHIVE_CHECKSUM_MISMATCH'},
 @{name='bad-source';mutation='';error='PACKAGE_SOURCE_COMMIT_MISMATCH';expected='b'*40},
 @{name='bad-size';mutation='size';error='PACKAGE_PAYLOAD_SIZE_MISMATCH'},
 @{name='bad-digest';mutation='digest';error='PACKAGE_PAYLOAD_CHECKSUM_MISMATCH'},
 @{name='invalid-size';mutation='invalid-size';error='PACKAGE_PAYLOAD_MISSING_OR_INVALID'},
 @{name='missing-required';mutation='missing-required';error='PACKAGE_REQUIRED_PAYLOAD_MISSING'},
 @{name='extra-payload';mutation='extra';error='PACKAGE_UNLISTED_PAYLOAD'},
 @{name='duplicate-entry';mutation='duplicate';error='PACKAGE_DUPLICATE_ENTRY'},
 @{name='duplicate-manifest';mutation='manifest-duplicate';error='PACKAGE_MANIFEST_PATH_INVALID'},
 @{name='unsafe-path';mutation='unsafe';error='PACKAGE_ENTRY_PATH_INVALID'},
 @{name='multiple-roots';mutation='multiple-roots';error='PACKAGE_MULTIPLE_ROOTS'},
 @{name='unsupported-certification';mutation='certification';error='PACKAGE_MANIFEST_INVALID'},
 @{name='root-commit';mutation='root-commit';error='PACKAGE_ROOT_COMMIT_MISMATCH'}
)
$passed=@()
foreach($case in $cases){
 $archive=New-Archive $case.name $case.mutation
 $expected=if($case.expected){$case.expected}else{$sourceCommit}
 if($case.mutation -eq 'root-commit'){$expected=$null}
 $actualError=$null
 try {$result=& (Join-Path $PSScriptRoot 'Test-Portable.ps1') -Archive $archive -ExpectedSourceCommit $expected | ConvertFrom-Json;if(-not $result.passed){throw 'FIXTURE_VALIDATION_NOT_CONFIRMED'}} catch {$actualError=$_.Exception.Message}
 if($actualError -ne $case.error){throw "Fixture $($case.name) expected '$($case.error)', got '$actualError'"}
 $passed+=$case.name
}
@{passed=$true;syntheticOnly=$true;cases=$passed.Count;checks=$passed;fixtureRoot=$fixtureRoot} | ConvertTo-Json -Compress

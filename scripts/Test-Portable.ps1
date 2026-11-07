param(
 [Parameter(Mandatory=$true)][string]$Archive,
 [string]$ExpectedSourceCommit
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
function Get-NotedSha256([string]$Path){
 $stream=[IO.File]::OpenRead($Path);$algorithm=[Security.Cryptography.SHA256]::Create()
 try {return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant()} finally {$algorithm.Dispose();$stream.Dispose()}
}
$archivePath=(Resolve-Path -LiteralPath $Archive).Path
if(-not(Test-Path -LiteralPath $archivePath -PathType Leaf)){throw 'PACKAGE_ARCHIVE_MISSING'}
$digest=Get-NotedSha256 $archivePath
$sidecar=Get-Content -LiteralPath ($archivePath+'.sha256') -Raw
$expectedLine='^([a-fA-F0-9]{64})  '+[regex]::Escape([IO.Path]::GetFileName($archivePath))+'\s*$'
if($sidecar -notmatch $expectedLine -or $Matches[1].ToLowerInvariant() -ne $digest){throw 'PACKAGE_ARCHIVE_CHECKSUM_MISMATCH'}
$zip=[IO.Compression.ZipFile]::OpenRead($archivePath)
try {
 $entries=@{}
 $root=$null
 foreach($entry in $zip.Entries){
  $parts=$entry.FullName.Split('/')
  if($parts.Count -ne 2 -or $entry.FullName.Contains('\') -or $parts[0] -notmatch '^portable-[0-9]{8}-[0-9]{6}-[a-f0-9]{7}$' -or $parts[1] -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*$'){throw 'PACKAGE_ENTRY_PATH_INVALID'}
  if($root -and $root -ne $parts[0]){throw 'PACKAGE_MULTIPLE_ROOTS'}
  $root=$parts[0]
  if($entries.ContainsKey($parts[1])){throw 'PACKAGE_DUPLICATE_ENTRY'}
  $entries[$parts[1]]=$entry
 }
 if(-not $entries.ContainsKey('manifest.json') -or $entries['manifest.json'].Length -gt 1048576){throw 'PACKAGE_MANIFEST_MISSING_OR_LARGE'}
 $reader=[IO.StreamReader]::new($entries['manifest.json'].Open())
 try {$manifest=$reader.ReadToEnd() | ConvertFrom-Json} finally {$reader.Dispose()}
 if($manifest.formatVersion -ne 1 -or $manifest.sourceCommit -notmatch '^[a-f0-9]{40}$' -or $manifest.signed -ne $false -or $manifest.hardwareCertified -ne $false){throw 'PACKAGE_MANIFEST_INVALID'}
 if($ExpectedSourceCommit -and $manifest.sourceCommit -ne $ExpectedSourceCommit){throw 'PACKAGE_SOURCE_COMMIT_MISMATCH'}
 if($root.Substring($root.Length-7) -ne $manifest.sourceCommit.Substring(0,7)){throw 'PACKAGE_ROOT_COMMIT_MISMATCH'}
 $seen=@{}
 foreach($file in $manifest.files){
  if($file.path -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' -or $file.path -eq 'manifest.json' -or $seen.ContainsKey($file.path)){throw 'PACKAGE_MANIFEST_PATH_INVALID'}
  $seen[$file.path]=$true
  $payloadSize=0L
  if(-not $entries.ContainsKey($file.path) -or $file.sha256 -notmatch '^[a-f0-9]{64}$' -or $file.bytes -isnot [ValueType] -or -not [long]::TryParse([string]$file.bytes,[ref]$payloadSize) -or $payloadSize -lt 0){throw 'PACKAGE_PAYLOAD_MISSING_OR_INVALID'}
  $entry=$entries[$file.path]
  if($entry.Length -ne $file.bytes){throw 'PACKAGE_PAYLOAD_SIZE_MISMATCH'}
  $stream=$entry.Open();$hasher=[Security.Cryptography.SHA256]::Create()
  try {$actual=([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-','').ToLowerInvariant()} finally {$hasher.Dispose();$stream.Dispose()}
  if($actual -ne $file.sha256){throw 'PACKAGE_PAYLOAD_CHECKSUM_MISMATCH'}
 }
 if($entries.Count -ne $seen.Count+1){throw 'PACKAGE_UNLISTED_PAYLOAD'}
 foreach($required in @('noted.exe','noted-agent.exe','noted-private-import.exe','README.txt','ai-privacy.md','help-and-shortcuts.md','backup-restore.md','evening-session-2026-11-06.md')){if(-not $seen.ContainsKey($required)){throw 'PACKAGE_REQUIRED_PAYLOAD_MISSING'}}
 $guiSha256=($manifest.files | Where-Object path -eq 'noted.exe').sha256
 @{passed=$true;archive=$archivePath;sha256=$digest;sourceCommit=$manifest.sourceCommit;guiSha256=$guiSha256;files=$seen.Count;signed=$false;hardwareCertified=$false} | ConvertTo-Json -Compress
} finally {$zip.Dispose()}

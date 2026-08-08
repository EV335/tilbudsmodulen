# extract-patch.ps1
# Kjører i repo-rot. Leser tilbudsmoduler.patch og skriver ut filene som er definert i patchen.
$patchPath = ".\tilbudsmoduler.patch"
if (-not (Test-Path $patchPath)) {
  Write-Error "Patchfil ikke funnet: $patchPath"
  exit 1
}

$lines = Get-Content -Path $patchPath -Encoding UTF8
$currentFile = $null
$currentContent = @()
$writing = $false

function Flush-Current {
  param($file, $contentLines)
  if (-not $file) { return }
  $dir = Split-Path -Path $file -Parent
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $out = $contentLines | ForEach-Object {
    if ($_ -match '^\+(.*)$') { $matches[1] } else { $_ }
  }
  $out | Set-Content -Path $file -Encoding UTF8
  Write-Host "Wrote file:" $file
}

for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]
  if ($line -match '^\*\*\* Add File:\s*(.+)$') {
    if ($currentFile) { Flush-Current -file $currentFile -contentLines $currentContent }
    $currentFile = $matches[1].Trim()
    $currentContent = @()
    $writing = $true
    continue
  }

  if ($line -match '^\*\*\* End Patch') {
    if ($currentFile) { Flush-Current -file $currentFile -contentLines $currentContent }
    $currentFile = $null
    $currentContent = @()
    $writing = $false
    continue
  }

  if ($writing -and $null -ne $currentFile) {
    $currentContent += $line
  }
}

if ($currentFile) { Flush-Current -file $currentFile -contentLines $currentContent }

Write-Host "Ferdig. Sjekk at filene er opprettet. Kjør deretter: git add -A; git commit -m 'apply patch files'"

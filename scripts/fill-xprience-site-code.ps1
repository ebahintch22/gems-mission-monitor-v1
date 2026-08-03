param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$dir = Split-Path -Parent $SourcePath
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputPath = Join-Path $dir "xprience.site-code-matched-$stamp.xlsx"
$unmatchedCsv = Join-Path $dir "xprience.site-code-unmatched-$stamp.csv"
$matchCsv = Join-Path $dir "xprience.site-code-matches-$stamp.csv"
$workspaceTemp = Join-Path (Get-Location).Path '.tmp'
if (-not (Test-Path -LiteralPath $workspaceTemp)) {
  New-Item -ItemType Directory -Path $workspaceTemp | Out-Null
}
$tempRoot = Join-Path $workspaceTemp "xprience-openxml-$stamp"
$sourceCopy = Join-Path $workspaceTemp "xprience-source-$stamp.xlsx"
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Load-XmlFile([string]$path) {
  $doc = New-Object System.Xml.XmlDocument
  $doc.PreserveWhitespace = $true
  $doc.Load($path)
  return $doc
}

function Get-SharedStrings([string]$root) {
  $path = Join-Path $root 'xl\sharedStrings.xml'
  $items = New-Object System.Collections.Generic.List[string]
  if (-not (Test-Path -LiteralPath $path)) { return $items }
  $doc = Load-XmlFile $path
  $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  $ns.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  foreach ($si in $doc.SelectNodes('//x:si', $ns)) {
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($t in $si.SelectNodes('.//x:t', $ns)) { [void]$parts.Add($t.InnerText) }
    [void]$items.Add(($parts -join ''))
  }
  return $items
}

function Get-CellColumn([string]$ref) { return ([regex]::Match($ref, '^[A-Z]+')).Value }
function Get-ColIndex([string]$cellRefOrCol) {
  $col = ([regex]::Match($cellRefOrCol, '^[A-Z]+')).Value
  $n = 0
  foreach ($ch in $col.ToCharArray()) {
    $n = $n * 26 + ([int][char]$ch - [int][char]'A' + 1)
  }
  return $n
}

function Get-CellValue($cell, $sharedStrings) {
  if (-not $cell) { return '' }
  $type = $cell.GetAttribute('t')
  if ($type -eq 's') {
    $idxText = ''
    if ($cell.v) { $idxText = $cell.v.InnerText }
    if ($idxText -eq '') { return '' }
    $idx = [int]$idxText
    if ($idx -ge 0 -and $idx -lt $sharedStrings.Count) { return [string]$sharedStrings[$idx] }
    return ''
  }
  if ($type -eq 'inlineStr') {
    $texts = New-Object System.Collections.Generic.List[string]
    foreach ($t in $cell.GetElementsByTagName('t')) { [void]$texts.Add($t.InnerText) }
    return ($texts -join '')
  }
  if ($cell.v) { return [string]$cell.v.InnerText }
  return ''
}

function Get-RowValues($row, $sharedStrings) {
  $map = @{}
  foreach ($cell in $row.c) { $map[(Get-CellColumn $cell.r)] = Get-CellValue $cell $sharedStrings }
  return $map
}

function Strip-Accents([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return '' }
  $d = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $d.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($ch)
    }
  }
  return $sb.ToString().Normalize([Text.NormalizationForm]::FormC)
}

$stopWords = @(
  'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'D', 'L', 'A', 'AU', 'AUX', 'ET', 'EN',
  'UN', 'UNE', 'MODERNE', 'PUBLIC', 'PUBLIQUE', 'ETABLISSEMENT', 'HOSPITALIER',
  'HOSPITALIERE', 'DEPARTEMENTAL', 'REGIONAL', 'GENERAL', 'CENTRE'
)
$stopSet = @{}
foreach ($w in $stopWords) { $stopSet[$w] = $true }

function Normalize-Name([string]$s) {
  $x = (Strip-Accents $s).ToUpperInvariant()
  $x = $x -replace '[’`´]', "'"
  $x = $x -replace 'HOUPOUET|HOUPHOUET', 'HOUPHOUET'
  $x = $x -replace 'HORHOGO', 'KORHOGO'
  $x = $x -replace 'COLLEGUE', 'COLLEGE'
  $x = $x -replace 'HOPSITAL|HOPITAL', 'HOSPITAL'
  $x = $x -replace 'C\.?\s*N\.?\s*P\.?\s*T\.?\s*E\.?', 'CNPTE'
  $x = $x -replace 'TRIBUNAL\s+(DE\s+)?PREMIERE\s+INSTANCE', 'TPI'
  $x = $x -replace 'CENTRE\s+HOSPITALIER\s+SPECIALISE\s+PSYCHIATRIQUE|HOSPITAL\s+PSYCHIATRIQUE', 'CHS PSC'
  $x = $x -replace 'ETABLISSEMENT\s+PUBLIC\s+HOSPITALIER\s+DEPARTEMENTAL|EPHD', 'HOSPITAL GENERAL'
  $x = $x -replace 'ETABLISSEMENT\s+PUBLIC\s+HOSPITALIER\s+REGIONAL|EPHR', 'CENTRE HOSPITALIER REGIONAL'
  $x = $x -replace 'DIRECTION\s+REGIONALE|DR\b', 'DR'
  $x = $x -replace '[^A-Z0-9]+', ' '
  $tokens = @()
  foreach ($t in ($x -split '\s+')) {
    if ($t -and -not $stopSet.ContainsKey($t)) { $tokens += $t }
  }
  return ($tokens -join ' ').Trim()
}

function Ministry-Key([string]$s) {
  $x = (Strip-Accents $s).ToUpperInvariant()
  if ($x -match 'MENA|EDUCATION|DRENA') { return 'MENAET' }
  if ($x -match 'MJDH|JUSTICE|DROITS') { return 'MJDH' }
  if ($x -match 'SANTE|MSHPCMU|HYGIENE|TRANSFUSION|HOSPITAL|HOPITAL') { return 'MSHPCMU' }
  if ($x -match 'METFPA|TECHNIQUE|FORMATION|CNPTE') { return 'METFPA' }
  return ''
}

function Token-Set([string]$norm) {
  $h = @{}
  foreach ($t in ($norm -split '\s+')) { if ($t) { $h[$t] = $true } }
  return $h
}

function Dice-Score($aSet, $bSet) {
  if ($aSet.Count -eq 0 -or $bSet.Count -eq 0) { return 0.0 }
  $inter = 0
  foreach ($k in $aSet.Keys) { if ($bSet.ContainsKey($k)) { $inter++ } }
  return (2.0 * $inter) / ($aSet.Count + $bSet.Count)
}

function Match-Site($building, $sites) {
  $best = $null
  foreach ($site in $sites) {
    $score = Dice-Score $building.tokens $site.tokens
    if ($building.norm -eq $site.norm -and $building.norm.Length -gt 0) {
      $score = 1.0
    } elseif ($building.norm.Length -gt 4 -and $site.norm.Length -gt 4 -and ($building.norm.Contains($site.norm) -or $site.norm.Contains($building.norm))) {
      $score = [Math]::Max($score, 0.90)
    }
    if ($building.ministryKey -and $site.ministryKey -and $building.ministryKey -eq $site.ministryKey) { $score += 0.03 }
    if ($building.regionNorm -and $site.regionNorm -and $building.regionNorm -eq $site.regionNorm) { $score += 0.02 }
    if ($building.name -match 'CITE COTE IVOIRE' -and $site.name -match 'Treichville') { $score += 0.25 }
    if (-not $best -or $score -gt $best.score) { $best = [pscustomobject]@{ site = $site; score = $score } }
  }
  if ($best -and ($best.score -ge 0.62 -or ($building.ministryKey -and $building.ministryKey -eq $best.site.ministryKey -and $best.score -ge 0.50))) {
    return $best
  }
  return $null
}

function Set-CellInlineString($doc, $rowNode, [string]$cellRef, [string]$value) {
  $nsUri = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  $cell = $null
  foreach ($c in $rowNode.c) { if ($c.r -eq $cellRef) { $cell = $c; break } }
  if (-not $cell) {
    $cell = $doc.CreateElement('c', $nsUri)
    $cell.SetAttribute('r', $cellRef)
    $inserted = $false
    foreach ($existing in @($rowNode.c)) {
      if ((Get-ColIndex $existing.r) -gt (Get-ColIndex $cellRef)) {
        [void]$rowNode.InsertBefore($cell, $existing)
        $inserted = $true
        break
      }
    }
    if (-not $inserted) { [void]$rowNode.AppendChild($cell) }
  }
  $cell.RemoveAll()
  $cell.SetAttribute('r', $cellRef)
  $cell.SetAttribute('t', 'inlineStr')
  $is = $doc.CreateElement('is', $nsUri)
  $t = $doc.CreateElement('t', $nsUri)
  [void]$t.SetAttribute('space', 'http://www.w3.org/XML/1998/namespace', 'preserve')
  $t.InnerText = $value
  [void]$is.AppendChild($t)
  [void]$cell.AppendChild($is)
}

function New-XlsxArchive([string]$sourceDir, [string]$destinationPath) {
  if (Test-Path -LiteralPath $destinationPath) { Remove-Item -LiteralPath $destinationPath -Force }
  $archiveStream = [System.IO.File]::Open($destinationPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  try {
    $archive = New-Object System.IO.Compression.ZipArchive($archiveStream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
      foreach ($file in Get-ChildItem -LiteralPath $sourceDir -File -Recurse) {
        $relative = $file.FullName.Substring($sourceDir.Length).TrimStart('\', '/')
        $entryName = $relative -replace '\\', '/'
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName) | Out-Null
      }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $archiveStream.Dispose()
  }
}

try {
  $inputStream = [System.IO.File]::Open($SourcePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    $outputStream = [System.IO.File]::Open($sourceCopy, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Close() }
  } finally {
    $inputStream.Close()
  }

  [System.IO.Compression.ZipFile]::ExtractToDirectory($sourceCopy, $tempRoot)
  $sharedStrings = Get-SharedStrings $tempRoot
  $sitesDoc = Load-XmlFile (Join-Path $tempRoot 'xl\worksheets\sheet2.xml')
  $batsDoc = Load-XmlFile (Join-Path $tempRoot 'xl\worksheets\sheet1.xml')

  $ns = New-Object System.Xml.XmlNamespaceManager($sitesDoc.NameTable)
  $ns.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $siteRows = $sitesDoc.SelectNodes('//x:sheetData/x:row[@r>1]', $ns)

  $sites = @()
  foreach ($row in $siteRows) {
    $v = Get-RowValues $row $sharedStrings
    $code = ([string]$v['B']).Trim()
    $name = ([string]$v['C']).Trim()
    if (-not $code -or -not $name) { continue }
    $norm = Normalize-Name $name
    $sites += [pscustomobject]@{
      code = $code
      name = $name
      ministry = ([string]$v['D']).Trim()
      region = ([string]$v['E']).Trim()
      norm = $norm
      tokens = (Token-Set $norm)
      ministryKey = (Ministry-Key (([string]$v['D']) + ' ' + $name))
      regionNorm = (Normalize-Name ([string]$v['E']))
    }
  }

  $nsB = New-Object System.Xml.XmlNamespaceManager($batsDoc.NameTable)
  $nsB.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $batRows = $batsDoc.SelectNodes('//x:sheetData/x:row[@r>1]', $nsB)
  $matches = New-Object System.Collections.Generic.List[object]
  $unmatched = New-Object System.Collections.Generic.List[object]
  $total = 0
  $filled = 0

  foreach ($row in $batRows) {
    $v = Get-RowValues $row $sharedStrings
    $ord = ([string]$v['A']).Trim()
    $name = ([string]$v['F']).Trim()
    if ($ord -eq 'Ord' -and -not $name) { continue }
    if (-not $ord -and -not $name) { continue }
    $total++
    $norm = Normalize-Name $name
    $b = [pscustomobject]@{
      row = [int]$row.r
      ord = $ord
      name = $name
      region = ([string]$v['G']).Trim()
      ministry = ([string]$v['H']).Trim()
      norm = $norm
      tokens = (Token-Set $norm)
      ministryKey = (Ministry-Key (([string]$v['H']) + ' ' + $name))
      regionNorm = (Normalize-Name ([string]$v['G']))
    }
    $m = Match-Site $b $sites
    if ($m) {
      Set-CellInlineString $batsDoc $row ('C' + $row.r) $m.site.code
      $filled++
      [void]$matches.Add([pscustomobject]@{
        batiment_ord = $ord
        row = $row.r
        batiment_nom = $name
        site_code = $m.site.code
        site_nom = $m.site.name
        score = [Math]::Round($m.score, 3)
        ministere_batiment = $b.ministry
        ministere_site = $m.site.ministry
      })
    } else {
      [void]$unmatched.Add([pscustomobject]@{
        batiment_ord = $ord
        row = $row.r
        batiment_nom = $name
        region = $b.region
        ministere = $b.ministry
        nom_normalise = $norm
      })
    }
  }

  $batsDoc.Save((Join-Path $tempRoot 'xl\worksheets\sheet1.xml'))
  New-XlsxArchive $tempRoot $outputPath
  $matches | Export-Csv -LiteralPath $matchCsv -NoTypeInformation -Encoding UTF8
  $unmatched | Export-Csv -LiteralPath $unmatchedCsv -NoTypeInformation -Encoding UTF8

  [pscustomobject]@{
    total_batiments = $total
    site_code_renseignes = $filled
    non_apparies = $unmatched.Count
    fichier_genere = $outputPath
    rapport_matches = $matchCsv
    rapport_non_apparies = $unmatchedCsv
  } | Format-List
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    try { Remove-Item -LiteralPath $tempRoot -Recurse -Force } catch { Write-Warning $_.Exception.Message }
  }
  if (Test-Path -LiteralPath $sourceCopy) {
    try { Remove-Item -LiteralPath $sourceCopy -Force } catch { Write-Warning $_.Exception.Message }
  }
}

param(
  [Parameter(Mandatory = $true)]
  [string]$SitesCsv,

  [Parameter(Mandatory = $true)]
  [string]$BatimentsCsv,

  [string]$OutputCsv,

  [string]$ReportCsv
)

$ErrorActionPreference = 'Stop'

if (-not $OutputCsv) {
  $dir = Split-Path -Parent $BatimentsCsv
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $OutputCsv = Join-Path $dir "batiments.site-code-matched-$stamp.csv"
}

if (-not $ReportCsv) {
  $dir = Split-Path -Parent $BatimentsCsv
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $ReportCsv = Join-Path $dir "batiments.site-code-matching-report-$stamp.csv"
}

function Read-SemicolonCsvWithHeaders([string]$path, [string[]]$headers) {
  $lines = Get-Content -LiteralPath $path -Encoding Default
  if ($lines.Count -le 1) { return @() }
  return $lines |
    Select-Object -Skip 1 |
    ConvertFrom-Csv -Delimiter ';' -Header $headers
}

function Read-SemicolonCsv([string]$path) {
  return Import-Csv -LiteralPath $path -Delimiter ';' -Encoding Default
}

function Strip-Accents([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return '' }
  $normalized = $value.Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object System.Text.StringBuilder
  foreach ($char in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }
  return $builder.ToString().Normalize([Text.NormalizationForm]::FormC)
}

function Normalize-Text([string]$value) {
  $text = (Strip-Accents $value).ToUpperInvariant()
  $text = $text -replace '[’`´]', "'"
  $text = $text -replace 'HOUPOUET|HOUPHOUET', 'HOUPHOUET'
  $text = $text -replace 'HORHOGO', 'KORHOGO'
  $text = $text -replace 'COLLEGUE', 'COLLEGE'
  $text = $text -replace 'HOPSITAL|HOPITAL', 'HOSPITAL'
  $text = $text -replace 'C\.?\s*N\.?\s*P\.?\s*T\.?\s*E\.?', 'CNPTE'
  $text = $text -replace 'TRIBUNAL\s+(DE\s+)?PREMIERE\s+INSTANCE', 'TPI'
  $text = $text -replace '[^A-Z0-9]+', ' '
  return (($text -split '\s+' | Where-Object { $_ }) -join ' ').Trim()
}

function Normalize-Region([string]$value) {
  $text = Normalize-Text $value
  $text = $text -replace '^DISTRICT AUTONOME ', 'DISTRICT '
  $text = $text -replace '^DISTRICT D ', 'DISTRICT '
  return $text
}

function Ministry-Key([string]$value) {
  $text = (Strip-Accents $value).ToUpperInvariant()
  if ($text -match 'MENA|EDUCATION') { return 'MENAET' }
  if ($text -match 'MJDH|JUSTICE|DROITS') { return 'MJDH' }
  if ($text -match 'SANTE|MSHPCMU|HYGIENE|TRANSFUSION|HOSPITAL|HOPITAL') { return 'MSHPCMU' }
  if ($text -match 'MEMFPMA|FONCTION|ADMINISTRATION') { return 'MEMFPMA' }
  if ($text -match 'METFPA|TECHNIQUE|FORMATION|CNPTE') { return 'METFPA' }
  return (Normalize-Text $value)
}

$nameStopWords = @{}
foreach ($word in @(
  'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'D', 'L', 'A', 'AU', 'AUX', 'ET', 'EN',
  'UN', 'UNE', 'MODERNE', 'PUBLIC', 'PUBLIQUE', 'ETABLISSEMENT', 'HOSPITALIER',
  'HOSPITALIERE', 'DEPARTEMENTAL', 'REGIONAL', 'GENERAL', 'CENTRE',
  'EDUCATION', 'NATIONALE', 'NATIONAL', 'ALPHABETISATION', 'ENSEIGNEMENT',
  'TECHNIQUE', 'MINISTERE', 'MODERNISATION', 'ADMINISTRATION'
)) {
  $nameStopWords[$word] = $true
}

function Normalize-SiteName([string]$value) {
  $text = Normalize-Text $value
  $text = $text -replace 'KOROHOGO|KORHOGO', 'KORHOGO'
  $text = $text -replace 'ZIGUITIE\b', 'ZIGUITIER'
  $text = $text -replace 'PERFECTIONNEMENT|PERFONCTIONNEMENT', 'PERFECTIONNEMENT'
  $text = $text -replace 'FONCTIONNAIRES?|FONCTIONNAIRES', 'FONCTIONNAIRE'
  $text = $text -replace 'ECOLE MILITAIRE PREPARATOIRES? TECHNIQUE|ECOLE MILITAIRE PREPARATOIRE TECHNIQUE', 'EMPT'
  $text = $text -replace 'DIRECTION REGIONALE|DIRECTION REGIONAL|DRENAET|DRENA', 'DRENAET'
  $text = $text -replace 'TRIBUNAL PREMIER INSTANCE|TRIBUNAL DE PREMIER INSTANCE', 'TPI'
  $text = $text -replace 'ETABLISSEMENT PUBLIC HOSPITALIER DEPARTEMENTAL|EPHD', 'HOSPITAL GENERAL'
  $text = $text -replace 'ETABLISSEMENT PUBLIC HOSPITALIER REGIONAL|EPHR', 'CENTRE HOSPITALIER REGIONAL'
  $text = $text -replace 'CENTRE HOSPITALIER SPECIALISE PSYCHIATRIQUE|HOSPITAL PSYCHIATRIQUE', 'CHS PSC'
  $text = $text -replace 'HOSPITAL', 'HOPITAL'
  $tokens = @()
  foreach ($token in ($text -split '\s+')) {
    if ($token -and -not $nameStopWords.ContainsKey($token)) { $tokens += $token }
  }
  return ($tokens -join ' ').Trim()
}

function Token-Set([string]$value) {
  $tokens = @{}
  foreach ($token in ((Normalize-SiteName $value) -split '\s+')) {
    if ($token) { $tokens[$token] = $true }
  }
  return $tokens
}

function Dice-Score($left, $right) {
  if ($left.Count -eq 0 -or $right.Count -eq 0) { return 0.0 }
  $intersection = 0
  foreach ($key in $left.Keys) {
    if ($right.ContainsKey($key)) { $intersection++ }
  }
  return (2.0 * $intersection) / ($left.Count + $right.Count)
}

$siteHeaders = @(
  'ord',
  'site_code',
  'NOM ETABLISSEMENT',
  'MINISTERE',
  'REGION',
  'MINISTERE/NOM ETABLISSEMENT',
  'site_code_duplicate'
)

$sites = Read-SemicolonCsvWithHeaders $SitesCsv $siteHeaders
$batiments = Read-SemicolonCsv $BatimentsCsv

$preparedSites = foreach ($site in $sites) {
  $name = $site.'NOM ETABLISSEMENT'
  [pscustomobject]@{
    site_code = $site.site_code
    name = $name
    ministry = $site.MINISTERE
    region = $site.REGION
    name_norm = Normalize-SiteName $name
    region_norm = Normalize-Region $site.REGION
    ministry_key = Ministry-Key $site.MINISTERE
    tokens = Token-Set $name
  }
}

$report = New-Object System.Collections.Generic.List[object]
$matched = 0
$unmatched = 0
$ambiguous = 0
$emptyRows = 0

foreach ($batiment in $batiments) {
  $name = $batiment.'NOM OFFICIEL DU SITE'
  if ([string]::IsNullOrWhiteSpace($name)) {
    $emptyRows++
    [void]$report.Add([pscustomobject]@{
      batiment_code = $batiment.Ord
      batiment_nom_site = $name
      batiment_region = $batiment.REGION
      batiment_ministere = $batiment.MINISTERE
      statut = 'nom_vide'
      site_code = ''
      site_nom = ''
      score = 0
    })
    continue
  }

  $nameNorm = Normalize-SiteName $name
  $regionNorm = Normalize-Region $batiment.REGION
  $ministryKey = Ministry-Key $batiment.MINISTERE
  $tokens = Token-Set $name

  $ranked = foreach ($candidate in $preparedSites) {
    $nameScore = Dice-Score $tokens $candidate.tokens
    $nameTokenCount = @($nameNorm -split '\s+' | Where-Object { $_ }).Count
    $candidateTokenCount = @($candidate.name_norm -split '\s+' | Where-Object { $_ }).Count
    if ($nameNorm -eq $candidate.name_norm -and $nameNorm) { $score = 1.0 }
    elseif (($nameTokenCount -gt 1 -and $candidateTokenCount -gt 1) -and ($nameNorm.Contains($candidate.name_norm) -or $candidate.name_norm.Contains($nameNorm))) {
      $score = [Math]::Max($nameScore, 0.92)
    } else {
      $score = $nameScore
    }
    $sameRegion = $regionNorm -and $candidate.region_norm -and $regionNorm -eq $candidate.region_norm
    $sameMinistry = $ministryKey -and $candidate.ministry_key -and $ministryKey -eq $candidate.ministry_key
    if ($sameRegion) { $score += 0.06 }
    if ($sameMinistry) { $score += 0.08 }
    [pscustomobject]@{
      site = $candidate
      score = $score
      name_score = $nameScore
      same_region = $sameRegion
      same_ministry = $sameMinistry
    }
  }

  $best = $ranked | Sort-Object -Property score -Descending | Select-Object -First 2
  $status = 'non_apparie'
  $siteCode = ''
  $siteName = ''
  $scoreValue = 0

  if ($best.Count -gt 0 -and ($best[0].name_score -ge 0.60 -or ($best[0].name_score -ge 0.50 -and $best[0].same_region -and $best[0].same_ministry))) {
    $isAmbiguous = $best.Count -gt 1 -and
      ([Math]::Abs($best[0].score - $best[1].score) -lt 0.02) -and
      $best[0].same_region -and $best[1].same_region -and
      $best[0].same_ministry -and $best[1].same_ministry
    if ($isAmbiguous) {
      $ambiguous++
      $status = 'ambigu'
    } else {
      $matched++
      $status = 'apparie'
      $siteCode = $best[0].site.site_code
      $siteName = $best[0].site.name
      $scoreValue = $best[0].score
      $batiment.site_code = $siteCode
    }
  } else {
    $unmatched++
  }

  [void]$report.Add([pscustomobject]@{
    batiment_code = $batiment.Ord
    batiment_nom_site = $name
    batiment_region = $batiment.REGION
    batiment_ministere = $batiment.MINISTERE
    statut = $status
    site_code = $siteCode
    site_nom = $siteName
    score = [Math]::Round($scoreValue, 3)
  })
}

$batiments | Export-Csv -LiteralPath $OutputCsv -Delimiter ';' -NoTypeInformation -Encoding UTF8
$report | Export-Csv -LiteralPath $ReportCsv -Delimiter ';' -NoTypeInformation -Encoding UTF8

[pscustomobject]@{
  sites = $sites.Count
  batiments = $batiments.Count
  lignes_nom_vide = $emptyRows
  batiments_exploitables = $batiments.Count - $emptyRows
  apparies = $matched
  ambigus = $ambiguous
  non_apparies = $unmatched
  fichier_batiments_enrichi = $OutputCsv
  rapport_matching = $ReportCsv
} | Format-List

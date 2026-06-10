param(
  [Parameter(Mandatory = $true)]
  [string] $XlsFormPath,

  [Parameter(Mandatory = $true)]
  [string] $OutputPath
)

Add-Type -AssemblyName System.IO.Compression

function Get-ColumnIndex {
  param([string] $Reference)
  $letters = ($Reference -replace '[^A-Z]', '')
  $index = 0
  foreach ($char in $letters.ToCharArray()) {
    $index = ($index * 26) + ([int][char]$char - [int][char]'A' + 1)
  }
  return $index - 1
}

function Get-CellValue {
  param($Cell, [string[]] $SharedStrings)
  if ($Cell.t -eq "inlineStr" -and $null -ne $Cell.is) {
    return [string]$Cell.is.InnerText
  }

  $valueNode = $Cell.v
  if ($null -eq $valueNode) {
    return ""
  }

  $value = [string]$valueNode
  if ($Cell.t -eq "s") {
    return $SharedStrings[[int]$value]
  }

  return $value
}

function Read-SheetRows {
  param($Zip, [string] $SheetPath, [string[]] $SharedStrings)
  $entry = $Zip.GetEntry($SheetPath)
  if ($null -eq $entry) {
    throw "Feuille introuvable dans le XLSX : $SheetPath"
  }

  $reader = New-Object System.IO.StreamReader($entry.Open())
  try {
    [xml]$xml = $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }

  $rows = @()
  foreach ($row in $xml.worksheet.sheetData.row) {
    $values = @{}
    foreach ($cell in $row.c) {
      $values[(Get-ColumnIndex $cell.r)] = Get-CellValue $cell $SharedStrings
    }
    $rows += ,$values
  }

  if ($rows.Count -eq 0) {
    return @()
  }

  $headerRow = $rows[0]
  $headers = @{}
  foreach ($key in $headerRow.Keys) {
    $header = [string]$headerRow[$key]
    if ($header.Trim().Length -gt 0) {
      $headers[[int]$key] = $header.Trim()
    }
  }

  $dataRows = @()
  for ($i = 1; $i -lt $rows.Count; $i += 1) {
    $source = $rows[$i]
    $object = [ordered]@{}
    foreach ($index in ($headers.Keys | Sort-Object)) {
      $object[$headers[$index]] = if ($source.ContainsKey($index)) { [string]$source[$index] } else { "" }
    }
    $hasData = $false
    foreach ($value in $object.Values) {
      if ([string]$value -ne "") {
        $hasData = $true
        break
      }
    }
    if ($hasData) {
      $dataRows += ,[pscustomobject]$object
    }
  }

  return $dataRows
}

function Get-FirstValue {
  param($Row, [string[]] $Names)
  foreach ($name in $Names) {
    if ($Row.PSObject.Properties.Name -contains $name) {
      $value = [string]$Row.$name
      if ($value.Trim().Length -gt 0) {
        return $value.Trim()
      }
    }
  }
  return ""
}

function Get-ChoiceListName {
  param([string] $Type)
  if ($Type -match '^select_(one|multiple)\s+(.+)$') {
    return $Matches[2].Trim()
  }
  return ""
}

function ConvertTo-SafeFileName {
  param([string] $Value)
  return ([string]$Value) -replace '[^a-zA-Z0-9_-]', ''
}

function Get-QuestionKind {
  param([string] $Type)
  if ($Type -match '^begin[\s_]group$') { return "group" }
  if ($Type -match '^end[\s_]group$') { return "end_group" }
  if ($Type -match '^begin[\s_]repeat$') { return "repeat" }
  if ($Type -match '^end[\s_]repeat$') { return "end_repeat" }
  if ($Type -eq "calculate") { return "calculate" }
  if ($Type -eq "note") { return "note" }
  return "question"
}

function Convert-ToField {
  param($Row, [string[]] $PathParts, [int] $Index)
  $type = Get-FirstValue $Row @("type")
  $name = Get-FirstValue $Row @("name")
  $label = Get-FirstValue $Row @("label::Français (fr)", "label", "label::French (fr)")
  $hint = Get-FirstValue $Row @("hint::Français (fr)", "hint", "hint::French (fr)")
  $choiceList = Get-ChoiceListName $type
  $path = @($PathParts + $name) -join "."

  return [ordered]@{
    index = $Index
    type = $type
    kind = Get-QuestionKind $type
    name = $name
    path = $path
    label = if ($label) { $label } else { $name }
    hint = $hint
    appearance = Get-FirstValue $Row @("appearance")
    calculation = Get-FirstValue $Row @("calculation")
    required = Get-FirstValue $Row @("required")
    relevant = Get-FirstValue $Row @("relevant")
    choice_filter = Get-FirstValue $Row @("choice_filter")
    constraint = Get-FirstValue $Row @("constraint")
    constraint_message = Get-FirstValue $Row @("constraint_message")
    repeat_count = Get-FirstValue $Row @("repeat_count")
    choiceList = $choiceList
    isTechnical = ($name.StartsWith("_") -or $type -eq "calculate")
  }
}

if (-not (Test-Path -LiteralPath $XlsFormPath)) {
  throw "Fichier XLSForm introuvable : $XlsFormPath"
}

$stream = [System.IO.File]::Open($XlsFormPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Read)

try {
  $sharedStrings = @()
  $sharedEntry = $zip.GetEntry("xl/sharedStrings.xml")
  if ($null -ne $sharedEntry) {
    $reader = New-Object System.IO.StreamReader($sharedEntry.Open())
    try {
      [xml]$sharedXml = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
    foreach ($si in $sharedXml.sst.si) {
      $sharedStrings += ($si.InnerText)
    }
  }

  $surveyRows = @(Read-SheetRows $zip "xl/worksheets/sheet1.xml" $sharedStrings)
  $choicesRows = @(Read-SheetRows $zip "xl/worksheets/sheet2.xml" $sharedStrings)
  $settingsRows = @(Read-SheetRows $zip "xl/worksheets/sheet3.xml" $sharedStrings)

  $settings = [ordered]@{}
  if ($settingsRows.Count -gt 0) {
    foreach ($property in ($settingsRows[0].PSObject.Properties | Where-Object { $_.MemberType -eq "NoteProperty" })) {
      $settings[$property.Name] = [string]$property.Value
    }
  }

  $sections = @()
  $allFields = @()
  $stack = @()
  $sectionStack = @()
  $defaultSection = [ordered]@{
    code = "root"
    name = "root"
    label = "Champs generaux"
    path = ""
    type = "root"
    fields = @()
  }

  for ($i = 0; $i -lt $surveyRows.Count; $i += 1) {
    $row = $surveyRows[$i]
    $type = Get-FirstValue $row @("type")
    $name = Get-FirstValue $row @("name")
    $label = Get-FirstValue $row @("label::Français (fr)", "label", "label::French (fr)")
    if ($type -eq "" -and $name -eq "") {
      continue
    }

    if ($type -match '^begin[\s_](group|repeat)$') {
      $sectionPath = @($stack + $name) -join "."
      $section = [ordered]@{
        code = $name
        name = $name
        label = if ($label) { $label } else { $name }
        path = $sectionPath
        type = if ($type -match 'repeat') { "repeat" } else { "group" }
        relevant = Get-FirstValue $row @("relevant")
        fields = @()
      }
      $sections += ,$section
      $sectionStack += ,$section
      $stack += $name
      continue
    }

    if ($type -match '^end[\s_](group|repeat)$') {
      if ($stack.Count -gt 0) {
        if ($stack.Count -eq 1) {
          $stack = @()
        } else {
          $stack = @($stack[0..($stack.Count - 2)])
        }
      }
      if ($sectionStack.Count -gt 0) {
        if ($sectionStack.Count -eq 1) {
          $sectionStack = @()
        } else {
          $sectionStack = @($sectionStack[0..($sectionStack.Count - 2)])
        }
      }
      continue
    }

    $field = Convert-ToField $row $stack ($i + 1)
    $allFields += ,$field
    if ($sectionStack.Count -gt 0) {
      $sectionStack[$sectionStack.Count - 1].fields += ,$field
    } else {
      $defaultSection.fields += ,$field
    }
  }

  if ($defaultSection.fields.Count -gt 0) {
    $sections = @($defaultSection) + $sections
  }

  $choiceLists = [ordered]@{}
  foreach ($choice in $choicesRows) {
    $listName = Get-FirstValue $choice @("list_name")
    if ($listName -eq "") {
      continue
    }
    if (-not $choiceLists.Contains($listName)) {
      $choiceLists[$listName] = @()
    }
    $choiceLists[$listName] += ,[ordered]@{
      name = Get-FirstValue $choice @("name")
      label = Get-FirstValue $choice @("label::Français (fr)", "label", "label::French (fr)")
      filters = [ordered]@{
        secteur = Get-FirstValue $choice @("secteur")
        region = Get-FirstValue $choice @("region")
        dept = Get-FirstValue $choice @("dept")
        drena = Get-FirstValue $choice @("drena")
        dec_san = Get-FirstValue $choice @("dec_san")
        dir_san = Get-FirstValue $choice @("dir_san")
        dist_san = Get-FirstValue $choice @("dist_san")
      }
    }
  }

  $summaryFields = @(
    [ordered]@{ path = "modB.nom_officiel"; label = "Site" },
    [ordered]@{ path = "modB.type_infra"; label = "Type" },
    [ordered]@{ path = "modB.region"; label = "Region" },
    [ordered]@{ path = "modB.sous_prefecture"; label = "Sous-prefecture" },
    [ordered]@{ path = "modD.electricite"; label = "Electricite" },
    [ordered]@{ path = "modE.operateurs"; label = "Operateurs" },
    [ordered]@{ path = "modF.internet"; label = "Internet" }
  )

  $formId = if ($settings.id_string) { $settings.id_string } else { "padci_survey_terrain_vf_v12" }

  $mapping = [ordered]@{
    id = $formId
    version = if ($settings.version) { $settings.version } else { "2026060404v12" }
    sourceFile = [System.IO.Path]::GetFileName($XlsFormPath)
    label = "Questionnaire PADCI - Enquete terrain v12"
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    mappingMode = "exhaustive_assisted"
    settings = $settings
    stats = [ordered]@{
      surveyRows = $surveyRows.Count
      fields = $allFields.Count
      sections = $sections.Count
      choiceLists = $choiceLists.Count
      choices = $choicesRows.Count
    }
    summaryFields = $summaryFields
    sections = $sections
    fields = $allFields
    choiceListStorage = [ordered]@{
      mode = "external"
      index = "$formId/choiceLists.index.json"
      directory = "$formId/choices"
    }
  }

  $outputDirectory = Split-Path -Parent $OutputPath
  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
  }

  $safeFormId = ConvertTo-SafeFileName $formId
  $choiceRoot = Join-Path $outputDirectory $safeFormId
  $choiceDirectory = Join-Path $choiceRoot "choices"
  if (-not (Test-Path -LiteralPath $choiceDirectory)) {
    New-Item -ItemType Directory -Path $choiceDirectory -Force | Out-Null
  }

  $json = $mapping | ConvertTo-Json -Depth 30
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($OutputPath, $json, $utf8NoBom)

  $choiceListIndex = @()
  foreach ($listName in $choiceLists.Keys) {
    $safeListName = ConvertTo-SafeFileName $listName
    $relativePath = "choices/$safeListName.json"
    $choiceListIndex += ,[ordered]@{
      name = $listName
      path = $relativePath
      choices = $choiceLists[$listName].Count
    }

    $choiceListJson = $choiceLists[$listName] | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText((Join-Path $choiceDirectory "$safeListName.json"), $choiceListJson, $utf8NoBom)
  }

  $indexJson = [ordered]@{
    formId = $formId
    generatedAt = $mapping.generatedAt
    choiceLists = $choiceListIndex
  } | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText((Join-Path $choiceRoot "choiceLists.index.json"), $indexJson, $utf8NoBom)

  Write-Output "Mapping genere : $OutputPath"
  Write-Output "ChoiceLists externes : $choiceDirectory"
  Write-Output "Sections : $($sections.Count)"
  Write-Output "Champs : $($allFields.Count)"
  Write-Output "Listes de choix : $($choiceLists.Count)"
  Write-Output "Choix : $($choicesRows.Count)"
} finally {
  $zip.Dispose()
  $stream.Dispose()
}

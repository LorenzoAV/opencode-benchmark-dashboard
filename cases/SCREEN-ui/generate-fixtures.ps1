# Generates the six SCREEN-ui screenshots and their ground truth.
Add-Type -AssemblyName System.Drawing

$WIDTH = 960
$HEIGHT = 600
$FIXTURE = Join-Path $PSScriptRoot "fixture"

# The two panels the overlap variant draws. Their intersection is the region
# ground truth of the overlap defect; the area they cover together is not.
$OVERLAP_DETAILS = @{ x = 600; y = 360; w = 240; h = 150 }
$OVERLAP_CHART = @{ x = 740; y = 430; w = 200; h = 120 }

function New-Brush($hex) {
  return New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($hex))
}

function Draw-Rect($g, $x, $y, $w, $h, $hex) {
  $brush = New-Brush $hex
  $g.FillRectangle($brush, [single]$x, [single]$y, [single]$w, [single]$h)
  $brush.Dispose()
}

function Draw-Border($g, $x, $y, $w, $h, $hex) {
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($hex), 1)
  $g.DrawRectangle($pen, [single]$x, [single]$y, [single]$w, [single]$h)
  $pen.Dispose()
}

function Draw-Text($g, $text, $x, $y, $size, $hex, $bold) {
  $style = [System.Drawing.FontStyle]::Regular
  if ($bold) { $style = [System.Drawing.FontStyle]::Bold }
  $font = New-Object System.Drawing.Font("Segoe UI", [single]$size, $style)
  $brush = New-Brush $hex
  $g.DrawString($text, $font, $brush, [single]$x, [single]$y)
  $font.Dispose()
  $brush.Dispose()
}

function Draw-AppBar($g) {
  Draw-Rect $g 0 0 $WIDTH 56 "#1E293B"
  Draw-Text $g "NORTHWING CONSOLE" 24 16 16 "#FFFFFF" $true
}

function Draw-CardFrame($g, $x, $y, $title) {
  Draw-Rect $g $x $y 400 220 "#FFFFFF"
  Draw-Border $g $x $y 400 220 "#E2E8F0"
  Draw-Text $g $title ($x + 24) ($y + 20) 14 "#0F172A" $true
}

function Draw-Button($g, $x, $y, $label, $hex) {
  Draw-Rect $g $x $y 150 38 $hex
  Draw-Text $g $label ($x + 40) ($y + 9) 11 "#FFFFFF" $true
}

function Draw-CardABody($g, $index, $truncate) {
  if ($truncate) {
    $clip = New-Object System.Drawing.Rectangle(64, 152, 352, 24)
    $g.SetClip($clip)
    Draw-Text $g "LAST SYNC 14 MINUTES AGO FROM DEVICE NORTHWING" 64 152 11 "#334155" $false
    $g.ResetClip()
  } else {
    Draw-Text $g "Owner: Dana Whitfield" 64 152 11 "#334155" $false
    Draw-Text $g "Plan: Scale annual" 64 176 11 "#334155" $false
    Draw-Text $g "Seats used: $((40 + $index)) of 50" 64 200 11 "#334155" $false
  }
  Draw-Button $g 64 252 "Manage" "#2563EB"
}

function Draw-CardBBody($g, $index, $lowContrast) {
  if ($lowContrast) {
    $text = "Your workspace usage is approaching the plan limit for this billing cycle. Review the breakdown before the next renewal date."
    $rect = New-Object System.Drawing.RectangleF(560, 152, 340, 72)
    $font = New-Object System.Drawing.Font("Segoe UI", [single]11, [System.Drawing.FontStyle]::Regular)
    $brush = New-Brush "#EDEFF2"
    $g.DrawString($text, $font, $brush, $rect)
    $font.Dispose()
    $brush.Dispose()
  } else {
    Draw-Text $g "Requests: 1,284,$(900 + $index)" 544 152 11 "#334155" $false
    Draw-Text $g "Storage: 218 GB of 500 GB" 544 176 11 "#334155" $false
    Draw-Text $g "Reset in 12 days" 544 200 11 "#334155" $false
  }
  Draw-Button $g 544 252 "Review" "#0F766E"
}

function Draw-ListRows($g) {
  $rows = @(
    @("Shipment NW-4471", "Delivered"),
    @("Shipment NW-4472", "In transit"),
    @("Shipment NW-4473", "Pending"),
    @("Shipment NW-4474", "Delayed"),
    @("Shipment NW-4475", "Delivered")
  )
  $y = 392
  foreach ($row in $rows) {
    Draw-Text $g $row[0] 72 $y 11 "#334155" $false
    Draw-Text $g $row[1] 720 $y 11 "#0F172A" $true
    $y += 28
  }
}

function Draw-OverlapPanels($g) {
  Draw-Rect $g $OVERLAP_DETAILS.x $OVERLAP_DETAILS.y $OVERLAP_DETAILS.w $OVERLAP_DETAILS.h "#DBEAFE"
  Draw-Border $g $OVERLAP_DETAILS.x $OVERLAP_DETAILS.y $OVERLAP_DETAILS.w $OVERLAP_DETAILS.h "#93C5FD"
  Draw-Text $g "DETAILS" ($OVERLAP_DETAILS.x + 20) ($OVERLAP_DETAILS.y + 16) 12 "#1E3A8A" $true
  Draw-Rect $g $OVERLAP_CHART.x $OVERLAP_CHART.y $OVERLAP_CHART.w $OVERLAP_CHART.h "#FEF3C7"
  Draw-Border $g $OVERLAP_CHART.x $OVERLAP_CHART.y $OVERLAP_CHART.w $OVERLAP_CHART.h "#FCD34D"
  Draw-Text $g "CHART" ($OVERLAP_CHART.x + 20) ($OVERLAP_CHART.y + 16) 12 "#92400E" $true
}

function Draw-ListPanel($g, $index, $overlap) {
  Draw-Rect $g 40 348 880 212 "#FFFFFF"
  Draw-Border $g 40 348 880 212 "#E2E8F0"
  Draw-Text $g "RECENT SHIPMENTS" 72 362 12 "#0F172A" $true
  Draw-ListRows $g
  if ($overlap) { Draw-OverlapPanels $g }
}

function Draw-Screen($g, $index, $variant) {
  Draw-AppBar $g
  Draw-CardFrame $g 40 96 "ACCOUNT HEALTH"
  Draw-CardABody $g $index ($variant -eq "truncation")
  Draw-CardFrame $g 520 96 "USAGE THIS MONTH"
  Draw-CardBBody $g $index ($variant -eq "low-contrast")
  Draw-ListPanel $g $index ($variant -eq "overlap")
}

function Save-Screen($index, $variant) {
  $bmp = New-Object System.Drawing.Bitmap($WIDTH, $HEIGHT)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  Draw-Screen $g $index $variant
  $name = "shot-0$index.png"
  $bmp.Save((Join-Path $FIXTURE $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Output "wrote $name variant=$variant"
}

function Normalize($x, $y, $w, $h) {
  return [ordered]@{
    x = [math]::Round($x / $WIDTH, 3)
    y = [math]::Round($y / $HEIGHT, 3)
    w = [math]::Round($w / $WIDTH, 3)
    h = [math]::Round($h / $HEIGHT, 3)
  }
}

function Normalize-Box($box) {
  return Normalize $box.x $box.y $box.w $box.h
}

# The ground-truth region of an overlap defect is the intersection of the two
# panels, computed from the same rectangles the variant draws.
function Normalize-Intersection($a, $b) {
  $x = [Math]::Max($a.x, $b.x)
  $y = [Math]::Max($a.y, $b.y)
  $w = [Math]::Min($a.x + $a.w, $b.x + $b.w) - $x
  $h = [Math]::Min($a.y + $a.h, $b.y + $b.h) - $y
  return Normalize $x $y $w $h
}

New-Item -ItemType Directory -Force -Path $FIXTURE | Out-Null
Save-Screen 1 "clean"
Save-Screen 2 "truncation"
Save-Screen 3 "clean"
Save-Screen 4 "overlap"
Save-Screen 5 "clean"
Save-Screen 6 "low-contrast"

$truth = [ordered]@{
  images = @(
    [ordered]@{ file = "shot-01.png"; defect = $false; type = "none"; region = $null },
    [ordered]@{ file = "shot-02.png"; defect = $true; type = "truncation"; region = (Normalize 64 152 352 24) },
    [ordered]@{ file = "shot-03.png"; defect = $false; type = "none"; region = $null },
    [ordered]@{
      file = "shot-04.png"
      defect = $true
      type = "overlap"
      region = (Normalize-Intersection $OVERLAP_DETAILS $OVERLAP_CHART)
      elements = @( (Normalize-Box $OVERLAP_DETAILS), (Normalize-Box $OVERLAP_CHART) )
    },
    [ordered]@{ file = "shot-05.png"; defect = $false; type = "none"; region = $null },
    [ordered]@{ file = "shot-06.png"; defect = $true; type = "low-contrast"; region = (Normalize 560 152 340 72) }
  )
}
$truth | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $FIXTURE "truth.json") -Encoding UTF8
Write-Output "wrote truth.json"

Add-Type -AssemblyName System.Drawing

$buildDir = 'D:\SMS\SchoolManagementSoftware\build'
if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
}

$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# Clear transparent
$g.Clear([System.Drawing.Color]::Transparent)

# Draw rounded navy shield background
$rect = New-Object System.Drawing.Rectangle 12, 12, 232, 232
$brushBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 58, 138))
$g.FillEllipse($brushBg, $rect)

# Draw gold accent ring
$penGold = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 245, 158, 11)), 6
$g.DrawEllipse($penGold, 18, 18, 220, 220)

# Draw Graduation Cap (Gold / Amber)
$brushGold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 251, 191, 36))
$pointsCap = @(
    (New-Object System.Drawing.Point 128, 65),
    (New-Object System.Drawing.Point 205, 105),
    (New-Object System.Drawing.Point 128, 145),
    (New-Object System.Drawing.Point 51, 105)
)
$g.FillPolygon($brushGold, $pointsCap)

# Cap base
$pointsBase = @(
    (New-Object System.Drawing.Point 85, 125),
    (New-Object System.Drawing.Point 85, 155),
    (New-Object System.Drawing.Point 128, 175),
    (New-Object System.Drawing.Point 171, 155),
    (New-Object System.Drawing.Point 171, 125),
    (New-Object System.Drawing.Point 128, 145)
)
$brushWhite = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
$g.FillPolygon($brushWhite, $pointsBase)

# Tassel
$penWhite = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 4
$g.DrawLine($penWhite, 128, 105, 62, 130)
$g.FillEllipse($brushGold, 58, 128, 10, 14)

# Open Book Symbol at Bottom
$penBook = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 251, 191, 36)), 5
$g.DrawBezier($penBook, (New-Object System.Drawing.Point 128, 195), (New-Object System.Drawing.Point 105, 185), (New-Object System.Drawing.Point 85, 188), (New-Object System.Drawing.Point 70, 202))
$g.DrawBezier($penBook, (New-Object System.Drawing.Point 128, 195), (New-Object System.Drawing.Point 151, 185), (New-Object System.Drawing.Point 171, 188), (New-Object System.Drawing.Point 186, 202))

# Save PNG
$pngPath = Join-Path $buildDir 'icon.png'
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Save ICO
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$icoPath = Join-Path $buildDir 'icon.ico'
$fs = New-Object System.IO.FileStream $icoPath, ([System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()

$g.Dispose()
$bmp.Dispose()

Write-Host "Generated icon files successfully:"
Get-ChildItem $buildDir

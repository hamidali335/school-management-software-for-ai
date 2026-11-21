# Clean-Machine Windows NSIS Installer Verification Script (Slice 6)
param(
  [string]$InstallerPath = ".\release\School Management Software-Setup-1.0.0.exe",
  [string]$AppDataDir = "$env:APPDATA\school-management-software"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $InstallerPath)) { throw "Installer not found at $InstallerPath" }
Start-Process -FilePath $InstallerPath -ArgumentList "/S" -Wait

$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "School Management Software.lnk"
if (-not (Test-Path $DesktopShortcut)) { Write-Warning "Desktop shortcut not found at $DesktopShortcut" }

New-Item -ItemType Directory -Force -Path $AppDataDir | Out-Null
$MarkerFile = Join-Path $AppDataDir "user-data-preserve-check.txt"
"PRESERVED" | Out-File -FilePath $MarkerFile -Encoding utf8

$Uninstaller = "$env:LOCALAPPDATA\Programs\school-management-software\Uninstall School Management Software.exe"
if (Test-Path $Uninstaller) {
  Start-Process -FilePath $Uninstaller -ArgumentList "/S" -Wait
  if (-not (Test-Path $MarkerFile)) { throw "FAIL: Uninstaller deleted user data in $AppDataDir!" }
  Write-Host "PASS: User data preserved after uninstall."
  Remove-Item $MarkerFile -Force
} else {
  Write-Warning "Uninstaller not found at default per-user path: $Uninstaller"
}

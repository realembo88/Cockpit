<#
.SYNOPSIS
    Richtet den Link-Typ cockpit-ablage:// ein, damit das Cockpit im Browser
    die Dokumenten-Ablage (Python) starten kann.

.DESCRIPTION
    - Nur fuer den aktuellen Benutzer, keine Administratorrechte noetig.
    - Muss im selben Ordner liegen wie ablage.py und cockpit_ablage.py.
    - Prueft Python, den Ablage-Ordner (ABLAGE_ROOT) und den API-Schluessel.
    - Kann jederzeit erneut ausgefuehrt werden (z. B. nach dem Verschieben der Skripte).

.EXAMPLE
    Rechtsklick auf die Datei -> "Mit PowerShell ausfuehren"
    oder:  powershell -ExecutionPolicy Bypass -File .\Cockpit-Ablage-einrichten.ps1

.EXAMPLE
    Wieder entfernen:
    powershell -ExecutionPolicy Bypass -File .\Cockpit-Ablage-einrichten.ps1 -Entfernen
#>

param(
    [switch]$Entfernen
)

$ErrorActionPreference = 'Stop'
$Key = 'HKCU:\Software\Classes\cockpit-ablage'

function Ende([int]$Code = 0) {
    Write-Host ''
    Read-Host 'Enter zum Schliessen' | Out-Null
    exit $Code
}

Write-Host ''
Write-Host '=== Cockpit-Ablage einrichten ===' -ForegroundColor Cyan
Write-Host ''

if ($Entfernen) {
    if (Test-Path -LiteralPath $Key) { Remove-Item -LiteralPath $Key -Recurse -Force }
    Write-Host 'Link-Typ cockpit-ablage:// wurde entfernt.' -ForegroundColor Green
    Ende 0
}

# --- Skripte pruefen ------------------------------------------------------------

$Here   = $PSScriptRoot
$Bridge = Join-Path $Here 'cockpit_ablage.py'
$Ablage = Join-Path $Here 'ablage.py'

if (-not (Test-Path -LiteralPath $Bridge)) {
    Write-Host "FEHLER: cockpit_ablage.py nicht gefunden in $Here" -ForegroundColor Red
    Write-Host 'Bitte cockpit_ablage.py in den Ordner mit ablage.py legen und dieses Skript dort ausfuehren.'
    Ende 1
}
if (-not (Test-Path -LiteralPath $Ablage)) {
    Write-Host "WARNUNG: ablage.py nicht gefunden in $Here" -ForegroundColor Yellow
    Write-Host 'cockpit_ablage.py nutzt die Regeln aus ablage.py - beide muessen im selben Ordner liegen.'
}

# --- Python finden (bevorzugt der Python-Launcher py.exe) -------------------------

$Command = $null
$Launcher = Get-Command 'py.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($Launcher) {
    $Command = '"' + $Launcher.Source + '" -3 "' + $Bridge + '" "%1"'
    Write-Host "Python:   $($Launcher.Source) (Python-Launcher)"
} else {
    $Python = Get-Command 'python.exe' -All -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -notlike '*\WindowsApps\*' } | Select-Object -First 1
    if (-not $Python) {
        Write-Host 'FEHLER: Python wurde nicht gefunden.' -ForegroundColor Red
        Write-Host 'Bitte Python von python.org installieren (Haken bei "Add python.exe to PATH") und erneut ausfuehren.'
        Ende 1
    }
    $Command = '"' + $Python.Source + '" "' + $Bridge + '" "%1"'
    Write-Host "Python:   $($Python.Source)"
}

# --- Link-Typ registrieren (HKCU, nur dieser Benutzer) ----------------------------

New-Item -Path $Key -Value 'URL:Cockpit Ablage' -Force | Out-Null
New-ItemProperty -Path $Key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$Key\DefaultIcon" -Value 'shell32.dll,4' -Force | Out-Null
New-Item -Path "$Key\shell" -Force | Out-Null
New-Item -Path "$Key\shell\open" -Force | Out-Null
New-Item -Path "$Key\shell\open\command" -Value $Command -Force | Out-Null
Write-Host "Link-Typ: cockpit-ablage:// -> $Bridge" -ForegroundColor Green

# --- Ablage-Ordner (ABLAGE_ROOT) --------------------------------------------------
# Wird das Skript aus dem Browser gestartet, gelten nur dauerhaft gesetzte
# Benutzer-Umgebungsvariablen - ein "set" in einer .bat-Datei wirkt dort nicht.

Write-Host ''
$Root = [Environment]::GetEnvironmentVariable('ABLAGE_ROOT', 'User')
if (-not $Root) {
    $OneDrive = $env:OneDrive
    if (-not $OneDrive) { $OneDrive = $env:OneDriveConsumer }
    if (-not $OneDrive) { $OneDrive = $env:OneDriveCommercial }
    if ($OneDrive) { $Default = Join-Path $OneDrive 'Dokumente_Ablage' } else { $Default = Join-Path $env:USERPROFILE 'Dokumente_Ablage' }
    if (Test-Path -LiteralPath (Join-Path $Default '00_Eingang')) {
        Write-Host "Ablage:   $Default (automatisch erkannt)"
    } else {
        Write-Host 'Der Ablage-Ordner wurde nicht automatisch gefunden.' -ForegroundColor Yellow
        Write-Host 'Bitte den vollstaendigen Pfad des Ordners eingeben, in dem 00_Eingang liegt'
        Write-Host '(z. B. C:\Users\NAME\OneDrive\01 Ablage NEU) - oder Enter zum Ueberspringen:'
        $Eingabe = (Read-Host 'Pfad').Trim().Trim('"')
        if ($Eingabe) {
            if (Test-Path -LiteralPath (Join-Path $Eingabe '00_Eingang')) {
                [Environment]::SetEnvironmentVariable('ABLAGE_ROOT', $Eingabe, 'User')
                Write-Host "ABLAGE_ROOT gesetzt: $Eingabe" -ForegroundColor Green
            } else {
                Write-Host "WARNUNG: In $Eingabe gibt es keinen Ordner 00_Eingang - nicht gesetzt." -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "Ablage:   $Root (ABLAGE_ROOT)"
}

# --- API-Schluessel ---------------------------------------------------------------

$KeyVal = [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'User')
if (-not $KeyVal) { $KeyVal = [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'Machine') }
if ($KeyVal) {
    Write-Host 'API-Schluessel: als Umgebungsvariable vorhanden' -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host 'Der API-Schluessel (ANTHROPIC_API_KEY) ist nicht dauerhaft gesetzt.' -ForegroundColor Yellow
    Write-Host 'Fuer den Start aus dem Browser muss er als Benutzer-Umgebungsvariable hinterlegt sein.'
    Write-Host 'Schluessel jetzt eingeben (Eingabe wird nicht angezeigt) oder Enter zum Ueberspringen:'
    $Secure = Read-Host 'ANTHROPIC_API_KEY' -AsSecureString
    $Plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure))
    if ($Plain) {
        [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', $Plain.Trim(), 'User')
        Write-Host 'API-Schluessel gespeichert (nur fuer diesen Windows-Benutzer).' -ForegroundColor Green
    }
    $Plain = $null
}

# --- Abschluss --------------------------------------------------------------------

Write-Host ''
Write-Host 'Fertig.' -ForegroundColor Cyan
Write-Host 'WICHTIG: Chrome einmal komplett schliessen und neu starten (auch im Hintergrund),'
Write-Host 'damit neu gesetzte Umgebungsvariablen beim Start aus dem Cockpit ankommen.'
Write-Host 'Danach im Cockpit unter Dokumente -> Einrichtung auf "Verbindung testen" tippen.'
Write-Host 'Chrome fragt beim ersten Mal, ob der Link geoeffnet werden darf: "Immer zulassen" anhaken.'
Ende 0

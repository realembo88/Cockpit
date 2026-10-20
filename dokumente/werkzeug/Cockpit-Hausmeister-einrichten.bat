@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Cockpit-Hausmeister einrichten
rem ==========================================================================
rem  Cockpit-Hausmeister einrichten (Windows-Aufgabenplanung)
rem  Doppelklick genuegt. Muss im selben Ordner liegen wie cockpit_ablage.py;
rem  vorher einmal Cockpit-Ablage-einrichten.bat ausfuehren (Python-Pfad).
rem
rem  Legt die Aufgabe "Cockpit Hausmeister" fuer den aktuellen Benutzer an:
rem  10 Minuten nach der Anmeldung, danach stuendlich, ohne Fenster (pythonw).
rem  Laeuft der Rechner zur geplanten Zeit nicht, holt Windows den Lauf nach.
rem  Der Hausmeister liest Zaehlerfotos, analysiert neue Scans, erkennt
rem  Dubletten, legt Briefe sicher bekannter Absender ab und macht die Sicherung.
rem  Ein Lauf aus dem Cockpit hat immer Vorrang.
rem
rem  Entfernen:   schtasks /delete /tn "Cockpit Hausmeister" /f
rem  Pausieren:   Aufgabenplanung -> Cockpit Hausmeister -> Deaktivieren
rem  Protokoll:   <Ablage>\_cockpit\hausmeister.json und hausmeister.log
rem ==========================================================================
echo.
echo  === Cockpit-Hausmeister einrichten ===
echo.
set "HM_BAT=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=[IO.File]::ReadAllText($env:HM_BAT); $ps=($f -split '(?m)^#{2}PS#\s*$',2)[1]; Invoke-Expression $ps"
echo.
pause
exit /b

##PS#
$ErrorActionPreference = 'Stop'
$aufgabe = 'Cockpit Hausmeister'
$hier = Split-Path -Parent $env:HM_BAT
$skript = [IO.Path]::Combine($hier, 'cockpit_ablage.py')
if (-not (Test-Path -LiteralPath $skript)) {
  Write-Host '  FEHLER: cockpit_ablage.py liegt nicht im selben Ordner wie diese Datei.'
  return
}

# --- Python vom Link-Typ cockpit-ablage:// uebernehmen ----------------------
$exe = $null; $pyarg = ''
try {
  $cmd = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Classes\cockpit-ablage\shell\open\command').'(default)'
  if ($cmd -match '^\s*"([^"]+)"\s*(-3\b)?') { $exe = $Matches[1]; if ($Matches[2]) { $pyarg = '-3' } }
} catch {}
if (-not $exe) {
  Write-Host '  FEHLER: Python-Pfad nicht gefunden. Bitte zuerst Cockpit-Ablage-einrichten.bat ausfuehren.'
  return
}

# --- Fensterlose Variante (pythonw / pyw) daneben suchen ---------------------
$i = $exe.LastIndexOfAny([char[]]'\/')
$ordner = $exe.Substring(0, [Math]::Max(0, $i))
$name = $exe.Substring($i + 1)
$wname = $null
if ($name -ieq 'py.exe') { $wname = 'pyw.exe' }
elseif ($name -match '^(?i)python(3(\.\d+)?)?\.exe$') { $wname = 'pythonw.exe' }
$pyw = $null
if ($wname) {
  $kand = $ordner + '\' + $wname
  if (Test-Path -LiteralPath $kand) { $pyw = $kand }
}
if (-not $pyw) {
  $pyw = $exe
  Write-Host '  HINWEIS: pythonw.exe nicht gefunden - beim stuendlichen Lauf blitzt kurz ein Fenster auf.'
}
Write-Host "  Python:    $pyw $pyarg"

# --- Ablage-Ordner und API-Schluessel pruefen --------------------------------
$root = [Environment]::GetEnvironmentVariable('ABLAGE_ROOT', 'User')
$key = [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'User')
if ($root) { Write-Host "  Ablage:    $root" } else { Write-Host '  WARNUNG: ABLAGE_ROOT ist nicht gesetzt - Cockpit-Ablage-einrichten.bat ausfuehren.' }
if (-not $key) { Write-Host '  HINWEIS: Kein API-Schluessel als Benutzer-Variable - Scans und Fotos werden dann nicht gelesen, die Sicherung laeuft trotzdem.' }

# --- Aufgabe anlegen ----------------------------------------------------------
$argumente = ("$pyarg `"$skript`" hausmeister").Trim()
$akt = New-ScheduledTaskAction -Execute $pyw -Argument $argumente -WorkingDirectory $hier
$benutzer = "$env:USERDOMAIN\$env:USERNAME"
$einst = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$wer = New-ScheduledTaskPrincipal -UserId $benutzer -LogonType Interactive -RunLevel Limited
$wdh = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 1)).Repetition
try { $wdh.Duration = $null } catch { $wdh.Duration = 'P3650D' }   # ohne Ende wiederholen
$text = 'Cockpit: Zaehlerfotos, neue Scans, Dubletten, Sicherung. 10 Minuten nach der Anmeldung, danach stuendlich.'

$art = ''
try {
  $t = New-ScheduledTaskTrigger -AtLogOn -User $benutzer
  $t.Delay = 'PT10M'
  $t.Repetition = $wdh
  Register-ScheduledTask -TaskName $aufgabe -Action $akt -Trigger $t -Settings $einst -Principal $wer -Description $text -Force | Out-Null
  $art = 'Anmeldung + 10 Minuten, danach stuendlich'
} catch {
  # Manche Windows-Versionen erlauben Anmelde-Ausloeser nur mit Administratorrechten.
  # Dann: stuendlich nach Uhrzeit, verpasste Laeufe holt Windows nach dem Start nach.
  try {
    $t = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(10)) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 1)
    try { $t.Repetition.Duration = $null } catch { $t.Repetition.Duration = 'P3650D' }
    Register-ScheduledTask -TaskName $aufgabe -Action $akt -Trigger $t -Settings $einst -Principal $wer -Description $text -Force | Out-Null
    $art = 'stuendlich (verpasste Laeufe werden nach dem Start nachgeholt)'
    Write-Host '  HINWEIS: Anmelde-Ausloeser nicht erlaubt. Fuer "10 Minuten nach dem Start" diese Datei'
    Write-Host '           mit Rechtsklick -> "Als Administrator ausfuehren" starten.'
  } catch {
    Write-Host "  FEHLER beim Anlegen der Aufgabe: $($_.Exception.Message)"
    return
  }
}
Write-Host "  Aufgabe:   '$aufgabe' - $art"

# --- Einmal sofort starten (im Hintergrund) -----------------------------------
try {
  Start-ScheduledTask -TaskName $aufgabe
  Write-Host '  Erster Lauf gestartet (unsichtbar im Hintergrund). Ergebnis siehe Cockpit -> Dokumente.'
} catch {
  Write-Host '  Erster Lauf folgt beim naechsten Ausloeser.'
}
Write-Host ''
Write-Host '  Fertig. Entfernen:  schtasks /delete /tn "Cockpit Hausmeister" /f'

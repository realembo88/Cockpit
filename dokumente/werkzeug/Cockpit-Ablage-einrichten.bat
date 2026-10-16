@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Cockpit-Ablage einrichten
rem ==========================================================================
rem  Cockpit-Ablage einrichten
rem  Doppelklick genuegt. Muss im selben Ordner liegen wie ablage.py und
rem  cockpit_ablage.py. Richtet den Link-Typ cockpit-ablage:// nur fuer den
rem  aktuellen Windows-Benutzer ein (keine Administratorrechte noetig),
rem  speichert Ablage-Ordner und API-Schluessel als Benutzer-Umgebungsvariablen
rem  und macht am Ende einen Selbsttest. Kann beliebig oft ausgefuehrt werden.
rem  Entfernen:  reg delete HKCU\Software\Classes\cockpit-ablage /f
rem ==========================================================================
echo.
echo  === Cockpit-Ablage einrichten ===
echo.

set "HIER=%~dp0"
set "SKRIPT=%HIER%cockpit_ablage.py"
if not exist "%SKRIPT%" goto :keinskript
if not exist "%HIER%ablage.py" echo  WARNUNG: ablage.py liegt nicht in diesem Ordner - beide Dateien muessen zusammen liegen.

rem --- Python finden ----------------------------------------------------------
rem  Alle Kandidaten werden ausprobiert; bevorzugt wird das Python, in dem das
rem  Paket "anthropic" installiert ist (also das, mit dem ablage.py laeuft).
rem  Auch Python aus dem Microsoft Store (WindowsApps) wird beruecksichtigt.
pushd "%HIER%"
set "PYEXE="
set "PYARG="
set "FALLBACK="
set "FALLARG="
if exist "verarbeiten.bat" for /f "usebackq tokens=1" %%t in (`findstr /i /c:"ablage.py" "verarbeiten.bat"`) do if exist "%%~t" call :probe "%%~t" ""
for /f "delims=" %%i in ('where python.exe 2^>nul') do call :probe "%%i" ""
for /f "delims=" %%i in ('where python3.exe 2^>nul') do call :probe "%%i" ""
for /f "delims=" %%i in ('where py.exe 2^>nul') do call :probe "%%i" "-3"
for /d %%d in ("%LOCALAPPDATA%\Programs\Python\Python3*") do if exist "%%d\python.exe" call :probe "%%d\python.exe" ""
for /d %%d in ("%ProgramFiles%\Python3*") do if exist "%%d\python.exe" call :probe "%%d\python.exe" ""
for /d %%d in ("C:\Python3*") do if exist "%%d\python.exe" call :probe "%%d\python.exe" ""
popd
if defined PYEXE goto :pygefunden
if not defined FALLBACK goto :keinpython
set "PYEXE=%FALLBACK%"
set "PYARG=%FALLARG%"
echo  WARNUNG: Python gefunden, aber das Paket "anthropic" fehlt dort. Bitte einmal ausfuehren:
echo           "%PYEXE%" %PYARG% -m pip install anthropic pypdf
:pygefunden
echo  Python:    %PYEXE% %PYARG%

rem --- Link-Typ cockpit-ablage:// registrieren ------------------------------
set "REGKEY=HKCU\Software\Classes\cockpit-ablage"
reg add "%REGKEY%" /ve /t REG_SZ /d "URL:Cockpit Ablage" /f >nul
if errorlevel 1 goto :regfehler
reg add "%REGKEY%" /v "URL Protocol" /t REG_SZ /d "" /f >nul
if errorlevel 1 goto :regfehler
reg add "%REGKEY%\shell\open\command" /ve /t REG_SZ /d "\"%PYEXE%\" %PYARG% \"%SKRIPT%\" \"%%1\"" /f >nul
if errorlevel 1 goto :regfehler
echo  Link-Typ:  cockpit-ablage:// eingerichtet

rem --- Ablage-Ordner (ABLAGE_ROOT) ------------------------------------------
set "ROOT="
for /f "tokens=2,*" %%a in ('reg query "HKCU\Environment" /v ABLAGE_ROOT 2^>nul ^| findstr /i "ABLAGE_ROOT"') do set "ROOT=%%b"
if defined ROOT goto :rootpruefen
if exist "%HIER%00_Eingang\" set "ROOT=%HIER%."
if not defined ROOT if exist "%HIER%..\00_Eingang\" set "ROOT=%HIER%.."
if not defined ROOT if defined OneDrive if exist "%OneDrive%\Dokumente_Ablage\00_Eingang\" set "ROOT=%OneDrive%\Dokumente_Ablage"
if not defined ROOT goto :rootfragen
goto :rootpruefen

:rootfragen
echo.
echo  Der Ablage-Ordner (der Ordner, in dem 00_Eingang liegt) wurde nicht gefunden.
echo  Tipp: Ordner im Explorer oeffnen, oben in die Adresszeile klicken,
echo  Pfad kopieren und hier mit Rechtsklick einfuegen.
set "ROOT="
set /p "ROOT=  Pfad: "
if not defined ROOT goto :ohneroot
set "ROOT=%ROOT:"=%"

:rootpruefen
for %%A in ("%ROOT%") do set "ROOT=%%~fA"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
if exist "%ROOT%\00_Eingang\" goto :rootok
echo  WARNUNG: In diesem Ordner gibt es keinen Unterordner 00_Eingang:
echo           %ROOT%
goto :rootfragen

:rootok
setx ABLAGE_ROOT "%ROOT%" >nul
set "ABLAGE_ROOT=%ROOT%"
echo  Ablage:    %ROOT%
goto :schluessel

:ohneroot
echo  Ablage-Ordner uebersprungen - das Skript sucht dann wie ablage.py selbst.

rem --- API-Schluessel ---------------------------------------------------------
:schluessel
set "HATKEY="
for /f "tokens=2,*" %%a in ('reg query "HKCU\Environment" /v ANTHROPIC_API_KEY 2^>nul ^| findstr /i "ANTHROPIC_API_KEY"') do set "HATKEY=%%b"
if defined HATKEY goto :keyok
reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v ANTHROPIC_API_KEY >nul 2>&1
if not errorlevel 1 goto :keymaschine
echo.
echo  Der API-Schluessel ist nicht dauerhaft gespeichert. Fuer den Start aus dem
echo  Browser muss er als Benutzer-Umgebungsvariable hinterlegt sein.
if exist "%HIER%verarbeiten.bat" findstr /i /c:"ANTHROPIC_API_KEY" "%HIER%verarbeiten.bat" >nul 2>&1
if exist "%HIER%verarbeiten.bat" if not errorlevel 1 echo  Hinweis: verarbeiten.bat setzt den Schluessel - denselben Schluessel hier einfuegen.
set "KEYIN="
set /p "KEYIN=  ANTHROPIC_API_KEY einfuegen (Enter = ueberspringen): "
if not defined KEYIN goto :test
set "KEYIN=%KEYIN:"=%"
setx ANTHROPIC_API_KEY "%KEYIN%" >nul
set "ANTHROPIC_API_KEY=%KEYIN%"
set "KEYIN="
echo  API-Schluessel gespeichert (nur fuer diesen Windows-Benutzer).
goto :test

:keyok
set "ANTHROPIC_API_KEY=%HATKEY%"
set "HATKEY="
echo  API-Schluessel: vorhanden
goto :test

:keymaschine
echo  API-Schluessel: vorhanden (systemweit)

rem --- Selbsttest -------------------------------------------------------------
:test
echo.
echo  --- Selbsttest ---
"%PYEXE%" %PYARG% "%SKRIPT%" test
echo.
echo  Fertig. Jetzt im Cockpit unter Dokumente - Einrichtung auf
echo  "Verbindung testen" tippen. Chrome fragt einmal, ob cockpit-ablage
echo  geoeffnet werden darf: "Immer zulassen" anhaken und oeffnen.
goto :ende

rem --- Unterprogramm: Python-Kandidaten pruefen ---------------------------------
rem  Parameter: Programm und Zusatzargument (z. B. -3 fuer py.exe)
:probe
if defined PYEXE goto :eof
set "PC=%~1"
set "PA=%~2"
"%PC%" %PA% -c "import anthropic" >nul 2>&1
if errorlevel 1 goto :probe2
set "PYEXE=%PC%"
set "PYARG=%PA%"
goto :eof
:probe2
if defined FALLBACK goto :eof
"%PC%" %PA% -c "import sys" >nul 2>&1
if errorlevel 1 goto :eof
set "FALLBACK=%PC%"
set "FALLARG=%PA%"
goto :eof

:keinskript
echo  FEHLER: cockpit_ablage.py liegt nicht im selben Ordner wie diese Datei:
echo          %HIER%
goto :ende

:keinpython
echo  FEHLER: Python wurde nicht gefunden.
if exist "%HIER%verarbeiten.bat" echo  So startet deine verarbeiten.bat Python - bitte ein Foto davon schicken:
if exist "%HIER%verarbeiten.bat" findstr /i /c:"py" "%HIER%verarbeiten.bat" | findstr /v /i "KEY"
echo  Falls Python fehlt: von python.org installieren, beim Setup den Haken bei
echo  "Add python.exe to PATH" setzen und diese Datei erneut starten.
goto :ende

:regfehler
echo  FEHLER: Der Link-Typ konnte nicht in die Registrierung eingetragen werden.

:ende
echo.
pause
endlocal

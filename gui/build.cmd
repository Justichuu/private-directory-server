@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

set "CSC="
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not defined CSC if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not defined CSC (
  for /f "delims=" %%P in ('where csc 2^>nul') do set "CSC=%%P"
)
if not defined CSC (
  echo Could not find csc.exe, the C# compiler that ships with Windows via .NET Framework.
  echo Private Directory Server needs .NET Framework, which is included with Windows 10 and 11.
  exit /b 1
)

echo Building the desktop launcher with "!CSC!"...
"!CSC!" /nologo /target:winexe /out:"Private Directory Server.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll gui\Launcher.cs
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo.
echo Done. Double-click "Private Directory Server.exe" to run it - no terminal needed from now on.

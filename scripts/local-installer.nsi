; Local fallback installer for environments where electron-builder's temporary
; uninstaller helper cannot be executed. The official release pipeline still uses
; electron-builder + NSIS; this script produces the same per-user layout for manual
; testing.
;
; Compile from the project root:
;   makensis scripts\local-installer.nsi

Unicode true
!include "MUI2.nsh"

!define APP_NAME "Lumen English"
!define APP_VERSION "1.0.0"
!define APP_PUBLISHER "Lumen English"
!define APP_EXE "Lumen English.exe"
!define UNINST_EXE "Uninstall Lumen English.exe"
!define APP_REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Lumen English"

Name "${APP_NAME}"
OutFile "..\release\Lumen-English-Setup-1.0.0.exe"
InstallDir "$LOCALAPPDATA\Programs\Lumen English"
InstallDirRegKey HKCU "${APP_REGKEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
SetCompress force
CRCCheck on
XPStyle on
BrandingText "${APP_NAME} · Installer"

VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=2052 "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey /LANG=2052 "FileVersion" "1.0.0.0"
VIAddVersionKey /LANG=2052 "ProductVersion" "1.0.0"
VIAddVersionKey /LANG=2052 "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Copyright © 2026 Lumen English"

!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "启动 Lumen English"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

Function .onInit
  SetShellVarContext current
FunctionEnd

Function un.onInit
  SetShellVarContext current
FunctionEnd

Section "Lumen English" SecMain
  SectionIn RO
  SetShellVarContext current

  ; A running copy would lock the executable during an update.
  nsExec::Exec 'taskkill /IM "${APP_EXE}" /F'
  Pop $0

  SetOutPath "$INSTDIR"
  File /r "..\release\win-unpacked\*.*"

  WriteUninstaller "$INSTDIR\${UNINST_EXE}"

  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\${UNINST_EXE}"

  WriteRegStr HKCU "${APP_REGKEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${APP_REGKEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${APP_REGKEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${APP_REGKEY}" "DisplayIcon" "$INSTDIR\${APP_EXE},0"
  WriteRegStr HKCU "${APP_REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${APP_REGKEY}" "UninstallString" '"$INSTDIR\${UNINST_EXE}"'
  WriteRegStr HKCU "${APP_REGKEY}" "QuietUninstallString" '"$INSTDIR\${UNINST_EXE}" /S'
  WriteRegDWORD HKCU "${APP_REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${APP_REGKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${APP_REGKEY}" "EstimatedSize" 425000
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  nsExec::Exec 'taskkill /IM "${APP_EXE}" /F'
  Pop $0

  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  DeleteRegKey HKCU "${APP_REGKEY}"

  ; Application data in %APPDATA%\Lumen English is intentionally preserved.
  RMDir /r "$INSTDIR"
SectionEnd



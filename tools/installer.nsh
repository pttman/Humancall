!include "nsDialogs.nsh"
!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Var DataDirectory
Var DataDirectoryInput
!endif

!macro customPageAfterChangeDir
  Page custom SelectDataDirectory SaveDataDirectory
!macroend

!ifndef BUILD_UNINSTALLER
Function SelectDataDirectory
  !insertmacro MUI_HEADER_TEXT "选择数据保存位置" "任务、提醒、对话和 API 配置将保存在这个文件夹。"
  SetShellVarContext current
  StrCpy $DataDirectory "$APPDATA\human-dispatch"
  IfFileExists "$APPDATA\human-dispatch\data-directory.txt" 0 +4
    FileOpen $0 "$APPDATA\human-dispatch\data-directory.txt" r
    FileReadUTF16LE $0 $DataDirectory
    FileClose $0
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 36u "请选择可长期保存且拥有写入权限的文件夹。升级时会沿用该位置；更换位置时，首次启动会复制原默认目录的数据，并保留原文件。"
  Pop $0
  ${NSD_CreateDirRequest} 0 44u 78% 14u "$DataDirectory"
  Pop $DataDirectoryInput
  ${NSD_CreateBrowseButton} 81% 44u 19% 14u "浏览…"
  Pop $0
  ${NSD_OnClick} $0 BrowseDataDirectory
  nsDialogs::Show
FunctionEnd

Function BrowseDataDirectory
  ${NSD_GetText} $DataDirectoryInput $DataDirectory
  nsDialogs::SelectFolderDialog "选择数据保存文件夹" "$DataDirectory"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $DataDirectoryInput "$0"
  ${EndIf}
FunctionEnd

Function SaveDataDirectory
  ${NSD_GetText} $DataDirectoryInput $DataDirectory
  ${If} $DataDirectory == ""
    MessageBox MB_OK "请选择数据保存文件夹。"
    Abort
  ${EndIf}
  ClearErrors
  CreateDirectory "$DataDirectory"
  GetTempFileName $1 "$DataDirectory"
  FileOpen $0 "$1" w
  ${If} ${Errors}
    MessageBox MB_OK "无法写入这个文件夹，请选择其他位置。"
    Abort
  ${EndIf}
  FileClose $0
  Delete "$1"
FunctionEnd

!macro customInstall
  SetShellVarContext current
  ${If} $DataDirectory != ""
    CreateDirectory "$APPDATA\human-dispatch"
    FileOpen $0 "$APPDATA\human-dispatch\data-directory.txt" w
    FileWriteUTF16LE $0 "$DataDirectory"
    FileClose $0
  ${EndIf}
!macroend
!endif

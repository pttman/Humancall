Option Explicit
Dim launcherShell, launcherFS, projectDir, electronPath, moduleDir, candidatePath
Set launcherShell = CreateObject("WScript.Shell")
Set launcherFS = CreateObject("Scripting.FileSystemObject")
projectDir = launcherFS.GetParentFolderName(WScript.ScriptFullName)
electronPath = launcherFS.BuildPath(projectDir, "node_modules\electron\dist\electron.exe")
If Not launcherFS.FileExists(electronPath) Then
  For Each moduleDir In Split(launcherShell.Environment("PROCESS")("NODE_PATH"), ";")
    If Len(Trim(moduleDir)) > 0 Then
      candidatePath = launcherFS.BuildPath(moduleDir, "electron\dist\electron.exe")
      If launcherFS.FileExists(candidatePath) Then
        electronPath = candidatePath
        Exit For
      End If
    End If
  Next
End If
If Not launcherFS.FileExists(electronPath) Then
  MsgBox "Local Electron is missing. Run npm install in the project folder first.", 16, "Humancall"
  WScript.Quit 1
End If
launcherShell.CurrentDirectory = projectDir
On Error Resume Next
launcherShell.Environment("PROCESS").Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0
launcherShell.Run Chr(34) & electronPath & Chr(34) & " " & Chr(34) & projectDir & Chr(34), 1, False

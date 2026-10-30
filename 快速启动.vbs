Option Explicit
Dim launcherShell, launcherFS, projectDir, electronPath
Set launcherShell = CreateObject("WScript.Shell")
Set launcherFS = CreateObject("Scripting.FileSystemObject")
projectDir = launcherFS.GetParentFolderName(WScript.ScriptFullName)
electronPath = launcherFS.BuildPath(projectDir, "node_modules\electron\dist\electron.exe")
If Not launcherFS.FileExists(electronPath) Then
  MsgBox "Local Electron is missing. Run npm install in the project folder first.", 16, "Humancall"
  WScript.Quit 1
End If
launcherShell.CurrentDirectory = projectDir
On Error Resume Next
launcherShell.Environment("PROCESS").Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0
launcherShell.Run Chr(34) & electronPath & Chr(34) & " " & Chr(34) & projectDir & Chr(34), 1, False

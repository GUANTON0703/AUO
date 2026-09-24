Option Explicit

Dim oShell, oFSO, sDir, sPython, sHtml

Set oShell = CreateObject("WScript.Shell")
Set oFSO   = CreateObject("Scripting.FileSystemObject")

' ── 取得 VBS 自身所在目錄 ──
sDir = oFSO.GetParentFolderName(WScript.ScriptFullName)

' ── Python 指令（先找同目錄 python.exe，找不到就用系統 PATH）──
If oFSO.FileExists(sDir & "\python.exe") Then
    sPython = """" & sDir & "\python.exe"""
Else
    sPython = "python"
End If

' ── 啟動後端（新視窗，不等待）──
oShell.Run "cmd.exe /k " & sPython & " """ & sDir & "\app_rs0342.py""", 1, False

' ── 等 3 秒讓後端起來 ──
WScript.Sleep 3000

' ── 開啟前端 HTML ──
sHtml = sDir & "\rs0342.html"
oShell.Run """" & sHtml & """", 1, False

Set oShell = Nothing
Set oFSO   = Nothing

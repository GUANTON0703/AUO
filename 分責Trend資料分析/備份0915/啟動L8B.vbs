Dim sh, fso, sDir, python, appPy, html, q, tmp, f
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
q = Chr(34)

sDir  = fso.GetParentFolderName(WScript.ScriptFullName) & "\"
appPy = sDir & "app.py"
html  = sDir & "L8B_DEFECT_Monitor_v12.html"

' Find Python
python = ""
Dim loc : loc = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%")
Dim p(8)
p(0) = loc & "\Programs\Python\Python312\python.exe"
p(1) = loc & "\Programs\Python\Python311\python.exe"
p(2) = loc & "\Programs\Python\Python310\python.exe"
p(3) = loc & "\Programs\Python\Python39\python.exe"
p(4) = loc & "\Programs\Python\Python38\python.exe"
p(5) = "C:\Python312\python.exe"
p(6) = "C:\Python311\python.exe"
p(7) = "C:\Python38\python.exe"
p(8) = "C:\Python39\python.exe"

Dim i
For i = 0 To 8
    If fso.FileExists(p(i)) Then
        python = p(i)
        Exit For
    End If
Next

If python = "" Then
    MsgBox "Python not found. Please install Python 3.8+.", 16, "L8B"
    WScript.Quit
End If

' Check pymysql
Dim d1 : d1 = fso.GetParentFolderName(fso.GetParentFolderName(python)) & "\Lib\site-packages\pymysql"
Dim d2 : d2 = fso.GetParentFolderName(python) & "\Lib\site-packages\pymysql"

If Not fso.FolderExists(d1) And Not fso.FolderExists(d2) Then
    Dim ans
    ans = MsgBox("pymysql not installed. Install now?", 36, "L8B")
    If ans = 7 Then WScript.Quit
    sh.Run q & python & q & " -m pip install pymysql", 1, True
    MsgBox "Done!", 64, "L8B"
End If

' Write temp bat to local drive (avoids UNC cmd.exe issue)
tmp = sh.ExpandEnvironmentStrings("%TEMP%") & "\l8b_run.bat"
Set f = fso.CreateTextFile(tmp, True, False)
f.WriteLine "@echo off"
f.WriteLine "start " & q & "L8B Server" & q & " cmd /k " & q & q & python & q & " " & q & appPy & q & q
f.Close

' Run temp bat (local path = no UNC error)
sh.Run q & tmp & q, 1, False

' Wait then open HTML
WScript.Sleep 2000
sh.Run q & html & q, 1, False

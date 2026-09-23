Dim oShell, fso, tempBat, f, q
Set oShell = CreateObject("WScript.Shell")
Set fso    = CreateObject("Scripting.FileSystemObject")

q = Chr(34)
tempBat = oShell.ExpandEnvironmentStrings("%TEMP%") & "\yield_run.bat"

Set f = fso.CreateTextFile(tempBat, True, False)
f.WriteLine "@echo off"
f.WriteLine "pushd " & q & "\\tw100049089\00_MyAgent\THS" & q
f.WriteLine "set PYTHON="
f.WriteLine "for %%P in (python.exe) do set PYTHON=%%~$PATH:P"
f.WriteLine "if " & q & "%PYTHON%" & q & "==" & q & q & " ("
f.WriteLine "  for %%D in ("
f.WriteLine "    " & q & "%LOCALAPPDATA%\Programs\Python\Python38\python.exe" & q
f.WriteLine "    " & q & "%LOCALAPPDATA%\Programs\Python\Python39\python.exe" & q
f.WriteLine "    " & q & "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" & q
f.WriteLine "    " & q & "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" & q
f.WriteLine "    " & q & "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" & q
f.WriteLine "    " & q & "C:\Python38\python.exe" & q
f.WriteLine "    " & q & "C:\Python39\python.exe" & q
f.WriteLine "    " & q & "C:\Python310\python.exe" & q
f.WriteLine "  ) do ("
f.WriteLine "    if exist %%D set PYTHON=%%~D"
f.WriteLine "  )"
f.WriteLine ")"
f.WriteLine "if " & q & "%PYTHON%" & q & "==" & q & q & " ("
f.WriteLine "  echo Python not found."
f.WriteLine "  pause"
f.WriteLine "  exit /b 1"
f.WriteLine ")"
f.WriteLine "echo Using Python: %PYTHON%"
f.WriteLine "start " & q & "GMIS Yield Dashboard" & q & " cmd /k " & q & "%PYTHON% \\tw100049089\00_MyAgent\THS\yield_dashboard.py" & q
f.WriteLine "timeout /t 3 /nobreak > nul"
f.WriteLine "start " & q & q & " " & q & "http://localhost:5203" & q
f.WriteLine "popd"
f.Close

oShell.Run q & tempBat & q, 1, False

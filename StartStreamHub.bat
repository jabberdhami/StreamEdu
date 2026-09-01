@echo off
echo Set WshShell = CreateObject("WScript.Shell"^) > start_hidden.vbs
echo WshShell.Run "cmd /c node server.js", 0, False >> start_hidden.vbs
wscript.exe start_hidden.vbs
del start_hidden.vbs

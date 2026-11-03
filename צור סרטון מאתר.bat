@echo off
rem Starts the Site to Reel server (minimized window) and opens it in the browser once it answers.
rem Close the minimized "Site to Reel" window to stop the tool.
start "Site to Reel" /min node "%~dp0server.mjs"
powershell -NoProfile -Command "for($i=0;$i -lt 40;$i++){try{Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4321 -TimeoutSec 1 | Out-Null; break}catch{Start-Sleep -Milliseconds 500}}"
start "" http://127.0.0.1:4321

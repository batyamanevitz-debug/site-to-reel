@echo off
rem Starts the Site to Reel server (minimized window) and opens the tool in the browser.
rem Close the minimized "Site to Reel" window to stop the tool.
start "Site to Reel" /min node "%~dp0server.mjs"
timeout /t 2 /nobreak >nul
start "" http://localhost:4321

@echo off
setlocal

set "COMMIT_MESSAGE=%~1"
if "%COMMIT_MESSAGE%"=="" set "COMMIT_MESSAGE=Livraison v0.2 du 03 juin 2026 [Making KoboConnector]"

git status
git add .
git commit -m "%COMMIT_MESSAGE%"
git push

endlocal

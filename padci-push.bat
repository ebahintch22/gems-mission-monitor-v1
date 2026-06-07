@echo off
setlocal

set "COMMIT_MESSAGE=%~1"
if "%COMMIT_MESSAGE%"=="" set "COMMIT_MESSAGE=Livraison v0.4 du 07 juin 2026 [KoboConnect + View Transposition + User Manager]"

git status
git add .
git commit -m "%COMMIT_MESSAGE%"
git push

endlocal

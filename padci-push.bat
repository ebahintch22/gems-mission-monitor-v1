@echo off
setlocal

set "COMMIT_MESSAGE=%~1"
if "%COMMIT_MESSAGE%"=="" set "COMMIT_MESSAGE=Livraison v0.3 du 04 juin 2026 [KoboConnect + Gestion Utilisateurs]"

git status
git add .
git commit -m "%COMMIT_MESSAGE%"
git push

endlocal

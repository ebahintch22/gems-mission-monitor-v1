@echo off
setlocal
chcp 65001 >nul

set "COMMIT_MESSAGE=%~1"
if "%COMMIT_MESSAGE%"=="" set "COMMIT_MESSAGE=Livraison v0.5 du 09 juin 2026 [Fiche décisionnelle]"

git status
git add .
git commit -m "%COMMIT_MESSAGE%"
git push

endlocal

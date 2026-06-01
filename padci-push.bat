@echo off
setlocal

set "COMMIT_MESSAGE=%~1"
if "%COMMIT_MESSAGE%"=="" set "COMMIT_MESSAGE=Update G2M application"

git status
git add .
git commit -m "%COMMIT_MESSAGE%"
git push

endlocal

@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: дальше код без строки color 0A


set "BASE_URL=https://685c16137a84d33bb0a9a85f--unique-cactus-b7ef48.netlify.app/addons"
set "OUT_DIR=addons"

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

if "%~1"=="install" (
    if "%~2"=="--forge" (
        if "%~3"=="" goto usage
        call :download "forge" "%~3"
        goto end
    ) else if "%~2"=="--js" (
        if "%~3"=="" goto usage
        call :download "js" "%~3"
        goto end
    ) else if "%~2"=="--all" (
        call :download_all
        goto end
    ) else (
        goto usage
    )
) else if "%~1"=="unistall" (
    if "%~2"=="--forge" (
        if "%~3"=="" goto usage
        call :unistall_file "forge" "%~3"
        goto end
    ) else if "%~2"=="--js" (
        if "%~3"=="" goto usage
        call :unistall_file "js" "%~3"
        goto end
    ) else (
        goto usage
    )
) else (
    goto usage
)

:: Скачивание файла
:download
setlocal
set "EXT=%~1"
set "LIB=%~2"
set "FILE=%LIB%.%EXT%"
set "URL=%BASE_URL%/%FILE%"
set "OUTFILE=%OUT_DIR%\%FILE%"

echo Проверяю наличие %FILE% на сервере...
curl -I --silent "%URL%" >nul 2>&1
if errorlevel 1 (
    echo Ошибка: файл %FILE% не найден на сервере.
    endlocal
    exit /b 1
)

echo Скачиваю %FILE% ...
curl -s -o "%OUTFILE%" "%URL%"
if errorlevel 1 (
    echo Ошибка при скачивании %FILE%.
    del "%OUTFILE%" >nul 2>&1
    endlocal
    exit /b 1
)

echo Файл %FILE% успешно сохранён в папку %OUT_DIR%.
endlocal
goto :eof

:: Удаление файла
:unistall_file
setlocal
set "EXT=%~1"
set "LIB=%~2"
set "FILE=%LIB%.%EXT%"
set "TARGET=%OUT_DIR%\%FILE%"

if exist "%TARGET%" (
    del "%TARGET%"
    if errorlevel 1 (
        echo Ошибка при удалении %FILE%.
        endlocal
        exit /b 1
    ) else (
        echo Файл %FILE% удалён из папки %OUT_DIR%.
    )
) else (
    echo Файл %FILE% не найден в папке %OUT_DIR%.
)
endlocal
goto :eof

:: Скачивание всех файлов
:download_all
setlocal

echo Скачиваю список файлов (index.txt)...
curl -s -o "%TEMP%\index.txt" "%BASE_URL%/index.txt"
if errorlevel 1 (
    echo Ошибка: не удалось получить список файлов index.txt.
    endlocal
    exit /b 1
)

for /f "usebackq delims=" %%f in ("%TEMP%\index.txt") do (
    set "FILE=%%f"
    for %%a in ("%%f") do (
        set "LIB=%%~na"
        set "EXT=%%~xa"
        setlocal enabledelayedexpansion
        set "EXT=!EXT:~1!"
        endlocal & set "EXT=!EXT!"
    )
    call :download "!EXT!" "!LIB!"
)

del "%TEMP%\index.txt"
endlocal
goto :eof

:usage
echo Использование:
echo   pifp install --forge libname    - скачать libname.forge
echo   pifp install --js libname       - скачать libname.js
echo   pifp install --all              - скачать все файлы из addons
echo   pifp unistall --forge libname   - удалить libname.forge из addons
echo   pifp unistall --js libname      - удалить libname.js из addons
exit /b 1

:end
endlocal
exit /b 0

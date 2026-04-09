@echo off
REM Batch file untuk menjalankan cek jatuh tempo via Windows Task Scheduler
REM Sesuaikan path php.exe jika berbeda

set PHP_EXE=C:\xampp\php\php.exe
set SCRIPT_PATH=D:\xampp\htdocs\Dashboard\cron\cek_jatuh_tempo_cli.php

if exist %PHP_EXE% (
    %PHP_EXE% %SCRIPT_PATH% >> D:\xampp\htdocs\Dashboard\cron\log.txt 2>&1
) else (
    echo PHP NOT FOUND at %PHP_EXE% >> D:\xampp\htdocs\Dashboard\cron\log.txt
)

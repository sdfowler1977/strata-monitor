@echo off
REM Strata Monitor on Windows. First run:  run.bat --strata-url http://127.0.0.1:8080 --key YOURKEY --strata-dir "C:\Strata"
REM (or create strata-monitor.json with install.sh's fields). Then open http://127.0.0.1:8090/
cd /d "%~dp0"
where py >nul 2>nul && (py -3 strata_monitor.py --config strata-monitor.json %* & goto :eof)
python strata_monitor.py --config strata-monitor.json %*

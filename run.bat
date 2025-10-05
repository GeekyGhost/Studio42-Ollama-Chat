@echo off
REM Sora Prompt Maker - Production Launcher
REM Local-only deployment script

echo ========================================
echo SORA PROMPT MAKER - PRODUCTION
echo ========================================
echo.

REM Check for Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    where py >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Python not found.
        echo Please install Python 3.10+ from python.org
        echo Make sure to check "Add Python to PATH" during installation.
        pause
        exit /b 1
    )
    set PYTHON=py -3
) else (
    set PYTHON=python
)

REM Verify Python version
echo [CHECK] Verifying Python version...
%PYTHON% --version
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to verify Python version
    pause
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist ".venv" (
    echo [SETUP] Creating virtual environment...
    %PYTHON% -m venv .venv
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
    echo [SUCCESS] Virtual environment created
) else (
    echo [INFO] Using existing virtual environment
)

REM Activate virtual environment
echo [SETUP] Activating virtual environment...
call .venv\Scripts\activate.bat
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to activate virtual environment
    pause
    exit /b 1
)

REM Install/upgrade requirements
if exist "requirements.txt" (
    echo [SETUP] Installing dependencies...
    python -m pip install --upgrade pip --quiet
    pip install -r requirements.txt --quiet
    if %ERRORLEVEL% NEQ 0 (
        echo [WARNING] Some packages may have failed to install
        echo Attempting to continue...
    ) else (
        echo [SUCCESS] Dependencies installed
    )
) else (
    echo [WARNING] requirements.txt not found
)

REM Create required directories
echo [SETUP] Creating application directories...
if not exist "templates" mkdir templates
if not exist "static" mkdir static

REM Verify critical files exist
if not exist "app.py" (
    echo [ERROR] app.py not found in current directory!
    echo Please ensure all application files are present.
    pause
    exit /b 1
)

if not exist "templates\chat.html" (
    echo [WARNING] templates\chat.html not found!
    echo The application may not function correctly.
    echo Please create the HTML template file.
    pause
)

REM Clear screen for clean startup
cls

echo.
echo ========================================
echo SORA PROMPT MAKER - SERVER STARTING
echo ========================================
echo.
echo Application URL: http://127.0.0.1:5000
echo Access: Local only (not accessible from network)
echo.
echo Optional Features:
echo   - Ollama AI assistance (run: ollama run llama3.2)
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

REM Ask if user wants to open browser
echo Would you like to open the application in your browser? (Y/N)
choice /C YN /N /T 5 /D Y >nul
if %ERRORLEVEL% EQU 1 (
    echo [INFO] Opening browser...
    start http://127.0.0.1:5000
)

REM Run Flask app in production mode
python app.py

REM Cleanup on exit
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application exited with error code %ERRORLEVEL%
    echo Check the logs above for details.
)

call deactivate
echo.
echo [INFO] Application stopped
pause
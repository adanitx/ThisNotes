@echo off
REM Script para subir ThisNotes a GitHub (Windows)

echo === ThisNotes - Subir a GitHub ===
echo.

REM Configuración
set REPO_NAME=ThisNotes
set OWNER=adanitx

echo Asegurate de que estés autenticado en GitHub:
echo 1. Ve a https://github.com/settings/tokens
echo 2. Crea un Personal Access Token con permisos 'repo'
echo 3. Ejecuta: git config --global credential.helper store
echo.
pause

REM Verificar que git está instalado
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git no está instalado o no está en el PATH
    echo Descárgalo desde: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM Inicializar git si es necesario
if not exist .git (
    echo Inicializando repositorio git...
    git init
    git branch -M main
)

REM Configurar usuario
set /p EMAIL="¿Cuál es tu email de GitHub? "
set /p NAME="¿Cuál es tu nombre para los commits? "

git config --global user.email "%EMAIL%"
git config --global user.name "%NAME%"

REM Agregar archivos
echo Agregando archivos...
git add .

REM Hacer commit
echo Creando commit...
git commit -m "Initial commit: ThisNotes browser extension v1.1.0"

REM Agregar remote
echo Configurando remote...
git remote remove origin 2>nul
git remote add origin https://github.com/%OWNER%/%REPO_NAME%.git

REM Subir
echo Subiendo a GitHub...
git push -u origin main

echo.
echo ✓ ¡Listo! Tu repositorio está en:
echo https://github.com/%OWNER%/%REPO_NAME%
echo.
pause

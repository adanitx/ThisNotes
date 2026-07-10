#!/bin/bash
# Script para subir ThisNotes a GitHub

echo "=== ThisNotes - Subir a GitHub ==="
echo ""

# Configuración
REPO_NAME="ThisNotes"
OWNER="adanitx"  # Cambia esto por tu usuario de GitHub

echo "Asegúrate de que estés autenticado en GitHub:"
echo "1. Ve a https://github.com/settings/tokens"
echo "2. Crea un Personal Access Token con permisos 'repo'"
echo "3. Ejecuta: git config --global credential.helper store"
echo ""

# Inicializar git
if [ ! -d .git ]; then
    echo "Inicializando repositorio git..."
    git init
    git branch -M main
fi

# Configurar usuario
read -p "¿Cuál es tu email de GitHub? " EMAIL
read -p "¿Cuál es tu nombre para los commits? " NAME

git config --global user.email "$EMAIL"
git config --global user.name "$NAME"

# Agregar archivos
echo "Agregando archivos..."
git add .

# Hacer commit
echo "Creando commit..."
git commit -m "Initial commit: ThisNotes browser extension v1.1.0"

# Agregar remote
echo "Configurando remote..."
git remote remove origin 2>/dev/null
git remote add origin "https://github.com/$OWNER/$REPO_NAME.git"

# Subir
echo "Subiendo a GitHub..."
git push -u origin main

echo ""
echo "✓ ¡Listo! Tu repositorio está en:"
echo "https://github.com/$OWNER/$REPO_NAME"

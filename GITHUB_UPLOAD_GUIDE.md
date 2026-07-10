# Guía: Subir ThisNotes a GitHub

## Opción 1: Usar el script automatizado (Recomendado)

### Windows
1. Abre PowerShell o cmd en la carpeta del proyecto
2. Ejecuta: `.\push-to-github.bat`
3. Sigue las instrucciones del script

### Mac/Linux
1. Abre Terminal en la carpeta del proyecto
2. Ejecuta: `bash push-to-github.sh`
3. Sigue las instrucciones del script

## Opción 2: Manual con GitHub CLI

### Requisitos
- Tener [Git](https://git-scm.com/downloads) instalado
- Tener [GitHub CLI](https://cli.github.com) instalado

### Pasos

#### 1. Autentica con GitHub
```bash
gh auth login
```
Elige HTTPS y autoriza en el navegador web

#### 2. Crea el repositorio
```bash
gh repo create ThisNotes --public --source=. --remote=origin --push
```

#### 3. ¡Listo!
Tu repositorio estará en `https://github.com/tu-usuario/ThisNotes`

## Opción 3: Manual tradicional con Git

### Requisitos
- Tener [Git](https://git-scm.com/downloads) instalado
- Tener un [Personal Access Token](https://github.com/settings/tokens) de GitHub

### Pasos

#### 1. Configura git
```bash
git config --global user.email "tu-email@ejemplo.com"
git config --global user.name "Tu Nombre"
git config --global credential.helper store
```

#### 2. Inicializa el repositorio
```bash
git init
git branch -M main
git add .
git commit -m "Initial commit: ThisNotes browser extension v1.1.0"
```

#### 3. Crea el repositorio en GitHub
- Ve a https://github.com/new
- Nombre: `ThisNotes`
- Descripción: `Extensión de navegador para generación de notas en webs`
- Público
- NO inicialices con README
- Haz clic en "Create repository"

#### 4. Sube tu código
```bash
git remote add origin https://github.com/tu-usuario/ThisNotes.git
git push -u origin main
```

#### 5. Introduce tu Personal Access Token cuando te lo pida
- Ve a https://github.com/settings/tokens
- Crea un token con permisos `repo`
- Cópialo y pégalo como "contraseña" (aparecerá oculta)

## Verificar que todo subió correctamente

1. Ve a `https://github.com/tu-usuario/ThisNotes`
2. Verifica que puedes ver todos estos archivos:
   - manifest.json
   - popup.html, popup.js, popup.css
   - content.js
   - options.html, options.js, options.css
   - README.md
   - LICENSE
   - .gitignore

## Compartir la extensión

### Para usuarios
Comparte el enlace: `https://github.com/tu-usuario/ThisNotes`

Las instrucciones están en el README. Los usuarios pueden:
1. Descargar la carpeta
2. Ir a `chrome://extensions/` (Chrome) o `about:debugging` (Firefox)
3. Cargar la carpeta descomprimida

### Para colaboradores
Comparte el enlace del repositorio para que puedan crear pull requests

## Solucionar problemas

### Error: "fatal: not a git repository"
```bash
git init
```

### Error: "fatal: unable to access 'https://github.com/...': The requested URL returned error: 401"
- Tu token ha expirado o es incorrecto
- Crea uno nuevo en https://github.com/settings/tokens
- Ejecuta `git config --global credential.reject-all`
- Vuelve a intentar

### Error: "could not read Username for 'https://github.com': No such file or directory"
```bash
git config --global credential.helper store
```

## Actualizar el repositorio después

Cuando hagas cambios locales:
```bash
git add .
git commit -m "Descripción de los cambios"
git push
```

¡Listo! Ahora tu extensión está en GitHub y es fácil de compartir y mantener.

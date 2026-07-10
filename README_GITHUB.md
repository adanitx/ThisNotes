# ThisNotes 📝

**Extensión de navegador para crear notas persistentes vinculadas a cualquier sitio web**

Una extensión ligera y versátil que permite tomar notas directamente sobre el contenido de cualquier página web, con sincronización automática, seguridad con PIN y más.

## ✨ Características

- **Notas por sitio**: Crea notas vinculadas a URL específicas o dominios
- **Interfaz flotante**: Arrastra, redimensiona y edita notas directamente en la página
- **Estilos personalizables**: 
  - Color de nota, color de texto, fondo de texto
  - Tipografía: Fuente, tamaño, cursiva, subrayado
  - Controles para cada propiedad
- **Adjuntos de imagen**: Agrega imágenes en base64, ve thumbnails con lightbox
- **PIN de protección**: Bloquea notas individuales con PIN
- **PIN Recovery**: Recupera un dígito olvidado del PIN (72h)
- **Papelera**: Recupera notas eliminadas dentro de 24 horas
- **Visualizar al acceder**: Muestra notas automáticamente al acceder a un sitio
- **Sesiones inteligentes**: Las notas ocultas manualmente se mantienen ocultas en la sesión
- **Sincronia opcional**: Backup en la nube del navegador (storage.sync)
- **Gestor de configuración**: Página de opciones para ver, filtrar y editar todas las notas

## 🚀 Instalación

### Chrome, Edge, Brave, Opera (Chromium)

1. Descarga esta carpeta
2. Abre `chrome://extensions/` (o equivalente en tu navegador)
3. Activa **"Modo de desarrollador"** (arriba a la derecha)
4. Haz clic en **"Cargar extensión sin empaquetar"**
5. Selecciona la carpeta `chromium-ready/`
6. ¡Listo! La extensión aparecer√° en tu toolbar

### Firefox

1. Descarga esta carpeta
2. Abre `about:debugging`
3. Haz clic en **"Esta instancia de Firefox"** (izquierda)
4. Haz clic en **"Cargar complemento temporal"**
5. Selecciona el archivo `manifest.firefox.json`
6. ¡Listo! La extensión aparecer√° en tu toolbar

## 💡 Uso Rápido

1. **Crear nota**: Abre cualquier web → Haz clic en el ícono de ThisNotes → Escribe título y contenido → Selecciona sitios → **Guardar**
2. **Ver nota**: La nota aparecerá flotante en la página
3. **Editar**: Haz clic en el ícono de lápiz o edita inline
4. **Ocultar**: Haz clic en el ícono de ojo
5. **Proteger con PIN**: Haz clic en el ícono de candado
6. **Gestionar**: Ve a **Configuración** para ver todas las notas, trashy PIN recovery

## 🎨 Personalizacion

Cada nota permite:
- **Color de fondo**: Elige cualquier color
- **Color de texto**: Se ajusta automáticamente para legibilidad
- **Bordeado inteligente**: Usa el color de la nota cuando el contraste es bajo
- **Tipografía**: Fuente, tamaño, cursiva, subrayado
- **Fondo de texto**: Elige si aplicar o no

Controla qué propiedades aplicar globalmente en **Configuración → Preferencias de visualización**.

## 🔒 Seguridad

- **PIN por nota**: Protege notas individuales con un PIN (4-20 caracteres)
- **Hash simple**: El PIN se almacena con hash (no encriptación cryptográfica)
- **Recovery**: Si olvidas el PIN, puedes eliminar la nota suavemente a papelera
- **PIN Log**: Historial de dígitos recuperados (72h)
- **Sin datos en servidor**: Todo se guarda localmente en tu navegador

## 📦 Estructura del Proyecto

```
ThisNotes/
├── chromium-ready/           # Carpeta para Chrome/Edge/Brave
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   ├── content.js
│   ├── options.html
│   ├── options.js
│   ├── options.css
│   └── icons/
├── firefox-ready/            # Carpeta para Firefox
│   ├── manifest.firefox.json
│   └── [mismos archivos]
├── manifest.json             # Manifest para Chromium
├── manifest.firefox.json     # Manifest para Firefox
├── popup.html / popup.js / popup.css
├── content.js                # Script de inyección en páginas
├── options.html / options.js / options.css
└── icons/
```

## 🔧 Desarrollo

### Estructura de almacenamiento

Las notas se almacenan en `chrome.storage.local` con las siguientes claves:

```javascript
thisnotes.notes           // Array de notas
thisnotes.displayPrefs    // Preferencias de visualización
thisnotes.layout          // Posiciones y tamaños de notas por sitio
thisnotes.trash           // Papelera con deletedAt timestamp (24h TTL)
thisnotes.pinLog          // Log de dígitos recuperados (72h TTL)
```

### Scripts principales

- **popup.js**: UI principal, creación/edición de notas
- **content.js**: Inyección en páginas, renderizado flotante, drag/resize
- **options.js**: Página de configuración y gestión

### Cambiar iconos

Reemplaza los archivos en `icons/` y actualiza referencias en `manifest.json`.

## 🐛 Soporte y Reportar Issues

Si encuentras un bug o tienes una sugerencia, por favor crea un issue en GitHub.

## 📄 Licencia

Libre para usar, modificar y distribuir.

---

**Disfruta tomando notas sin límites en la web** 🎉

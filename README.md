# ThisNotes - Extension de notas por sitio

Una extensión ligera y privada para crear notas vinculadas a webs específicas directamente en tu navegador.

## Características principales

- 📌 **Notas por web**: Crea notas asociadas a URLs específicas que solo aparecen en esas webs
- 🎨 **Personalización**: Elige color, tamaño de fuente, estilos (cursiva, subrayado) y fondo de texto
- 📸 **Adjuntos**: Guarda imágenes y capturas de pantalla (hasta 800KB por imagen)
- 🔒 **PIN de seguridad**: Protege notas sensibles con PIN de visualización
- 📝 **Versiones**: Historial de cambios por nota + deshacer último cambio
- 👁️ **Visibilidad**: Muestra/oculta notas por sitio con un clic
- 🏷️ **Etiquetas**: Organiza tus notas con etiquetas personalizadas
- 📤 **Exportar/Importar**: Descarga y restaura tus notas en JSON
- 💾 **Almacenamiento local**: Todos tus datos se guardan localmente en tu navegador (sin sincronización a servidores externos)
- 🔧 **Configuración global**: Panel central para gestionar todas las notas

## Instalación

### Chrome, Edge, Brave, Opera (Chromium)

1. Descarga o clona este repositorio
2. Abre `chrome://extensions` (o el equivalente en tu navegador)
3. Activa **"Modo de desarrollador"** (arriba a la derecha)
4. Haz clic en **"Cargar extensión sin empaquetar"**
5. Selecciona la carpeta del proyecto
6. ¡Listo! La extensión aparecerá en tu barra de herramientas

### Firefox

1. Descarga o clona este repositorio
2. Abre `about:debugging` en la barra de direcciones
3. Haz clic en **"This Firefox"** (panel izquierdo)
4. Pulsa **"Load Temporary Add-on"**
5. Selecciona el archivo `manifest.firefox.json` de esta carpeta
6. ¡Listo! La extensión se cargará temporalmente (se resetea al reiniciar Firefox)

Para carga permanente en Firefox, empaqueta como `.xpi` o instala desde [AMO](https://addons.mozilla.org).

## Uso rápido

1. **Abrir la extensión**: Haz clic en el icono en tu barra de herramientas
2. **Crear nota**: Rellena el formulario (título, contenido, webs asociadas)
3. **Guardar**: Pulsa "Guardar"
4. **Ver nota**: La nota aparecerá en las webs que especificaste
5. **Gestionar**: Usa los botones en la nota o el panel de "Configuración" para editar/borrar/exportar

## Estructura de archivos

```
ThisNotes/
├── manifest.json              # Configuración para Chrome/Edge/Brave/Opera
├── manifest.firefox.json      # Configuración para Firefox
├── content.js                 # Inyectado en todas las webs (renderiza notas)
├── popup.html / popup.js      # Interfaz del popup
├── popup.css                  # Estilos del popup
├── options.html / options.js  # Página de configuración global
├── options.css                # Estilos de configuración
├── LICENSE                    # MIT License
└── README.md                  # Este archivo
```

## Almacenamiento de datos

- **Ubicación**: Storage local del navegador (chrome.storage.local / browser.storage.local)
- **Privacidad**: Todos los datos permanecen en tu navegador, sin sincronización a servidores
- **Datos guardados**:
  - `thisnotes.notes` - Tus notas
  - `thisnotes.displayPrefs` - Preferencias de visualización
  - `thisnotes.layout` - Posiciones de paneles
  - `thisnotes.trash` - Notas eliminadas (se borran automáticamente en 24h)
  - `thisnotes.security` - Hash del PIN (si lo usas)

## PIN de seguridad

- Protege notas individuales con un PIN de 4-20 caracteres
- Las notas bloqueadas mostrarán un input de PIN antes de ver el contenido
- El PIN se almacena localmente (nunca se envía a servidores)
- Función de recuperación: Revela 1 dígito del PIN si lo olvidas

## Licencia

MIT License - Ver archivo LICENSE

## Desarrollo

Este proyecto está construido con:
- **JavaScript vanilla** (sin dependencias externas)
- **Manifest V3** (estándar moderno de extensiones)
- Storage API nativa del navegador

Para contribuir o reportar problemas, crea un issue en el repositorio.

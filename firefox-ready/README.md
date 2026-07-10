# ThisNotes - Extension de notas por sitio

## Que hace
- Crea notas vinculadas a una web concreta.
- Guarda contenido y estilos en almacenamiento local de la extension.
- Muestra notas encima de la web correspondiente.
- Permite mostrar/ocultar por sitio con icono de ojo (desde popup y desde la propia nota).
- Permite copiar, exportar, importar y eliminar notas con confirmacion.
- Permite etiquetas por nota.
- Permite historial de versiones por nota y deshacer ultimo cambio.
- Permite arrastrar y anclar la posicion del panel de notas por web (persistente).
- Incluye bloqueo por PIN para acciones sensibles.
- Incluye sincronizacion opcional con storage.sync (nube del navegador).
- Incluye pagina de configuracion para:
  - Ver resumen de todas las notas (sin visual).
  - Editar las webs asociadas a cada nota.
  - Editar etiquetas asociadas a cada nota.
  - Activar/desactivar propiedades visuales (color, fuente, tamano, cursiva, subrayado, fondo de texto).
  - Filtrar por texto, web o etiqueta.

## Cargar extension en Chrome/Edge/Brave/Opera (Chromium)
1. Abre la pagina de extensiones del navegador.
2. Activa "Modo desarrollador".
3. Pulsa "Cargar descomprimida" (Load unpacked).
4. Selecciona esta carpeta del proyecto.

## Cargar en Firefox
1. Abre about:debugging.
2. En "This Firefox", pulsa "Load Temporary Add-on".
3. Selecciona el archivo manifest.firefox.json de esta carpeta.

## Uso rapido
1. Abre una web normal.
2. Haz clic en la extension.
3. Crea una nota y guarda.
4. La nota aparecera en la web.
5. Usa el icono de ojo para ocultar/mostrar.
6. En "Configuracion" puedes gestionar todas las notas globalmente.

## Estructura
- manifest.json
- manifest.firefox.json
- popup.html / popup.css / popup.js
- content.js
- options.html / options.css / options.js

const ext = globalThis.browser || globalThis.chrome;

const STORAGE_NOTES = "thisnotes.notes";
const STORAGE_PREFS = "thisnotes.displayPrefs";
const STORAGE_LAYOUT = "thisnotes.layout";
const STORAGE_TRASH = "thisnotes.trash";
const STORAGE_SESSION_HIDDEN = "thisnotes.sessionHidden";

const defaultPrefs = {
  applyNoteColor: true,
  applyTextColor: true,
  applyFontFamily: true,
  applyFontSize: true,
  applyItalic: true,
  applyUnderline: true,
  applyTextBackground: true,
};

const defaultStyle = {
  noteColor: "#fff2a8",
  textColor: "#1d1d1d",
  fontFamily: "Segoe UI",
  fontSize: 14,
  textBackgroundColor: "#ffffff",
  italic: false,
  underline: false,
};

let currentUrl = normalizeComparableUrl(location.href);
let siteKey = location.hostname.toLowerCase();
let lastCheckedUrl = currentUrl;

let root = null;
let dragState = null;
let resizeState = null;
const unlockedViewNotes = new Set();
const sessionHiddenNotes = new Set();

ext.runtime.onMessage.addListener((message) => {
  if (message?.type === "THISNOTES_REFRESH" || message?.type === "THISNOTES_OPEN_PANEL") {
    render().catch((err) => console.error(err));
  } else if (message?.type === "THISNOTES_TOGGLE_SESSION_VISIBILITY") {
    const { noteId, show } = message;
    if (show) {
      showNoteOnSite(noteId).catch((err) => console.error(err));
    } else {
      hideNoteOnSite(noteId).catch((err) => console.error(err));
    }
  } else if (message?.type === "THISNOTES_GET_SESSION_HIDDEN") {
    // Return current session hidden notes
    return Promise.resolve({
      sessionHiddenNotes: Array.from(sessionHiddenNotes),
      currentUrl,
    });
  }
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }
  if (changes[STORAGE_NOTES] || changes[STORAGE_PREFS] || changes[STORAGE_LAYOUT] || changes[STORAGE_SESSION_HIDDEN]) {
    render().catch((err) => console.error(err));
  }
});

// Initialize: Load session hidden notes and render
(async () => {
  await loadSessionHiddenNotes();
  await render().catch((err) => console.error(err));
})();

// Detectar cambios de URL para SPAs (Single Page Applications)
function updateCurrentUrlIfChanged() {
  const newUrl = normalizeComparableUrl(location.href);
  const newHost = location.hostname.toLowerCase();
  
  if (newUrl !== currentUrl || newHost !== siteKey) {
    currentUrl = newUrl;
    siteKey = newHost;
    lastCheckedUrl = currentUrl;
    sessionHiddenNotes.clear(); // Limpiar ocultos al cambiar de URL
    saveSessionHiddenNotes(); // Persist cleared state
    render().catch((err) => console.error(err));
  }
}

// Load and save session hidden notes from/to storage
async function loadSessionHiddenNotes() {
  const store = await ext.storage.local.get([STORAGE_SESSION_HIDDEN]);
  const hidden = store[STORAGE_SESSION_HIDDEN] || {};
  const urlHidden = hidden[currentUrl] || [];
  sessionHiddenNotes.clear();
  urlHidden.forEach((id) => sessionHiddenNotes.add(id));
}

async function saveSessionHiddenNotes() {
  const store = await ext.storage.local.get([STORAGE_SESSION_HIDDEN]);
  const hidden = store[STORAGE_SESSION_HIDDEN] || {};
  if (sessionHiddenNotes.size > 0) {
    hidden[currentUrl] = Array.from(sessionHiddenNotes);
  } else {
    delete hidden[currentUrl];
  }
  await ext.storage.local.set({ [STORAGE_SESSION_HIDDEN]: hidden });
}

// Listener para cambios de hash
window.addEventListener("hashchange", updateCurrentUrlIfChanged);

// Listener para navegación (atrás/adelante)
window.addEventListener("popstate", updateCurrentUrlIfChanged);

// Polling periódico para detectar cambios de URL en SPAs complejas
setInterval(updateCurrentUrlIfChanged, 500);

async function render() {
  if (!siteKey || !currentUrl) {
    return;
  }

  const store = await ext.storage.local.get([STORAGE_NOTES, STORAGE_PREFS, STORAGE_LAYOUT]);
  const notes = store[STORAGE_NOTES] || [];
  const prefs = { ...defaultPrefs, ...(store[STORAGE_PREFS] || {}) };
  const layout = store[STORAGE_LAYOUT] || {};

  const visibleNotes = notes.filter((note) => {
    const websites = note.websites || [];
    if (!websites.some((entry) => associationMatchesCurrent(entry, currentUrl, siteKey))) {
      return false;
    }

    if (sessionHiddenNotes.has(note.id)) {
      return false;
    }

    if (note.showOnAccess) {
      return true;
    }

    const vis = note.siteVisibility || {};
    if (Object.prototype.hasOwnProperty.call(vis, currentUrl)) {
      return !!vis[currentUrl];
    }
    if (Object.prototype.hasOwnProperty.call(vis, siteKey)) {
      return !!vis[siteKey];
    }
    return true;
  });

  mountRoot();
  root.innerHTML = "";

  const notePositions = getNotePositions(layout, siteKey);

  visibleNotes.forEach((note, index) => {
    const card = document.createElement("section");
    card.className = "thisnotes-card";
    card.dataset.noteId = note.id;

    const style = { ...defaultStyle, ...(note.style || {}) };
    if (prefs.applyNoteColor) {
      card.style.background = style.noteColor;
    }

    const header = document.createElement("header");
    header.className = "thisnotes-header";

    const title = document.createElement("strong");
    title.textContent = note.title || "Nota";

    const controls = document.createElement("div");
    controls.className = "thisnotes-controls";

    const dragButton = document.createElement("button");
    dragButton.className = "thisnotes-drag";
    dragButton.type = "button";
    dragButton.title = "Mover nota";
    dragButton.textContent = "::";
    dragButton.addEventListener("mousedown", (event) => startNoteDrag(event, note.id, card));

    const eyeButton = document.createElement("button");
    eyeButton.className = "thisnotes-eye";
    eyeButton.type = "button";
    eyeButton.title = "Ocultar nota";
    eyeButton.innerHTML = eyeIcon();
    eyeButton.addEventListener("click", () => hideNoteOnSite(note.id));

    const copyButton = document.createElement("button");
    copyButton.className = "thisnotes-copy";
    copyButton.type = "button";
    copyButton.title = "Copiar contenido";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(note.content || "");
    });

    const editButton = document.createElement("button");
    editButton.className = "thisnotes-edit";
    editButton.type = "button";
    editButton.title = "Editar contenido";
    editButton.innerHTML = pencilIcon();
    editButton.addEventListener("click", () => startInlineEdit(note.id, card, body, editButton));

    controls.appendChild(dragButton);
    controls.appendChild(copyButton);
    controls.appendChild(editButton);
    controls.appendChild(eyeButton);
    header.appendChild(title);
    header.appendChild(controls);

    const body = document.createElement("p");
    body.className = "thisnotes-content";
    body.textContent = note.content || "";

    const noteBackground = style.noteColor || defaultStyle.noteColor;
    body.style.background = noteBackground;

    const preferredTextColor = prefs.applyTextColor ? style.textColor : defaultStyle.textColor;
    const safeText = ensureReadableTextColor(preferredTextColor, noteBackground, style.noteColor);
    body.style.color = safeText.color;
    body.style.textShadow = safeText.shadow;

    // Aplicar fuente al título
    if (prefs.applyFontFamily) {
      title.style.fontFamily = style.fontFamily;
    }
    // Aplicar color y sombra al título también
    title.style.color = safeText.color;
    title.style.textShadow = safeText.shadow;

    if (prefs.applyFontFamily) {
      body.style.fontFamily = style.fontFamily;
    }
    if (prefs.applyFontSize) {
      body.style.fontSize = `${Number(style.fontSize) || 14}px`;
    }
    if (prefs.applyItalic && style.italic) {
      body.style.fontStyle = "italic";
    }
    if (prefs.applyUnderline && style.underline) {
      body.style.textDecoration = "underline";
    }
    if (prefs.applyTextBackground === false) {
      body.style.background = noteBackground;
    }

    if (Array.isArray(note.tags) && note.tags.length) {
      const tags = document.createElement("small");
      tags.className = "thisnotes-tags";
      tags.textContent = `#${note.tags.join(" #")}`;
      card.appendChild(tags);
    }

    card.appendChild(header);
    card.appendChild(body);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "thisnotes-resize";
    resizeHandle.title = "Expandir o comprimir";
    resizeHandle.addEventListener("mousedown", (event) => startResize(event, note.id, card));
    card.appendChild(resizeHandle);

    if (Array.isArray(note.attachments) && note.attachments.length) {
      const attRow = buildAttachmentRow(note.attachments);
      card.insertBefore(attRow, resizeHandle);
      if (note.viewPinHash && !unlockedViewNotes.has(note.id)) {
        attRow.style.display = "none";
        attRow.dataset.pinHidden = "1";
      }
    }

    const lockBtn = buildLockButton(note.id, note.viewPinHash, card, body);
    controls.insertBefore(lockBtn, eyeButton);

    if (note.viewPinHash && !unlockedViewNotes.has(note.id)) {
      mountViewPinOverlay(card, note.id, note.viewPinHash, body);
    }

    root.appendChild(card);

    const pos = notePositions[note.id] || defaultPositionForIndex(index, card);
    applyCardPosition(card, pos.x, pos.y);
    if (Number(pos.w) > 0) {
      card.style.width = `${Math.round(pos.w)}px`;
    }
    if (Number(pos.h) > 0) {
      card.style.height = `${Math.round(pos.h)}px`;
      body.style.maxHeight = `${Math.max(40, Math.round(pos.h) - 86)}px`;
      body.style.overflow = "auto";
    } else {
      body.style.maxHeight = "none";
      body.style.overflow = "visible";
    }
  });

  root.style.display = visibleNotes.length ? "block" : "none";
}

function mountRoot() {
  if (root) {
    return;
  }

  root = document.createElement("aside");
  root.id = "thisnotes-root";
  document.documentElement.appendChild(root);

  const style = document.createElement("style");
  style.textContent = `
    #thisnotes-root {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
    }

    #thisnotes-root .thisnotes-card {
      position: fixed;
      width: min(320px, calc(100vw - 24px));
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 10px;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
      padding: 10px;
      pointer-events: auto;
      color: #1b1b1b;
      animation: thisnotesIn 120ms ease-out;
    }

    #thisnotes-root .thisnotes-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-family: "Segoe UI", sans-serif;
      font-size: 13px;
    }

    #thisnotes-root .thisnotes-controls {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    #thisnotes-root .thisnotes-content {
      margin: 0;
      white-space: pre-wrap;
      border-radius: 4px;
      padding: 2px 4px;
      line-height: 1.4;
    }

    #thisnotes-root .thisnotes-tags {
      display: block;
      margin: 0 0 8px;
      color: #1d4f35;
      font: 600 11px "Segoe UI", sans-serif;
    }

    #thisnotes-root .thisnotes-eye,
    #thisnotes-root .thisnotes-drag,
    #thisnotes-root .thisnotes-copy {
      border: none;
      background: rgba(0, 0, 0, 0.1);
      height: 28px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #111;
      font: 700 14px "Segoe UI", sans-serif;
    }

    #thisnotes-root .thisnotes-drag {
      padding: 0 8px;
    }

    #thisnotes-root .thisnotes-eye {
      width: 28px;
      padding: 0;
    }

    #thisnotes-root .thisnotes-copy {
      padding: 0 8px;
      font-size: 11px;
    }

    #thisnotes-root .thisnotes-resize {
      position: absolute;
      right: 6px;
      bottom: 6px;
      width: 14px;
      height: 14px;
      cursor: nwse-resize;
      background:
        linear-gradient(135deg, transparent 0 45%, rgba(0, 0, 0, 0.35) 45% 55%, transparent 55%),
        linear-gradient(135deg, transparent 0 65%, rgba(0, 0, 0, 0.35) 65% 75%, transparent 75%);
    }

    #thisnotes-root .thisnotes-eye svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    @keyframes thisnotesIn {
      from {
        opacity: 0;
        transform: translateY(-4px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `;
  document.documentElement.appendChild(style);
  injectViewPinOverlayStyles(style);
  injectExtraStyles(style);
  injectExtraStyles(style);
}

async function hideNoteOnSite(noteId) {
  sessionHiddenNotes.add(noteId);
  await saveSessionHiddenNotes();
  await render().catch((err) => console.error(err));
}

async function showNoteOnSite(noteId) {
  sessionHiddenNotes.delete(noteId);
  await saveSessionHiddenNotes();
  await render().catch((err) => console.error(err));
}

function startNoteDrag(event, noteId, card) {
  event.preventDefault();
  const rect = card.getBoundingClientRect();
  dragState = {
    noteId,
    card,
    dx: event.clientX - rect.left,
    dy: event.clientY - rect.top,
  };
  document.addEventListener("mousemove", onNoteDrag);
  document.addEventListener("mouseup", endNoteDrag, { once: true });
}

function onNoteDrag(event) {
  if (!dragState) {
    return;
  }
  const maxX = Math.max(0, window.innerWidth - dragState.card.offsetWidth);
  const maxY = Math.max(0, window.innerHeight - dragState.card.offsetHeight);
  const x = clamp(event.clientX - dragState.dx, 0, maxX);
  const y = clamp(event.clientY - dragState.dy, 0, maxY);
  applyCardPosition(dragState.card, x, y);
}

async function endNoteDrag() {
  document.removeEventListener("mousemove", onNoteDrag);
  if (!dragState) {
    return;
  }

  const { noteId, card } = dragState;
  dragState = null;

  const x = parseFloat(card.style.left) || 0;
  const y = parseFloat(card.style.top) || 0;
  const store = await ext.storage.local.get([STORAGE_LAYOUT]);
  const layout = store[STORAGE_LAYOUT] || {};
  const notePositions = getNotePositions(layout, siteKey);
  const prev = notePositions[noteId] || {};
  notePositions[noteId] = { x, y, w: prev.w, h: prev.h };
  setNotePositions(layout, siteKey, notePositions);
  await ext.storage.local.set({ [STORAGE_LAYOUT]: layout });
}

function startResize(event, noteId, card) {
  event.preventDefault();
  event.stopPropagation();
  const rect = card.getBoundingClientRect();
  resizeState = {
    noteId,
    card,
    startX: event.clientX,
    startY: event.clientY,
    startW: rect.width,
    startH: rect.height,
  };
  document.addEventListener("mousemove", onResizeMove);
  document.addEventListener("mouseup", endResize, { once: true });
}

function onResizeMove(event) {
  if (!resizeState) {
    return;
  }
  const minW = 220;
  const minH = 120;
  const maxW = Math.max(minW, window.innerWidth - 12);
  const maxH = Math.max(minH, window.innerHeight - 12);
  const w = clamp(resizeState.startW + (event.clientX - resizeState.startX), minW, maxW);
  const h = clamp(resizeState.startH + (event.clientY - resizeState.startY), minH, maxH);
  resizeState.card.style.width = `${Math.round(w)}px`;
  resizeState.card.style.height = `${Math.round(h)}px`;
  const body = resizeState.card.querySelector(".thisnotes-content");
  if (body) {
    body.style.maxHeight = `${Math.max(40, Math.round(h) - 86)}px`;
    body.style.overflow = "auto";
  }
}

async function endResize() {
  document.removeEventListener("mousemove", onResizeMove);
  if (!resizeState) {
    return;
  }
  const { noteId, card } = resizeState;
  resizeState = null;

  const x = parseFloat(card.style.left) || 0;
  const y = parseFloat(card.style.top) || 0;
  const w = card.offsetWidth;
  const h = card.offsetHeight;

  const store = await ext.storage.local.get([STORAGE_LAYOUT]);
  const layout = store[STORAGE_LAYOUT] || {};
  const notePositions = getNotePositions(layout, siteKey);
  notePositions[noteId] = { x, y, w, h };
  setNotePositions(layout, siteKey, notePositions);
  await ext.storage.local.set({ [STORAGE_LAYOUT]: layout });
}

function defaultPositionForIndex(index, card) {
  const centerX = Math.max(0, Math.round((window.innerWidth - card.offsetWidth) / 2));
  const centerY = Math.max(0, Math.round((window.innerHeight - card.offsetHeight) / 2));
  const x = clamp(centerX + index * 20, 0, Math.max(0, window.innerWidth - card.offsetWidth));
  const y = clamp(centerY + index * 20, 0, Math.max(0, window.innerHeight - card.offsetHeight));
  return { x, y };
}

function applyCardPosition(card, x, y) {
  const maxX = Math.max(0, window.innerWidth - card.offsetWidth);
  const maxY = Math.max(0, window.innerHeight - card.offsetHeight);
  card.style.left = `${clamp(Number(x) || 0, 0, maxX)}px`;
  card.style.top = `${clamp(Number(y) || 0, 0, maxY)}px`;
}

function normalizeUrlText(value) {
  let output = String(value || "").trim();
  if (!output) {
    return "";
  }
  if ((output.startsWith('"') && output.endsWith('"')) || (output.startsWith("'") && output.endsWith("'"))) {
    output = output.slice(1, -1).trim();
  }
  return output;
}

function normalizeComparableUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function entryLooksLikeUrl(value) {
  return /^(https?|ftp):\/\//i.test(String(value || "").trim());
}

function associationMatchesCurrent(entry, pageUrl, pageHost) {
  const cleaned = normalizeUrlText(entry);
  if (!cleaned) {
    return false;
  }
  if (entryLooksLikeUrl(cleaned)) {
    return normalizeComparableUrl(cleaned) === normalizeComparableUrl(pageUrl);
  }
  return cleaned.toLowerCase() === String(pageHost || "").toLowerCase();
}

function getNotePositions(layout, hostKey) {
  const v2 = layout?.notePositionsByHost;
  if (v2 && typeof v2 === "object" && v2[hostKey] && typeof v2[hostKey] === "object") {
    return { ...v2[hostKey] };
  }
  return {};
}

function setNotePositions(layout, hostKey, positions) {
  if (!layout.notePositionsByHost || typeof layout.notePositionsByHost !== "object") {
    layout.notePositionsByHost = {};
  }
  layout.notePositionsByHost[hostKey] = positions;
}

function eyeIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-6.2 0-10 7-10 7s3.8 7 10 7 10-7 10-7-3.8-7-10-7zm0 11.2A4.2 4.2 0 1 1 12 7.8a4.2 4.2 0 0 1 0 8.4z"/></svg>';
}

function pencilIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.2V21h3.8L18 9.8l-3.8-3.8L3 17.2zm18.4-11.6a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0L16 4l3.8 3.8 1.6-1.6z"/></svg>';
}

function lockClosedIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM12 17a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z"/></svg>';
}

function lockOpenIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8h-1V6A5 5 0 0 0 7 6h2a3 3 0 0 1 6 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>';
}

function buildLockButton(noteId, pinHash, card, bodyEl) {
  const btn = document.createElement("button");
  btn.className = "thisnotes-lock";
  btn.type = "button";

  const isLocked = !!pinHash && !unlockedViewNotes.has(noteId);
  btn.innerHTML = pinHash ? (isLocked ? lockClosedIcon() : lockOpenIcon()) : lockOpenIcon();
  btn.title = pinHash ? "Gestionar PIN de visualizacion" : "Anadir PIN de visualizacion";

  btn.addEventListener("click", () => {
    if (card.querySelector(".thisnotes-pin-manager")) {
      return;
    }
    if (pinHash && !unlockedViewNotes.has(noteId)) {
      return;
    }
    showPinManager(noteId, pinHash, card, btn, bodyEl);
  });

  return btn;
}

function showPinManager(noteId, currentPinHash, card, lockBtn, bodyEl) {
  const existing = card.querySelector(".thisnotes-pin-manager");
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement("div");
  panel.className = "thisnotes-pin-manager";

  const resizeHandle = card.querySelector(".thisnotes-resize");

  if (!currentPinHash) {
    panel.innerHTML = `
      <p class="thisnotes-pm-label">Anadir PIN de visualizacion</p>
      <input class="thisnotes-pm-input" type="password" placeholder="Nuevo PIN (4-20 car.)" autocomplete="off" />
      <input class="thisnotes-pm-input" type="password" placeholder="Confirmar PIN" autocomplete="off" />
    `;
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Guardar PIN";
    saveBtn.className = "thisnotes-pm-btn thisnotes-pm-save";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.className = "thisnotes-pm-btn thisnotes-pm-cancel";
    panel.appendChild(saveBtn);
    panel.appendChild(cancelBtn);

    const inputs = panel.querySelectorAll(".thisnotes-pm-input");

    saveBtn.addEventListener("click", async () => {
      const pin1 = inputs[0].value.trim();
      const pin2 = inputs[1].value.trim();
      if (!pin1 || pin1.length < 4 || pin1.length > 20) {
        inputs[0].placeholder = "PIN: 4-20 caracteres";
        return;
      }
      if (pin1 !== pin2) {
        inputs[1].placeholder = "No coinciden";
        inputs[1].value = "";
        return;
      }
      await updateNoteViewPin(noteId, simpleHash(pin1));
      panel.remove();
      lockBtn.innerHTML = lockClosedIcon();
      lockBtn.title = "Gestionar PIN de visualizacion";
      bodyEl.style.display = "none";
    });
    cancelBtn.addEventListener("click", () => panel.remove());
  } else {
    panel.innerHTML = `<p class="thisnotes-pm-label">Nota desbloqueada. Eliminar PIN?</p>`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Eliminar PIN";
    removeBtn.className = "thisnotes-pm-btn thisnotes-pm-remove";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.className = "thisnotes-pm-btn thisnotes-pm-cancel";
    panel.appendChild(removeBtn);
    panel.appendChild(cancelBtn);

    removeBtn.addEventListener("click", async () => {
      await updateNoteViewPin(noteId, "");
      unlockedViewNotes.delete(noteId);
      panel.remove();
      lockBtn.innerHTML = lockOpenIcon();
      lockBtn.title = "Anadir PIN de visualizacion";
    });
    cancelBtn.addEventListener("click", () => panel.remove());
  }

  card.insertBefore(panel, resizeHandle || null);
}

async function updateNoteViewPin(noteId, newPinHash) {
  const store = await ext.storage.local.get([STORAGE_NOTES]);
  const notes = store[STORAGE_NOTES] || [];
  const updated = notes.map((n) => {
    if (n.id !== noteId) {
      return n;
    }
    return { ...n, viewPinHash: newPinHash, updatedAt: new Date().toISOString() };
  });
  await ext.storage.local.set({ [STORAGE_NOTES]: updated });
}

function startInlineEdit(noteId, card, bodyEl, editBtn) {
  if (card.querySelector(".thisnotes-inline-editor")) {
    return;
  }

  bodyEl.style.display = "none";
  editBtn.style.opacity = "0.4";
  editBtn.disabled = true;

  const textarea = document.createElement("textarea");
  textarea.className = "thisnotes-inline-editor";
  textarea.value = bodyEl.textContent || "";
  textarea.rows = 4;

  const row = document.createElement("div");
  row.className = "thisnotes-inline-row";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Guardar";
  saveBtn.className = "thisnotes-inline-save";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancelar";
  cancelBtn.className = "thisnotes-inline-cancel";

  const finish = () => {
    textarea.remove();
    row.remove();
    bodyEl.style.display = "";
    editBtn.style.opacity = "";
    editBtn.disabled = false;
  };

  saveBtn.addEventListener("click", async () => {
    const newContent = textarea.value;
    const store = await ext.storage.local.get([STORAGE_NOTES]);
    const notes = store[STORAGE_NOTES] || [];
    const updated = notes.map((n) => {
      if (n.id !== noteId) {
        return n;
      }
      return { ...n, content: newContent, updatedAt: new Date().toISOString() };
    });
    await ext.storage.local.set({ [STORAGE_NOTES]: updated });
  });

  cancelBtn.addEventListener("click", finish);

  row.appendChild(saveBtn);
  row.appendChild(cancelBtn);
  card.insertBefore(textarea, card.querySelector(".thisnotes-resize") || null);
  card.insertBefore(row, card.querySelector(".thisnotes-resize") || null);
  textarea.focus();
}

function buildAttachmentRow(attachments) {
  const row = document.createElement("div");
  row.className = "thisnotes-attachments";

  attachments.forEach((att) => {
    const wrap = document.createElement("div");
    wrap.className = "thisnotes-att-wrap";

    const thumb = document.createElement("img");
    thumb.src = att.dataUrl;
    thumb.alt = att.name || "adjunto";
    thumb.className = "thisnotes-att-thumb";
    thumb.title = att.name || "Adjunto";

    thumb.addEventListener("click", () => openLightbox(att));

    wrap.appendChild(thumb);
    row.appendChild(wrap);
  });

  return row;
}

function openLightbox(att) {
  const overlay = document.createElement("div");
  overlay.className = "thisnotes-lightbox";

  const img = document.createElement("img");
  img.src = att.dataUrl;
  img.alt = att.name || "adjunto";
  img.className = "thisnotes-lightbox-img";

  const dlBtn = document.createElement("a");
  dlBtn.href = att.dataUrl;
  dlBtn.download = att.name || "adjunto.png";
  dlBtn.textContent = "Descargar";
  dlBtn.className = "thisnotes-lightbox-dl";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.className = "thisnotes-lightbox-close";
  closeBtn.addEventListener("click", () => overlay.remove());

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  overlay.appendChild(closeBtn);
  overlay.appendChild(img);
  overlay.appendChild(dlBtn);
  document.documentElement.appendChild(overlay);
}

function ensureReadableTextColor(desiredColor, backgroundColor, noteColor) {
  const desired = colorToRgb(desiredColor);
  const background = colorToRgb(backgroundColor);
  const note = colorToRgb(noteColor || backgroundColor);

  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };

  // Siempre usar el color deseado del usuario
  const finalColor = desiredColor || "#111111";

  if (!desired || !background) {
    return {
      color: finalColor,
      shadow: "-1px -1px 0 #ffffff, 1px -1px 0 #ffffff, -1px 1px 0 #ffffff, 1px 1px 0 #ffffff",
    };
  }

  // Verificar contraste entre el color deseado y el fondo
  const hasGoodContrast = contrastRatio(desired, background) >= 3.2;
  
  if (hasGoodContrast) {
    // Si hay buen contraste, no es necesaria sombra
    return {
      color: finalColor,
      shadow: "none",
    };
  }

  // Si NO hay buen contraste, necesita sombra para legibilidad
  const isTextDark = relativeLuminance(desired) < 0.18;
  let shadowColor = isTextDark ? "#ffffff" : "#000000";
  
  // Si el texto es oscuro y la nota no es blanca ni negra, usa el color de la nota
  if (isTextDark && note) {
    const noteLum = relativeLuminance(note);
    const noteIsNotWhite = noteLum < 0.9;
    const noteIsNotBlack = noteLum > 0.1;
    if (noteIsNotWhite && noteIsNotBlack) {
      shadowColor = noteColor;
    }
  }
  // Si el texto es claro y la nota no es blanca ni negra, usa el color de la nota
  else if (!isTextDark && note) {
    const noteLum = relativeLuminance(note);
    const noteIsNotWhite = noteLum < 0.9;
    const noteIsNotBlack = noteLum > 0.1;
    if (noteIsNotWhite && noteIsNotBlack) {
      shadowColor = noteColor;
    }
  }

  return {
    color: finalColor,
    shadow: `-1px -1px 0 ${shadowColor}, 1px -1px 0 ${shadowColor}, -1px 1px 0 ${shadowColor}, 1px 1px 0 ${shadowColor}`,
  };
}

function colorToRgb(color) {
  const probe = document.createElement("span");
  probe.style.color = color;
  probe.style.display = "none";
  document.documentElement.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) {
    return null;
  }
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const top = Math.max(l1, l2);
  const bottom = Math.min(l1, l2);
  return (top + 0.05) / (bottom + 0.05);
}

function relativeLuminance(rgb) {
  const srgb = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * srgb[0]) + (0.7152 * srgb[1]) + (0.0722 * srgb[2]);
}

function simpleHash(text) {
  return btoa(unescape(encodeURIComponent(text))).split("").reverse().join("");
}

function mountViewPinOverlay(card, noteId, pinHash, contentEl) {
  const overlay = document.createElement("div");
  overlay.className = "thisnotes-pin-overlay";

  const lockIcon = document.createElement("div");
  lockIcon.className = "thisnotes-pin-icon";
  lockIcon.textContent = "🔒";

  const label = document.createElement("p");
  label.textContent = "Nota protegida con PIN";
  label.className = "thisnotes-pin-label";

  const input = document.createElement("input");
  input.type = "password";
  input.placeholder = "Introduce PIN";
  input.className = "thisnotes-pin-input";
  input.autocomplete = "off";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Ver nota";
  btn.className = "thisnotes-pin-btn";

  const errMsg = document.createElement("p");
  errMsg.className = "thisnotes-pin-err";
  errMsg.hidden = true;
  errMsg.textContent = "PIN incorrecto";

  const tryUnlock = () => {
    const entered = input.value.trim();
    if (!entered) {
      return;
    }
    if (simpleHash(entered) === pinHash) {
      unlockedViewNotes.add(noteId);
      overlay.remove();
      contentEl.style.display = "";
      const hiddenAtts = card.querySelectorAll("[data-pin-hidden]");
      hiddenAtts.forEach((el) => {
        el.style.display = "";
        el.removeAttribute("data-pin-hidden");
      });
      const lockBtn = card.querySelector(".thisnotes-lock");
      if (lockBtn) {
        lockBtn.innerHTML = lockOpenIcon();
        lockBtn.title = "Gestionar PIN de visualizacion";
      }
    } else {
      errMsg.hidden = false;
      input.value = "";
      input.focus();
    }
  };

  btn.addEventListener("click", tryUnlock);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      tryUnlock();
    }
  });

  contentEl.style.display = "none";
  overlay.appendChild(lockIcon);
  overlay.appendChild(label);
  overlay.appendChild(input);
  overlay.appendChild(btn);
  overlay.appendChild(errMsg);

  const forgotBtn = document.createElement("button");
  forgotBtn.type = "button";
  forgotBtn.textContent = "Olvide el PIN — Eliminar nota";
  forgotBtn.className = "thisnotes-pin-forgot";
  forgotBtn.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "No puedes ver el contenido sin el PIN. ¿Eliminar la nota de todas formas?\n\nPodras recuperarla desde Configuracion durante 24 horas."
    );
    if (!confirmed) {
      return;
    }
    const store = await ext.storage.local.get([STORAGE_NOTES, STORAGE_TRASH]);
    const allNotes = store[STORAGE_NOTES] || [];
    const target = allNotes.find((n) => n.id === noteId);
    if (!target) {
      return;
    }
    const trash = (store[STORAGE_TRASH] || []).filter(
      (n) => Date.now() - new Date(n.deletedAt).getTime() < 24 * 3600 * 1000
    );
    trash.unshift({ ...target, deletedAt: new Date().toISOString() });
    const updated = allNotes.filter((n) => n.id !== noteId);
    await ext.storage.local.set({ [STORAGE_NOTES]: updated, [STORAGE_TRASH]: trash });
    card.remove();
  });
  overlay.appendChild(forgotBtn);

  card.appendChild(overlay);
}

function injectViewPinOverlayStyles(style) {
  style.textContent += `
    #thisnotes-root .thisnotes-pin-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 12px 8px;
    }

    #thisnotes-root .thisnotes-pin-icon {
      font-size: 28px;
      line-height: 1;
    }

    #thisnotes-root .thisnotes-pin-label {
      margin: 0;
      font: 600 12px "Segoe UI", sans-serif;
      opacity: 0.8;
    }

    #thisnotes-root .thisnotes-pin-input {
      width: 100%;
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      padding: 6px 8px;
      font: 14px "Segoe UI", sans-serif;
      text-align: center;
      background: rgba(255, 255, 255, 0.8);
    }

    #thisnotes-root .thisnotes-pin-btn {
      border: none;
      background: #173b2d;
      color: #fff;
      border-radius: 8px;
      padding: 6px 14px;
      cursor: pointer;
      font: 600 13px "Segoe UI", sans-serif;
    }

    #thisnotes-root .thisnotes-pin-err {
      margin: 0;
      font: 12px "Segoe UI", sans-serif;
      color: #b00020;
    }

    #thisnotes-root .thisnotes-pin-forgot {
      border: none;
      background: none;
      color: #7a3030;
      font: 11px "Segoe UI", sans-serif;
      cursor: pointer;
      text-decoration: underline;
      padding: 0;
      margin-top: 4px;
    }
  `;
}

function injectExtraStyles(style) {
  style.textContent += `
    #thisnotes-root .thisnotes-edit {
      width: 28px;
      padding: 0;
      border: none;
      background: rgba(0, 0, 0, 0.1);
      height: 28px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #111;
    }

    #thisnotes-root .thisnotes-edit svg {
      width: 15px;
      height: 15px;
      fill: currentColor;
    }

    #thisnotes-root .thisnotes-inline-editor {
      width: 100%;
      border: 1px solid rgba(0, 0, 0, 0.25);
      border-radius: 8px;
      padding: 7px;
      font: 14px "Segoe UI", sans-serif;
      resize: vertical;
      margin-bottom: 6px;
      background: rgba(255, 255, 255, 0.8);
    }

    #thisnotes-root .thisnotes-inline-row {
      display: flex;
      gap: 6px;
      margin-bottom: 6px;
    }

    #thisnotes-root .thisnotes-inline-save,
    #thisnotes-root .thisnotes-inline-cancel {
      border: none;
      border-radius: 8px;
      padding: 5px 10px;
      cursor: pointer;
      font: 600 12px "Segoe UI", sans-serif;
    }

    #thisnotes-root .thisnotes-inline-save {
      background: #173b2d;
      color: #fff;
    }

    #thisnotes-root .thisnotes-inline-cancel {
      background: rgba(0, 0, 0, 0.1);
      color: #111;
    }

    #thisnotes-root .thisnotes-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 6px 0 4px;
      max-height: 36px;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 2px;
    }

    #thisnotes-root .thisnotes-att-wrap {
      position: relative;
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid rgba(0, 0, 0, 0.2);
      cursor: pointer;
    }

    #thisnotes-root .thisnotes-att-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .thisnotes-lightbox {
      position: fixed;
      inset: 0;
      z-index: 2147483648;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }

    .thisnotes-lightbox-img {
      max-width: 90vw;
      max-height: 80vh;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .thisnotes-lightbox-dl {
      color: #fff;
      background: #173b2d;
      border-radius: 8px;
      padding: 8px 16px;
      text-decoration: none;
      font: 600 13px "Segoe UI", sans-serif;
    }

    .thisnotes-lightbox-close {
      position: absolute;
      top: 14px;
      right: 14px;
      border: none;
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
      font-size: 20px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #thisnotes-root .thisnotes-lock {
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      background: rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #111;
    }

    #thisnotes-root .thisnotes-lock svg {
      width: 15px;
      height: 15px;
      fill: currentColor;
    }

    #thisnotes-root .thisnotes-pin-manager {
      margin: 6px 0 4px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.06);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    #thisnotes-root .thisnotes-pm-label {
      margin: 0;
      font: 600 12px "Segoe UI", sans-serif;
    }

    #thisnotes-root .thisnotes-pm-input {
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      padding: 6px 8px;
      font: 13px "Segoe UI", sans-serif;
      background: rgba(255, 255, 255, 0.8);
      width: 100%;
    }

    #thisnotes-root .thisnotes-pm-btn {
      border: none;
      border-radius: 8px;
      padding: 5px 10px;
      cursor: pointer;
      font: 600 12px "Segoe UI", sans-serif;
    }

    #thisnotes-root .thisnotes-pm-save,
    #thisnotes-root .thisnotes-pm-remove {
      background: #173b2d;
      color: #fff;
    }

    #thisnotes-root .thisnotes-pm-cancel {
      background: rgba(0, 0, 0, 0.1);
      color: #111;
    }
  `;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

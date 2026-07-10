const ext = globalThis.browser || globalThis.chrome;

const STORAGE_NOTES = "thisnotes.notes";
const STORAGE_PREFS = "thisnotes.displayPrefs";
const STORAGE_SECURITY = "thisnotes.security";
const STORAGE_SYNC_PREF = "thisnotes.syncPref";
const STORAGE_SYNC_NOTES = "thisnotes.sync.notes";
const STORAGE_SYNC_UPDATED_AT = "thisnotes.sync.updatedAt";
const STORAGE_DRAFTS = "thisnotes.draftsByTab";
const STORAGE_TRASH = "thisnotes.trash";

const defaultStyle = {
  noteColor: "#fff2a8",
  textColor: "#1d1d1d",
  fontFamily: "Segoe UI",
  fontSize: 14,
  textBackgroundColor: "#ffffff",
  italic: false,
  underline: false,
};

let activeSite = "";
let activeHost = "";
let activeTabId = null;
let notes = [];
let lockConfig = { enabled: false, pinHash: "" };
let unlocked = false;
let skipDeleteConfirm = false;
let deleteModalResolve = null;
let pendingAttachments = [];

const fontCatalog = [
  "Arial",
  "Arial Black",
  "Calibri",
  "Cambria",
  "Candara",
  "Comic Sans MS",
  "Consolas",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Impact",
  "Lucida Sans Unicode",
  "Palatino Linotype",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "system-ui",
  "serif",
  "sans-serif",
  "monospace",
];

const icons = {
  eyeOpen:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-6.2 0-10 7-10 7s3.8 7 10 7 10-7 10-7-3.8-7-10-7zm0 11.2A4.2 4.2 0 1 1 12 7.8a4.2 4.2 0 0 1 0 8.4z"/></svg>',
  eyeClosed:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.3 2 2 3.3l3 3A14.2 14.2 0 0 0 2 12s3.8 7 10 7a9.8 9.8 0 0 0 5.1-1.4l3.6 3.6 1.3-1.3L3.3 2zM12 16.2a4.2 4.2 0 0 1-4.2-4.2c0-.8.2-1.5.6-2.1l5.7 5.7c-.6.4-1.3.6-2.1.6zm9.2-4.2s-1.4 2.5-3.9 4.3l-1.5-1.5a6 6 0 0 0-6.7-6.7L7.3 6.3A10.7 10.7 0 0 1 12 5c6.2 0 10 7 10 7z"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H10V7h9v14z"/></svg>',
  edit:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.2V21h3.8L18 9.8l-3.8-3.8L3 17.2zm18.4-11.6c.5-.5.5-1.3 0-1.8L20.2 2.6a1.3 1.3 0 0 0-1.8 0L17 4l3.8 3.8 1.6-1.2z"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v2H5v-2zm7-18 5 5h-3v6h-4V7H7l5-5z"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 14H7L6 7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>',
  undo:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.7 9h2.1A5 5 0 1 0 12 7h-2.3l2.8 2.8-1.4 1.4L6 6l5.1-5.2 1.4 1.4L9.7 5H12z"/></svg>',
};

init().catch((err) => console.error(err));

async function init() {
  wireEvents();
  initFontSelector();
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  activeTabId = typeof tab?.id === "number" ? tab.id : null;
  activeSite = getPageUrlKey(tab?.url);
  activeHost = getHostFromUrl(activeSite);
  document.getElementById("siteLabel").textContent = activeSite
    ? `Web activa: ${activeSite}`
    : "No disponible para esta pestana";
  await refresh();
}

function wireEvents() {
  document.getElementById("noteForm").addEventListener("submit", onSave);
  document.getElementById("resetBtn").addEventListener("click", resetForm);
  document.getElementById("openOptions").addEventListener("click", () => {
    ext.runtime.openOptionsPage();
  });
  document.getElementById("exportSiteBtn").addEventListener("click", exportSiteNotes);
  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", importNotes);
  document.getElementById("unlockBtn").addEventListener("click", unlockWithPin);
  document.getElementById("reloadTabBtn").addEventListener("click", reloadCurrentTab);
  document.getElementById("attachInput").addEventListener("change", onAttachFiles);
  document.getElementById("deleteModalCancel").addEventListener("click", () => {
    if (deleteModalResolve) deleteModalResolve(false);
  });
  document.getElementById("deleteModalConfirm").addEventListener("click", () => {
    if (document.getElementById("skipConfirmCheck").checked) {
      skipDeleteConfirm = true;
    }
    if (deleteModalResolve) deleteModalResolve(true);
  });
  document.getElementById("removePinBtn").addEventListener("click", removePinFromNote);
  const draftFields = [
    "title",
    "content",
    "websites",
    "tags",
    "noteColor",
    "textColor",
    "fontFamily",
    "fontSize",
    "textBackgroundColor",
    "italic",
    "underline",
  ];
  draftFields.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    const eventName = el.tagName === "SELECT" || el.type === "checkbox" || el.type === "color" ? "change" : "input";
    el.addEventListener(eventName, queueDraftSave);
  });
}

function initFontSelector() {
  renderFontOptions(fontCatalog);
  ensureFontInSelector(defaultStyle.fontFamily);
}

function renderFontOptions(options) {
  const select = document.getElementById("fontFamily");
  const current = String(select.value || "");
  select.innerHTML = "";
  options.forEach((font) => {
    const option = document.createElement("option");
    option.value = font;
    option.textContent = font;
    option.style.fontFamily = font;
    select.appendChild(option);
  });
  if (current && options.includes(current)) {
    select.value = current;
  } else if (options.length) {
    select.value = options[0];
  }
}

function ensureFontInSelector(fontName) {
  const select = document.getElementById("fontFamily");
  const options = Array.from(select.options).map((opt) => opt.value);
  if (!options.includes(fontName)) {
    const option = document.createElement("option");
    option.value = fontName;
    option.textContent = `${fontName} (personalizada)`;
    option.style.fontFamily = fontName;
    select.appendChild(option);
  }
  select.value = fontName;
}

async function refresh() {
  const store = await ext.storage.local.get([STORAGE_NOTES, STORAGE_SECURITY]);
  notes = store[STORAGE_NOTES] || [];
  lockConfig = {
    enabled: !!store[STORAGE_SECURITY]?.enabled,
    pinHash: String(store[STORAGE_SECURITY]?.pinHash || ""),
  };
  refreshLockUi();
  renderList();
  setDefaultWeb();
  await restoreDraft();
}

function refreshLockUi() {
  const lockPanel = document.getElementById("lockPanel");
  const blocked = lockConfig.enabled && !unlocked;
  lockPanel.hidden = !blocked;

  const ids = [
    "saveBtn",
    "resetBtn",
    "importBtn",
    "exportSiteBtn",
    "title",
    "content",
    "websites",
    "tags",
    "noteColor",
    "textColor",
    "fontFamily",
    "fontSize",
    "textBackgroundColor",
    "italic",
    "underline",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = blocked;
    }
  });
}

async function unlockWithPin() {
  const pin = String(document.getElementById("unlockPin").value || "").trim();
  if (!pin) {
    alert("Introduce PIN.");
    return;
  }
  if (simpleHash(pin) !== lockConfig.pinHash) {
    alert("PIN incorrecto.");
    return;
  }
  unlocked = true;
  document.getElementById("unlockPin").value = "";
  refreshLockUi();
}

function canMutate() {
  return !lockConfig.enabled || unlocked;
}

function requireUnlocked() {
  if (canMutate()) {
    return true;
  }
  alert("Debes desbloquear con PIN.");
  return false;
}

function getPageUrlKey(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || parsed.protocol.startsWith("chrome") || parsed.protocol.startsWith("moz")) {
      return "";
    }
    parsed.hash = "";
    parsed.search = "";
    return normalizeComparableUrl(parsed.toString());
  } catch {
    return "";
  }
}

function parseCsvQuoted(raw) {
  const text = String(raw || "");
  const values = [];
  let token = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(token.trim());
      token = "";
      continue;
    }
    token += ch;
  }
  values.push(token.trim());

  return values.filter(Boolean);
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

function getHostFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
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

function associationMatchesCurrent(entry, currentUrl, currentHost) {
  const cleaned = normalizeUrlText(entry);
  if (!cleaned) {
    return false;
  }
  if (entryLooksLikeUrl(cleaned)) {
    const left = normalizeComparableUrl(cleaned);
    const right = normalizeComparableUrl(currentUrl);
    return left && right && left === right;
  }
  return cleaned.toLowerCase() === String(currentHost || "").toLowerCase();
}

function normalizeWebsites(raw) {
  const parsed = parseCsvQuoted(raw)
    .map((item) => normalizeUrlText(item))
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const item of parsed) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function normalizeTags(raw) {
  const parsed = parseCsvQuoted(raw)
    .map((item) => normalizeUrlText(item).toLowerCase())
    .filter(Boolean);
  return [...new Set(parsed)];
}

function formatCsvQuoted(values) {
  return (values || []).map((value) => `"${String(value).replace(/"/g, "")}"`).join(", ");
}

function setDefaultWeb() {
  const websitesInput = document.getElementById("websites");
  if (!websitesInput.value && activeSite) {
    websitesInput.value = formatCsvQuoted([activeSite]);
  }
}

function getSiteNotes() {
  return notes.filter((n) => (n.websites || []).some((entry) => associationMatchesCurrent(entry, activeSite, activeHost)));
}

function isVisibleOnSite(note) {
  const map = note.siteVisibility || {};
  const normalizedActive = normalizeComparableUrl(activeSite);
  if (Object.prototype.hasOwnProperty.call(map, normalizedActive)) {
    return !!map[normalizedActive];
  }
  if (Object.prototype.hasOwnProperty.call(map, activeSite)) {
    return !!map[activeSite];
  }
  if (Object.prototype.hasOwnProperty.call(map, activeHost)) {
    return !!map[activeHost];
  }
  return true;
}

function renderList() {
  const list = document.getElementById("notesList");
  list.innerHTML = "";

  if (!activeSite) {
    list.innerHTML = '<p class="empty">Abre una web normal para gestionar notas.</p>';
    return;
  }

  const siteNotes = getSiteNotes();
  if (!siteNotes.length) {
    list.innerHTML = '<p class="empty">No hay notas para esta web.</p>';
    return;
  }

  const tpl = document.getElementById("noteItemTemplate");
  for (const note of siteNotes) {
    const frag = tpl.content.cloneNode(true);
    frag.querySelector(".noteTitle").textContent = note.title || "Sin titulo";
    frag.querySelector(".noteMeta").textContent = `Actualizada: ${new Date(note.updatedAt).toLocaleString()}`;
    frag.querySelector(".noteSnippet").textContent = (note.content || "").slice(0, 140);
    frag.querySelector(".noteTags").textContent = (note.tags || []).length
      ? `Tags: ${(note.tags || []).join(", ")}`
      : "";
    frag.querySelector(".noteShowOnAccess").textContent = note.showOnAccess
      ? "Visualizar al acceder: si"
      : "";

    const eye = frag.querySelector(".toggleVisibility");
    const visible = isVisibleOnSite(note);
    eye.innerHTML = visible ? icons.eyeOpen : icons.eyeClosed;

    frag.querySelector(".copyNote").innerHTML = icons.copy;
    frag.querySelector(".exportNote").innerHTML = icons.download;
    frag.querySelector(".editNote").innerHTML = icons.edit;
    frag.querySelector(".deleteNote").innerHTML = icons.trash;

    const undo = document.createElement("button");
    undo.className = "iconBtn undoNote";
    undo.type = "button";
    undo.title = "Deshacer ultimo cambio";
    undo.innerHTML = icons.undo;
    undo.disabled = !Array.isArray(note.versions) || !note.versions.length;
    frag.querySelector(".noteHead .row").appendChild(undo);

    eye.addEventListener("click", () => toggleNoteVisibility(note.id));
    frag.querySelector(".copyNote").addEventListener("click", () => copyNote(note.id));
    frag.querySelector(".exportNote").addEventListener("click", () => exportSingleNote(note.id));
    frag.querySelector(".editNote").addEventListener("click", () => loadNoteToForm(note.id));
    frag.querySelector(".deleteNote").addEventListener("click", () => deleteNote(note.id));
    undo.addEventListener("click", () => undoLastVersion(note.id));

    list.appendChild(frag);
  }
}

async function onSave(event) {
  event.preventDefault();
  if (!requireUnlocked()) {
    return;
  }
  if (!activeSite) {
    alert("No puedes crear notas en esta pagina.");
    return;
  }

  const noteId = document.getElementById("noteId").value;
  const websites = normalizeWebsites(document.getElementById("websites").value || activeSite);
  const tags = normalizeTags(document.getElementById("tags").value);

  if (!websites.length) {
    alert("Debes asociar al menos una web.");
    return;
  }

  const viewPinRaw = document.getElementById("viewPin").value.trim();
  const viewPinConfirm = document.getElementById("viewPinConfirm").value.trim();

  if (viewPinRaw && viewPinRaw !== viewPinConfirm) {
    alert("Los PINs de visualizacion no coinciden.");
    return;
  }
  if (viewPinRaw && (viewPinRaw.length < 4 || viewPinRaw.length > 20)) {
    alert("El PIN de visualizacion debe tener entre 4 y 20 caracteres.");
    return;
  }

  const now = new Date().toISOString();
  const payload = {
    title: document.getElementById("title").value.trim(),
    content: document.getElementById("content").value,
    websites,
    tags,
    style: {
      noteColor: document.getElementById("noteColor").value,
      textColor: document.getElementById("textColor").value,
      fontFamily: document.getElementById("fontFamily").value || defaultStyle.fontFamily,
      fontSize: Number(document.getElementById("fontSize").value) || defaultStyle.fontSize,
      textBackgroundColor: document.getElementById("textBackgroundColor").value,
      italic: document.getElementById("italic").checked,
      underline: document.getElementById("underline").checked,
    },
    viewPinHash: viewPinRaw
      ? simpleHash(viewPinRaw)
      : (noteId ? (notes.find((n) => n.id === noteId)?.viewPinHash || "") : ""),
    pinRecovered: viewPinRaw
      ? false
      : (noteId ? (notes.find((n) => n.id === noteId)?.pinRecovered ?? false) : false),
    showOnAccess: !!document.getElementById("showOnAccess").checked,
    attachments: buildFinalAttachments(noteId),
  };

  if (!payload.content.trim()) {
    alert("El contenido no puede estar vacio.");
    return;
  }

  if (noteId) {
    notes = notes.map((note) => {
      if (note.id !== noteId) {
        return note;
      }
      const history = [
        snapshotVersion(note),
        ...(Array.isArray(note.versions) ? note.versions : []),
      ].slice(0, 20);
      return {
        ...note,
        ...payload,
        versions: history,
        updatedAt: now,
      };
    });
  } else {
    notes.unshift({
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      siteVisibility: {
        [activeSite]: true,
        ...(activeHost ? { [activeHost]: true } : {}),
      },
      versions: [],
      ...payload,
    });
  }

  await saveNotes();
  await clearDraft();
  resetForm();
}

function resetForm() {
  document.getElementById("noteForm").reset();
  document.getElementById("noteId").value = "";
  document.getElementById("noteColor").value = defaultStyle.noteColor;
  document.getElementById("textColor").value = defaultStyle.textColor;
  ensureFontInSelector(defaultStyle.fontFamily);
  document.getElementById("fontSize").value = String(defaultStyle.fontSize);
  document.getElementById("textBackgroundColor").value = defaultStyle.textBackgroundColor;
  document.getElementById("viewPin").value = "";
  document.getElementById("viewPinConfirm").value = "";
  document.getElementById("showOnAccess").checked = false;
  document.getElementById("formTitle").textContent = "Crear nota";
  setDefaultWeb();
  setPinSectionMode(false);
  pendingAttachments = [];
  renderAttachPreview([]);
  queueDraftSave();
}

function loadNoteToForm(id) {
  const note = notes.find((n) => n.id === id);
  if (!note) {
    return;
  }

  document.getElementById("noteId").value = note.id;
  document.getElementById("title").value = note.title || "";
  document.getElementById("content").value = note.content || "";
  document.getElementById("websites").value = formatCsvQuoted(note.websites || []);
  document.getElementById("tags").value = formatCsvQuoted(note.tags || []);
  document.getElementById("noteColor").value = note.style?.noteColor || defaultStyle.noteColor;
  document.getElementById("textColor").value = note.style?.textColor || defaultStyle.textColor;
  ensureFontInSelector(note.style?.fontFamily || defaultStyle.fontFamily);
  document.getElementById("fontSize").value = String(note.style?.fontSize || defaultStyle.fontSize);
  document.getElementById("textBackgroundColor").value = note.style?.textBackgroundColor || defaultStyle.textBackgroundColor;
  document.getElementById("italic").checked = !!note.style?.italic;
  document.getElementById("underline").checked = !!note.style?.underline;
  document.getElementById("showOnAccess").checked = !!note.showOnAccess;
  document.getElementById("viewPin").value = "";
  document.getElementById("viewPinConfirm").value = "";
  document.getElementById("formTitle").textContent = "Editar nota";
  setPinSectionMode(!!note.viewPinHash);
  pendingAttachments = [];
  renderAttachPreview(note.attachments || []);
  queueDraftSave();
}

function setPinSectionMode(hasPin) {
  document.getElementById("pinNewSection").hidden = hasPin;
  document.getElementById("pinExistingSection").hidden = !hasPin;
  document.getElementById("removePinCurrent").value = "";
}

async function removePinFromNote() {
  const noteId = document.getElementById("noteId").value;
  if (!noteId) {
    return;
  }
  const note = notes.find((n) => n.id === noteId);
  if (!note?.viewPinHash) {
    return;
  }
  const entered = document.getElementById("removePinCurrent").value.trim();
  if (!entered) {
    alert("Introduce el PIN actual para eliminarlo.");
    return;
  }
  if (simpleHash(entered) !== note.viewPinHash) {
    alert("PIN incorrecto.");
    return;
  }
  notes = notes.map((n) => {
    if (n.id !== noteId) return n;
    return { ...n, viewPinHash: "", updatedAt: new Date().toISOString() };
  });
  await saveNotes();
  setPinSectionMode(false);
  alert("PIN eliminado.");
}

async function toggleNoteVisibility(id) {
  if (!requireUnlocked()) {
    return;
  }
  let toggledToVisible = false;
  notes = notes.map((note) => {
    if (note.id !== id) {
      return note;
    }
    const map = { ...(note.siteVisibility || {}) };
    const newValue = !isVisibleOnSite(note);
    toggledToVisible = newValue;
    map[normalizeComparableUrl(activeSite)] = newValue;
    map[activeSite] = newValue;
    if (activeHost) {
      map[activeHost] = newValue;
    }
    return { ...note, siteVisibility: map, updatedAt: new Date().toISOString() };
  });

  await saveNotes();
  if (toggledToVisible) {
    await notifyActiveTab(true);
  }
}

async function copyNote(id) {
  if (!requireUnlocked()) {
    return;
  }
  const note = notes.find((n) => n.id === id);
  if (!note) {
    return;
  }

  const text = note.content || "";

  await navigator.clipboard.writeText(text);
}

function exportSingleNote(id) {
  if (!requireUnlocked()) {
    return;
  }
  const note = notes.find((n) => n.id === id);
  if (!note) {
    return;
  }
  downloadJSON(`thisnotes-${id}.json`, { notes: [note], exportedAt: new Date().toISOString() });
}

function exportSiteNotes() {
  if (!requireUnlocked()) {
    return;
  }
  const siteNotes = getSiteNotes();
  if (!siteNotes.length) {
    alert("No hay notas para exportar.");
    return;
  }
  downloadJSON(`thisnotes-${activeSite}.json`, {
    site: activeSite,
    notes: siteNotes,
    exportedAt: new Date().toISOString(),
  });
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function importNotes(event) {
  if (!requireUnlocked()) {
    event.target.value = "";
    return;
  }

  const [file] = event.target.files || [];
  event.target.value = "";
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = Array.isArray(parsed) ? parsed : parsed.notes;

    if (!Array.isArray(incoming)) {
      throw new Error("Formato no valido");
    }

    const now = new Date().toISOString();
    for (const candidate of incoming) {
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      if (!String(candidate.content || "").trim()) {
        continue;
      }

      notes.unshift({
        id: crypto.randomUUID(),
        createdAt: candidate.createdAt || now,
        updatedAt: now,
        title: String(candidate.title || ""),
        content: String(candidate.content || ""),
        tags: normalizeTags(
          Array.isArray(candidate.tags) ? candidate.tags.join(",") : String(candidate.tags || "")
        ),
        websites: Array.isArray(candidate.websites) && candidate.websites.length
          ? normalizeWebsites(candidate.websites.join(","))
          : [activeSite],
        style: { ...defaultStyle, ...(candidate.style || {}) },
        versions: Array.isArray(candidate.versions) ? candidate.versions.slice(0, 20) : [],
        siteVisibility: typeof candidate.siteVisibility === "object" && candidate.siteVisibility
          ? candidate.siteVisibility
          : {
            [activeSite]: true,
            ...(activeHost ? { [activeHost]: true } : {}),
          },
      });
    }

    await saveNotes();
  } catch {
    alert("No se pudo importar el archivo.");
  }
}

async function deleteNote(id) {
  if (!requireUnlocked()) {
    return;
  }
  const note = notes.find((n) => n.id === id);
  if (!note) {
    return;
  }

  if (!skipDeleteConfirm) {
    const ok = await showDeleteModal(note.title || "Sin titulo");
    if (!ok) {
      return;
    }
  }

  notes = notes.filter((n) => n.id !== id);
  await softDeleteNotes([note]);
  await saveNotes();
}

async function softDeleteNotes(deletedArray) {
  const store = await ext.storage.local.get([STORAGE_TRASH]);
  const trash = (store[STORAGE_TRASH] || []).filter(
    (n) => Date.now() - new Date(n.deletedAt).getTime() < 24 * 3600 * 1000
  );
  const now = new Date().toISOString();
  for (const note of deletedArray) {
    trash.unshift({ ...note, deletedAt: now });
  }
  await ext.storage.local.set({ [STORAGE_TRASH]: trash });
}

function showDeleteModal(noteTitle) {
  return new Promise((resolve) => {
    deleteModalResolve = (result) => {
      deleteModalResolve = null;
      document.getElementById("deleteModal").hidden = true;
      resolve(result);
    };
    document.getElementById("deleteModalMsg").textContent =
      `Seguro que quieres eliminar la nota "${noteTitle}"?`;
    document.getElementById("skipConfirmCheck").checked = false;
    document.getElementById("deleteModal").hidden = false;
  });
}

async function undoLastVersion(id) {
  if (!requireUnlocked()) {
    return;
  }
  notes = notes.map((note) => {
    if (note.id !== id || !Array.isArray(note.versions) || !note.versions.length) {
      return note;
    }
    const [previous, ...rest] = note.versions;
    return {
      ...note,
      title: previous.title,
      content: previous.content,
      websites: previous.websites,
      tags: previous.tags,
      style: previous.style,
      versions: rest,
      updatedAt: new Date().toISOString(),
    };
  });
  await saveNotes();
}

function snapshotVersion(note) {
  return {
    title: String(note.title || ""),
    content: String(note.content || ""),
    websites: Array.isArray(note.websites) ? [...note.websites] : [],
    tags: Array.isArray(note.tags) ? [...note.tags] : [],
    style: { ...defaultStyle, ...(note.style || {}) },
    updatedAt: note.updatedAt || new Date().toISOString(),
  };
}

async function saveNotes() {
  await ext.storage.local.set({ [STORAGE_NOTES]: notes });
  await maybeSyncPush();
  await refresh();
  await notifyActiveTab(false);
}

async function maybeSyncPush() {
  const conf = await ext.storage.local.get([STORAGE_SYNC_PREF]);
  const enabled = !!conf[STORAGE_SYNC_PREF]?.enabled;
  if (!enabled || !ext.storage.sync) {
    return;
  }
  try {
    await ext.storage.sync.set({
      [STORAGE_SYNC_NOTES]: notes,
      [STORAGE_SYNC_UPDATED_AT]: new Date().toISOString(),
    });
  } catch {
    // Si excede cuota de sync, se mantiene solo local.
  }
}

async function notifyActiveTab(openPanel = false) {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    toggleReloadPanel(false);
    return;
  }

  try {
    await ext.tabs.sendMessage(tab.id, { type: "THISNOTES_REFRESH" });
    if (openPanel) {
      await ext.tabs.sendMessage(tab.id, { type: "THISNOTES_OPEN_PANEL" });
    }
    toggleReloadPanel(false);
  } catch {
    const recovered = await tryInjectAndNotify(tab.id, openPanel);
    toggleReloadPanel(!recovered);
  }
}

async function tryInjectAndNotify(tabId, openPanel) {
  if (!ext.scripting?.executeScript) {
    return false;
  }
  try {
    await ext.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await ext.tabs.sendMessage(tabId, { type: "THISNOTES_REFRESH" });
    if (openPanel) {
      await ext.tabs.sendMessage(tabId, { type: "THISNOTES_OPEN_PANEL" });
    }
    return true;
  } catch {
    return false;
  }
}

function toggleReloadPanel(show) {
  const panel = document.getElementById("reloadPanel");
  if (panel) {
    panel.hidden = !show;
  }
}

async function reloadCurrentTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  await ext.tabs.reload(tab.id);
  toggleReloadPanel(false);
}

function simpleHash(text) {
  return btoa(unescape(encodeURIComponent(text))).split("").reverse().join("");
}

function simpleUnhash(hash) {
  try {
    return decodeURIComponent(escape(atob(hash.split("").reverse().join(""))));
  } catch {
    return "";
  }
}

let draftSaveTimer = null;

function queueDraftSave() {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
  }
  draftSaveTimer = setTimeout(() => {
    persistDraft().catch((err) => console.error(err));
  }, 120);
}

function getCurrentDraftPayload() {
  return {
    noteId: document.getElementById("noteId").value,
    title: document.getElementById("title").value,
    content: document.getElementById("content").value,
    websites: document.getElementById("websites").value,
    tags: document.getElementById("tags").value,
    noteColor: document.getElementById("noteColor").value,
    textColor: document.getElementById("textColor").value,
    fontFamily: document.getElementById("fontFamily").value,
    fontSize: document.getElementById("fontSize").value,
    textBackgroundColor: document.getElementById("textBackgroundColor").value,
    italic: !!document.getElementById("italic").checked,
    underline: !!document.getElementById("underline").checked,
    updatedAt: new Date().toISOString(),
  };
}

function payloadHasUserContent(payload) {
  return Boolean(
    String(payload.title || "").trim() ||
    String(payload.content || "").trim() ||
    String(payload.tags || "").trim() ||
    (String(payload.websites || "").trim() && String(payload.websites || "").trim() !== formatCsvQuoted([activeSite]))
  );
}

async function persistDraft() {
  if (activeTabId === null) {
    return;
  }
  const key = String(activeTabId);
  const store = await ext.storage.local.get([STORAGE_DRAFTS]);
  const drafts = store[STORAGE_DRAFTS] || {};
  const payload = getCurrentDraftPayload();
  if (!payloadHasUserContent(payload)) {
    if (drafts[key]) {
      delete drafts[key];
      await ext.storage.local.set({ [STORAGE_DRAFTS]: drafts });
    }
    return;
  }
  drafts[key] = payload;
  await ext.storage.local.set({ [STORAGE_DRAFTS]: drafts });
}

async function restoreDraft() {
  if (activeTabId === null) {
    return;
  }
  const key = String(activeTabId);
  const store = await ext.storage.local.get([STORAGE_DRAFTS]);
  const draft = store[STORAGE_DRAFTS]?.[key];
  if (!draft || typeof draft !== "object") {
    return;
  }

  document.getElementById("noteId").value = String(draft.noteId || "");
  document.getElementById("title").value = String(draft.title || "");
  document.getElementById("content").value = String(draft.content || "");
  document.getElementById("websites").value = String(draft.websites || "");
  document.getElementById("tags").value = String(draft.tags || "");
  document.getElementById("noteColor").value = String(draft.noteColor || defaultStyle.noteColor);
  document.getElementById("textColor").value = String(draft.textColor || defaultStyle.textColor);
  ensureFontInSelector(String(draft.fontFamily || defaultStyle.fontFamily));
  document.getElementById("fontSize").value = String(draft.fontSize || defaultStyle.fontSize);
  document.getElementById("textBackgroundColor").value = String(draft.textBackgroundColor || defaultStyle.textBackgroundColor);
  document.getElementById("italic").checked = !!draft.italic;
  document.getElementById("underline").checked = !!draft.underline;
  document.getElementById("formTitle").textContent = draft.noteId ? "Editar nota" : "Crear nota";
}

async function clearDraft() {
  if (activeTabId === null) {
    return;
  }
  const key = String(activeTabId);
  const store = await ext.storage.local.get([STORAGE_DRAFTS]);
  const drafts = store[STORAGE_DRAFTS] || {};
  if (!drafts[key]) {
    return;
  }
  delete drafts[key];
  await ext.storage.local.set({ [STORAGE_DRAFTS]: drafts });
}

const MAX_ATTACH_BYTES = 800 * 1024;

async function onAttachFiles(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      alert(`"${file.name}" no es una imagen y no se adjunto.`);
      continue;
    }
    if (file.size > MAX_ATTACH_BYTES) {
      alert(`"${file.name}" supera el limite de 800 KB y no se adjunto.`);
      continue;
    }
    const dataUrl = await fileToDataUrl(file);
    pendingAttachments.push({ name: file.name, dataUrl });
  }

  const noteId = document.getElementById("noteId").value;
  renderAttachPreview(buildFinalAttachments(noteId));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildFinalAttachments(noteId) {
  const existing = noteId
    ? (notes.find((n) => n.id === noteId)?.attachments || [])
    : [];
  return [...existing, ...pendingAttachments];
}

function renderAttachPreview(attachments) {
  const container = document.getElementById("attachPreview");
  container.innerHTML = "";
  attachments.forEach((att, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "att-thumb";

    const img = document.createElement("img");
    img.src = att.dataUrl;
    img.alt = att.name || "adjunto";

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "x";
    del.title = "Quitar adjunto";
    del.addEventListener("click", () => removeAttachment(idx, attachments));

    wrap.appendChild(img);
    wrap.appendChild(del);
    container.appendChild(wrap);
  });
}

function removeAttachment(idx, current) {
  const noteId = document.getElementById("noteId").value;
  const existingCount = noteId
    ? (notes.find((n) => n.id === noteId)?.attachments || []).length
    : 0;

  if (idx < existingCount) {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      note.attachments = (note.attachments || []).filter((_, i) => i !== idx);
    }
  } else {
    pendingAttachments.splice(idx - existingCount, 1);
  }

  renderAttachPreview(buildFinalAttachments(noteId));
}

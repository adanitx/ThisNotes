const ext = globalThis.browser || globalThis.chrome;

const STORAGE_NOTES = "thisnotes.notes";
const STORAGE_PREFS = "thisnotes.displayPrefs";
const STORAGE_SECURITY = "thisnotes.security";
const STORAGE_SYNC_PREF = "thisnotes.syncPref";
const STORAGE_SYNC_NOTES = "thisnotes.sync.notes";
const STORAGE_SYNC_UPDATED_AT = "thisnotes.sync.updatedAt";
const STORAGE_TRASH = "thisnotes.trash";
const STORAGE_PIN_LOG = "thisnotes.pinRecoveryLog";

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

let notes = [];

init().catch((err) => console.error(err));

async function init() {
  wireEvents();
  await refresh();
}

function wireEvents() {
  document.getElementById("savePrefs").addEventListener("click", savePrefs);
  document.getElementById("savePin").addEventListener("click", savePin);
  document.getElementById("removePin").addEventListener("click", removePin);
  document.getElementById("saveSyncPref").addEventListener("click", saveSyncPref);
  document.getElementById("syncNow").addEventListener("click", syncNow);
  document.getElementById("restoreSync").addEventListener("click", restoreSync);
  document.getElementById("filterText").addEventListener("input", renderNotes);
  document.getElementById("filterWeb").addEventListener("input", renderNotes);
  document.getElementById("filterTag").addEventListener("input", renderNotes);
}

async function refresh() {
  const store = await ext.storage.local.get([STORAGE_NOTES, STORAGE_PREFS, STORAGE_SECURITY, STORAGE_SYNC_PREF]);
  notes = store[STORAGE_NOTES] || [];
  const prefs = { ...defaultPrefs, ...(store[STORAGE_PREFS] || {}) };
  const security = store[STORAGE_SECURITY] || { enabled: false, pinHash: "" };
  const syncPref = store[STORAGE_SYNC_PREF] || { enabled: false };

  for (const [key, value] of Object.entries(prefs)) {
    const el = document.getElementById(key);
    if (el) {
      el.checked = !!value;
    }
  }

  document.getElementById("pinEnabled").checked = !!security.enabled;
  document.getElementById("syncEnabled").checked = !!syncPref.enabled;
  renderNotes();
  await refreshTrashAndLog();
}

function renderNotes() {
  const container = document.getElementById("notesContainer");
  container.innerHTML = "";

  const ft = String(document.getElementById("filterText").value || "").trim().toLowerCase();
  const fw = String(document.getElementById("filterWeb").value || "").trim().toLowerCase();
  const fg = String(document.getElementById("filterTag").value || "").trim().toLowerCase();

  const filtered = notes.filter((note) => {
    const title = String(note.title || "").toLowerCase();
    const content = String(note.content || "").toLowerCase();
    const webs = (note.websites || []).map((w) => String(w).toLowerCase());
    const tags = (note.tags || []).map((t) => String(t).toLowerCase());
    if (ft && !title.includes(ft) && !content.includes(ft)) {
      return false;
    }
    if (fw && !webs.some((w) => w.includes(fw))) {
      return false;
    }
    if (fg && !tags.some((t) => t.includes(fg))) {
      return false;
    }
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = "<p>No hay notas con estos filtros.</p>";
    return;
  }

  const tpl = document.getElementById("summaryTemplate");
  for (const note of filtered) {
    const frag = tpl.content.cloneNode(true);
    frag.querySelector(".sTitle").textContent = note.title || "Sin titulo";
    frag.querySelector(".sDate").textContent = new Date(note.updatedAt).toLocaleString();
    frag.querySelector(".sSnippet").textContent = (note.content || "").slice(0, 180);

    const websInput = frag.querySelector(".sWebs");
    websInput.value = formatCsvQuoted(note.websites || []);
    const tagsInput = frag.querySelector(".sTags");
    tagsInput.value = formatCsvQuoted(note.tags || []);

    frag.querySelector(".saveWebs").addEventListener("click", () => saveMetadata(note.id, websInput.value, tagsInput.value));
    frag.querySelector(".deleteNote").addEventListener("click", () => deleteNote(note.id));
    frag.querySelector(".undoNote").addEventListener("click", () => undoLastVersion(note.id));
    const recoverBtn = frag.querySelector(".pinRecoverBtn");
    if (note.viewPinHash) {
      recoverBtn.disabled = !!note.pinRecovered;
      recoverBtn.title = note.pinRecovered ? "Ya se recupero un digito. Cambia el PIN para volver a recuperar." : "Mostrar un digito del PIN";
      recoverBtn.addEventListener("click", () => recoverPinDigit(note.id));
    } else {
      recoverBtn.hidden = true;
    }

    container.appendChild(frag);
  }
}

async function savePrefs() {
  const payload = {};
  for (const key of Object.keys(defaultPrefs)) {
    payload[key] = !!document.getElementById(key)?.checked;
  }

  await ext.storage.local.set({ [STORAGE_PREFS]: payload });
  alert("Preferencias guardadas.");
}

async function savePin() {
  const enabled = !!document.getElementById("pinEnabled").checked;
  const currentPin = String(document.getElementById("currentPinValue").value || "").trim();
  const pin = String(document.getElementById("pinValue").value || "").trim();
  const prev = await ext.storage.local.get([STORAGE_SECURITY]);
  const prevConfig = prev[STORAGE_SECURITY] || { enabled: false, pinHash: "" };
  const prevHash = String(prevConfig.pinHash || "");
  const hasExistingPin = !!prevHash;

  if (enabled && !pin && !hasExistingPin) {
    alert("Debes indicar un PIN al activar.");
    return;
  }
  if (pin && (pin.length < 4 || pin.length > 20)) {
    alert("El PIN debe tener entre 4 y 20 caracteres.");
    return;
  }

  if (!enabled && hasExistingPin) {
    alert("Para desactivar el PIN usa 'Quitar PIN' e introduce el PIN actual.");
    document.getElementById("pinEnabled").checked = true;
    return;
  }

  if (hasExistingPin && pin) {
    if (!currentPin) {
      alert("Debes indicar el PIN actual para cambiarlo.");
      return;
    }
    if (simpleHash(currentPin) !== prevHash) {
      alert("PIN actual incorrecto.");
      return;
    }
  }

  await ext.storage.local.set({
    [STORAGE_SECURITY]: {
      enabled,
      pinHash: pin ? simpleHash(pin) : prevHash,
    },
  });
  document.getElementById("currentPinValue").value = "";
  document.getElementById("pinValue").value = "";
  alert("Configuracion de PIN guardada.");
}

async function removePin() {
  const currentPin = String(document.getElementById("currentPinValue").value || "").trim();
  const prev = await ext.storage.local.get([STORAGE_SECURITY]);
  const prevHash = String(prev[STORAGE_SECURITY]?.pinHash || "");

  if (!prevHash) {
    alert("No hay PIN configurado.");
    return;
  }
  if (!currentPin) {
    alert("Debes indicar el PIN actual para quitarlo.");
    return;
  }
  if (simpleHash(currentPin) !== prevHash) {
    alert("PIN actual incorrecto.");
    return;
  }

  const ok = confirm("Quitar el PIN desactivara el bloqueo de acciones sensibles. Continuar?");
  if (!ok) {
    return;
  }
  await ext.storage.local.set({ [STORAGE_SECURITY]: { enabled: false, pinHash: "" } });
  document.getElementById("pinEnabled").checked = false;
  document.getElementById("currentPinValue").value = "";
  document.getElementById("pinValue").value = "";
}

async function saveSyncPref() {
  await ext.storage.local.set({
    [STORAGE_SYNC_PREF]: { enabled: !!document.getElementById("syncEnabled").checked },
  });
  alert("Preferencia de sync guardada.");
}

async function syncNow(silent = false) {
  if (!ext.storage.sync) {
    if (!silent) {
      alert("Este navegador no soporta storage.sync en este contexto.");
    }
    return;
  }
  try {
    await ext.storage.sync.set({
      [STORAGE_SYNC_NOTES]: notes,
      [STORAGE_SYNC_UPDATED_AT]: new Date().toISOString(),
    });
    if (!silent) {
      alert("Notas subidas a la nube del navegador.");
    }
  } catch {
    if (!silent) {
      alert("No se pudo sincronizar. Puede haberse superado la cuota.");
    }
  }
}

async function restoreSync() {
  if (!ext.storage.sync) {
    alert("Este navegador no soporta storage.sync en este contexto.");
    return;
  }
  const data = await ext.storage.sync.get([STORAGE_SYNC_NOTES]);
  const incoming = data[STORAGE_SYNC_NOTES];
  if (!Array.isArray(incoming)) {
    alert("No hay datos validos en la nube.");
    return;
  }

  const ok = confirm("Esto reemplazara tus notas locales con las de la nube. Continuar?");
  if (!ok) {
    return;
  }

  notes = incoming.map((candidate) => normalizeIncomingNote(candidate));
  await saveNotes();
}

async function saveMetadata(noteId, websRaw, tagsRaw) {
  const webs = normalizeWebsites(websRaw);
  const tags = normalizeTags(tagsRaw);
  if (!webs.length) {
    alert("Debes indicar al menos una web.");
    return;
  }

  notes = notes.map((note) => {
    if (note.id !== noteId) {
      return note;
    }
    const history = [snapshotVersion(note), ...(Array.isArray(note.versions) ? note.versions : [])].slice(0, 20);
    return {
      ...note,
      websites: webs,
      tags,
      versions: history,
      updatedAt: new Date().toISOString(),
    };
  });

  await saveNotes();
}

async function undoLastVersion(noteId) {
  notes = notes.map((note) => {
    if (note.id !== noteId || !Array.isArray(note.versions) || !note.versions.length) {
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

async function deleteNote(noteId) {
  const note = notes.find((n) => n.id === noteId);
  if (!note) {
    return;
  }

  const ok = confirm(`Seguro que quieres eliminar la nota "${note.title || "Sin titulo"}"?`);
  if (!ok) {
    return;
  }

  notes = notes.filter((n) => n.id !== noteId);
  const store = await ext.storage.local.get([STORAGE_TRASH]);
  const trash = (store[STORAGE_TRASH] || []).filter(
    (n) => Date.now() - new Date(n.deletedAt).getTime() < 24 * 3600 * 1000
  );
  trash.unshift({ ...note, deletedAt: new Date().toISOString() });
  await ext.storage.local.set({ [STORAGE_NOTES]: notes, [STORAGE_TRASH]: trash });
  await refresh();
}

async function saveNotes() {
  await ext.storage.local.set({ [STORAGE_NOTES]: notes });
  const pref = await ext.storage.local.get([STORAGE_SYNC_PREF]);
  if (pref[STORAGE_SYNC_PREF]?.enabled) {
    await syncNow(true);
  }
  await refresh();
}

function normalizeList(raw) {
  return normalizeTags(raw);
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

function normalizeToken(value) {
  let output = String(value || "").trim();
  if (!output) {
    return "";
  }
  if ((output.startsWith('"') && output.endsWith('"')) || (output.startsWith("'") && output.endsWith("'"))) {
    output = output.slice(1, -1).trim();
  }
  return output;
}

function normalizeWebsites(raw) {
  const parsed = parseCsvQuoted(raw)
    .map((w) => normalizeToken(w))
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
    .map((w) => normalizeToken(w).toLowerCase())
    .filter(Boolean);
  return [...new Set(parsed)];
}

function formatCsvQuoted(values) {
  return (values || []).map((value) => `"${String(value).replace(/"/g, "")}"`).join(", ");
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

function normalizeIncomingNote(candidate) {
  const now = new Date().toISOString();
  return {
    id: candidate.id || crypto.randomUUID(),
    createdAt: candidate.createdAt || now,
    updatedAt: candidate.updatedAt || now,
    title: String(candidate.title || ""),
    content: String(candidate.content || ""),
    tags: normalizeTags(
      Array.isArray(candidate.tags) ? candidate.tags.join(",") : String(candidate.tags || "")
    ),
    websites: Array.isArray(candidate.websites) && candidate.websites.length
      ? normalizeWebsites(candidate.websites.join(","))
      : ["example.com"],
    style: { ...defaultStyle, ...(candidate.style || {}) },
    versions: Array.isArray(candidate.versions) ? candidate.versions.slice(0, 20) : [],
    siteVisibility: typeof candidate.siteVisibility === "object" && candidate.siteVisibility
      ? candidate.siteVisibility
      : {},
  };
}

function simpleHash(text) {
  return btoa(unescape(encodeURIComponent(text))).split("").reverse().join("");
}

function simpleUnhash(hash) {
  try {
    return decodeURIComponent(escape(atob(hash.split("").reverse().join("")))) ;
  } catch {
    return "";
  }
}

async function refreshTrashAndLog() {
  await renderTrash();
  await renderPinLog();
}

async function renderTrash() {
  const container = document.getElementById("trashContainer");
  const store = await ext.storage.local.get([STORAGE_TRASH]);
  const TTL = 24 * 3600 * 1000;
  const now = Date.now();
  const valid = (store[STORAGE_TRASH] || []).filter(
    (n) => now - new Date(n.deletedAt).getTime() < TTL
  );
  if (valid.length !== (store[STORAGE_TRASH] || []).length) {
    await ext.storage.local.set({ [STORAGE_TRASH]: valid });
  }
  container.innerHTML = "";
  if (!valid.length) {
    container.innerHTML = "<p>La papelera esta vacia.</p>";
    return;
  }
  const tpl = document.getElementById("trashTemplate");
  for (const note of valid) {
    const frag = tpl.content.cloneNode(true);
    frag.querySelector(".tTitle").textContent = note.title || "Sin titulo";
    const exp = new Date(new Date(note.deletedAt).getTime() + TTL);
    frag.querySelector(".tDate").textContent = `Caduca: ${exp.toLocaleString()}`;
    frag.querySelector(".tSnippet").textContent = (note.content || "").slice(0, 120);
    frag.querySelector(".restoreNote").addEventListener("click", () => restoreFromTrash(note.id));
    frag.querySelector(".purgeNote").addEventListener("click", () => purgeFromTrash(note.id));
    container.appendChild(frag);
  }
}

async function restoreFromTrash(noteId) {
  const store = await ext.storage.local.get([STORAGE_NOTES, STORAGE_TRASH]);
  const trash = store[STORAGE_TRASH] || [];
  const target = trash.find((n) => n.id === noteId);
  if (!target) {
    return;
  }
  const restoredNote = { ...target };
  delete restoredNote.deletedAt;
  const currentNotes = store[STORAGE_NOTES] || [];
  const alreadyExists = currentNotes.some((n) => n.id === noteId);
  if (alreadyExists) {
    alert("Ya existe una nota activa con ese ID.");
    return;
  }
  const updatedNotes = [restoredNote, ...currentNotes];
  const updatedTrash = trash.filter((n) => n.id !== noteId);
  await ext.storage.local.set({ [STORAGE_NOTES]: updatedNotes, [STORAGE_TRASH]: updatedTrash });
  notes = updatedNotes;
  await renderTrash();
  renderNotes();
  alert(`Nota "${restoredNote.title || "Sin titulo"}" restaurada.`);
}

async function purgeFromTrash(noteId) {
  const ok = confirm("Eliminar definitivamente esta nota? Esta accion no tiene vuelta atras.");
  if (!ok) {
    return;
  }
  const store = await ext.storage.local.get([STORAGE_TRASH]);
  const updated = (store[STORAGE_TRASH] || []).filter((n) => n.id !== noteId);
  await ext.storage.local.set({ [STORAGE_TRASH]: updated });
  await renderTrash();
}

async function renderPinLog() {
  const container = document.getElementById("pinLogContainer");
  const store = await ext.storage.local.get([STORAGE_PIN_LOG]);
  const TTL = 72 * 3600 * 1000;
  const now = Date.now();
  const valid = (store[STORAGE_PIN_LOG] || []).filter(
    (entry) => now - new Date(entry.recoveredAt).getTime() < TTL
  );
  if (valid.length !== (store[STORAGE_PIN_LOG] || []).length) {
    await ext.storage.local.set({ [STORAGE_PIN_LOG]: valid });
  }
  container.innerHTML = "";
  if (!valid.length) {
    container.innerHTML = "<p>Sin recuperaciones de PIN recientes.</p>";
    return;
  }
  for (const entry of valid) {
    const el = document.createElement("article");
    el.className = "summaryItem";
    const exp = new Date(new Date(entry.recoveredAt).getTime() + TTL);
    el.innerHTML = `
      <div class="summaryTop">
        <h3>${entry.noteTitle || "Sin titulo"}</h3>
        <small>Caduca: ${exp.toLocaleString()}</small>
      </div>
      <p>Digito ${entry.position} del PIN: <strong>${entry.digit}</strong></p>
    `;
    container.appendChild(el);
  }
}

async function recoverPinDigit(noteId) {
  const note = notes.find((n) => n.id === noteId);
  if (!note?.viewPinHash) {
    alert("Esta nota no tiene PIN de visualizacion.");
    return;
  }
  if (note.pinRecovered) {
    alert("Ya se recupero un digito del PIN de esta nota. Cambia el PIN para poder recuperarlo de nuevo.");
    return;
  }
  const pin = simpleUnhash(note.viewPinHash);
  if (!pin) {
    alert("No se pudo leer el PIN almacenado.");
    return;
  }
  const posStr = prompt(
    `El PIN tiene ${pin.length} digitos. Introduce la posicion del digito que quieres ver (1-${pin.length}):`
  );
  const pos = parseInt(posStr, 10);
  if (!pos || pos < 1 || pos > pin.length) {
    alert("Posicion no valida.");
    return;
  }
  const digit = pin[pos - 1];
  const ok = confirm(
    `Se mostrara el digito ${pos} del PIN y no podras recuperarlo de nuevo hasta cambiar el PIN. Continuar?`
  );
  if (!ok) {
    return;
  }
  notes = notes.map((n) => {
    if (n.id !== noteId) {
      return n;
    }
    return { ...n, pinRecovered: true, updatedAt: new Date().toISOString() };
  });
  await saveNotes();
  const store = await ext.storage.local.get([STORAGE_PIN_LOG]);
  const log = (store[STORAGE_PIN_LOG] || []).filter(
    (e) => Date.now() - new Date(e.recoveredAt).getTime() < 72 * 3600 * 1000
  );
  log.unshift({
    noteId,
    noteTitle: note.title || "Sin titulo",
    position: pos,
    digit,
    recoveredAt: new Date().toISOString(),
  });
  await ext.storage.local.set({ [STORAGE_PIN_LOG]: log });
  await renderPinLog();
  alert(`Digito ${pos} del PIN: ${digit}\n\nRecuerda: no podras recuperarlo de nuevo hasta que cambies el PIN de esta nota.`);
}

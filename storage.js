const STORAGE_KEY = "jobnest.applications";
const DRAFT_STORAGE_KEY = "jobnest.popupDraft";
const BACKUP_DB_NAME = "jobnest.backup";
const BACKUP_STORE_NAME = "backup";
const BACKUP_HANDLE_KEY = "backupFileHandle";
const MISSING_BACKUP_FILE_MESSAGE = "Backup file was deleted. Choose Backup File again.";

const STATUSES = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" }
];

async function loadApplications() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(result[STORAGE_KEY])
    ? result[STORAGE_KEY].filter((application) => application && typeof application === "object").map(normalizeApplicationRecord)
    : [];
}

async function saveApplications(nextApplications) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: nextApplications
  });
}

async function loadPopupDraft() {
  const result = await chrome.storage.local.get(DRAFT_STORAGE_KEY);
  return result[DRAFT_STORAGE_KEY] && typeof result[DRAFT_STORAGE_KEY] === "object"
    ? result[DRAFT_STORAGE_KEY]
    : {};
}

async function savePopupDraft(draft) {
  await chrome.storage.local.set({
    [DRAFT_STORAGE_KEY]: draft
  });
}

async function clearPopupDraft() {
  await chrome.storage.local.remove(DRAFT_STORAGE_KEY);
}

async function chooseBackupFile() {
  if (!window.showSaveFilePicker) {
    throw new Error("Automatic backup needs a Chromium browser with File System Access support.");
  }

  const handle = await window.showSaveFilePicker({
    suggestedName: "jobnest-backup.json",
    types: [
      {
        description: "JobNest backup",
        accept: {
          "application/json": [".json"]
        }
      }
    ]
  });

  const hasPermission = await verifyBackupPermission(handle, true);
  if (!hasPermission) {
    throw new Error("Backup file permission was not granted.");
  }

  await storeBackupFileHandle(handle);
  return handle;
}

async function writeApplicationsBackup(nextApplications, options = {}) {
  const handle = await getBackupFileHandle();
  if (!handle) {
    return false;
  }

  const hasPermission = await verifyBackupPermission(handle, Boolean(options.requestPermission));
  if (!hasPermission) {
    return false;
  }

  try {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(nextApplications, null, 2));
    await writable.close();
    return true;
  } catch (error) {
    if (isMissingBackupFileError(error)) {
      await clearBackupFileHandle();
      throw createMissingBackupFileError();
    }

    throw error;
  }
}

async function readConnectedBackupFile(options = {}) {
  const handle = await getBackupFileHandle();
  if (!handle) {
    throw new Error("Choose Backup File before restoring applications.");
  }

  const hasPermission = await verifyBackupPermission(handle, Boolean(options.requestPermission));
  if (!hasPermission) {
    throw new Error("Backup file permission was not granted.");
  }

  try {
    return await handle.getFile();
  } catch (error) {
    if (isMissingBackupFileError(error)) {
      await clearBackupFileHandle();
      throw createMissingBackupFileError();
    }

    throw error;
  }
}

async function verifyBackupFileStillExists() {
  const handle = await getBackupFileHandle();
  if (!handle) {
    return null;
  }

  try {
    await handle.getFile();
    return handle;
  } catch (error) {
    if (isMissingBackupFileError(error)) {
      await clearBackupFileHandle();
      throw createMissingBackupFileError();
    }

    return handle;
  }
}

async function getBackupFileHandle() {
  const db = await openBackupDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKUP_STORE_NAME, "readonly");
    const store = transaction.objectStore(BACKUP_STORE_NAME);
    const request = store.get(BACKUP_HANDLE_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function storeBackupFileHandle(handle) {
  const db = await openBackupDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKUP_STORE_NAME, "readwrite");
    const store = transaction.objectStore(BACKUP_STORE_NAME);
    const request = store.put(handle, BACKUP_HANDLE_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearBackupFileHandle() {
  const db = await openBackupDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKUP_STORE_NAME, "readwrite");
    const store = transaction.objectStore(BACKUP_STORE_NAME);
    const request = store.delete(BACKUP_HANDLE_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function openBackupDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BACKUP_DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(BACKUP_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function verifyBackupPermission(handle, requestAccess) {
  const options = { mode: "readwrite" };

  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }

  if (!requestAccess) {
    return false;
  }

  return (await handle.requestPermission(options)) === "granted";
}

function createMissingBackupFileError() {
  const error = new Error(MISSING_BACKUP_FILE_MESSAGE);
  error.name = "MissingBackupFileError";
  return error;
}

function isMissingBackupFileError(error) {
  return error?.name === "NotFoundError"
    || error?.name === "MissingBackupFileError"
    || /file.*(deleted|missing|not found|not exist)/i.test(String(error?.message || ""));
}

function statusLabel(value) {
  return STATUSES.find((status) => status.value === value)?.label || "Saved";
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function createStatusEvent(status, date = todayDateString()) {
  return {
    type: "status",
    status,
    date,
    createdAt: new Date().toISOString()
  };
}

function normalizeApplicationRecord(application) {
  const status = normalizeStatus(application.status);
  const createdAt = clean(application.createdAt) || new Date().toISOString();
  const appliedDate = clean(application.appliedDate) || clean(createdAt).slice(0, 10) || todayDateString();

  return {
    id: clean(application.id) || crypto.randomUUID(),
    company: clean(application.company),
    role: clean(application.role),
    url: clean(application.url),
    location: clean(application.location),
    status,
    appliedDate,
    notes: clean(application.notes),
    createdAt,
    updatedAt: clean(application.updatedAt) || new Date().toISOString(),
    events: normalizeApplicationEvents(application.events, status, appliedDate)
  };
}

function normalizeApplicationEvents(events, currentStatus, fallbackDate) {
  const normalizedEvents = Array.isArray(events)
    ? events
        .filter((event) => event && typeof event === "object")
        .map((event) => ({
          type: clean(event.type) || "status",
          status: normalizeStatus(event.status),
          date: clean(event.date) || fallbackDate,
          createdAt: clean(event.createdAt) || new Date().toISOString()
        }))
        .filter((event) => event.type === "status")
    : [];

  if (normalizedEvents.some((event) => event.status === currentStatus)) {
    return normalizedEvents;
  }

  return [
    ...normalizedEvents,
    createStatusEvent(currentStatus, fallbackDate)
  ];
}

function normalizeStatus(status) {
  const statusValue = clean(status);
  return STATUSES.some((item) => item.value === statusValue) ? statusValue : "saved";
}

function getStatusEventDate(application, status) {
  const events = Array.isArray(application.events) ? application.events : [];
  const matchingEvents = events.filter((event) => event?.type === "status" && event.status === status);
  const lastMatchingEvent = matchingEvents.at(-1);

  return clean(lastMatchingEvent?.date) || clean(application.appliedDate) || clean(application.createdAt).slice(0, 10);
}

function clean(value) {
  return String(value || "").trim();
}

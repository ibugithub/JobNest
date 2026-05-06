const STORAGE_KEY = "jobnest.applications";
const BACKUP_DB_NAME = "jobnest.backup";
const BACKUP_STORE_NAME = "backup";
const BACKUP_HANDLE_KEY = "backupFileHandle";

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

  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(nextApplications, null, 2));
  await writable.close();
  return true;
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

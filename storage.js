const STORAGE_KEY = "jobnest.applications";

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

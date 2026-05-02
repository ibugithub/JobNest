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
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function saveApplications(nextApplications) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: nextApplications
  });
}

function statusLabel(value) {
  return STATUSES.find((status) => status.value === value)?.label || "Saved";
}

function clean(value) {
  return String(value || "").trim();
}

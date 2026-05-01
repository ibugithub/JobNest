const STORAGE_KEY = "jobnest.applications";

const STATUSES = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" }
];

const form = document.querySelector("#jobForm");
const jobList = document.querySelector("#jobList");
const summary = document.querySelector("#summary");
const searchInput = document.querySelector("#search");
const statusFilter = document.querySelector("#statusFilter");
const exportButton = document.querySelector("#exportBtn");
const template = document.querySelector("#jobItemTemplate");

let applications = [];

document.addEventListener("DOMContentLoaded", async () => {
  setDefaultAppliedDate();
  await prefillFromActiveTab();
  applications = await loadApplications();
  renderApplications();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const application = {
    id: crypto.randomUUID(),
    company: clean(formData.get("company")),
    role: clean(formData.get("role")),
    url: clean(formData.get("url")),
    location: clean(formData.get("location")),
    status: formData.get("status") || "saved",
    appliedDate: formData.get("appliedDate") || "",
    notes: clean(formData.get("notes")),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  applications = [application, ...applications];
  await saveApplications(applications);
  form.reset();
  setDefaultAppliedDate();
  await prefillFromActiveTab();
  renderApplications();
});

searchInput.addEventListener("input", renderApplications);
statusFilter.addEventListener("change", renderApplications);

exportButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(applications, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jobnest-applications-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

function renderApplications() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;

  const visibleApplications = applications.filter((application) => {
    const matchesStatus = selectedStatus === "all" || application.status === selectedStatus;
    const searchableText = `${application.company} ${application.role} ${application.location}`.toLowerCase();
    return matchesStatus && searchableText.includes(searchTerm);
  });

  summary.textContent = `${applications.length} ${applications.length === 1 ? "application" : "applications"} tracked`;
  jobList.replaceChildren();

  if (visibleApplications.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = applications.length === 0 ? "No applications saved yet." : "No applications match this view.";
    jobList.append(empty);
    return;
  }

  for (const application of visibleApplications) {
    const item = template.content.firstElementChild.cloneNode(true);
    item.querySelector("h3").textContent = application.role;
    item.querySelector(".company-line").textContent = application.company;
    item.querySelector(".meta-line").textContent = buildMetaLine(application);

    const notesLine = item.querySelector(".notes-line");
    notesLine.textContent = application.notes;
    notesLine.hidden = !application.notes;

    const statusSelect = item.querySelector(".status-select");
    populateStatusSelect(statusSelect, application.status);
    statusSelect.addEventListener("change", async () => {
      await updateApplication(application.id, { status: statusSelect.value });
    });

    const openLink = item.querySelector(".open-link");
    if (application.url) {
      openLink.href = application.url;
    } else {
      openLink.hidden = true;
    }

    item.querySelector(".delete-button").addEventListener("click", async () => {
      await deleteApplication(application.id);
    });

    jobList.append(item);
  }
}

function populateStatusSelect(select, currentStatus) {
  select.replaceChildren();
  for (const status of STATUSES) {
    const option = document.createElement("option");
    option.value = status.value;
    option.textContent = status.label;
    option.selected = status.value === currentStatus;
    select.append(option);
  }
}

function buildMetaLine(application) {
  const parts = [
    statusLabel(application.status),
    application.appliedDate ? `Applied ${application.appliedDate}` : "",
    application.location
  ].filter(Boolean);

  return parts.join(" | ");
}

function statusLabel(value) {
  return STATUSES.find((status) => status.value === value)?.label || "Saved";
}

async function updateApplication(id, changes) {
  applications = applications.map((application) => {
    if (application.id !== id) {
      return application;
    }

    return {
      ...application,
      ...changes,
      updatedAt: new Date().toISOString()
    };
  });

  await saveApplications(applications);
  renderApplications();
}

async function deleteApplication(id) {
  applications = applications.filter((application) => application.id !== id);
  await saveApplications(applications);
  renderApplications();
}

async function loadApplications() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function saveApplications(nextApplications) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: nextApplications
  });
}

async function prefillFromActiveTab() {
  const urlInput = document.querySelector("#url");
  const roleInput = document.querySelector("#role");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      return;
    }

    if (tab.url?.startsWith("http")) {
      urlInput.value = tab.url;
    }

    if (tab.title && !roleInput.value) {
      roleInput.value = simplifyTitle(tab.title);
    }
  } catch (error) {
    console.warn("Could not read active tab", error);
  }
}

function simplifyTitle(title) {
  return title
    .replace(/\s+[-|]\s+(LinkedIn|Indeed|Glassdoor|Wellfound|Greenhouse|Lever).*$/i, "")
    .trim();
}

function setDefaultAppliedDate() {
  document.querySelector("#appliedDate").value = new Date().toISOString().slice(0, 10);
}

function clean(value) {
  return String(value || "").trim();
}

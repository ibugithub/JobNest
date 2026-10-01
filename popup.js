const form = document.querySelector("#jobForm");
const saveMessage = document.querySelector("#saveMessage");
const openTrackerButton = document.querySelector("#openTrackerBtn");
const duplicateNotice = document.querySelector("#duplicateNotice");
const duplicateTitle = document.querySelector("#duplicateTitle");
const duplicateDetails = document.querySelector("#duplicateDetails");
const viewExistingButton = document.querySelector("#viewExistingBtn");
const saveSeparateButton = document.querySelector("#saveSeparateBtn");
const saveApplicationButton = document.querySelector("#saveApplicationBtn");

let applications = [];
let duplicateApplication = null;
let allowPossibleDuplicate = false;

document.addEventListener("DOMContentLoaded", async () => {
  setDefaultAppliedDate();
  applyDraft(await loadPopupDraft());
  await prefillFromActiveTab();
  applications = await loadApplications();
  updateDuplicateNotice();
});

form.addEventListener("input", () => {
  allowPossibleDuplicate = false;
  saveCurrentDraft();
  updateDuplicateNotice();
});

form.addEventListener("change", () => {
  allowPossibleDuplicate = false;
  saveCurrentDraft();
  updateDuplicateNotice();
});

viewExistingButton.addEventListener("click", () => {
  if (duplicateApplication) {
    openExtensionPage(chrome.runtime.getURL(`tracker.html?application=${encodeURIComponent(duplicateApplication.id)}`));
  }
});

saveSeparateButton.addEventListener("click", () => {
  allowPossibleDuplicate = true;
  updateDuplicateNotice();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const duplicate = findDuplicateApplication();
  if (duplicate?.type === "exact" || (duplicate?.type === "possible" && !allowPossibleDuplicate)) {
    updateDuplicateNotice();
    return;
  }

  try {
    if (!await verifyBackupFileStillExists()) {
      await redirectToBackupSetup("backupRequired");
      return;
    }
  } catch (error) {
    if (isMissingBackupFileError(error)) {
      await redirectToBackupSetup("backupMissing");
      return;
    }

    console.warn("Backup file check failed", error);
    await redirectToBackupSetup("backupRequired");
    return;
  }

  if (applications.length === 0) {
    const shouldRestoreFirst = await backupHasApplications();
    if (shouldRestoreFirst) {
      await redirectToBackupSetup("restoreRequired");
      return;
    }
  }

  const formData = new FormData(form);
  const status = formData.get("status") || "saved";
  const statusDate = formData.get("appliedDate") || todayDateString();
  const timestamp = new Date().toISOString();
  const application = {
    id: crypto.randomUUID(),
    company: clean(formData.get("company")),
    role: clean(formData.get("role")),
    url: clean(formData.get("url")),
    location: clean(formData.get("location")),
    status,
    appliedDate: statusDate,
    notes: clean(formData.get("notes")),
    createdAt: timestamp,
    updatedAt: timestamp,
    events: [
      createStatusEvent(status, statusDate)
    ]
  };

  applications = [application, ...applications];
  await saveApplications(applications);

  try {
    const didWrite = await writeApplicationsBackup(applications, { requestPermission: true });
    if (!didWrite) {
      throw createBackupPermissionError();
    }
  } catch (error) {
    console.warn("Backup write failed", error);
    applications = applications.filter((item) => item.id !== application.id);
    await saveApplications(applications);
    await redirectToBackupSetup(isMissingBackupFileError(error) ? "backupMissing" : "backupPermission");
    return;
  }

  await clearPopupDraft();
  form.reset();
  setDefaultAppliedDate();
  await prefillFromActiveTab();
  showSaveMessage("Application saved.");
});

openTrackerButton.addEventListener("click", () => {
  openExtensionPage(chrome.runtime.getURL("tracker.html"));
});

async function redirectToBackupSetup(reason) {
  await openBackupSetupPage(reason);

  window.setTimeout(() => {
    window.close();
  }, 120);
}

async function openBackupSetupPage(reason) {
  const setupUrl = chrome.runtime.getURL(`tracker.html?setup=${encodeURIComponent(reason)}`);
  await openExtensionPage(setupUrl);
}

function openExtensionPage(url) {
  return new Promise((resolve) => {
    try {
      if (!chrome.tabs?.create) {
        window.open(url, "_blank");
        resolve();
        return;
      }

      chrome.tabs.create({ url }, () => {
        if (chrome.runtime.lastError) {
          window.open(url, "_blank");
        }

        resolve();
      });
    } catch (error) {
      console.warn("Could not open extension page in a tab", error);
      window.location.href = url;
      resolve();
    }
  });
}

async function backupHasApplications() {
  try {
    const file = await readConnectedBackupFile({ requestPermission: true });
    const backupApplications = await readApplicationsBackup(file);
    return backupApplications.length > 0;
  } catch (error) {
    if (isMissingBackupFileError(error)) {
      await redirectToBackupSetup("backupMissing");
      return true;
    }

    console.warn("Backup read failed", error);
    await redirectToBackupSetup(isBackupPermissionError(error) ? "backupPermission" : "backupRequired");
    return true;
  }
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
  document.querySelector("#appliedDate").value = todayDateString();
}

function applyDraft(draft) {
  const fields = ["company", "role", "url", "location", "status", "appliedDate", "notes"];

  for (const field of fields) {
    const input = form.elements[field];
    if (input && draft[field]) {
      input.value = draft[field];
    }
  }
}

function saveCurrentDraft() {
  const formData = new FormData(form);
  savePopupDraft({
    company: clean(formData.get("company")),
    role: clean(formData.get("role")),
    url: clean(formData.get("url")),
    location: clean(formData.get("location")),
    status: formData.get("status") || "saved",
    appliedDate: formData.get("appliedDate") || todayDateString(),
    notes: clean(formData.get("notes"))
  });
}

function showSaveMessage(message) {
  saveMessage.textContent = message;

  window.setTimeout(() => {
    if (message === "Application saved.") {
      window.close();
    }
  }, 900);
}

function findDuplicateApplication() {
  const formData = new FormData(form);
  const url = normalizeJobUrl(formData.get("url"));
  const company = normalizeDuplicateText(formData.get("company"));
  const role = normalizeDuplicateText(formData.get("role"));

  if (url) {
    const exactMatch = applications.find((application) => normalizeJobUrl(application.url) === url);
    if (exactMatch) {
      return { type: "exact", application: exactMatch };
    }
  }

  if (company && role) {
    const possibleMatch = applications.find((application) => (
      normalizeDuplicateText(application.company) === company
      && normalizeDuplicateText(application.role) === role
    ));
    if (possibleMatch) {
      return { type: "possible", application: possibleMatch };
    }
  }

  return null;
}

function updateDuplicateNotice() {
  const duplicate = findDuplicateApplication();
  duplicateApplication = duplicate?.application || null;

  if (!duplicate || (duplicate.type === "possible" && allowPossibleDuplicate)) {
    duplicateNotice.hidden = true;
    saveApplicationButton.disabled = false;
    return;
  }

  const application = duplicate.application;
  const status = normalizeStatus(application.status);
  const statusDate = getStatusEventDate(application, status);
  duplicateNotice.hidden = false;
  duplicateTitle.textContent = duplicate.type === "exact"
    ? "This job is already tracked."
    : "This may already be tracked.";
  duplicateDetails.textContent = `${application.role} at ${application.company} · ${statusLabel(status)}${statusDate ? ` on ${statusDate}` : ""}`;
  saveSeparateButton.hidden = duplicate.type === "exact";
  saveApplicationButton.disabled = duplicate.type === "exact";
}

function normalizeJobUrl(value) {
  const rawUrl = clean(value);
  if (!rawUrl) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";

    const trackingParameters = ["fbclid", "gclid", "refId", "trackingId"];
    [...url.searchParams.keys()].forEach((key) => {
      if (key.toLowerCase().startsWith("utm_") || trackingParameters.some((item) => item.toLowerCase() === key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    });
    url.searchParams.sort();
    const port = url.port ? `:${url.port}` : "";
    return `${url.hostname}${port}${url.pathname}${url.search}`;
  } catch (error) {
    return rawUrl.replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

function normalizeDuplicateText(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

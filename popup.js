const form = document.querySelector("#jobForm");
const saveMessage = document.querySelector("#saveMessage");
const openTrackerButton = document.querySelector("#openTrackerBtn");

let applications = [];

document.addEventListener("DOMContentLoaded", async () => {
  setDefaultAppliedDate();
  applyDraft(await loadPopupDraft());
  await prefillFromActiveTab();
  applications = await loadApplications();
});

form.addEventListener("input", () => {
  saveCurrentDraft();
});

form.addEventListener("change", () => {
  saveCurrentDraft();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

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
    const didWrite = await writeApplicationsBackup(applications);
    if (!didWrite) {
      throw new Error("Backup file not updated. Choose Backup File again.");
    }
  } catch (error) {
    console.warn("Backup write failed", error);
    applications = applications.filter((item) => item.id !== application.id);
    await saveApplications(applications);
    showSaveMessage(isMissingBackupFileError(error) ? MISSING_BACKUP_FILE_MESSAGE : "Backup file not updated. Choose Backup File again.");
    return;
  }

  await clearPopupDraft();
  form.reset();
  setDefaultAppliedDate();
  await prefillFromActiveTab();
  showSaveMessage("Application saved.");
});

openTrackerButton.addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("tracker.html")
  });
});

async function redirectToBackupSetup(reason) {
  showSaveMessage("Select a backup file before saving jobs.");
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`tracker.html?setup=${reason}`)
  });
  window.close();
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

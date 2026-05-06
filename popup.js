const form = document.querySelector("#jobForm");
const saveMessage = document.querySelector("#saveMessage");
const openTrackerButton = document.querySelector("#openTrackerBtn");

let applications = [];

document.addEventListener("DOMContentLoaded", async () => {
  setDefaultAppliedDate();
  await prefillFromActiveTab();
  applications = await loadApplications();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

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

function showSaveMessage(message) {
  saveMessage.textContent = message;

  window.setTimeout(() => {
    window.close();
  }, 700);
}

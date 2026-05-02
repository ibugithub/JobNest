const form = document.querySelector("#jobForm");
const summary = document.querySelector("#summary");
const openTrackerButton = document.querySelector("#openTrackerBtn");

let applications = [];

document.addEventListener("DOMContentLoaded", async () => {
  setDefaultAppliedDate();
  await prefillFromActiveTab();
  applications = await loadApplications();
  renderSummary();
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
  renderSummary();
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
  document.querySelector("#appliedDate").value = new Date().toISOString().slice(0, 10);
}

function renderSummary() {
  summary.textContent = `${applications.length} ${applications.length === 1 ? "application" : "applications"} tracked`;
}

const sectionsList = document.querySelector("#sectionsList");
const summary = document.querySelector("#summary");
const searchInput = document.querySelector("#search");
const exportButton = document.querySelector("#exportBtn");
const sectionTemplate = document.querySelector("#statusSectionTemplate");
const jobTemplate = document.querySelector("#jobItemTemplate");

let applications = [];

document.addEventListener("DOMContentLoaded", async () => {
  applications = await loadApplications();
  renderApplications();
});

searchInput.addEventListener("input", renderApplications);

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

  const visibleApplications = applications.filter((application) => {
    const searchableText = `${application.company} ${application.role} ${application.location}`.toLowerCase();
    return searchableText.includes(searchTerm);
  });

  summary.textContent = `${applications.length} ${applications.length === 1 ? "application" : "applications"} tracked`;
  sectionsList.replaceChildren();

  if (visibleApplications.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = applications.length === 0 ? "No applications saved yet. Use the popup to add your first job." : "No applications match this view.";
    sectionsList.append(empty);
    return;
  }

  for (const status of STATUSES) {
    const sectionApplications = visibleApplications.filter((application) => getApplicationStatus(application) === status.value);
    const section = sectionTemplate.content.firstElementChild.cloneNode(true);
    const sectionList = section.querySelector(".job-list");

    section.querySelector("h3").textContent = status.label;
    section.querySelector(".status-count").textContent = String(sectionApplications.length);

    if (sectionApplications.length === 0) {
      const empty = document.createElement("p");
      empty.className = "section-empty";
      empty.textContent = "No applications";
      sectionList.append(empty);
    }

    for (const application of sectionApplications) {
      sectionList.append(createApplicationItem(application));
    }

    sectionsList.append(section);
  }
}

function createApplicationItem(application) {
  const item = jobTemplate.content.firstElementChild.cloneNode(true);
  item.querySelector("h4").textContent = application.role;
  item.querySelector(".company-line").textContent = application.company;
  item.querySelector(".meta-line").textContent = buildMetaLine(application);

  const notesLine = item.querySelector(".notes-line");
  notesLine.textContent = application.notes;
  notesLine.hidden = !application.notes;

  const statusSelect = item.querySelector(".status-select");
  populateStatusSelect(statusSelect, getApplicationStatus(application));
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

  return item;
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
    application.appliedDate ? `Applied ${application.appliedDate}` : "",
    application.location
  ].filter(Boolean);

  return parts.join(" | ");
}

function getApplicationStatus(application) {
  const hasKnownStatus = STATUSES.some((status) => status.value === application.status);
  return hasKnownStatus ? application.status : "saved";
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

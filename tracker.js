const sectionsList = document.querySelector("#sectionsList");
const summary = document.querySelector("#summary");
const searchInput = document.querySelector("#search");
const importButton = document.querySelector("#importBtn");
const importInput = document.querySelector("#importInput");
const importMessage = document.querySelector("#importMessage");
const exportButton = document.querySelector("#exportBtn");
const sectionTemplate = document.querySelector("#statusSectionTemplate");
const jobTemplate = document.querySelector("#jobItemTemplate");

let applications = [];
let draggedApplicationId = "";
let dragPlaceholder = null;

document.addEventListener("DOMContentLoaded", async () => {
  applications = await loadApplications();
  renderApplications();
});

searchInput.addEventListener("input", renderApplications);

importButton.addEventListener("click", () => {
  importInput.click();
});

importInput.addEventListener("change", async () => {
  const [file] = importInput.files;
  importInput.value = "";

  if (!file) {
    return;
  }

  try {
    const importedApplications = await readApplicationsBackup(file);
    applications = importedApplications;
    await saveApplications(applications);
    renderApplications();
    showImportMessage(`${applications.length} ${applications.length === 1 ? "application" : "applications"} restored from backup.`);
  } catch (error) {
    alert(error.message);
  }
});

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

async function readApplicationsBackup(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Import failed. Please choose a JobNest JSON export file.");
  }

  return parsed.map(normalizeImportedApplication);
}

function normalizeImportedApplication(application) {
  if (!application || typeof application !== "object") {
    throw new Error("Import failed. Every application must be an object.");
  }

  return {
    id: clean(application.id) || crypto.randomUUID(),
    company: clean(application.company),
    role: clean(application.role),
    url: clean(application.url),
    location: clean(application.location),
    status: normalizeImportedStatus(application.status),
    appliedDate: clean(application.appliedDate),
    notes: clean(application.notes),
    createdAt: clean(application.createdAt) || new Date().toISOString(),
    updatedAt: clean(application.updatedAt) || new Date().toISOString()
  };
}

function normalizeImportedStatus(status) {
  const statusValue = clean(status);
  return STATUSES.some((item) => item.value === statusValue) ? statusValue : "saved";
}

function showImportMessage(message) {
  importMessage.textContent = message;

  window.setTimeout(() => {
    if (importMessage.textContent === message) {
      importMessage.textContent = "";
    }
  }, 4500);
}

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

    section.dataset.status = status.value;
    sectionList.dataset.status = status.value;
    section.querySelector("h3").textContent = status.label;
    section.querySelector(".status-count").textContent = String(sectionApplications.length);
    setupDropTarget(sectionList, status.value);

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
  item.draggable = true;
  item.dataset.applicationId = application.id;
  item.querySelector("h4").textContent = application.role;
  item.querySelector(".company-line").textContent = application.company;
  item.querySelector(".meta-line").textContent = buildMetaLine(application);

  const notesLine = item.querySelector(".notes-line");
  notesLine.textContent = application.notes;
  notesLine.hidden = !application.notes;

  item.addEventListener("dragstart", (event) => {
    draggedApplicationId = application.id;
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", application.id);

    dragPlaceholder = createDragPlaceholder(item);
    requestAnimationFrame(() => {
      item.classList.add("is-hidden-during-drag");
    });
  });

  item.addEventListener("dragend", () => {
    draggedApplicationId = "";
    dragPlaceholder?.remove();
    dragPlaceholder = null;
    item.classList.remove("is-dragging");
    item.classList.remove("is-hidden-during-drag");
    clearDropTargets();
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

function setupDropTarget(jobList, statusValue) {
  jobList.addEventListener("dragenter", (event) => {
    event.preventDefault();
    jobList.closest(".status-section").classList.add("is-drop-target");
  });

  jobList.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    jobList.closest(".status-section").classList.add("is-drop-target");
    scrollJobListDuringDrag(jobList, event.clientY);

    if (!dragPlaceholder) {
      return;
    }

    const nextItem = getNextDropItem(jobList, event.clientY);
    if (nextItem) {
      jobList.insertBefore(dragPlaceholder, nextItem);
    } else {
      jobList.append(dragPlaceholder);
    }
  });

  jobList.addEventListener("dragleave", (event) => {
    if (!jobList.contains(event.relatedTarget)) {
      jobList.closest(".status-section").classList.remove("is-drop-target");
    }
  });

  jobList.addEventListener("drop", async (event) => {
    event.preventDefault();
    const applicationId = event.dataTransfer.getData("text/plain") || draggedApplicationId;
    const nextApplicationId = getNextApplicationId(dragPlaceholder);

    if (!applicationId) {
      clearDropState();
      return;
    }

    const application = applications.find((item) => item.id === applicationId);
    if (!application) {
      clearDropState();
      return;
    }

    await moveApplication(applicationId, statusValue, nextApplicationId);
    clearDropState();
  });
}

function createDragPlaceholder(item) {
  const placeholder = document.createElement("div");
  placeholder.className = "drag-placeholder";
  placeholder.style.height = `${item.offsetHeight}px`;
  return placeholder;
}

function getNextDropItem(jobList, pointerY) {
  const draggableItems = [...jobList.querySelectorAll(".job-item:not(.is-dragging)")];

  return draggableItems.find((item) => {
    const rect = item.getBoundingClientRect();
    return pointerY < rect.top + rect.height / 2;
  }) || null;
}

function scrollJobListDuringDrag(jobList, pointerY) {
  const rect = jobList.getBoundingClientRect();
  const edgeSize = 72;
  const maxScrollStep = 35;

  if (pointerY < rect.top + edgeSize) {
    const distanceFromTopEdge = Math.max(pointerY - rect.top, 0);
    const scrollRatio = 1 - distanceFromTopEdge / edgeSize;
    jobList.scrollTop -= Math.ceil(scrollRatio * maxScrollStep);
    return;
  }

  if (pointerY > rect.bottom - edgeSize) {
    const distanceFromBottomEdge = Math.max(rect.bottom - pointerY, 0);
    const scrollRatio = 1 - distanceFromBottomEdge / edgeSize;
    jobList.scrollTop += Math.ceil(scrollRatio * maxScrollStep);
  }
}

function getNextApplicationId(placeholder) {
  let nextElement = placeholder?.nextElementSibling || null;

  while (nextElement && !nextElement.matches(".job-item")) {
    nextElement = nextElement.nextElementSibling;
  }

  return nextElement?.dataset.applicationId || "";
}

function clearDropState() {
  dragPlaceholder?.remove();
  dragPlaceholder = null;
  clearDropTargets();
}

function clearDropTargets() {
  document.querySelectorAll(".is-drop-target").forEach((section) => {
    section.classList.remove("is-drop-target");
  });
}

async function moveApplication(id, nextStatus, nextApplicationId) { 
  const movedApplication = applications.find((application) => application.id === id);
  if (!movedApplication) {
    return;
  }

  const updatedApplication = {
    ...movedApplication,
    status: nextStatus,
    updatedAt: new Date().toISOString()
  };

  const remainingApplications = applications.filter((application) => application.id !== id);
  const targetIndex = nextApplicationId
    ? remainingApplications.findIndex((application) => application.id === nextApplicationId)
    : -1;

  if (targetIndex >= 0) {
    remainingApplications.splice(targetIndex, 0, updatedApplication);
  } else {
    const lastInTargetColumnIndex = findLastIndex(remainingApplications, (application) => getApplicationStatus(application) === nextStatus);
    remainingApplications.splice(lastInTargetColumnIndex + 1, 0, updatedApplication);
  }

  applications = remainingApplications;
  await saveApplications(applications);
  renderApplications();
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }

  return -1;
}

async function deleteApplication(id) {
  applications = applications.filter((application) => application.id !== id);
  await saveApplications(applications);
  renderApplications();
}

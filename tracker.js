const sectionsList = document.querySelector("#sectionsList");
const summary = document.querySelector("#summary");
const searchInput = document.querySelector("#search");
const importButton = document.querySelector("#importBtn");
const importMessage = document.querySelector("#importMessage");
const backupLocationButton = document.querySelector("#backupLocationBtn");
const backupGate = document.querySelector("#backupGate");
const gateBackupButton = document.querySelector("#gateBackupBtn");
const gateRestoreButton = document.querySelector("#gateRestoreBtn");
const applicationsSection = document.querySelector(".applications-section");
const sectionTemplate = document.querySelector("#statusSectionTemplate");
const jobTemplate = document.querySelector("#jobItemTemplate");

let applications = [];
let draggedApplicationId = "";
let dragPlaceholder = null;

document.addEventListener("DOMContentLoaded", async () => {
  applications = await loadApplications();
  try {
    await verifyBackupFileStillExists();
  } catch (error) {
    if (isMissingBackupFileError(error)) {
      showImportMessage(MISSING_BACKUP_FILE_MESSAGE);
    } else {
      console.warn("Backup file check failed", error);
    }
  }
  await updateBackupButtonLabel();
  await updateBackupGate();
  updateRestoreButtons();
  await showSetupMessageFromUrl();
  renderApplications();
});

searchInput.addEventListener("input", renderApplications);

importButton.addEventListener("click", () => {
  restoreApplicationsFromConnectedBackup();
});

gateRestoreButton.addEventListener("click", () => {
  restoreApplicationsFromConnectedBackup();
});

async function restoreApplicationsFromConnectedBackup() {
  if (applications.length > 0) {
    showImportMessage("Restore is available only when there are no saved applications.");
    return;
  }

  try {
    const file = await readConnectedBackupFile({ requestPermission: true });
    const importedApplications = await readApplicationsBackup(file);
    applications = importedApplications;
    await saveApplications(applications);
    updateRestoreButtons();
    renderApplications();
    showImportMessage(`${applications.length} ${applications.length === 1 ? "application" : "applications"} restored from backup.`);
  } catch (error) {
    if (isMissingBackupFileError(error)) {
      showBackupDisconnectedState(MISSING_BACKUP_FILE_MESSAGE);
      return;
    }

    showImportMessage(error.message);
  }
}

backupLocationButton.addEventListener("click", async () => {
  await connectBackupFile();
});

gateBackupButton.addEventListener("click", async () => {
  await connectBackupFile();
});

async function connectBackupFile() {
  try {
    const handle = await chooseBackupFile();
    await updateBackupButtonLabel(handle);
    await updateBackupGate(handle);

    if (applications.length === 0) {
      showImportMessage("Backup file connected. Use Restore Backup if you need to load saved applications.");
      return;
    }

    await writeBackupWithStatus("Backup file connected and updated.", true);
  } catch (error) {
    if (error.name !== "AbortError") {
      alert(error.message);
    }
  }
}

async function updateBackupButtonLabel(handle) {
  const backupHandle = handle || await getBackupFileHandle();

  backupLocationButton.textContent = backupHandle ? `Backup: ${backupHandle.name}` : "Choose Backup File";
  backupLocationButton.disabled = Boolean(backupHandle);
  backupLocationButton.title = backupHandle
    ? `Backup file: ${backupHandle.name}`
    : "Choose backup file";
}

async function updateBackupGate(handle) {
  const backupHandle = handle || await getBackupFileHandle();
  const needsBackup = !backupHandle;

  backupGate.hidden = !needsBackup;
  applicationsSection.classList.toggle("is-disabled", needsBackup);
  searchInput.disabled = needsBackup;
}

function showBackupDisconnectedState(message) {
  backupLocationButton.textContent = "Choose Backup File";
  backupLocationButton.disabled = false;
  backupLocationButton.title = "Choose backup file";
  backupGate.hidden = false;
  applicationsSection.classList.add("is-disabled");
  searchInput.disabled = true;
  showImportMessage(message);
}

function updateRestoreButtons() {
  const canRestore = applications.length === 0;
  importButton.disabled = !canRestore;
  gateRestoreButton.disabled = !canRestore;
  importButton.title = canRestore
    ? "Restore applications from a backup file"
    : "Restore is available only when there are no saved applications.";
  gateRestoreButton.title = importButton.title;
}

async function showSetupMessageFromUrl() {
  const setupReason = new URLSearchParams(window.location.search).get("setup");
  if (!setupReason) {
    return;
  }

  const backupHandle = await getBackupFileHandle();
  clearSetupMessageFromUrl();

  if (backupHandle) {
    return;
  }

  if (setupReason === "backupMissing") {
    showBackupDisconnectedState(MISSING_BACKUP_FILE_MESSAGE);
    return;
  }

  if (setupReason === "backupRequired") {
    showBackupDisconnectedState("Choose a backup file before saving jobs from the popup.");
  }
}

function clearSetupMessageFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("setup");
  window.history.replaceState({}, "", url);
}

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

  return normalizeApplicationRecord(application);
}

function showImportMessage(message) {
  importMessage.textContent = message;

  window.setTimeout(() => {
    if (importMessage.textContent === message) {
      importMessage.textContent = "";
    }
  }, 4500);
}

async function writeBackupWithStatus(successMessage, requestPermission = false) {
  try {
    const backupHandle = await getBackupFileHandle();
    if (!backupHandle) {
      return false;
    }

    const didWrite = await writeApplicationsBackup(applications, { requestPermission });

    if (didWrite && successMessage) {
      showImportMessage(successMessage);
    }

    if (!didWrite) {
      await clearBackupFileHandle();
      showBackupDisconnectedState("Backup file not updated. Choose Backup File again.");
    }

    return didWrite;
  } catch (error) {
    console.warn("Backup write failed", error);
    showBackupDisconnectedState(isMissingBackupFileError(error) ? MISSING_BACKUP_FILE_MESSAGE : "Backup file not updated. Choose Backup File again.");
    return false;
  }
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
    empty.textContent = applications.length === 0
      ? "No applications found in browser storage. Use Restore Backup to load your saved backup, or use the popup to add your first job."
      : "No applications match this view.";
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
  item.title = application.role;
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
  const status = getApplicationStatus(application);
  const statusDate = getStatusEventDate(application, status);
  const parts = [
    statusDate ? `${statusLabel(status)} ${statusDate}` : "",
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

  const previousStatus = getApplicationStatus(movedApplication);
  const events = Array.isArray(movedApplication.events) ? movedApplication.events : [];
  const updatedApplication = {
    ...movedApplication,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
    events: previousStatus === nextStatus
      ? events
      : buildStatusEventsForMove(events, nextStatus)
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
  updateRestoreButtons();
  await writeBackupWithStatus();
  renderApplications();
}

function buildStatusEventsForMove(events, nextStatus) {
  if (nextStatus === "saved") {
    return [createStatusEvent("saved")];
  }

  const nextStatusIndex = getStatusIndex(nextStatus);
  const retainedEvents = events.filter((event) => {
    const eventStatusIndex = getStatusIndex(event.status);
    return event.type === "status" && eventStatusIndex >= 0 && eventStatusIndex < nextStatusIndex;
  });

  return [
    ...retainedEvents,
    createStatusEvent(nextStatus)
  ];
}

function getStatusIndex(status) {
  return STATUSES.findIndex((item) => item.value === status);
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
  updateRestoreButtons();
  await writeBackupWithStatus();
  renderApplications();
}

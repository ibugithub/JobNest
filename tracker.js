const sectionsList = document.querySelector("#sectionsList");
const summary = document.querySelector("#summary");
const searchInput = document.querySelector("#search");
const statsButton = document.querySelector("#statsBtn");
const importButton = document.querySelector("#importBtn");
const importMessage = document.querySelector("#importMessage");
const backupLocationButton = document.querySelector("#backupLocationBtn");
const backupGate = document.querySelector("#backupGate");
const backupGateTitle = document.querySelector("#backupGateTitle");
const backupGateMessage = document.querySelector("#backupGateMessage");
const gateBackupButton = document.querySelector("#gateBackupBtn");
const gateRestoreButton = document.querySelector("#gateRestoreBtn");
const applicationsSection = document.querySelector(".applications-section");
const sectionTemplate = document.querySelector("#statusSectionTemplate");
const jobTemplate = document.querySelector("#jobItemTemplate");

let applications = [];
let draggedApplicationId = "";
let dragPlaceholder = null;
let dragState = null;
let dragMoveFrame = 0;
let pendingDragPoint = null;

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
  applyCompanyFilterFromUrl();
  renderApplications();
});

searchInput.addEventListener("input", renderApplications);

statsButton.addEventListener("click", () => {
  window.location.href = chrome.runtime.getURL("stats.html");
});

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
    const handle = backupLocationButton.textContent.startsWith("Reconnect")
      ? await reconnectBackupFile()
      : await chooseBackupFile();
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
  backupGate.classList.remove("is-warning");
  backupGateTitle.textContent = "Connect a backup file to continue";
  backupGateMessage.textContent = "JobNest needs a backup JSON file before you manage applications. If browser storage was cleared, restore your previous backup after connecting a backup file.";
  gateBackupButton.textContent = "Choose Backup File";
  applicationsSection.classList.toggle("is-disabled", needsBackup);
  searchInput.disabled = needsBackup;
}

function showBackupDisconnectedState(message) {
  backupLocationButton.textContent = "Choose Backup File";
  backupLocationButton.disabled = false;
  backupLocationButton.title = "Choose backup file";
  backupGate.classList.add("is-warning");
  backupGate.hidden = false;
  backupGateTitle.textContent = "Backup setup needed";
  backupGateMessage.textContent = message;
  gateBackupButton.textContent = "Choose Backup File";
  applicationsSection.classList.add("is-disabled");
  searchInput.disabled = true;
}

async function showBackupPermissionNeededState(message) {
  const backupHandle = await getBackupFileHandle();

  backupLocationButton.textContent = backupHandle ? `Reconnect: ${backupHandle.name}` : "Choose Backup File";
  backupLocationButton.disabled = false;
  backupLocationButton.title = backupHandle
    ? `Reconnect backup file: ${backupHandle.name}`
    : "Choose backup file";
  backupGate.classList.add("is-warning");
  backupGate.hidden = false;
  backupGateTitle.textContent = backupHandle ? "Reconnect backup file" : "Backup setup needed";
  backupGateMessage.textContent = message;
  gateBackupButton.textContent = backupHandle ? "Reconnect Backup" : "Choose Backup File";
  applicationsSection.classList.add("is-disabled");
  searchInput.disabled = true;
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

  if (setupReason === "backupPermission") {
    await showBackupPermissionNeededState("JobNest cannot update your backup file until you reconnect it. Click Reconnect Backup to continue saving jobs.");
    return;
  }

  if (setupReason === "restoreRequired") {
    showBackupRestoreRequiredState();
    return;
  }

  if (setupReason === "backupMissing") {
    showBackupDisconnectedState("Your selected backup file was moved or deleted. Choose Backup File again before saving jobs.");
    return;
  }

  if (setupReason === "backupRequired") {
    if (backupHandle) {
      await showBackupPermissionNeededState("JobNest needs permission to update your backup file. Click Reconnect Backup to continue saving jobs.");
      return;
    }

    showBackupDisconnectedState("Choose a backup file before saving jobs from the popup.");
  }
}

function showBackupRestoreRequiredState() {
  backupGate.classList.add("is-warning");
  backupGate.hidden = false;
  backupGateTitle.textContent = "Restore backup before saving";
  backupGateMessage.textContent = "Browser storage is empty, but your backup file has saved applications. Restore Backup before adding new jobs.";
  gateBackupButton.textContent = "Choose Backup File";
  applicationsSection.classList.add("is-disabled");
  searchInput.disabled = true;
}

function clearSetupMessageFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("setup");
  window.history.replaceState({}, "", url);
}

function applyCompanyFilterFromUrl() {
  const company = new URLSearchParams(window.location.search).get("company");
  if (!company) {
    return;
  }

  searchInput.value = company;
  showImportMessage(`Showing applications for ${company}.`);

  const url = new URL(window.location.href);
  url.searchParams.delete("company");
  window.history.replaceState({}, "", url);
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
      await showBackupPermissionNeededState("Backup file permission is needed. Click Reconnect Backup.");
    }

    return didWrite;
  } catch (error) {
    console.warn("Backup write failed", error);
    if (isMissingBackupFileError(error)) {
      showBackupDisconnectedState(MISSING_BACKUP_FILE_MESSAGE);
      return false;
    }

    if (isBackupPermissionError(error)) {
      await showBackupPermissionNeededState("Backup file permission is needed. Click Reconnect Backup.");
      return false;
    }

    showImportMessage("Backup file not updated. Your board change was saved in browser storage.");
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
  item.dataset.applicationId = application.id;
  item.title = application.role;
  item.querySelector("h4").textContent = application.role;
  item.querySelector(".company-line").textContent = application.company;
  item.querySelector(".meta-line").textContent = buildMetaLine(application);

  const notesLine = item.querySelector(".notes-line");
  notesLine.textContent = application.notes;
  notesLine.hidden = !application.notes;

  item.addEventListener("pointerdown", (event) => {
    preparePointerDrag(event, item, application.id);
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
  jobList.dataset.status = statusValue;
}

function preparePointerDrag(event, item, applicationId) {
  if (event.button !== 0 || event.target.closest("a, button, input, select, textarea")) {
    return;
  }

  dragState = {
    applicationId,
    item,
    startX: event.clientX,
    startY: event.clientY,
    pointerX: event.clientX,
    pointerY: event.clientY,
    offsetX: 0,
    offsetY: 0,
    preview: null,
    hasStarted: false
  };

  item.setPointerCapture?.(event.pointerId);
  document.addEventListener("pointermove", handlePointerDragMove);
  document.addEventListener("pointerup", handlePointerDragEnd, { once: true });
  document.addEventListener("pointercancel", cancelPointerDrag, { once: true });
}

function handlePointerDragMove(event) {
  if (!dragState) {
    return;
  }

  dragState.pointerX = event.clientX;
  dragState.pointerY = event.clientY;
  pendingDragPoint = {
    x: event.clientX,
    y: event.clientY
  };

  if (!dragState.hasStarted) {
    const moveDistance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (moveDistance < 6) {
      return;
    }

    startPointerDrag();
  }

  event.preventDefault();

  if (!dragMoveFrame) {
    dragMoveFrame = requestAnimationFrame(updatePointerDrag);
  }
}

function startPointerDrag() {
  const rect = dragState.item.getBoundingClientRect();
  const preview = dragState.item.cloneNode(true);

  draggedApplicationId = dragState.applicationId;
  dragState.hasStarted = true;
  dragState.offsetX = dragState.startX - rect.left;
  dragState.offsetY = dragState.startY - rect.top;
  dragState.preview = preview;

  preview.classList.add("drag-preview");
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  positionDragPreview(preview, dragState.pointerX, dragState.pointerY);
  document.body.append(preview);

  dragPlaceholder = createDragPlaceholder(dragState.item);
  dragState.item.before(dragPlaceholder);
  dragState.item.classList.add("is-dragging", "is-hidden-during-drag");
  document.body.classList.add("is-board-dragging");
  updatePointerDrag();
}

function updatePointerDrag() {
  dragMoveFrame = 0;

  if (!dragState?.hasStarted || !pendingDragPoint) {
    return;
  }

  const { x, y } = pendingDragPoint;
  const left = x - dragState.offsetX;
  const top = y - dragState.offsetY;

  dragState.preview.style.transform = `translate3d(${left}px, ${top}px, 0) rotate(0.35deg)`;
  scrollDuringPointerDrag(x, y);
  updateDropPosition(x, y);
}

function positionDragPreview(preview, pointerX, pointerY) {
  const left = pointerX - dragState.offsetX;
  const top = pointerY - dragState.offsetY;
  preview.style.transform = `translate3d(${left}px, ${top}px, 0) rotate(0.35deg)`;
}

function updateDropPosition(pointerX, pointerY) {
  if (!dragPlaceholder) {
    return;
  }

  const targetList = getDropListAtPoint(pointerX, pointerY);
  if (!targetList) {
    clearDropTargets();
    return;
  }

  clearDropTargets();
  targetList.closest(".status-section").classList.add("is-drop-target");

  const nextItem = getNextDropItem(targetList, pointerY);
  const nextSibling = nextItem || null;

  if (dragPlaceholder.parentElement === targetList && dragPlaceholder.nextElementSibling === nextSibling) {
    return;
  }

  const currentList = dragPlaceholder.parentElement;
  const animatedLists = currentList === targetList ? [targetList] : [currentList, targetList].filter(Boolean);

  animateListsReorder(animatedLists, () => {
    targetList.insertBefore(dragPlaceholder, nextSibling);
  });
}

function getDropListAtPoint(pointerX, pointerY) {
  const element = document.elementFromPoint(pointerX, pointerY);
  const directList = element?.closest(".job-list");

  if (directList) {
    return directList;
  }

  return [...document.querySelectorAll(".job-list")].find((jobList) => {
    const rect = jobList.getBoundingClientRect();
    return pointerX >= rect.left && pointerX <= rect.right && pointerY >= rect.top && pointerY <= rect.bottom;
  }) || null;
}

async function handlePointerDragEnd() {
  document.removeEventListener("pointermove", handlePointerDragMove);
  document.removeEventListener("pointercancel", cancelPointerDrag);

  if (!dragState?.hasStarted) {
    dragState = null;
    return;
  }

  const applicationId = draggedApplicationId;
  const targetList = dragPlaceholder?.closest(".job-list") || null;
  const nextApplicationId = getNextApplicationId(dragPlaceholder);
  const nextStatus = targetList?.dataset.status || "";

  if (!applicationId || !nextStatus || !applications.some((item) => item.id === applicationId)) {
    clearDropState();
    return;
  }

  try {
    await moveApplication(applicationId, nextStatus, nextApplicationId);
  } catch (error) {
    console.warn("Move failed", error);
    renderApplications();
  } finally {
    clearDropState();
  }
}

function cancelPointerDrag() {
  document.removeEventListener("pointermove", handlePointerDragMove);
  document.removeEventListener("pointerup", handlePointerDragEnd);
  clearDropState();
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

function scrollDuringPointerDrag(pointerX, pointerY) {
  const targetList = getDropListAtPoint(pointerX, pointerY);
  if (targetList) {
    scrollJobListDuringDrag(targetList, pointerY);
  }

  scrollBoardDuringDrag(pointerX);
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

function scrollBoardDuringDrag(pointerX) {
  const rect = applicationsSection.getBoundingClientRect();
  const edgeSize = 96;
  const maxScrollStep = 28;

  if (pointerX < rect.left + edgeSize) {
    const distanceFromLeftEdge = Math.max(pointerX - rect.left, 0);
    const scrollRatio = 1 - distanceFromLeftEdge / edgeSize;
    applicationsSection.scrollLeft -= Math.ceil(scrollRatio * maxScrollStep);
    return;
  }

  if (pointerX > rect.right - edgeSize) {
    const distanceFromRightEdge = Math.max(rect.right - pointerX, 0);
    const scrollRatio = 1 - distanceFromRightEdge / edgeSize;
    applicationsSection.scrollLeft += Math.ceil(scrollRatio * maxScrollStep);
  }
}

function animateListsReorder(jobLists, updateList) {
  const movingElements = [...new Set(jobLists.flatMap((jobList) => {
    return [...jobList.querySelectorAll(".job-item:not(.is-hidden-during-drag), .drag-placeholder")];
  }))];
  const previousRects = new Map(movingElements.map((element) => [element, element.getBoundingClientRect()]));

  updateList();

  for (const element of movingElements) {
    const previousRect = previousRects.get(element);
    if (!previousRect || !element.isConnected) {
      continue;
    }

    const nextRect = element.getBoundingClientRect();
    const deltaY = previousRect.top - nextRect.top;

    if (!deltaY) {
      continue;
    }

    element.animate(
      [
        { transform: `translate3d(0, ${deltaY}px, 0)` },
        { transform: "translate3d(0, 0, 0)" }
      ],
      {
        duration: 170,
        easing: "cubic-bezier(0.2, 0, 0, 1)"
      }
    );
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
  draggedApplicationId = "";
  cancelAnimationFrame(dragMoveFrame);
  dragMoveFrame = 0;
  pendingDragPoint = null;
  dragState?.preview?.remove();
  dragState = null;
  dragPlaceholder?.remove();
  dragPlaceholder = null;
  document.body.classList.remove("is-board-dragging");
  document.querySelectorAll(".is-dragging, .is-hidden-during-drag").forEach((item) => {
    item.classList.remove("is-dragging");
    item.classList.remove("is-hidden-during-drag");
  });
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

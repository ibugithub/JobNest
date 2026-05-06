const summary = document.querySelector("#summary");
const trackerButton = document.querySelector("#trackerBtn");
const exportButton = document.querySelector("#exportBtn");
const exportMenu = document.querySelector("#exportMenu");
const totalApplications = document.querySelector("#totalApplications");
const appliedApplications = document.querySelector("#appliedApplications");
const interviewApplications = document.querySelector("#interviewApplications");
const offerApplications = document.querySelector("#offerApplications");
const trendGraph = document.querySelector("#trendGraph");
const timeChart = document.querySelector("#timeChart");
const companyList = document.querySelector("#companyList");
const selectedCompanyTitle = document.querySelector("#selectedCompanyTitle");
const companyApplications = document.querySelector("#companyApplications");
const rangeButtons = [...document.querySelectorAll(".segment-button")];

let applications = [];
let activeRange = "daily";
let timeRows = [];
let selectedCompany = "";

document.addEventListener("DOMContentLoaded", async () => {
  applications = await loadApplications();
  renderStats();
});

window.addEventListener("resize", () => {
  drawTrendGraph(timeRows);
});

trackerButton.addEventListener("click", () => {
  window.location.href = chrome.runtime.getURL("tracker.html");
});

exportButton.addEventListener("click", () => {
  const isOpen = !exportMenu.hidden;
  exportMenu.hidden = isOpen;
  exportButton.setAttribute("aria-expanded", String(!isOpen));
});

exportMenu.addEventListener("click", (event) => {
  const button = event.target.closest("[data-export-range]");
  if (!button) {
    return;
  }

  exportMenu.hidden = true;
  exportButton.setAttribute("aria-expanded", "false");
  exportStatsReport(button.dataset.exportRange);
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".export-menu")) {
    return;
  }

  exportMenu.hidden = true;
  exportButton.setAttribute("aria-expanded", "false");
});

rangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeRange = button.dataset.range;
    rangeButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    renderTimeChart();
  });
});

function renderStats() {
  const appliedItems = applications.filter(hasAppliedActivity);
  const interviewItems = applications.filter((application) => hasStatusActivity(application, "interview"));
  const offerItems = applications.filter((application) => hasStatusActivity(application, "offer"));

  summary.textContent = `${applications.length} ${applications.length === 1 ? "application" : "applications"} tracked`;
  totalApplications.textContent = String(applications.length);
  appliedApplications.textContent = String(appliedItems.length);
  interviewApplications.textContent = String(interviewItems.length);
  offerApplications.textContent = String(offerItems.length);

  renderTimeChart();
  const companyCounts = countBy(appliedItems, (application) => clean(application.company) || "Not specified");
  selectedCompany = selectedCompany || companyCounts[0]?.[0] || "";
  renderCompanyList(companyCounts);
  renderCompanyApplications();
}

function renderTimeChart() {
  const appliedDates = applications
    .map(getAppliedDate)
    .filter(Boolean);
  const buckets = createTimeBuckets(activeRange);
  const counts = countDatesByBucket(appliedDates, activeRange);
  const rows = buckets.map((bucket) => ({
    label: bucket.label,
    value: counts.get(bucket.key) || 0
  }));

  timeRows = rows;
  drawTrendGraph(rows);
  renderBars(timeChart, rows);
}

function drawTrendGraph(rows) {
  const context = trendGraph.getContext("2d");
  const rect = trendGraph.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(Math.floor(rect.width), 320);
  const height = Math.max(Math.floor(rect.height), 220);

  trendGraph.width = Math.floor(width * ratio);
  trendGraph.height = Math.floor(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const padding = {
    top: 34,
    right: 28,
    bottom: 46,
    left: 48
  };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const ySteps = Math.min(maxValue, 4);

  drawGraphGrid(context, width, height, padding, graphWidth, graphHeight, maxValue, ySteps);

  if (rows.length === 0 || rows.every((row) => row.value === 0)) {
    drawEmptyGraphMessage(context, width, height);
    return;
  }

  const slotWidth = rows.length > 1 ? graphWidth / rows.length : graphWidth;
  const points = rows.map((row, index) => {
    const x = rows.length > 1
      ? padding.left + slotWidth * index + slotWidth / 2
      : padding.left + graphWidth / 2;
    const barHeight = (row.value / maxValue) * graphHeight;
    const y = padding.top + graphHeight - barHeight;
    return { x, y, value: row.value, label: row.label };
  });

  drawTrendArea(context, points, padding, graphHeight);

  drawTrendLine(context, points);
  drawGraphLabels(context, points, padding, graphHeight);
}

function drawGraphGrid(context, width, height, padding, graphWidth, graphHeight, maxValue, ySteps) {
  context.strokeStyle = "#e6edf6";
  context.lineWidth = 1;
  context.fillStyle = "#7890a8";
  context.font = "700 12px Inter, system-ui, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let index = 0; index <= ySteps; index += 1) {
    const value = Math.round((maxValue / ySteps) * index);
    const y = padding.top + graphHeight - (index / ySteps) * graphHeight;

    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(String(value), padding.left - 10, y);
  }

  context.strokeStyle = "#cbd5e1";
  context.beginPath();
  context.moveTo(padding.left, height - padding.bottom);
  context.lineTo(padding.left + graphWidth, height - padding.bottom);
  context.stroke();
}

function drawTrendArea(context, points, padding, graphHeight) {
  const bottom = padding.top + graphHeight;
  const gradient = context.createLinearGradient(0, padding.top, 0, bottom);

  gradient.addColorStop(0, "rgba(20, 184, 166, 0.22)");
  gradient.addColorStop(0.55, "rgba(37, 99, 235, 0.08)");
  gradient.addColorStop(1, "rgba(37, 99, 235, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(points[0].x, bottom);
  drawSmoothPath(context, points);
  context.lineTo(points[points.length - 1].x, bottom);
  context.closePath();
  context.fill();
}

function drawTrendLine(context, points) {
  context.save();
  context.shadowColor = "rgba(20, 184, 166, 0.28)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 5;
  context.strokeStyle = "#0f766e";
  context.lineWidth = 4;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  drawSmoothPath(context, points);
  context.stroke();
  context.restore();

  context.strokeStyle = "#5eead4";
  context.lineWidth = 1.5;
  context.beginPath();
  drawSmoothPath(context, points);
  context.stroke();

  points.forEach((point) => {
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#0f766e";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (point.value > 0) {
      drawValuePill(context, point);
    }
  });
}

function drawSmoothPath(context, points) {
  context.moveTo(points[0].x, points[0].y);

  if (points.length === 1) {
    return;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const previousPoint = points[index - 1] || points[index];
    const currentPoint = points[index];
    const nextPoint = points[index + 1];
    const afterNextPoint = points[index + 2] || nextPoint;
    const firstControlPoint = {
      x: currentPoint.x + (nextPoint.x - previousPoint.x) / 6,
      y: currentPoint.y + (nextPoint.y - previousPoint.y) / 6
    };
    const secondControlPoint = {
      x: nextPoint.x - (afterNextPoint.x - currentPoint.x) / 6,
      y: nextPoint.y - (afterNextPoint.y - currentPoint.y) / 6
    };

    context.bezierCurveTo(
      firstControlPoint.x,
      firstControlPoint.y,
      secondControlPoint.x,
      secondControlPoint.y,
      nextPoint.x,
      nextPoint.y
    );
  }
}

function drawValuePill(context, point) {
  const text = String(point.value);
  const width = Math.max(context.measureText(text).width + 16, 24);
  const height = 20;
  const x = point.x - width / 2;
  const y = point.y - 32;

  context.fillStyle = "#0f172a";
  drawRoundedRect(context, x, y, width, height, 10);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "800 11px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, point.x, y + height / 2);
}

function drawGraphLabels(context, points, padding, graphHeight) {
  context.fillStyle = "#64748b";
  context.font = "700 11px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "top";

  const labelStep = Math.max(Math.ceil(points.length / 7), 1);

  points.forEach((point, index) => {
    if (index % labelStep !== 0 && index !== points.length - 1) {
      return;
    }

    context.fillText(point.label, point.x, padding.top + graphHeight + 12);
  });
}

function drawEmptyGraphMessage(context, width, height) {
  context.fillStyle = "#64748b";
  context.font = "800 14px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("No application activity yet.", width / 2, height / 2);
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function renderBars(container, rows) {
  container.replaceChildren();

  if (rows.length === 0 || rows.every((row) => row.value === 0)) {
    container.append(createEmptyMessage("No application activity yet."));
    return;
  }

  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  rows.forEach((row) => {
    const item = document.createElement("div");
    const label = document.createElement("span");
    const track = document.createElement("div");
    const fill = document.createElement("div");
    const value = document.createElement("span");

    item.className = "bar-row";
    label.className = "bar-label";
    track.className = "bar-track";
    fill.className = "bar-fill";
    value.className = "bar-value";

    label.textContent = row.label;
    label.title = row.label;
    fill.style.setProperty("--bar-width", `${Math.max((row.value / maxValue) * 100, row.value > 0 ? 4 : 0)}%`);
    value.textContent = String(row.value);

    track.append(fill);
    item.append(label, track, value);
    container.append(item);
  });
}

function renderCompanyList(counts) {
  companyList.replaceChildren();

  if (counts.length === 0) {
    companyList.append(createEmptyMessage("No applied jobs yet."));
    return;
  }

  counts.forEach(([labelText, count]) => {
    const item = document.createElement("button");
    const label = document.createElement("span");
    const value = document.createElement("span");

    item.className = "rank-row";
    item.type = "button";
    item.classList.toggle("is-selected", labelText === selectedCompany);
    item.addEventListener("click", () => {
      selectedCompany = labelText;
      renderCompanyList(counts);
      renderCompanyApplications();
    });
    label.className = "rank-label";
    value.className = "rank-count";

    label.textContent = labelText;
    label.title = labelText;
    value.textContent = String(count);

    item.append(label, value);
    companyList.append(item);
  });
}

function renderCompanyApplications() {
  companyApplications.replaceChildren();

  if (!selectedCompany) {
    selectedCompanyTitle.textContent = "Company Applications";
    companyApplications.append(createEmptyMessage("Select a company to view applications."));
    return;
  }

  const matchingApplications = applications.filter((application) => (clean(application.company) || "Not specified") === selectedCompany);
  selectedCompanyTitle.textContent = selectedCompany;

  if (matchingApplications.length === 0) {
    companyApplications.append(createEmptyMessage("No applications found for this company."));
    return;
  }

  matchingApplications.forEach((application) => {
    const item = document.createElement("article");
    const role = document.createElement("h3");
    const meta = document.createElement("p");
    const link = document.createElement("button");

    item.className = "company-job";
    role.textContent = clean(application.role) || "Untitled role";
    role.title = role.textContent;
    meta.textContent = [
      statusLabel(getApplicationStatus(application)),
      getStatusEventDate(application, getApplicationStatus(application)),
      clean(application.location)
    ].filter(Boolean).join(" | ");

    link.type = "button";
    link.textContent = "Open job";
    link.addEventListener("click", () => {
      window.location.href = chrome.runtime.getURL(`tracker.html?company=${encodeURIComponent(selectedCompany)}`);
    });
    item.append(role, meta, link);

    companyApplications.append(item);
  });
}

function exportStatsReport(range) {
  const reportPeriod = getReportPeriod(range);
  const reportRows = buildReportRows(reportPeriod);
  const reportApplications = getApplicationsForPeriod(reportPeriod);
  const companyCounts = countBy(reportApplications, (application) => clean(application.company) || "Not specified");
  const reportWindow = window.open("", "_blank");

  if (!reportWindow) {
    alert("Allow popups to export the PDF report.");
    return;
  }

  reportWindow.document.write(buildReportHtml(range, reportPeriod, reportRows, reportApplications, companyCounts));
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.addEventListener("load", () => {
    reportWindow.print();
  });
}

function buildReportRows(reportPeriod) {
  const appliedDates = getApplicationsForPeriod(reportPeriod).map(getAppliedDate).filter(Boolean);
  const counts = countDatesByBucket(appliedDates, reportPeriod.bucketRange);

  return reportPeriod.buckets.map((bucket) => ({
    label: bucket.label,
    key: bucket.key,
    value: counts.get(bucket.key) || 0
  }));
}

function getApplicationsForPeriod(reportPeriod) {
  return applications
    .filter(hasAppliedActivity)
    .filter((application) => {
      const date = parseDate(getAppliedDate(application));
      return date && date >= reportPeriod.startDate && date <= reportPeriod.endDate;
    });
}

function buildReportHtml(range, reportPeriod, rows, reportApplications, companyCounts) {
  const generatedAt = new Date().toLocaleString();
  const periodText = `${formatReportDate(reportPeriod.startDate)} - ${formatReportDate(reportPeriod.endDate)}`;
  const totalApplied = reportApplications.length;
  const interviews = reportApplications.filter((application) => hasStatusActivity(application, "interview")).length;
  const offers = reportApplications.filter((application) => hasStatusActivity(application, "offer")).length;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>JobNest ${escapeHtml(toTitleCase(range))} Report</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; color: #111827; font-family: Inter, Arial, sans-serif; }
          main { padding: 32px; }
          header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 18px; }
          h1 { margin: 0; font-size: 26px; }
          h2 { margin: 26px 0 12px; font-size: 16px; }
          p { margin: 5px 0; color: #64748b; }
          .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 22px; }
          .metric { border: 1px solid #dbe3ee; border-radius: 8px; padding: 14px; }
          .metric span { color: #64748b; font-size: 12px; font-weight: 700; }
          .metric strong { display: block; margin-top: 6px; font-size: 24px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 9px 8px; text-align: left; vertical-align: top; }
          th { color: #475569; font-size: 12px; text-transform: uppercase; }
          td { font-size: 13px; }
          .muted { color: #64748b; }
          @media print { main { padding: 20px; } button { display: none; } }
        </style>
      </head>
      <body>
        <main>
          <header>
            <div>
              <h1>JobNest ${escapeHtml(toTitleCase(range))} Report</h1>
              <p>${escapeHtml(periodText)}</p>
              <p>Generated ${escapeHtml(generatedAt)}</p>
            </div>
            <p>${escapeHtml(String(applications.length))} total applications tracked</p>
          </header>

          <section class="summary">
            <div class="metric"><span>Applied in report</span><strong>${escapeHtml(String(totalApplied))}</strong></div>
            <div class="metric"><span>Interviews</span><strong>${escapeHtml(String(interviews))}</strong></div>
            <div class="metric"><span>Offers</span><strong>${escapeHtml(String(offers))}</strong></div>
          </section>

          <section>
            <h2>${escapeHtml(toTitleCase(range))} Activity</h2>
            ${buildRowsTable(rows, ["Period", "Applications"], (row) => [row.label, String(row.value)])}
          </section>

          <section>
            <h2>Companies</h2>
            ${buildRowsTable(companyCounts, ["Company", "Applications"], ([company, count]) => [company, String(count)])}
          </section>

          <section>
            <h2>Application Details</h2>
            ${buildRowsTable(reportApplications, ["Company", "Role", "Status", "Date", "Location"], (application) => [
              clean(application.company) || "Not specified",
              clean(application.role) || "Untitled role",
              statusLabel(getApplicationStatus(application)),
              getAppliedDate(application) || "",
              clean(application.location) || ""
            ])}
          </section>
        </main>
      </body>
    </html>
  `;
}

function buildRowsTable(rows, headers, getCells) {
  if (rows.length === 0) {
    return `<p class="muted">No data available.</p>`;
  }

  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr>${getCells(row).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function getReportPeriod(range) {
  const today = startOfDay(new Date());

  if (range === "weekly") {
    const startDate = startOfWeek(today);
    const endDate = endOfDay(addDays(startDate, 6));
    return {
      startDate,
      endDate,
      bucketRange: "daily",
      buckets: createBucketsBetween(startDate, endDate, "daily")
    };
  }

  if (range === "monthly") {
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    return {
      startDate,
      endDate,
      bucketRange: "daily",
      buckets: createBucketsBetween(startDate, endDate, "daily")
    };
  }

  if (range === "yearly") {
    const startDate = new Date(today.getFullYear(), 0, 1);
    const endDate = endOfDay(new Date(today.getFullYear(), 11, 31));
    return {
      startDate,
      endDate,
      bucketRange: "monthly",
      buckets: createMonthsBetween(startDate, endDate)
    };
  }

  return {
    startDate: today,
    endDate: endOfDay(today),
    bucketRange: "daily",
    buckets: [
      {
        key: toDateKey(today),
        label: "Today"
      }
    ]
  };
}

function createBucketsBetween(startDate, endDate, bucketRange) {
  const buckets = [];
  let date = startOfDay(startDate);

  while (date <= endDate) {
    buckets.push({
      key: getBucketKey(date, bucketRange),
      label: formatDayLabel(date)
    });
    date = addDays(date, 1);
  }

  return buckets;
}

function createMonthsBetween(startDate, endDate) {
  const buckets = [];
  let date = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  while (date <= endDate) {
    buckets.push({
      key: getBucketKey(date, "monthly"),
      label: date.toLocaleDateString(undefined, { month: "short" })
    });
    date = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }

  return buckets;
}

function toTitleCase(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createTimeBuckets(range) {
  if (range === "weekly") {
    return createRecentBuckets(8, startOfWeek, addDays, 7, formatWeekLabel);
  }

  if (range === "monthly") {
    return createRecentMonths(12);
  }

  if (range === "yearly") {
    return createRecentYears(5);
  }

  return createRecentBuckets(14, startOfDay, addDays, 1, formatDayLabel);
}

function createRecentBuckets(count, startFunction, addFunction, step, labelFunction) {
  const today = startFunction(new Date());
  const buckets = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = addFunction(today, -index * step);
    buckets.push({
      key: toDateKey(date),
      label: labelFunction(date)
    });
  }

  return buckets;
}

function createRecentMonths(count) {
  const today = new Date();
  const buckets = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
    });
  }

  return buckets;
}

function createRecentYears(count) {
  const currentYear = new Date().getFullYear();
  const buckets = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const year = currentYear - index;
    buckets.push({
      key: String(year),
      label: String(year)
    });
  }

  return buckets;
}

function countDatesByBucket(dates, range) {
  const counts = new Map();

  dates.forEach((dateText) => {
    const date = parseDate(dateText);
    if (!date) {
      return;
    }

    const key = getBucketKey(date, range);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

function getBucketKey(date, range) {
  if (range === "weekly") {
    return toDateKey(startOfWeek(date));
  }

  if (range === "monthly") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  if (range === "yearly") {
    return String(date.getFullYear());
  }

  return toDateKey(date);
}

function getAppliedDate(application) {
  const appliedEvent = getStatusEvents(application, "applied").at(-1);
  if (appliedEvent?.date) {
    return appliedEvent.date;
  }

  if (hasAppliedActivity(application)) {
    return clean(application.appliedDate) || clean(application.createdAt).slice(0, 10);
  }

  return "";
}

function hasAppliedActivity(application) {
  return hasStatusActivity(application, "applied")
    || ["applied", "screening", "interview", "offer", "rejected"].includes(getApplicationStatus(application));
}

function hasStatusActivity(application, status) {
  return getApplicationStatus(application) === status || getStatusEvents(application, status).length > 0;
}

function getStatusEvents(application, status) {
  return Array.isArray(application.events)
    ? application.events.filter((event) => event?.type === "status" && event.status === status)
    : [];
}

function getApplicationStatus(application) {
  return STATUSES.some((status) => status.value === application.status) ? application.status : "saved";
}

function countBy(items, getKey) {
  const counts = new Map();

  items.forEach((item) => {
    const key = getKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()].sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]));
}

function createEmptyMessage(message) {
  const empty = document.createElement("p");
  empty.className = "empty-stats";
  empty.textContent = message;
  return empty;
}

function parseDate(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeek(date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(date, mondayOffset));
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDayLabel(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatWeekLabel(date) {
  return `Week ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function formatReportDate(date) {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

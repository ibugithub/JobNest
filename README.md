# JobNest
A browser extension to track job applications without paying for a hosted tracker.

## Features

- Save a job application from the extension popup.
- Auto-fill the job URL from the active browser tab.
- Track company, role, location, status, date applied, notes, and source URL.
- Keep a status event history for statistics.
- Open a dedicated tracker page for saved applications.
- Search saved applications and review them in status sections on the tracker page.
- Drag application cards between sections to update status and reorder cards.
- Require a local backup JSON file before saving applications.
- Automatically write application updates to the selected local backup file.
- Restore from the selected backup file when browser storage is empty.
- View application statistics by day, week, month, and year.
- Export printable PDF reports from the statistics page.
- Store everything locally in your browser with `chrome.storage.local`.

## Load the extension in Chrome or Chromium

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Pin **JobNest** from the browser extensions menu.

## Project structure

```text
manifest.json       Extension metadata and permissions
popup.html          Popup UI
popup.css           Popup styling
popup.js            Quick-add popup behavior
storage.js          Shared local storage helpers
tracker.html        Dedicated applications page
tracker.css         Tracker page styling
tracker.js          Tracker page list/filter/drag behavior
stats.html          Statistics page
stats.css           Statistics page styling
stats.js            Statistics and printable report behavior
icon.png            Extension icon source
PRIVACY.md          Privacy policy draft
```

## Publishing checklist

- Add Chrome Web Store screenshots.
- Add a public privacy policy URL.
- Create a clean ZIP with only extension files.
- Upload the ZIP in the Chrome Web Store Developer Dashboard.
- Complete privacy, distribution, and store listing forms.

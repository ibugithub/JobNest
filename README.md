# JobNest
A browser extension to track job applications without paying for a hosted tracker.

## First milestone

This first version is intentionally small:

- Save a job application from the extension popup.
- Auto-fill the job URL from the active browser tab.
- Track company, role, location, status, date applied, notes, and source URL.
- Open a dedicated tracker page for saved applications.
- Search saved applications and review them in status sections on the tracker page.
- Update status from an application card to move it between sections.
- Export your applications as JSON from the tracker page.
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
tracker.js          Tracker page list/filter/export behavior
```

## Next useful steps

- Add a content script that can detect company/title from job pages.
- Add CSV export.
- Add tags, salary range, and reminder dates.
- Add import so you can migrate data between browsers.

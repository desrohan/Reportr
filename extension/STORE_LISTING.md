# Chrome Web Store submission notes

Fill these into the Chrome Web Store developer dashboard when submitting. Every
permission the extension requests must have a justification, and the data
collection disclosures must match what the code actually does.

Privacy policy URL: **https://reportr.tools.rohan-shah.in/privacy**

---

## Single purpose

> Reportr lets users capture bug reports — screenshots, full-page captures, area
> selections, and screen/tab recordings with session replay — from any website,
> then review and save them to their team workspace.

All permissions below serve this one purpose.

---

## Permission justifications

Paste each justification next to its permission in the dashboard.

### `activeTab`
Lets the user trigger a screenshot or recording of the tab they are currently
on when they click the extension. Used only in response to a user action.

### `tabs`
Needed to identify the active tab and its window for capture, to keep the
recording control bar in sync as the user switches tabs during a recording, and
to open the review page after a capture. We do not read browsing history.

### `scripting`
Injects the on-page recording control bar and capture/selection UI into the tab
being captured. Tabs opened before the extension loaded have no content script,
so it is injected on demand when a capture starts.

### `tabCapture`
Records the video and audio of the current tab when the user chooses "record
this tab."

### `desktopCapture`
Records a window or the full screen when the user chooses that recording mode.
The browser's native picker is shown so the user selects exactly what is shared.

### `offscreen`
Screen/tab recording uses the MediaRecorder API, which is unavailable in a
service worker. An offscreen document hosts the recorder while capture is
active.

### `storage`
Stores capture drafts and the user's session locally so a report can be
reviewed and annotated before the user decides to save it. Nothing is uploaded
automatically.

### `unlimitedStorage`
Screen recordings and full-page screenshots can be large; this avoids hitting
the default storage quota while a draft is held locally before upload.

### Host permission: `<all_urls>`
Bug reports can be created on any website the user visits, so the capture
content scripts and screenshot APIs must be able to run on any URL. They only
act when the user starts a capture; there is no passive/background collection.

---

## Data collection disclosures

In the dashboard's "Data usage" section, declare the following categories (the
Extension collects them **only during an active capture the user initiates**):

- **Personally identifiable information** — the user's email and account ID,
  synced from the dashboard to attribute captures to their workspace.
- **Authentication information** — the user's session token, synced from the
  dashboard so saved reports upload to the correct account. (Sensitive request
  headers such as `Authorization` and `Cookie` are **redacted** before captured
  network data leaves the page.)
- **Web content / user activity** — screenshots, screen/tab recordings, DOM
  interactions (clicks, scrolls), console logs, and network request metadata of
  the page the user is capturing, so the bug can be reproduced and replayed.

### Required certifications (all true for Reportr)

- ☑ I do not sell or transfer user data to third parties outside of approved use
  cases (data is only sent to the storage/database providers that operate the
  Service on the user's behalf).
- ☑ I do not use or transfer user data for purposes unrelated to my item's
  single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

---

## Pre-submission checklist

- [ ] Upload a **production** build (`npm run build`), not the dev `dist/`. Make
      sure no dev-only files (e.g. `@react-refresh.js`) are in the zip.
- [ ] Confirm icons are PNG (`icon16.png`, `icon48.png`, `icon128.png`) and that
      a 128×128 PNG is present — SVG icons are not accepted.
- [ ] Privacy policy page is live at the URL above.
- [ ] Store listing screenshots (1280×800 or 640×400) prepared.
- [ ] Permission justifications above pasted into the dashboard.
- [ ] Data disclosures above ticked in the dashboard.

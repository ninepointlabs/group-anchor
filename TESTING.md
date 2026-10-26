# Testing

Status as of 2026-10-26, before review.

## What was run

**Static checks**

- `node --check` passes on `background.js`, `popup.js` and
  `scripts/make-icons.js`.
- `manifest.json` parses as JSON. Chromium loaded it as an unpacked extension
  with no manifest errors. Permissions are exactly `tabs`, `tabGroups` and
  `storage`.
- Icons are valid RGBA PNGs at 16, 32, 48 and 128 px.

**Automated run in a throwaway Chromium profile**

- Chromium 154.0.8037.97 (Arch Linux) in headless mode, driven by Playwright.
- A fresh `--user-data-dir` under `/tmp`, deleted afterwards. No personal
  browser or profile was used.
- The extension was loaded with `--load-extension`. The test called `chrome.*`
  APIs from inside the extension's service worker to simulate the user's
  actions, then checked the resulting tab order.

**This is not the same as manual testing.** There was no real keyboard, mouse,
drag-and-drop, or visible tab strip.

The harness is `tests/integration.mjs`. Run it with `npm test` (see the README's
Development section for setup).

**Mocked unit check of error handling**

`background.js` ran in Node with a stubbed `chrome` object
(`tests/error-handling.mjs`, run with `npm run test:unit`). 5/5 checks pass.
Breaking the retry delays or the "gone" error check makes 4 of them fail.

- A drag error thrown twice and then cleared → the move was retried and
  succeeded.
- A drag error that never clears → 6 attempts, then one `console.warn` with no
  uncaught rejection.
- "No group with id" and "No tab with id" → ignored silently.

**Hands-on trial by Tim (2026-10-26)**

Tim loaded the extension unpacked in Brave Origin 1.97.59 (Linux) and reported
"everything works so far". He didn't say which checklist items he tried, so
the table below still marks each one "not yet verified" until there are
per-item results.

## Manual checklist

Every item below is **not yet verified manually**. Each one notes what the
automated run covered.

| # | Check | Manual status | Automated / static coverage |
|---|-------|---------------|-----------------------------|
| 1 | Open new tabs with Ctrl+T, middle-click, and links. Groups stay below the pinned tabs. | Not yet verified | PASS (API): `tabs.create` at the end, and `tabs.create` inserted right after the pinned tabs (above the groups). In both cases the groups re-anchored below the pinned tabs. Real Ctrl+T, middle-click and link opening were not exercised. |
| 2 | Pin and unpin tabs. The groups shift accordingly. | Not yet verified | PASS (API): `tabs.update({pinned})` both ways. The groups moved down and back up, and their relative order was unchanged. |
| 3 | Drag one group above another. The new order is kept. | Not yet verified | PASS (API): `tabGroups.move` put group B before group A, and the order B, A was kept. A group moved to the end of the strip snapped back up. |
| 4 | Drag a tab while lots of tabs are opening. No uncaught errors in the service worker console. | Not yet verified | PARTIAL: 25 tabs were created at once above the groups. Everything ended anchored, and the service worker logged no errors or warnings. A real drag can't be done headless, so the retry path was only checked with mocks (see above). |
| 5 | Collapse and expand groups. Positioning still works. | Not yet verified | PASS (API): with all groups collapsed, a new tab was inserted above them. They re-anchored, and again after expanding. |
| 6 | Use multiple windows, and move a group between windows. | Not yet verified | PASS (API): a second window with a pinned tab was opened, and a group was moved into it with `tabGroups.move({windowId})`. The group anchored below that window's pinned tab, and the source window stayed in order. |
| 7 | Toggle the global switch and the per-window pause. Both work. | Not yet verified | PASS (API + popup page): when disabled, the badge reads `OFF` and no anchoring happens. Re-enabling re-anchors and clears the badge. A paused window isn't touched while other windows still are, and unpausing re-anchors it. The popup page loads with no errors and its switches write `storage.sync` / `storage.session`. The popup was opened as a tab, not from the toolbar. Only light mode was looked at. |
| 8 | Test with Brave's vertical tabs enabled. | Not yet verified | NONE: Brave isn't installed on the build machine. Vertical tabs use the same tab and group model, so the same API behavior is expected, but nobody has checked it. |

Not covered at all: Edge, Vivaldi, the dark-mode popup, and the service worker
being killed and woken up again mid-session.

# Group Anchor privacy policy

_Last updated: 2026-10-26_

Group Anchor does not collect, store, transmit, sell or share any personal
data or browsing data.

## What the extension accesses

- **Tabs and tab groups** (`tabs`, `tabGroups` permissions). The extension
  reads each tab's position, pinned state and group, and the group IDs in
  each window, so it can move tab groups back below your pinned tabs. This
  happens entirely inside your browser. It doesn't read or record page
  content, and it doesn't keep or send tab URLs or titles anywhere.
- **Settings** (`storage` permission). Two settings are saved:
  - The on/off switch, in your browser's synced extension storage
    (`chrome.storage.sync`). If browser sync is turned on, your browser vendor
    syncs it to your other devices along with other extension settings. It
    never reaches the developer.
  - "Pause for this window", in session storage
    (`chrome.storage.session`). It is cleared when the window closes or the
    browser restarts.

## What it doesn't do

- No network requests. The extension never contacts any server.
- No analytics, tracking, advertising or third-party code.
- No remote code. Everything the extension runs is included in the package.

## Changes

If this policy ever changes, the new version will be published at this same
address with a new "Last updated" date.

## Contact

Questions about this policy or the extension: open an issue at
https://github.com/ninepointlabs/group-anchor/issues

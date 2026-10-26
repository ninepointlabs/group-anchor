# Chrome Web Store submission

Everything needed to publish Group Anchor from Tim's personal developer
account. Copy the text into the matching fields in the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Before submitting

- [ ] Developer account registered (one-time US$5 fee, 2-step verification on).
- [ ] Trader declaration answered. This is Tim's call: a free hobby extension
      from a personal account is usually "non-trader", but if it's part of a
      business, declare as a trader and give the verified contact details.
- [ ] Manual checklist in `TESTING.md` done. The description below says it
      works with vertical tabs and in Chrome and Brave, so check items 8 and
      1–7 in both browsers before publishing.
- [ ] Placeholder icons replaced (optional, but the 128 px icon is the store
      icon). Run `npm run icons` after changing `scripts/make-icons.js`.
- [ ] `PRIVACY.md` merged into `main` so its public URL works (see "Privacy
      policy URL" below).
- [ ] `version` bumped in **both** `manifest.json` and `package.json` if this
      version was uploaded before. Each upload needs a higher version.

## Build the upload

```sh
npm run package          # → dist/group-anchor-<version>.zip
```

The zip contains only `manifest.json`, `background.js`, `popup.html`,
`popup.js`, `popup.css` and `icons/`, with no dev files.

To test the exact upload, unzip it and run the integration test against it:

```sh
unzip dist/group-anchor-0.1.0.zip -d /tmp/ga && EXTENSION_DIR=/tmp/ga npm run test:integration
```

## Store listing tab

**Name** (from `manifest.json`): Group Anchor

**Summary** (from the manifest `description`, max 132 characters):
Keeps tab groups anchored at the top of the tab strip, directly below pinned tabs.

**Category:** Productivity → Tools (or Workflow & Planning)

**Language:** English

**Description:**

```
Tab groups can't be pinned, so as you open new tabs they drift down the tab strip. Group Anchor keeps them where you want them: right below your pinned tabs, in every window.

Every window stays in this order:
• Pinned tabs
• Your tab groups
• Everything else

How it works
• Groups keep the order you put them in. Drag one group above another and Group Anchor keeps the new order. It never sorts them.
• Collapsed groups, multiple windows, and groups moved between windows all work.
• Works with horizontal and vertical tabs, in Chrome, Brave and other Chromium-based browsers.
• It only moves things when the order is actually wrong, so there's no flicker.

Settings
• One switch turns it off everywhere. The toolbar icon shows "OFF" while it's disabled.
• "Pause for this window" leaves the current window alone until it closes.

Privacy
Group Anchor collects no data and makes no network requests. Everything happens inside your browser.

Good to know
• Pinned tabs can't be in a group. That's a browser rule.
• A tab opened from a tab inside a group may be added to that group by the browser. The group still stays anchored.
```

**Graphic assets** (regenerate with `npm run store-images`):

| Field | File | Size |
|---|---|---|
| Store icon | `icons/icon128.png` | 128×128 |
| Screenshot 1 | `store/screenshot-1-before-after.png` | 1280×800 |
| Screenshot 2 | `store/screenshot-2-popup.png` | 1280×800 |
| Small promo tile | `store/promo-small.png` | 440×280 |

Screenshot 1 is a drawn illustration of the effect, not a capture of a real
browser. The popups in screenshot 2 are real captures of `popup.html`. A real
screenshot of the tab strip (for example Brave's vertical tabs before and
after) would make a stronger first image. Capture it at exactly 1280×800 or
640×400.

**Homepage URL:** https://github.com/ninepointlabs/group-anchor

**Support URL:** https://github.com/ninepointlabs/group-anchor/issues

## Privacy practices tab

**Single purpose:**

```
Keeps tab groups positioned directly below the pinned tabs in each browser window, so groups don't drift down the tab strip as new tabs open.
```

**Permission justifications:**

`tabs`:
```
Needed to read each tab's position, pinned state and group in a window, and to react when tabs are opened, moved, pinned or regrouped, so the extension can tell whether tab groups have drifted below ungrouped tabs. Tab URLs and titles are not read, stored or sent.
```

`tabGroups`:
```
Needed to move tab groups back to just below the pinned tabs (chrome.tabGroups.move) and to react when groups are created, moved, collapsed or changed.
```

`storage`:
```
Stores the extension's two settings: the global on/off switch (storage.sync) and the "pause for this window" flag (storage.session). No user data is stored.
```

**Remote code:** No, I am not using remote code.

**Data usage:** tick **none** of the data categories. Then certify all three
statements:

- I do not sell or transfer user data to third parties, outside of the
  approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

**Privacy policy URL:** the extension collects no user data, so a policy may
not be strictly required. Linking one avoids reviewer questions. `PRIVACY.md`
is ready, and the repo is public, so link:

```
https://github.com/ninepointlabs/group-anchor/blob/main/PRIVACY.md
```

That URL only works once this file is merged into `main`.

## Distribution tab

- **Visibility:** Public, or Unlisted to soft-launch (only people with the
  link can install it).
- **Regions:** All regions.

## Submit

Click **Submit for review**. Reviews usually take a few days. Narrow
permissions and no remote code help. Each later update is a new zip with a
higher `version`, uploaded under **Package**.

Brave, Vivaldi and other Chromium-based browsers can install straight from the
Chrome Web Store. Edge users can too, but Edge has its own store (Microsoft
Edge Add-ons) that it's worth publishing to separately.

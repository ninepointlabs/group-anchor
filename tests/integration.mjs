// Integration test for Group Anchor (dev only; the extension itself has no
// dependencies). Loads the extension into headless Chromium with a throwaway
// profile in the OS temp dir, then drives chrome.* APIs from the extension's
// own service worker and checks the resulting tab order. This is
// programmatic, not real keyboard/mouse input, so it doesn't replace the
// manual checklist in TESTING.md.
//
// Run with: npm test
//   CHROMIUM_PATH=/usr/bin/chromium  use a system Chromium instead of
//                                    Playwright's bundled one
//   SCREENSHOT=popup.png             save a screenshot of the popup page
import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "group-anchor-test-"));
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
  ],
});

let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
const swLogs = [];
sw.on("console", (m) => swLogs.push(`${m.type()}: ${m.text()}`));

const ev = (fn, arg) => sw.evaluate(fn, arg);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = () => wait(900);

// Layout string like "P P | g1 g1 | g2 | u u" for a window.
async function layout(windowId) {
  return ev(async (windowId) => {
    const tabs = (await chrome.tabs.query({ windowId })).sort((a, b) => a.index - b.index);
    return tabs.map((t) => (t.pinned ? "P" : t.groupId === -1 ? "u" : "g" + t.groupId));
  }, windowId);
}
function anchored(l) {
  // pinned → contiguous groups → ungrouped
  let phase = 0;
  for (const x of l) {
    const p = x === "P" ? 0 : x === "u" ? 2 : 1;
    if (p < phase) return false;
    phase = p;
  }
  return true;
}
function groupOrder(l) {
  return [...new Set(l.filter((x) => x.startsWith("g")))];
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
}

const win = await ev(async () => (await chrome.windows.getAll({ windowTypes: ["normal"] }))[0].id);

// Setup: 6 tabs, 2 pinned, groups A(2) and B(1), then ungrouped.
const ids = await ev(async (windowId) => {
  const made = [];
  for (let i = 0; i < 6; i++) made.push((await chrome.tabs.create({ windowId, url: "about:blank" })).id);
  return made;
}, win);
await ev(async (ids) => {
  await chrome.tabs.update(ids[0], { pinned: true });
  await chrome.tabs.update(ids[1], { pinned: true });
}, ids);
const gA = await ev((ids) => chrome.tabs.group({ tabIds: [ids[4], ids[5]] }), ids);
await settle();
const gB = await ev((ids) => chrome.tabs.group({ tabIds: [ids[3]] }), ids);
await settle();
let l = await layout(win);
check("1a initial groups anchored after pinned", anchored(l), l.join(" "));

// 1. New tabs: at end (Ctrl+T), and inserted right after pinned (like a link
// opened next to a pinned opener), plus a burst.
await ev((windowId) => chrome.tabs.create({ windowId, url: "about:blank" }), win);
await ev(async (windowId) => {
  const pinned = (await chrome.tabs.query({ windowId, pinned: true })).length;
  await chrome.tabs.create({ windowId, url: "about:blank", index: pinned });
}, win);
await settle();
l = await layout(win);
check("1b new tab inserted above groups gets pushed below", anchored(l), l.join(" "));
const orderBefore = groupOrder(l);

// 2. Pin / unpin.
await ev(async (windowId) => {
  const tabs = (await chrome.tabs.query({ windowId, groupId: -1, pinned: false }));
  await chrome.tabs.update(tabs[tabs.length - 1].id, { pinned: true });
}, win);
await settle();
l = await layout(win);
check("2a pin a tab → groups shift down", anchored(l) && l.filter((x) => x === "P").length === 3, l.join(" "));
await ev(async (windowId) => {
  const [t] = await chrome.tabs.query({ windowId, pinned: true });
  await chrome.tabs.update(t.id, { pinned: false });
}, win);
await settle();
l = await layout(win);
check("2b unpin a tab → groups shift up", anchored(l) && l.filter((x) => x === "P").length === 2, l.join(" "));
check("2c group relative order unchanged", JSON.stringify(groupOrder(l)) === JSON.stringify(orderBefore), groupOrder(l).join(","));

// 3. Reorder groups: move the second group in front of the first.
const [first, second] = groupOrder(l).map((g) => Number(g.slice(1)));
await ev(async ({ windowId, second }) => {
  const pinned = (await chrome.tabs.query({ windowId, pinned: true })).length;
  await chrome.tabGroups.move(second, { index: pinned });
}, { windowId: win, second });
await settle();
l = await layout(win);
check("3 user reorder of groups is kept", anchored(l) && groupOrder(l)[0] === "g" + second && groupOrder(l)[1] === "g" + first, l.join(" "));

// 3b. Move a group below ungrouped tabs (drift) → snaps back, keeping order.
await ev(async ({ windowId, first }) => {
  await chrome.tabGroups.move(first, { index: -1 });
}, { windowId: win, first });
await settle();
l = await layout(win);
check("3b group dragged to the end snaps back up", anchored(l), l.join(" "));

// 4. Burst: 25 tabs created + moved rapidly, with ungrouped tabs shoved above groups.
await ev(async (windowId) => {
  const pinned = (await chrome.tabs.query({ windowId, pinned: true })).length;
  const ps = [];
  for (let i = 0; i < 25; i++) ps.push(chrome.tabs.create({ windowId, url: "about:blank", index: pinned, active: false }));
  await Promise.all(ps);
}, win);
await wait(2500);
l = await layout(win);
check("4 burst of 25 tabs opened above groups", anchored(l), `${l.length} tabs`);

// 5. Collapse groups, then disturb.
await ev(async (windowId) => {
  const groups = await chrome.tabGroups.query({ windowId });
  for (const g of groups) await chrome.tabGroups.update(g.id, { collapsed: true });
  const pinned = (await chrome.tabs.query({ windowId, pinned: true })).length;
  await chrome.tabs.create({ windowId, url: "about:blank", index: pinned, active: true });
}, win);
await settle();
l = await layout(win);
check("5a collapsed groups still anchored", anchored(l), l.slice(0, 8).join(" ") + " ...");
await ev(async (windowId) => {
  const groups = await chrome.tabGroups.query({ windowId });
  for (const g of groups) await chrome.tabGroups.update(g.id, { collapsed: false });
}, win);
await settle();
l = await layout(win);
check("5b expanded groups still anchored", anchored(l));

// 6. Second window; move a group into it.
const win2 = await ev(async () => {
  const w = await chrome.windows.create({ url: ["about:blank", "about:blank", "about:blank"] });
  return w.id;
});
await ev(async (w2) => {
  const tabs = await chrome.tabs.query({ windowId: w2 });
  await chrome.tabs.update(tabs[0].id, { pinned: true });
}, win2);
await ev(async ({ w2, g }) => chrome.tabGroups.move(g, { windowId: w2, index: -1 }), { w2: win2, g: first });
await settle();
const l2 = await layout(win2);
l = await layout(win);
check("6a group moved to other window anchors there", anchored(l2) && l2.includes("g" + first), l2.join(" "));
check("6b source window still anchored", anchored(l) && !l.includes("g" + first));

// 7a. Global off.
await ev(() => chrome.storage.sync.set({ enabled: false }));
await settle();
const badgeOff = await ev(() => chrome.action.getBadgeText({}));
await ev(async ({ windowId, g }) => chrome.tabGroups.move(g, { index: -1 }), { windowId: win, g: second });
await settle();
l = await layout(win);
check("7a disabled → badge OFF", badgeOff === "OFF", JSON.stringify(badgeOff));
check("7b disabled → no anchoring", !anchored(l), l.slice(-4).join(" "));
await ev(() => chrome.storage.sync.set({ enabled: true }));
await settle();
l = await layout(win);
const badgeOn = await ev(() => chrome.action.getBadgeText({}));
check("7c re-enabled → re-anchors and badge cleared", anchored(l) && badgeOn === "", JSON.stringify(badgeOn));

// 7d. Per-window pause (window 1 paused, window 2 not).
await ev((w) => chrome.storage.session.set({ [`paused:${w}`]: true }), win);
await ev(async ({ g }) => chrome.tabGroups.move(g, { index: -1 }), { g: second });
await ev(async (w2) => {
  const pinned = (await chrome.tabs.query({ windowId: w2, pinned: true })).length;
  await chrome.tabs.create({ windowId: w2, url: "about:blank", index: pinned });
}, win2);
await settle();
l = await layout(win);
const l2b = await layout(win2);
check("7d paused window not anchored", !anchored(l));
check("7e other window still anchored while one paused", anchored(l2b), l2b.join(" "));
await ev((w) => chrome.storage.session.remove(`paused:${w}`), win);
await settle();
l = await layout(win);
check("7f unpause → window re-anchored", anchored(l));

// Popup renders.
const extId = sw.url().split("/")[2];
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.goto(`chrome-extension://${extId}/popup.html`);
await page.waitForTimeout(500);
const enabledChecked = await page.isChecked("#enabled");
await page.click("#enabled");
await page.waitForTimeout(300);
const afterClick = await ev(() => chrome.storage.sync.get("enabled"));
await page.click("#enabled");
await page.click("#paused");
await page.waitForTimeout(300);
const sess = await ev(() => chrome.storage.session.get(null));
check("popup: loads, no page errors", pageErrors.length === 0 && enabledChecked, pageErrors.join("; "));
check("popup: global toggle writes storage.sync", afterClick.enabled === false);
check("popup: pause toggle writes storage.session", Object.keys(sess).some((k) => k.startsWith("paused:")), JSON.stringify(sess));
if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT });

const errs = swLogs.filter((x) => /^(error|warning)/.test(x));
check("no SW errors/warnings logged", errs.length === 0, errs.join(" | "));

await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

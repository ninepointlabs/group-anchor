// Group Anchor service worker.
//
// Keeps every tab group in a window directly below the pinned tabs, so the
// order is always: pinned tabs → tab groups → ungrouped tabs.
//
// The service worker can be terminated at any time, so nothing here relies on
// in-memory state for correctness. Each pass re-reads the window with
// chrome.tabs.query and derives the desired order from it. The in-memory maps
// below (debounce timers, busy flags) only coalesce work; losing them just
// means one extra, harmless pass.

const DEBOUNCE_MS = 200;

// Backoff for "Tabs cannot be edited right now (user may be dragging a tab)".
const RETRY_DELAYS_MS = [100, 250, 500, 1000, 2000];

// Hard cap on group moves in a single pass, as a safety net against loops.
const MAX_MOVES_PER_PASS = 50;

const SYNC_DEFAULTS = { enabled: true };

const debounceTimers = new Map(); // windowId → timeout id
const busyWindows = new Set(); // windows with a pass in progress
const dirtyWindows = new Set(); // windows that changed while busy

// ---------------------------------------------------------------------------
// Settings

async function isEnabled() {
  const { enabled } = await chrome.storage.sync.get(SYNC_DEFAULTS);
  return enabled !== false;
}

function pausedKey(windowId) {
  return `paused:${windowId}`;
}

async function isPaused(windowId) {
  const key = pausedKey(windowId);
  const result = await chrome.storage.session.get(key);
  return result[key] === true;
}

async function updateBadge() {
  const enabled = await isEnabled();
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  if (!enabled) {
    await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
  }
}

// ---------------------------------------------------------------------------
// Error helpers

function errorMessage(err) {
  return String((err && err.message) || err);
}

function isDragError(err) {
  return /cannot be edited right now/i.test(errorMessage(err));
}

// A tab, group or window disappeared while we were working on it. Not a bug;
// the removal fires its own event, which schedules a fresh pass.
function isGoneError(err) {
  return /no (group|tab|window) with id/i.test(errorMessage(err));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs fn, retrying with backoff while the user is dragging a tab.
async function withDragRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isDragError(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

// ---------------------------------------------------------------------------
// Ordering logic

// Given a window's tabs, returns the plan for anchoring its groups:
//   pinnedCount: number of pinned tabs (groups start at this index)
//   groups: [{ groupId, start, count }] in their current relative order
//   inOrder: true when the window already matches pinned → groups → ungrouped
//
// Group order is the order in which groups currently appear in the strip.
// That keeps any reordering the user did by dragging, and never sorts.
function planWindow(tabs) {
  tabs = [...tabs].sort((a, b) => a.index - b.index);

  const pinnedCount = tabs.filter((t) => t.pinned).length;
  const groups = [];
  const byId = new Map();

  for (const tab of tabs) {
    if (tab.pinned || tab.groupId === -1) continue;
    let group = byId.get(tab.groupId);
    if (!group) {
      group = { groupId: tab.groupId, start: tab.index, count: 0 };
      byId.set(tab.groupId, group);
      groups.push(group);
    }
    group.count++;
  }

  // Already in order when every group sits exactly where the previous one
  // ended, starting right after the pinned tabs.
  let expected = pinnedCount;
  let inOrder = true;
  for (const group of groups) {
    if (group.start !== expected) {
      inOrder = false;
      break;
    }
    expected += group.count;
  }

  return { pinnedCount, groups, inOrder };
}

async function isNormalWindow(windowId) {
  try {
    const win = await chrome.windows.get(windowId);
    return win.type === "normal";
  } catch (err) {
    if (isGoneError(err)) return false;
    throw err;
  }
}

// One reorder pass for a window. Moves at most one group per iteration and
// re-reads the window after every move, so it never acts on stale indexes.
async function anchorWindow(windowId) {
  if (!(await isEnabled())) return;
  if (await isPaused(windowId)) return;
  if (!(await isNormalWindow(windowId))) return;

  for (let moves = 0; moves < MAX_MOVES_PER_PASS; moves++) {
    const tabs = await chrome.tabs.query({ windowId });
    const plan = planWindow(tabs);
    if (plan.inOrder) return;

    // Find the first group that isn't where it should be. Every group's
    // target is at or left of its current position (earlier groups come
    // first in the strip), so moves only ever go toward the pinned tabs.
    let index = plan.pinnedCount;
    for (const group of plan.groups) {
      if (group.start !== index) {
        await withDragRetry(() =>
          chrome.tabGroups.move(group.groupId, { index })
        );
        break;
      }
      index += group.count;
    }
  }
  console.warn(`Group Anchor: gave up on window ${windowId} after ${MAX_MOVES_PER_PASS} moves`);
}

// Runs a pass with a per-window busy flag. Our own moves fire tabs.onMoved
// and tabGroups.onMoved; while busy those just mark the window dirty, and a
// single follow-up pass runs afterwards (which is a no-op if order is right).
async function runPass(windowId) {
  if (busyWindows.has(windowId)) {
    dirtyWindows.add(windowId);
    return;
  }
  busyWindows.add(windowId);
  try {
    await anchorWindow(windowId);
  } catch (err) {
    if (!isGoneError(err)) {
      console.warn(`Group Anchor: pass failed for window ${windowId}:`, errorMessage(err));
    }
  } finally {
    busyWindows.delete(windowId);
  }
  if (dirtyWindows.delete(windowId)) schedule(windowId);
}

// Debounces per window so a burst of events triggers one pass.
function schedule(windowId) {
  if (typeof windowId !== "number" || windowId < 0) return;
  clearTimeout(debounceTimers.get(windowId));
  debounceTimers.set(
    windowId,
    setTimeout(() => {
      debounceTimers.delete(windowId);
      runPass(windowId);
    }, DEBOUNCE_MS)
  );
}

async function scheduleAllWindows() {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  for (const win of windows) schedule(win.id);
}

// ---------------------------------------------------------------------------
// Event wiring. Listeners are registered synchronously at top level so the
// browser can wake the service worker for them.

chrome.tabs.onCreated.addListener((tab) => schedule(tab.windowId));
chrome.tabs.onMoved.addListener((_tabId, info) => schedule(info.windowId));
chrome.tabs.onAttached.addListener((_tabId, info) => schedule(info.newWindowId));
chrome.tabs.onDetached.addListener((_tabId, info) => schedule(info.oldWindowId));
chrome.tabs.onRemoved.addListener((_tabId, info) => {
  if (!info.isWindowClosing) schedule(info.windowId);
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if ("pinned" in changeInfo || "groupId" in changeInfo) schedule(tab.windowId);
});

chrome.tabGroups.onCreated.addListener((group) => schedule(group.windowId));
chrome.tabGroups.onUpdated.addListener((group) => schedule(group.windowId));
chrome.tabGroups.onMoved.addListener((group) => schedule(group.windowId));

chrome.windows.onCreated.addListener(
  (win) => schedule(win.id),
  { windowTypes: ["normal"] }
);

// Drop the per-window pause flag when its window closes.
chrome.windows.onRemoved.addListener((windowId) => {
  clearTimeout(debounceTimers.get(windowId));
  debounceTimers.delete(windowId);
  chrome.storage.session.remove(pausedKey(windowId));
});

chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
  scheduleAllWindows();
});
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  scheduleAllWindows();
});

// React to the popup's toggles.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && "enabled" in changes) {
    updateBadge();
    if (changes.enabled.newValue !== false) scheduleAllWindows();
  }
  if (area === "session") {
    for (const [key, change] of Object.entries(changes)) {
      const match = /^paused:(\d+)$/.exec(key);
      if (match && change.newValue !== true) schedule(Number(match[1]));
    }
  }
});

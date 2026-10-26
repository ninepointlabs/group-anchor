// Error-handling test for Group Anchor (dev only, no dependencies). Runs
// background.js in a Node vm with a stubbed chrome object, so it covers paths
// a headless browser can't trigger on demand: the "user may be dragging a
// tab" retry, and tabs or groups disappearing mid-pass.
//
// Run with: npm run test:unit
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const SRC = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "background.js"),
  "utf8"
);

const DRAG_ERROR = "Tabs cannot be edited right now (user may be dragging a tab).";

// A stub chrome with one window: a pinned tab, an ungrouped tab, then group 7.
// The group is out of place, so a pass always tries to move it. moveResult(n)
// returns an Error to throw on the nth move call, or null to succeed.
function makeChrome(moveResult) {
  const event = () => ({ addListener() {} });
  let tabs = [
    { id: 1, index: 0, pinned: true, groupId: -1 },
    { id: 2, index: 1, pinned: false, groupId: -1 },
    { id: 3, index: 2, pinned: false, groupId: 7 },
  ];
  const moves = [];
  const chrome = {
    tabs: {
      onCreated: event(), onMoved: event(), onAttached: event(),
      onDetached: event(), onRemoved: event(), onUpdated: event(),
      query: async () => tabs,
    },
    tabGroups: {
      onCreated: event(), onUpdated: event(), onMoved: event(),
      move: async (groupId, props) => {
        moves.push([groupId, props]);
        const err = moveResult(moves.length);
        if (err) throw err;
        // Successful move: group 7 now sits right after the pinned tab.
        tabs = [tabs[0], { ...tabs[2], index: 1 }, { ...tabs[1], index: 2 }];
      },
    },
    windows: {
      onCreated: event(), onRemoved: event(),
      get: async () => ({ type: "normal" }),
      getAll: async () => [],
    },
    runtime: { onInstalled: event(), onStartup: event() },
    storage: {
      onChanged: event(),
      sync: { get: async (defaults) => defaults },
      session: { get: async () => ({}), remove() {} },
    },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  };
  return { chrome, moves };
}

const results = [];

async function check(name, moveResult, expected) {
  const { chrome, moves } = makeChrome(moveResult);
  const warnings = [];
  const context = {
    chrome,
    setTimeout,
    clearTimeout,
    console: { warn: (...args) => warnings.push(args.join(" ")), log() {} },
  };
  vm.createContext(context);
  // runPass is a top-level function in background.js; expose it to the test.
  vm.runInContext(`${SRC}\n;globalThis.__runPass = runPass;`, context);

  let uncaught = null;
  try {
    await context.__runPass(1);
  } catch (err) {
    uncaught = err;
  }

  const ok =
    !uncaught &&
    moves.length === expected.moves &&
    warnings.length === expected.warnings;
  results.push(ok);
  const detail = `moves=${moves.length} warnings=${warnings.length}${uncaught ? ` uncaught=${uncaught.message}` : ""}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}  ${detail}`);
}

await check(
  "drag error twice, then success → retried and moved",
  (n) => (n <= 2 ? new Error(DRAG_ERROR) : null),
  { moves: 3, warnings: 0 }
);
await check(
  "drag error never clears → 6 attempts, one warning, nothing thrown",
  () => new Error(DRAG_ERROR),
  { moves: 6, warnings: 1 }
);
await check(
  "\"No group with id\" mid-pass → ignored silently",
  () => new Error("No group with id: 7."),
  { moves: 1, warnings: 0 }
);
await check(
  "\"No tab with id\" mid-pass → ignored silently",
  () => new Error("No tab with id: 3."),
  { moves: 1, warnings: 0 }
);
await check(
  "unexpected error → one warning, nothing thrown",
  () => new Error("Something else broke"),
  { moves: 1, warnings: 1 }
);

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

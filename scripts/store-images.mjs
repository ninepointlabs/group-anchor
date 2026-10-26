// Renders the Chrome Web Store images into store/ with headless Chromium.
// Run with: npm run store-images   (CHROMIUM_PATH works as in the tests)
//
//   store/screenshot-1-before-after.png  1280×800  illustration of the effect
//   store/screenshot-2-popup.png         1280×800  real popup, light + dark
//   store/promo-small.png                 440×280  small promo tile
//
// Screenshot 1 is a drawn illustration, not a capture of a real browser:
// headless Chromium has no visible tab strip. Tab titles are generic on
// purpose. The popup images in screenshot 2 are real captures of popup.html
// with the extension loaded.

import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "store");
const executablePath = process.env.CHROMIUM_PATH || undefined;

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const BG = "#eef2ff";
const INK = "#111827";
const MUTED = "#4b5563";

// ---------------------------------------------------------------------------
// Illustrated tab lists

const GROUP_COLORS = { Work: "#1a73e8", Research: "#188038" };

const tab = (title, group) => ({ title, group });
const pinned = [{ pinned: true }, { pinned: true }, { pinned: true }];

const before = [
  ...pinned,
  tab("Search results"),
  tab("Recipe ideas"),
  tab("Weather"),
  tab("Video"),
  tab("Sprint board", "Work"),
  tab("Design doc", "Work"),
  tab("Pull request #42", "Work"),
  tab("News"),
  tab("Shopping list"),
  tab("Paper: attention", "Research"),
  tab("Benchmarks", "Research"),
];

const after = [
  ...pinned,
  tab("Sprint board", "Work"),
  tab("Design doc", "Work"),
  tab("Pull request #42", "Work"),
  tab("Paper: attention", "Research"),
  tab("Benchmarks", "Research"),
  tab("Search results"),
  tab("Recipe ideas"),
  tab("Weather"),
  tab("Video"),
  tab("News"),
  tab("Shopping list"),
];

function tabList(tabs) {
  const pins = tabs.filter((t) => t.pinned);
  let html = `<div class="pins">${pins.map(() => `<span class="pin"></span>`).join("")}</div>`;
  let lastGroup = null;
  for (const t of tabs.filter((t) => !t.pinned)) {
    if (t.group && t.group !== lastGroup) {
      html += `<div class="label" style="background:${GROUP_COLORS[t.group]}">${t.group}</div>`;
    }
    lastGroup = t.group || null;
    const color = t.group ? GROUP_COLORS[t.group] : "transparent";
    html += `<div class="tab" style="border-left-color:${color}"><span class="fav"></span>${t.title}</div>`;
  }
  return html;
}

const beforeAfterHtml = `<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 1280px; height: 800px; background: ${BG}; font-family: ${FONT};
         color: ${INK}; display: flex; flex-direction: column; align-items: center; }
  h1 { font-size: 44px; margin: 52px 0 8px; letter-spacing: -0.5px; }
  p.sub { font-size: 21px; color: ${MUTED}; margin: 0 0 36px; }
  .cols { display: flex; gap: 72px; align-items: flex-start; }
  .col h2 { font-size: 18px; font-weight: 600; color: ${MUTED}; margin: 0 0 12px; text-align: center;
            text-transform: uppercase; letter-spacing: 1px; }
  .panel { width: 380px; background: #fff; border-radius: 14px; padding: 12px;
           box-shadow: 0 10px 30px rgba(17, 24, 39, 0.12); }
  .pins { display: flex; gap: 8px; padding: 4px 4px 10px; border-bottom: 1px solid #e5e7eb; margin-bottom: 6px; }
  .pin { width: 32px; height: 32px; border-radius: 8px; background: #e5e7eb; }
  .label { display: inline-block; color: #fff; font-size: 13px; font-weight: 600; padding: 3px 10px;
           border-radius: 6px; margin: 8px 0 4px 4px; }
  .tab { display: flex; align-items: center; gap: 10px; font-size: 15px; padding: 6px 8px;
         border-left: 4px solid transparent; border-radius: 4px; }
  .fav { width: 16px; height: 16px; border-radius: 4px; background: #d1d5db; flex: none; }
  .arrow { font-size: 48px; color: #6366f1; align-self: center; margin-top: 30px; }
</style></head><body>
  <h1>Tab groups stay at the top</h1>
  <p class="sub">Pinned tabs, then your groups, then everything else. Automatically, in every window.</p>
  <div class="cols">
    <div class="col"><h2>Without Group Anchor</h2><div class="panel">${tabList(before)}</div></div>
    <div class="arrow">→</div>
    <div class="col"><h2>With Group Anchor</h2><div class="panel">${tabList(after)}</div></div>
  </div>
</body></html>`;

function popupShowcaseHtml(lightPng, darkPng) {
  const img = (buf) => `data:image/png;base64,${buf.toString("base64")}`;
  return `<!doctype html><html><head><style>
    body { margin: 0; width: 1280px; height: 800px; background: ${BG}; font-family: ${FONT};
           color: ${INK}; display: flex; flex-direction: column; align-items: center; }
    h1 { font-size: 44px; margin: 90px 0 8px; letter-spacing: -0.5px; }
    p.sub { font-size: 21px; color: ${MUTED}; margin: 0 0 64px; text-align: center; line-height: 1.5; }
    .pair { display: flex; gap: 64px; }
    figure { margin: 0; text-align: center; }
    figure img { width: 420px; border-radius: 12px; box-shadow: 0 10px 30px rgba(17, 24, 39, 0.18); }
    figcaption { margin-top: 16px; font-size: 16px; color: ${MUTED}; }
  </style></head><body>
    <h1>One switch, or pause a single window</h1>
    <p class="sub">Turn it off everywhere (the icon shows OFF), or pause just the window you're in.<br>
       Follows your system's light or dark theme.</p>
    <div class="pair">
      <figure><img src="${img(lightPng)}"><figcaption>Light</figcaption></figure>
      <figure><img src="${img(darkPng)}"><figcaption>Dark</figcaption></figure>
    </div>
  </body></html>`;
}

// Small promo tile. Kept bold and text-light because it's shown small.
const promoHtml = (iconPng) => `<!doctype html><html><head><style>
  body { margin: 0; width: 440px; height: 280px; font-family: ${FONT}; color: #fff;
         background: linear-gradient(135deg, #2563eb, #4f46e5);
         display: flex; flex-direction: column; align-items: center; justify-content: center; }
  img { width: 96px; height: 96px; margin-bottom: 18px; }
  h1 { margin: 0; font-size: 38px; letter-spacing: -0.5px; }
  p { margin: 8px 0 0; font-size: 17px; opacity: 0.9; }
</style></head><body>
  <img src="data:image/png;base64,${iconPng.toString("base64")}">
  <h1>Group Anchor</h1>
  <p>Tab groups that stay put</p>
</body></html>`;

// ---------------------------------------------------------------------------

async function renderHtml(browser, html, width, height, file) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.screenshot({ path: file });
  await page.close();
  console.log(`wrote ${path.relative(ROOT, file)}`);
}

// Captures the real popup with the extension loaded, at 2× for sharpness.
async function capturePopup(colorScheme) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "group-anchor-store-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: true,
    colorScheme,
    deviceScaleFactor: 2,
    viewport: { width: 280, height: 160 },
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
    ],
  });
  try {
    const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
    const extId = sw.url().split("/")[2];
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await page.waitForSelector("#enabled:checked");
    return await page.locator("body").screenshot();
  } finally {
    await ctx.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

fs.mkdirSync(OUT, { recursive: true });
const light = await capturePopup("light");
const dark = await capturePopup("dark");

const browser = await chromium.launch({ executablePath, headless: true });
try {
  await renderHtml(browser, beforeAfterHtml, 1280, 800, path.join(OUT, "screenshot-1-before-after.png"));
  await renderHtml(browser, popupShowcaseHtml(light, dark), 1280, 800, path.join(OUT, "screenshot-2-popup.png"));
  const icon = fs.readFileSync(path.join(ROOT, "icons", "icon128.png"));
  await renderHtml(browser, promoHtml(icon), 440, 280, path.join(OUT, "promo-small.png"));
} finally {
  await browser.close();
}

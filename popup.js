// Group Anchor popup: a global on/off switch (chrome.storage.sync) and a
// per-window pause (chrome.storage.session). The service worker listens for
// storage changes, so the popup only has to write the values.

const enabledInput = document.getElementById("enabled");
const pausedInput = document.getElementById("paused");
const pauseRow = document.getElementById("pause-row");

function renderPauseRow() {
  // Pausing a window only matters while the extension is enabled.
  pausedInput.disabled = !enabledInput.checked;
  pauseRow.classList.toggle("disabled", !enabledInput.checked);
}

async function init() {
  const win = await chrome.windows.getCurrent();
  const pausedKey = `paused:${win.id}`;

  const { enabled } = await chrome.storage.sync.get({ enabled: true });
  const session = await chrome.storage.session.get(pausedKey);

  enabledInput.checked = enabled !== false;
  pausedInput.checked = session[pausedKey] === true;
  renderPauseRow();

  enabledInput.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: enabledInput.checked });
    renderPauseRow();
  });

  pausedInput.addEventListener("change", () => {
    if (pausedInput.checked) {
      chrome.storage.session.set({ [pausedKey]: true });
    } else {
      chrome.storage.session.remove(pausedKey);
    }
  });
}

init();

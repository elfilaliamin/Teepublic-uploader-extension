const SERVER = "http://127.0.0.1:5000";

let state = {
  running: false,
  storeUrl: "",
  excelPath: "",
  tabId: null,

  phase: "idle", // "waitingStore" | "waitingUploader" | "waitingPublished"
  currentId: null,
  currentRow: null,
};

async function pushLog(text, kind = "info") {
  const { logs = [] } = await chrome.storage.local.get(["logs"]);
  logs.push({ text: `[${new Date().toLocaleTimeString()}] ${text}`, kind });
  await chrome.storage.local.set({ logs: logs.slice(-200) });
  chrome.runtime.sendMessage({ type: "LOG", text, kind });
}

async function fetchNextRow(excelPath) {
  const url = `${SERVER}/next-row?path=${encodeURIComponent(excelPath)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`next-row HTTP ${res.status}`);
  return await res.json();
}

async function markDone(excelPath, id) {
  const res = await fetch(`${SERVER}/mark-done`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: excelPath, id }),
  });
  if (!res.ok) throw new Error(`mark-done HTTP ${res.status}`);
  return await res.json();
}

async function ensureTab(url) {
  if (state.tabId) {
    try {
      await chrome.tabs.get(state.tabId);
      await chrome.tabs.update(state.tabId, { url, active: true });
      return;
    } catch (_) {
      state.tabId = null;
    }
  }
  const tab = await chrome.tabs.create({ url, active: true });
  state.tabId = tab.id;
}

async function stopRun(reason) {
  state.running = false;
  state.phase = "idle";
  state.currentId = null;
  state.currentRow = null;
  await pushLog(`Stopped: ${reason}`, "error");
}

async function startRun(storeUrl, excelPath) {
  state.running = true;
  state.storeUrl = storeUrl;
  state.excelPath = excelPath;
  state.phase = "waitingStore";
  state.currentId = null;
  state.currentRow = null;

  await pushLog("Starting…", "ok");

  // server check (serve.py stays unchanged)
  try {
    const health = await fetch(`${SERVER}/`);
    if (!health.ok) throw new Error("Server not reachable");
  } catch (e) {
    await stopRun("Server not connected on 127.0.0.1:5000");
    return;
  }

  await ensureTab(storeUrl);
}

async function beginCycleOnStorePage() {
  let row;
  try {
    row = await fetchNextRow(state.excelPath);
  } catch (e) {
    await stopRun("Failed to read Excel (server error).");
    return;
  }

  if (row && row.message && String(row.message).includes("No rows")) {
    state.running = false;
    await pushLog("No rows left. Done.", "ok");
    return;
  }

  state.currentRow = row;
  state.currentId = row.Id;

  await pushLog(`Processing Id=${row.Id}`, "ok");

  try {
    await chrome.tabs.sendMessage(state.tabId, {
      type: "STORE_STEP",
      id: row.Id,
    });
    // STORE_STEP clicks "Continue to uploader" (navigation starts)
    state.phase = "waitingUploader";
  } catch (e) {
    await stopRun("Content script not available on this page.");
  }
}

async function doUploaderStep() {
  if (!state.currentRow) {
    await stopRun("No current row loaded (unexpected).");
    return;
  }

  try {
    await chrome.tabs.sendMessage(state.tabId, {
      type: "UPLOADER_STEP",
      row: state.currentRow,
      excelPath: state.excelPath,
    });
    // UPLOADER_STEP clicks Publish (navigation starts)
    state.phase = "waitingPublished";
  } catch (e) {
    await stopRun("Content script not available on uploader page.");
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  (async () => {
    if (msg.type === "START") {
      state.running = false;
      await startRun(msg.storeUrl, msg.excelPath);
      return;
    }

    if (msg.type === "ERROR") {
      await stopRun(msg.reason || "Unknown error");
      return;
    }

    if (msg.type === "LOG_LINE") {
      await pushLog(msg.text || "", msg.kind || "info");
      return;
    }
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  (async () => {
    if (!state.running) return;
    if (tabId !== state.tabId) return;
    if (changeInfo.status !== "complete") return;

    const url = tab.url || "";

    if (state.phase === "waitingStore") {
      await pushLog("Store page loaded. Getting next row…", "ok");
      await beginCycleOnStorePage();
      return;
    }

    if (state.phase === "waitingUploader") {
      await pushLog("Page loaded after store step. Trying uploader step…", "ok");
      await doUploaderStep();
      return;
    }

    if (state.phase === "waitingPublished") {
      if (url.includes("teepublic.com/t-shirt/")) {
        await pushLog("Published page detected (/t-shirt/). Marking Done…", "ok");

        try {
          await markDone(state.excelPath, state.currentId);
          await pushLog(`Marked Done for Id=${state.currentId}`, "ok");
        } catch (e) {
          await stopRun("Could not mark Done (Excel might be open/locked).");
          return;
        }

        // Reset and go back to store
        state.phase = "waitingStore";
        state.currentId = null;
        state.currentRow = null;

        await chrome.tabs.update(state.tabId, { url: state.storeUrl });
      }
    }
  })();
});

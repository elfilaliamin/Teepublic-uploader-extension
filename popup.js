const $ = (id) => document.getElementById(id);

function stripQuotes(s) {
  if (!s) return s;
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function logLine(text, kind = "info") {
  const el = document.createElement("div");
  el.textContent = text;
  el.className =
    kind === "error" ? "text-red-300" : kind === "ok" ? "text-green-300" : "text-gray-100";
  $("log").prepend(el);
}

async function loadSaved() {
  const { storeUrl, excelPath, logs } = await chrome.storage.local.get([
    "storeUrl",
    "excelPath",
    "logs",
  ]);

  if (storeUrl) $("storeUrl").value = storeUrl;
  if (excelPath) $("excelPath").value = excelPath;

  (logs || []).slice(-30).reverse().forEach((l) => logLine(l.text, l.kind));
}

async function saveValues() {
  const storeUrl = stripQuotes($("storeUrl").value);
  const excelPath = stripQuotes($("excelPath").value);

  $("storeUrl").value = storeUrl;
  $("excelPath").value = excelPath;

  await chrome.storage.local.set({ storeUrl, excelPath });
  logLine("Saved settings.", "ok");
}

async function clearValues() {
  await chrome.storage.local.remove(["storeUrl", "excelPath"]);
  $("storeUrl").value = "";
  $("excelPath").value = "";
  logLine("Cleared settings.", "ok");
}

async function start() {
  const storeUrl = stripQuotes($("storeUrl").value);
  const excelPath = stripQuotes($("excelPath").value);

  if (!storeUrl || !excelPath) {
    logLine("Please set Store Link and Excel File Path.", "error");
    return;
  }

  await chrome.storage.local.set({ storeUrl, excelPath });

  chrome.runtime.sendMessage({
    type: "START",
    storeUrl,
    excelPath,
  });
}

$("saveBtn").addEventListener("click", saveValues);
$("clearBtn").addEventListener("click", clearValues);
$("startBtn").addEventListener("click", start);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "LOG") logLine(msg.text, msg.kind || "info");
});

loadSaved();

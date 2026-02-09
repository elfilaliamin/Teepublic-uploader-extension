const SERVER = "http://127.0.0.1:5000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanPath(p) {
  if (!p) return p;
  p = String(p).trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1).trim();
  }
  return p;
}

async function waitFor(condFn, timeoutMs = 20000, stepMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const v = condFn();
      if (v) return v;
    } catch (_) {}
    await sleep(stepMs);
  }
  return null;
}

function setNativeValue(el, value) {
  const desc = Object.getOwnPropertyDescriptor(el, "value");
  const proto = Object.getPrototypeOf(el);
  const protoDesc = Object.getOwnPropertyDescriptor(proto, "value");
  const setter = (protoDesc && protoDesc.set) || (desc && desc.set);
  setter.call(el, value);
}

function logLine(text, kind = "info") {
  chrome.runtime.sendMessage({ type: "LOG_LINE", text, kind });
}

// Center The design in teepublic
function centerDesign() {
  document
    .querySelectorAll(
      '[title="Center Horizontally"], [title="Top Align"], [title="Center Vertically"]'
    )
    .forEach((el) => el.click());
}

// Checkbox rule: 1st, 5th, 6th checked; 2nd, 3rd, 4th unchecked
function applyCheckboxRules() {
  const boxes = [...document.querySelectorAll('input[type="checkbox"]')];

  const ensureChecked = (i) => {
    const cb = boxes[i];
    if (cb && !cb.checked) cb.click();
  };

  const ensureUnchecked = (i) => {
    const cb = boxes[i];
    if (cb && cb.checked) cb.click();
  };

  [0, 4, 5].forEach(ensureChecked);
  [1, 2, 3].forEach(ensureUnchecked);
}

async function clickCopySettings() {
  const el = await waitFor(() => {
    const spans = [...document.querySelectorAll("span.link__content")];
    return spans.find((s) => s.textContent.trim() === "Copy Settings");
  }, 25000);

  if (!el) throw new Error('Could not find: <span class="link__content">Copy Settings</span>');
  el.click();
  await sleep(300);
}

async function clickContinueToUploader() {
  const btn = await waitFor(
    () =>
      document.querySelector(
        'input.m-design-copier-modal__form-submit[type="submit"][value="Continue to uploader"]'
      ),
    25000
  );
  if (!btn) throw new Error('Could not find: "Continue to uploader" submit input.');
  btn.click();
  await sleep(300);
}

async function storeStep() {
  const ready = await waitFor(() => document.readyState === "complete", 15000);
  if (!ready) throw new Error("Page not ready (store step).");

  await clickCopySettings();

  // Wait a bit for modal contents (checkboxes/buttons) to appear
  await waitFor(
    () => document.querySelector('input.m-design-copier-modal__form-submit[value="Continue to uploader"]'),
    25000
  );

  applyCheckboxRules();
  centerDesign();
  await clickContinueToUploader();
  logLine("Store step done: Copy Settings -> checkbox rules -> center -> Continue.", "ok");
}

async function uploadImageFromPath(path) {
  path = cleanPath(path);

  const res = await fetch(`${SERVER}/get-file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`get-file HTTP ${res.status}`);

  const blob = await res.blob();
  const fileName = path.split(/[\\/]/).pop() || "design.png";
  const file = new File([blob], fileName, { type: blob.type || "image/png" });

  const input = await waitFor(
    () => document.querySelector('input.jsUploaderFileInput.m-uploader__dropzone-input[type="file"]'),
    25000
  );
  if (!input) throw new Error("Uploader file input not found (.jsUploaderFileInput).");

  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitUploadFinished(timeoutMs = 180000) {
  const start = Date.now();
  let sawBlock = false;

  while (Date.now() - start < timeoutMs) {
    const dz = document.querySelector(".m-uploader__dropzone.jsUploaderDropzone");
    if (dz) {
      const display = window.getComputedStyle(dz).display;
      if (display === "block") sawBlock = true;
      if (sawBlock && display === "none") return true;
    }
    await sleep(200);
  }
  throw new Error("Upload timeout: dropzone didn't toggle block -> none.");
}

function fillInputByPlaceholder(placeholder, value) {
  const el = document.querySelector(`input[placeholder="${CSS.escape(placeholder)}"]`);
  if (!el) throw new Error(`Input not found: placeholder="${placeholder}"`);
  el.focus();
  setNativeValue(el, value ?? "");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
}

function fillTextareaByPlaceholder(placeholder, value) {
  const el = document.querySelector(`textarea[placeholder="${CSS.escape(placeholder)}"]`);
  if (!el) throw new Error(`Textarea not found: placeholder="${placeholder}"`);
  el.focus();
  setNativeValue(el, value ?? "");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
}

// Taggle-style helper: fills tags into #secondary_tags and presses Enter for each one
function fillSecondaryTags(tags, containerSelector = "#secondary_tags") {
  const container = document.querySelector(containerSelector);
  if (!container) throw new Error(`Could not find container: ${containerSelector}`);

  const input = container.querySelector("input.taggle_input");
  if (!input) throw new Error("Could not find the Taggle input (.taggle_input)");

  const list = Array.isArray(tags)
    ? tags
    : String(tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  const pressEnter = (el) => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 })
    );
    el.dispatchEvent(
      new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 })
    );
  };

  input.focus();
  fire(input, "focus");

  for (const tag of list) {
    input.value = "";
    fire(input, "input");

    input.value = tag;
    fire(input, "input");
    fire(input, "change");

    pressEnter(input);
  }

  return list.length;
}

async function uploaderStep(row) {
  const ready = await waitFor(() => document.readyState === "complete", 15000);
  if (!ready) throw new Error("Page not ready (uploader step).");

  // Make sure we're on uploader page
  const fileInput = await waitFor(
    () => document.querySelector('input.jsUploaderFileInput[type="file"]'),
    25000
  );
  if (!fileInput) throw new Error("Not on uploader page (file input missing).");

  await uploadImageFromPath(row.Image_Path);
  logLine("Image selected.", "ok");

  await waitUploadFinished();
  logLine("Upload finished.", "ok");

  // Fill fields
  fillInputByPlaceholder("Title", row.Title || "");
  fillTextareaByPlaceholder("Describe your design", row.Description || "");
  fillInputByPlaceholder("Main tag", row.Main_Tag || "");
  fillSecondaryTags(row.Tags || "", "#secondary_tags");

  // Center
  centerDesign();

  // content flag false
  const contentFlag = document.getElementById("design_content_flag_false");
  if (!contentFlag) throw new Error("design_content_flag_false not found.");
  if (!contentFlag.checked) contentFlag.click();

  // terms checkbox
  const terms = document.getElementById("terms");
  if (!terms) throw new Error("#terms checkbox not found.");
  if (!terms.checked) terms.click();

  // publish
  const publish = document.querySelector(
    'button.publish-and-promote-button.btn.btn--big.btn--green[name="commit"][value="publish"]'
  );
  if (!publish) throw new Error("Publish button not found.");
  publish.click();
  logLine("Clicked Publish.", "ok");
}

chrome.runtime.onMessage.addListener((msg) => {
  (async () => {
    try {
      if (msg.type === "STORE_STEP") {
        await storeStep();
        return;
      }
      if (msg.type === "UPLOADER_STEP") {
        const row = { ...msg.row };
        row.Image_Path = cleanPath(row.Image_Path);
        await uploaderStep(row);
        return;
      }
    } catch (e) {
      chrome.runtime.sendMessage({
        type: "ERROR",
        reason: e?.message || String(e),
      });
    }
  })();
});

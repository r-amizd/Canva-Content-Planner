(function () {
  console.log("[Canva Dispatcher] Content script active");

  function getFolderIdFromUrl() {
    const match = window.location.pathname.match(/\/folder\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  // Setup Shadow DOM Host
  const host = document.createElement("div");
  host.id = "canva-dispatcher-host";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .launcher-btn {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 999999;
      background: #7d2ae8;
      color: #fff;
      border: none;
      border-radius: 50px;
      padding: 13px 22px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(125, 42, 232, 0.4);
      transition: transform 0.15s ease, background 0.15s ease;
    }
    .launcher-btn:hover {
      background: #6c22d1;
      transform: translateY(-2px);
    }
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.55);
      z-index: 1000000;
      display: none;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .modal-card {
      background: #fff;
      width: 480px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      border-radius: 14px;
      padding: 24px;
      box-shadow: 0 20px 30px rgba(0,0,0,0.25);
      color: #1f2937;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
    }
    .modal-header h3 { margin: 0; font-size: 18px; }
    .close-btn { background: none; border: none; font-size: 22px; cursor: pointer; color: #9ca3af; }
    label { font-size: 12px; font-weight: 600; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block; }
    select, input[type="number"], input[type="text"] {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 16px;
    }
    .count-row { display: flex; gap: 12px; align-items: center; }
    .copies-list {
      flex: 1;
      overflow-y: auto;
      max-height: 220px;
      margin-bottom: 16px;
      padding-right: 4px;
    }
    .copy-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .copy-row span {
      font-size: 12px;
      color: #6b7280;
      width: 24px;
    }
    .copy-row input { margin-bottom: 0; }
    .submit-btn {
      background: #7d2ae8;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .submit-btn:hover { background: #6c22d1; }
    .submit-btn:disabled { background: #9ca3af; cursor: not-allowed; }
    .status-box {
      font-size: 13px;
      margin-top: 10px;
      max-height: 100px;
      overflow-y: auto;
    }
  `;
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <button class="launcher-btn" id="openBtn">⚡ Batch Duplicate</button>
    <div class="modal-overlay" id="overlay">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Folder Batch Duplicator</h3>
          <button class="close-btn" id="closeBtn">&times;</button>
        </div>

        <label>1. Select Source Design</label>
        <select id="designSelect">
          <option value="">Scanning folder designs...</option>
        </select>

        <div class="count-row">
          <div style="flex: 1;">
            <label>2. Number of Copies</label>
            <input type="number" id="copyCount" min="1" max="15" value="3">
          </div>
        </div>

        <label>3. Name Each Duplicate</label>
        <div class="copies-list" id="copiesContainer"></div>

        <button class="submit-btn" id="runBtn">Duplicate & Save to Folder</button>
        <div class="status-box" id="statusBox"></div>
      </div>
    </div>
  `;
  shadow.appendChild(wrapper);

  const openBtn = shadow.getElementById("openBtn");
  const closeBtn = shadow.getElementById("closeBtn");
  const overlay = shadow.getElementById("overlay");
  const designSelect = shadow.getElementById("designSelect");
  const copyCount = shadow.getElementById("copyCount");
  const copiesContainer = shadow.getElementById("copiesContainer");
  const runBtn = shadow.getElementById("runBtn");
  const statusBox = shadow.getElementById("statusBox");

  const defaultPresets = ["Instagram Post", "LinkedIn Graphic", "Facebook Feed", "X Post", "Pinterest Pin", "Story", "Flyer"];

  function renderCopyInputs(count) {
    copiesContainer.innerHTML = "";
    const selectedText = designSelect.options[designSelect.selectedIndex]?.text || "Design";
    
    for (let i = 0; i < count; i++) {
      const row = document.createElement("div");
      row.className = "copy-row";
      const preset = defaultPresets[i] || `Copy ${i + 1}`;
      row.innerHTML = `
        <span>#${i + 1}</span>
        <input type="text" class="copy-title-input" value="${selectedText} - ${preset}">
      `;
      copiesContainer.appendChild(row);
    }
  }

  copyCount.addEventListener("input", () => {
    const val = Math.min(Math.max(parseInt(copyCount.value, 10) || 1, 1), 15);
    renderCopyInputs(val);
  });

  designSelect.addEventListener("change", () => {
    renderCopyInputs(parseInt(copyCount.value, 10) || 3);
  });

  openBtn.addEventListener("click", () => {
    const folderId = getFolderIdFromUrl();
    if (!folderId) {
      alert("Please navigate to a Canva folder URL (e.g. canva.com/folder/FAHZ...) first.");
      return;
    }

    overlay.style.display = "flex";
    statusBox.innerHTML = "";
    designSelect.innerHTML = `<option value="">Scanning designs in folder...</option>`;
    runBtn.disabled = true;

    const reqId = crypto.randomUUID();
    window.postMessage({
      source: "CANVA_EXT_UI",
      type: "FETCH_FOLDER_ITEMS",
      folderId,
      requestId: reqId
    }, "*");

    function handleFolderResponse(e) {
      if (e.source !== window || !e.data || e.data.source !== "CANVA_EXT_ENGINE") return;
      if (e.data.requestId !== reqId) return;
      window.removeEventListener("message", handleFolderResponse);

      const designs = e.data.designs || [];
      if (designs.length === 0) {
        designSelect.innerHTML = `<option value="">No designs found on this page</option>`;
        return;
      }

      designSelect.innerHTML = designs.map(d => `<option value="${d.id}">${d.title}</option>`).join("");
      runBtn.disabled = false;
      renderCopyInputs(parseInt(copyCount.value, 10) || 3);
    }

    window.addEventListener("message", handleFolderResponse);
  });

  closeBtn.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  runBtn.addEventListener("click", () => {
    const sourceDesignId = designSelect.value;
    const folderId = getFolderIdFromUrl();
    if (!sourceDesignId || !folderId) return;

    const titleInputs = shadow.querySelectorAll(".copy-title-input");
    const copies = Array.from(titleInputs).map(inp => ({
      title: inp.value.trim() || "Untitled Copy"
    }));

    runBtn.disabled = true;
    runBtn.textContent = "Duplicating...";
    statusBox.innerHTML = `<span style="color:#6b7280;">Processing ${copies.length} copies...</span>`;

    const reqId = crypto.randomUUID();
    window.postMessage({
      source: "CANVA_EXT_UI",
      type: "EXECUTE_DUPLICATION_BATCH",
      payload: {
        requestId: reqId,
        sourceDesignId,
        folderId,
        copies
      }
    }, "*");

    function handleBatchComplete(e) {
      if (e.source !== window || !e.data || e.data.source !== "CANVA_EXT_ENGINE") return;
      if (e.data.requestId !== reqId) return;
      window.removeEventListener("message", handleBatchComplete);

      runBtn.disabled = false;
      runBtn.textContent = "Duplicate & Save to Folder";

      const results = e.data.results || [];
      const successes = results.filter(r => r.success);
      statusBox.innerHTML = `
        <span style="color: green; font-weight: 600;">
          ✓ Successfully created ${successes.length}/${results.length} designs! Cards added to grid.
        </span>
      `;
    }

    window.addEventListener("message", handleBatchComplete);
  });
})();
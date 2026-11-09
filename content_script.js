(function () {
  console.log("[Canva Dispatcher] Themed content script initialized");

  function getFolderIdFromUrl() {
    const match = window.location.pathname.match(/\/folder\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function getDefaultScheduleDate(daysFromNow = 1, hour = 10, minute = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, minute, 0, 0);

    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const host = document.createElement("div");
  host.id = "canva-dispatcher-host";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host {
      --cv-bg-surface: #1e1f21;
      --cv-bg-card: #252627;
      --cv-bg-input: #121214;
      --cv-border: rgba(255, 255, 255, 0.12);
      --cv-border-focus: #8b3dff;
      --cv-text-primary: #ffffff;
      --cv-text-secondary: #a7a9ac;
      --cv-purple: #8b3dff;
      --cv-purple-hover: #7a2be2;
      --cv-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    /* Floating Launcher - Positioned above Canva's native help button */
    .launcher-btn {
      position: fixed;
      bottom: 84px;
      right: 24px;
      z-index: 999999;
      background: linear-gradient(135deg, #8b3dff 0%, #5d2ad0 100%);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 24px;
      padding: 10px 18px;
      font-family: var(--cv-font);
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.2px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
    }
    .launcher-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 22px rgba(139, 61, 255, 0.4);
    }
    .launcher-btn:active {
      transform: translateY(0);
    }

    /* Modal Backdrop */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(4px);
      z-index: 1000000;
      display: none;
      align-items: center;
      justify-content: center;
      font-family: var(--cv-font);
    }

    /* Main Modal Surface */
    .modal-card {
      background: var(--cv-bg-surface);
      border: 1px solid var(--cv-border);
      width: 620px;
      max-height: 86vh;
      display: flex;
      flex-direction: column;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
      color: var(--cv-text-primary);
      box-sizing: border-box;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--cv-border);
    }
    .modal-header h3 {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.2px;
      color: var(--cv-text-primary);
    }
    .close-btn {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: var(--cv-text-secondary);
      border-radius: 8px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .close-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }

    label {
      font-size: 11px;
      font-weight: 700;
      color: var(--cv-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 6px;
      display: block;
    }

    select, input[type="text"], input[type="datetime-local"] {
      width: 100%;
      box-sizing: border-box;
      padding: 9px 12px;
      background: var(--cv-bg-input);
      border: 1px solid var(--cv-border);
      border-radius: 8px;
      font-size: 13px;
      color: var(--cv-text-primary);
      outline: none;
      font-family: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    select:focus, input[type="text"]:focus, input[type="datetime-local"]:focus {
      border-color: var(--cv-border-focus);
      box-shadow: 0 0 0 2px rgba(139, 61, 255, 0.25);
    }
    input[type="datetime-local"]::-webkit-calendar-picker-indicator {
      filter: invert(0.85);
      cursor: pointer;
    }

    /* Target Cards */
    .task-list {
      flex: 1;
      overflow-y: auto;
      max-height: 380px;
      margin-bottom: 18px;
      padding-right: 6px;
    }
    .task-list::-webkit-scrollbar {
      width: 6px;
    }
    .task-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
    }

    .task-card {
      border: 1px solid var(--cv-border);
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 12px;
      background: var(--cv-bg-card);
      transition: border-color 0.15s ease;
    }
    .task-card:hover {
      border-color: rgba(255, 255, 255, 0.2);
    }
    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .target-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 13px;
      color: var(--cv-text-primary);
    }
    .target-badge span.dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00c4cc;
      display: inline-block;
    }

    .task-grid {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 12px;
      margin-bottom: 10px;
    }
    .time-input-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sync-label {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      color: var(--cv-text-secondary);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      text-transform: none;
      margin: 0;
    }
    .sync-label input[type="checkbox"], .target-toggle input[type="checkbox"] {
      accent-color: var(--cv-purple);
      cursor: pointer;
      width: 14px;
      height: 14px;
      margin: 0;
    }

    .task-caption {
      margin-top: 8px;
    }

    /* Primary Action Button */
    .submit-btn {
      background: var(--cv-purple);
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s ease, opacity 0.15s ease;
    }
    .submit-btn:hover { background: var(--cv-purple-hover); }
    .submit-btn:disabled {
      background: rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.35);
      cursor: not-allowed;
    }

    .status-box {
      font-size: 12px;
      margin-top: 12px;
      max-height: 80px;
      overflow-y: auto;
      line-height: 1.4;
    }
  `;
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <button class="launcher-btn" id="openBtn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      Dupe & Schedule
    </button>
    <div class="modal-overlay" id="overlay">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Campaign Duplicator & Scheduler</h3>
          <button class="close-btn" id="closeBtn">&times;</button>
        </div>

        <div style="margin-bottom: 16px;">
          <label>Select Source Design</label>
          <select id="designSelect"><option value="">Scanning folder...</option></select>
        </div>

        <label>Destination Campaign Targets</label>
        <div class="task-list" id="taskList"></div>

        <button class="submit-btn" id="runBtn">Execute Campaign Dispatch</button>
        <div class="status-box" id="statusBox"></div>
      </div>
    </div>
  `;
  shadow.appendChild(wrapper);

  const openBtn = shadow.getElementById("openBtn");
  const closeBtn = shadow.getElementById("closeBtn");
  const overlay = shadow.getElementById("overlay");
  const designSelect = shadow.getElementById("designSelect");
  const taskList = shadow.getElementById("taskList");
  const runBtn = shadow.getElementById("runBtn");
  const statusBox = shadow.getElementById("statusBox");

  let connectedQueues = [];

  function syncTimesAcrossCards(triggerInput) {
    const parentCard = triggerInput.closest(".task-card");
    const syncCheckbox = parentCard?.querySelector(".task-sync-time");

    if (syncCheckbox && !syncCheckbox.checked) return;

    const newValue = triggerInput.value;
    const cards = shadow.querySelectorAll(".task-card");

    cards.forEach(card => {
      const isSyncActive = card.querySelector(".task-sync-time")?.checked;
      const dateInput = card.querySelector(".task-date");
      if (isSyncActive && dateInput && dateInput !== triggerInput) {
        dateInput.value = newValue;
      }
    });
  }

  function renderTasks() {
    taskList.innerHTML = "";
    const sourceTitle = designSelect.options[designSelect.selectedIndex]?.text || "Design";
    const baselineSharedDate = getDefaultScheduleDate(1, 10, 0);

    connectedQueues.forEach((queue, index) => {
      const card = document.createElement("div");
      card.className = "task-card";
      card.innerHTML = `
        <div class="task-header">
          <div class="target-badge">
            <span class="dot"></span>
            <span>${queue.platform} &mdash; ${queue.name}</span>
          </div>
          <label class="sync-label target-toggle">
            <input type="checkbox" class="task-enable" checked data-idx="${index}"> Enable Target
          </label>
        </div>
        <div class="task-grid">
          <div>
            <label>Title</label>
            <input type="text" class="task-title" value="${sourceTitle} - ${queue.platform}">
          </div>
          <div>
            <label>Schedule Time (Local)</label>
            <div class="time-input-group">
              <input type="datetime-local" class="task-date" value="${baselineSharedDate}">
              <label class="sync-label" title="Keep time synchronized with other targets">
                <input type="checkbox" class="task-sync-time" checked> Sync
              </label>
            </div>
          </div>
        </div>
        <div class="task-caption">
          <label>Caption / Post Message</label>
          <input type="text" class="task-msg" placeholder="Write post copy here...">
        </div>
      `;

      const dateInput = card.querySelector(".task-date");
      dateInput.addEventListener("input", (e) => syncTimesAcrossCards(e.target));

      const syncCheckbox = card.querySelector(".task-sync-time");
      syncCheckbox.addEventListener("change", (e) => {
        if (e.target.checked) {
          const syncedSibling = Array.from(shadow.querySelectorAll(".task-card"))
            .find(c => c !== card && c.querySelector(".task-sync-time")?.checked);
          if (syncedSibling) {
            dateInput.value = syncedSibling.querySelector(".task-date").value;
          }
        }
      });

      taskList.appendChild(card);
    });
  }

  openBtn.addEventListener("click", () => {
    const folderId = getFolderIdFromUrl();
    if (!folderId) {
      alert("Please navigate to a Canva folder view first.");
      return;
    }

    overlay.style.display = "flex";
    statusBox.innerHTML = "";
    designSelect.innerHTML = `<option value="">Fetching designs & queues...</option>`;
    taskList.innerHTML = "";
    runBtn.disabled = true;

    const reqId = crypto.randomUUID();
    window.postMessage({
      source: "CANVA_EXT_UI",
      type: "INIT_DATA_REQUEST",
      requestId: reqId
    }, "*");

    function handleInit(e) {
      if (e.source !== window || !e.data || e.data.source !== "CANVA_EXT_ENGINE") return;
      if (e.data.requestId !== reqId) return;
      window.removeEventListener("message", handleInit);

      if (e.data.type === "INIT_DATA_ERROR") {
        statusBox.innerHTML = `<span style="color:#ef4444;">${e.data.error}</span>`;
        return;
      }

      const designs = e.data.designs || [];
      connectedQueues = e.data.queues || [];

      if (designs.length === 0) {
        designSelect.innerHTML = `<option value="">No designs found in this folder</option>`;
        return;
      }

      designSelect.innerHTML = designs.map(d => `<option value="${d.id}">${d.title}</option>`).join("");
      runBtn.disabled = false;
      renderTasks();
    }

    window.addEventListener("message", handleInit);
  });

  designSelect.addEventListener("change", () => {
    renderTasks();
  });

  closeBtn.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  runBtn.addEventListener("click", () => {
    const sourceDesignId = designSelect.value;
    const folderId = getFolderIdFromUrl();
    if (!sourceDesignId || !folderId) return;

    const cards = Array.from(shadow.querySelectorAll(".task-card"));
    const tasks = [];

    cards.forEach((card, i) => {
      const enabled = card.querySelector(".task-enable").checked;
      if (!enabled) return;

      const title = card.querySelector(".task-title").value.trim() || `Campaign Post ${i + 1}`;
      const scheduleDate = card.querySelector(".task-date").value;
      const caption = card.querySelector(".task-msg").value.trim();
      const queue = connectedQueues[i];

      tasks.push({
        title,
        queueId: queue?.id,
        scheduleDate,
        caption
      });
    });

    if (tasks.length === 0) {
      alert("Please enable at least one channel target.");
      return;
    }

    runBtn.disabled = true;
    runBtn.textContent = "Dispatching campaign...";
    statusBox.innerHTML = `<span style="color:var(--cv-text-secondary);">Processing ${tasks.length} items (cloning & scheduling)...</span>`;

    const reqId = crypto.randomUUID();
    window.postMessage({
      source: "CANVA_EXT_UI",
      type: "EXECUTE_DUPLICATE_AND_SCHEDULE",
      payload: {
        requestId: reqId,
        sourceDesignId,
        folderId,
        tasks
      }
    }, "*");

    function handleComplete(e) {
      if (e.source !== window || !e.data || e.data.source !== "CANVA_EXT_ENGINE") return;
      if (e.data.requestId !== reqId) return;
      window.removeEventListener("message", handleComplete);

      runBtn.disabled = false;
      runBtn.textContent = "Execute Campaign Dispatch";

      const results = e.data.results || [];
      const succeeded = results.filter(r => r.success);
      statusBox.innerHTML = `
        <span style="color: #10b981; font-weight: 600;">
          ✓ Completed ${succeeded.length}/${results.length} tasks! Duplicated, registered to folder, and scheduled on Content Planner.
        </span>
      `;
    }

    window.addEventListener("message", handleComplete);
  });
})();
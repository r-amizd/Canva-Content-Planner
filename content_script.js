(function () {
  console.log("[Canva Dispatcher] Content script ready");

  function getFolderIdFromUrl() {
    const match = window.location.pathname.match(/\/folder\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function getDefaultScheduleDate(daysFromNow = 1, hour = 10, minute = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, minute, 0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  }

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
    .launcher-btn:hover { background: #6c22d1; transform: translateY(-2px); }
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
      width: 580px;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      border-radius: 14px;
      padding: 24px;
      box-shadow: 0 20px 30px rgba(0,0,0,0.25);
      color: #1f2937;
    }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .modal-header h3 { margin: 0; font-size: 18px; }
    .close-btn { background: none; border: none; font-size: 22px; cursor: pointer; color: #9ca3af; }
    label { font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; display: block; }
    select, input[type="text"], input[type="datetime-local"] {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 13px;
    }
    .task-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      background: #f9fafb;
    }
    .task-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 8px;
    }
    .task-caption {
      margin-top: 6px;
    }
    .task-list {
      flex: 1;
      overflow-y: auto;
      max-height: 340px;
      margin-bottom: 16px;
      padding-right: 4px;
    }
    .submit-btn {
      background: #7d2ae8;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .submit-btn:hover { background: #6c22d1; }
    .submit-btn:disabled { background: #9ca3af; cursor: not-allowed; }
    .status-box { font-size: 13px; margin-top: 10px; max-height: 90px; overflow-y: auto; }
  `;
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <button class="launcher-btn" id="openBtn">⚡ Dupe & Schedule</button>
    <div class="modal-overlay" id="overlay">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Campaign Duplicator & Scheduler</h3>
          <button class="close-btn" id="closeBtn">&times;</button>
        </div>

        <div style="margin-bottom: 14px;">
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

  function renderTasks() {
    taskList.innerHTML = "";
    const sourceTitle = designSelect.options[designSelect.selectedIndex]?.text || "Design";

    connectedQueues.forEach((queue, index) => {
      const card = document.createElement("div");
      card.className = "task-card";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight: 600; font-size: 13px;">${queue.platform} &mdash; ${queue.name}</span>
          <label style="margin: 0; font-size: 11px; text-transform:none;">
            <input type="checkbox" class="task-enable" checked data-idx="${index}"> Enable
          </label>
        </div>
        <div class="task-grid">
          <div>
            <label>Title</label>
            <input type="text" class="task-title" value="${sourceTitle} - ${queue.platform}">
          </div>
          <div>
            <label>Schedule Time</label>
            <input type="datetime-local" class="task-date" value="${getDefaultScheduleDate(index + 1, 10 + (index % 4))}">
          </div>
        </div>
        <div class="task-caption">
          <label>Caption / Post Message</label>
          <input type="text" class="task-msg" placeholder="Write post copy here...">
        </div>
      `;
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
        statusBox.innerHTML = `<span style="color:red;">${e.data.error}</span>`;
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
    statusBox.innerHTML = `<span style="color:#6b7280;">Processing ${tasks.length} items (cloning & scheduling)...</span>`;

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
        <span style="color: green; font-weight: 600;">
          ✓ Completed ${succeeded.length}/${results.length} tasks! Designs duplicated, added to folder, and scheduled on the Content Planner calendar.
        </span>
      `;
    }

    window.addEventListener("message", handleComplete);
  });
})();
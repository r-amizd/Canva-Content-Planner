(function () {
  console.log("[Canva Dispatcher] Main world runner loaded");

  function getSession() {
    if (window.bootstrap?.base?.a) {
      const b = window.bootstrap.base.a;
      return {
        authz: b.C,
        activeUser: b.N,
        user: b.L,
        brand: b.D,
        analytics: b.A
      };
    }
    if (window.CanvaSession) {
      return window.CanvaSession;
    }
    throw new Error("Canva session credentials not available");
  }

  function getHeaders(requestType = "general") {
    const s = getSession();
    return {
      "content-type": "application/json;charset=UTF-8",
      "x-canva-accept-prefix": "no-prefix",
      "x-canva-active-user": s.activeUser,
      "x-canva-analytics": s.analytics,
      "x-canva-app": "home",
      "x-canva-authz": s.authz,
      "x-canva-brand": s.brand,
      "x-canva-locale": "en",
      "x-canva-request": requestType,
      "x-canva-user": s.user
    };
  }

  function generateItemKey() {
    return crypto.randomUUID().replace(/-/g, "").substring(0, 22);
  }

  // DOM Scraper for Folder View
  function getFolderDesignsFromDOM() {
    const cards = Array.from(document.querySelectorAll('a[href*="designId="]'));
    const results = [];
    const seen = new Set();

    cards.forEach(a => {
      let id = null;
      try {
        const url = new URL(a.href);
        id = url.searchParams.get("designId");
      } catch (e) {
        const match = a.href.match(/designId=([A-Za-z0-9_-]+)/);
        if (match) id = match[1];
      }

      if (!id || seen.has(id)) return;
      seen.add(id);

      const container = a.closest('[data-testid], [role="group"], article, div[class*="Card"], div[tabindex]') || a.parentElement;
      const titleEl = container.querySelector('span[title], p, h3, [aria-label]') || container;
      const title = titleEl.getAttribute('title') || 
                    titleEl.getAttribute('aria-label') || 
                    container.innerText.trim().split('\n')[0] || 
                    "Untitled Design";

      results.push({ id, title: title.trim() });
    });

    return results;
  }

  // 1. Fetch Connected Social Queues
  async function fetchConnectedQueues() {
    const s = getSession();
    const url = `https://www.canva.com/_ajax/shares/targetqueues?brand=${s.brand}&actions=C&filteredForContentPlanner&limit=100`;
    const res = await fetch(url, {
      method: "GET",
      headers: getHeaders("gettargetqueues"),
      credentials: "include"
    });

    if (!res.ok) throw new Error(`Failed to load target queues (${res.status})`);
    const data = await res.json();
    return (data.targetQueues || []).map(q => ({
      id: q.id,
      platform: q.reference?.platform || "UNKNOWN",
      targetType: q.reference?.targetType || "DEFAULT",
      name: q.externalName || "Unnamed Channel",
      avatar: q.externalThumb || ""
    }));
  }

  // 2. Clone Design
  async function cloneDesign(sourceDesignId, newTitle) {
    const res = await fetch("https://www.canva.com/_ajax/design", {
      method: "POST",
      headers: getHeaders("createdesign"),
      credentials: "include",
      body: JSON.stringify({
        "I": crypto.randomUUID(),
        "O": newTitle,
        "A?": "M",
        "N": sourceDesignId
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Clone failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    const newDesignId = data?.A?.A;
    if (!newDesignId) throw new Error("No design ID returned from clone endpoint");
    return newDesignId;
  }

  // 3. Register Design to Folder
  async function registerToFolder(folderId, designId) {
    const res = await fetch(`https://www.canva.com/_ajax/folders/${folderId}?createItems`, {
      method: "POST",
      headers: getHeaders("createitems"),
      credentials: "include",
      body: JSON.stringify({
        "A": { "id": folderId },
        "B": [
          {
            "A": "B",
            "B": designId,
            "D": generateItemKey()
          }
        ]
      })
    });
    return res.ok;
  }

  // Helper: Convert local datetime-local string to UTC "YYYY-MM-DDTHH:MM"
  function convertLocalToUtcIso(localIsoString) {
    if (!localIsoString) return localIsoString;
    // localIsoString looks like "2026-11-09T21:00"
    const localDate = new Date(localIsoString);
    // getUTCFullYear, getUTCMonth, etc.
    const year = localDate.getUTCFullYear();
    const month = String(localDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(localDate.getUTCDate()).padStart(2, "0");
    const hours = String(localDate.getUTCHours()).padStart(2, "0");
    const minutes = String(localDate.getUTCMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // 4. Schedule Post via RPC
  async function scheduleDesignPost(designId, queueId, localScheduleDate, message) {
    const s = getSession();
    
    // Explicitly convert local UI time (CST) to UTC for Canva's backend
    const utcScheduleDate = convertLocalToUtcIso(localScheduleDate);

    const payload = {
      user: s.user,
      brand: s.brand,
      document: designId,
      documentVersion: 1,
      message: message || "",
      targetQueues: [queueId],
      isDraft: false,
      action: "SCHEDULE_FOR_DATE",
      scheduleDate: utcScheduleDate,
      scheduleToNextAvailableSlot: false,
      schema: "WEB_2",
      exportSpec: {
        pages: [1],
        fileFormat: "JPG"
      }
    };

    const res = await fetch("https://www.canva.com/_ajax/shares", {
      method: "POST",
      headers: getHeaders("createshare"),
      credentials: "include",
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Schedule failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data?.share?.id || true;
  }

  // 5. DOM Injection for Instant Grid Updates
  function injectClonedCardToDOM(sourceDesignId, newDesignId, newTitle) {
    const sourceLink = document.querySelector(`a[href*="designId=${sourceDesignId}"]`);
    if (!sourceLink) return;

    const sourceCard = sourceLink.closest('[data-testid], [role="group"], article, div[class*="Card"], div[tabindex]') || sourceLink.parentElement;
    if (!sourceCard || !sourceCard.parentElement) return;

    const newCard = sourceCard.cloneNode(true);
    newCard.querySelectorAll('a').forEach(a => {
      if (a.href.includes("designId=")) {
        a.href = a.href.replace(/designId=[A-Za-z0-9_-]+/, `designId=${newDesignId}`);
      }
    });

    newCard.querySelectorAll('[title]').forEach(el => el.setAttribute('title', newTitle));
    newCard.querySelectorAll('[aria-label]').forEach(el => el.setAttribute('aria-label', newTitle));

    const textNodes = newCard.querySelectorAll('span, p, h3');
    for (const node of textNodes) {
      if (node.children.length === 0 && node.innerText.trim().length > 0) {
        node.innerText = newTitle;
        break;
      }
    }

    sourceCard.parentElement.insertBefore(newCard, sourceCard.parentElement.firstChild);
  }

  // Event Router
  window.addEventListener("message", async (e) => {
    if (e.source !== window || !e.data || e.data.source !== "CANVA_EXT_UI") return;

    if (e.data.type === "INIT_DATA_REQUEST") {
      try {
        const designs = getFolderDesignsFromDOM();
        const queues = await fetchConnectedQueues();
        window.postMessage({
          source: "CANVA_EXT_ENGINE",
          type: "INIT_DATA_RESPONSE",
          requestId: e.data.requestId,
          designs,
          queues
        }, "*");
      } catch (err) {
        window.postMessage({
          source: "CANVA_EXT_ENGINE",
          type: "INIT_DATA_ERROR",
          requestId: e.data.requestId,
          error: err.message
        }, "*");
      }
    }

    if (e.data.type === "EXECUTE_DUPLICATE_AND_SCHEDULE") {
      const { requestId, sourceDesignId, folderId, tasks } = e.data.payload;
      const results = [];

      for (const task of tasks) {
        try {
          // Step 1: Duplicate
          const newDesignId = await cloneDesign(sourceDesignId, task.title);

          // Step 2: Register in folder & DOM update
          if (folderId) {
            await registerToFolder(folderId, newDesignId);
          }
          injectClonedCardToDOM(sourceDesignId, newDesignId, task.title);

          // Step 3: Schedule if queue target provided
          let shareId = null;
          if (task.queueId && task.scheduleDate) {
            shareId = await scheduleDesignPost(newDesignId, task.queueId, task.scheduleDate, task.caption);
          }

          results.push({
            title: task.title,
            designId: newDesignId,
            scheduled: Boolean(shareId),
            success: true
          });
        } catch (err) {
          results.push({
            title: task.title,
            error: err.message,
            success: false
          });
        }
      }

      window.postMessage({
        source: "CANVA_EXT_ENGINE",
        type: "PIPELINE_COMPLETE",
        requestId,
        results
      }, "*");
    }
  });
})();
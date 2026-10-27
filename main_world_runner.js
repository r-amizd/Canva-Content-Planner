(function () {
  console.log("[Canva Dispatcher] Main world runner loaded");

  function getSession() {
    if (!window.bootstrap?.base?.a) {
      throw new Error("Canva session bootstrap not ready");
    }
    const session = window.bootstrap.base.a;
    return {
      authz: session.C,
      activeUser: session.N,
      user: session.L,
      brand: session.D,
      analytics: session.A
    };
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

  // 1. Scrape all designs visible in current folder view
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

  // 2. Clone Design entity
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

  // 3. Link newly cloned design to target folder
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

    if (!res.ok) {
      console.warn(`[Canva Dispatcher] Warning: registerToFolder returned ${res.status}`);
    }
    return res.ok;
  }

  // 4. Client-side DOM Injection for instant UI updates
  function injectClonedCardToDOM(sourceDesignId, newDesignId, newTitle) {
    const sourceLink = document.querySelector(`a[href*="designId=${sourceDesignId}"]`);
    if (!sourceLink) return;

    const sourceCard = sourceLink.closest('[data-testid], [role="group"], article, div[class*="Card"], div[tabindex]') || sourceLink.parentElement;
    if (!sourceCard || !sourceCard.parentElement) return;

    // Clone the card DOM structure
    const newCard = sourceCard.cloneNode(true);

    // Update all internal links with the new design ID
    newCard.querySelectorAll('a').forEach(a => {
      if (a.href.includes("designId=")) {
        a.href = a.href.replace(/designId=[A-Za-z0-9_-]+/, `designId=${newDesignId}`);
      }
    });

    // Update titles and aria-labels
    newCard.querySelectorAll('[title]').forEach(el => el.setAttribute('title', newTitle));
    newCard.querySelectorAll('[aria-label]').forEach(el => el.setAttribute('aria-label', newTitle));

    const textNodes = newCard.querySelectorAll('span, p, h3');
    if (textNodes.length > 0) {
      // Find the one containing the text
      for (const node of textNodes) {
        if (node.children.length === 0 && node.innerText.trim().length > 0) {
          node.innerText = newTitle;
          break;
        }
      }
    }

    // Prepend into the grid right before the source card or at top of grid
    sourceCard.parentElement.insertBefore(newCard, sourceCard.parentElement.firstChild);
  }

  // Event bridge listener
  window.addEventListener("message", async (e) => {
    if (e.source !== window || !e.data || e.data.source !== "CANVA_EXT_UI") return;

    if (e.data.type === "FETCH_FOLDER_ITEMS") {
      try {
        const designs = getFolderDesignsFromDOM();
        window.postMessage({
          source: "CANVA_EXT_ENGINE",
          type: "FOLDER_ITEMS_RESULT",
          requestId: e.data.requestId,
          designs
        }, "*");
      } catch (err) {
        window.postMessage({
          source: "CANVA_EXT_ENGINE",
          type: "FOLDER_ITEMS_ERROR",
          requestId: e.data.requestId,
          error: err.message
        }, "*");
      }
    }

    if (e.data.type === "EXECUTE_DUPLICATION_BATCH") {
      const { requestId, sourceDesignId, folderId, copies } = e.data.payload;
      const results = [];

      for (const item of copies) {
        try {
          const newId = await cloneDesign(sourceDesignId, item.title);
          if (folderId) {
            await registerToFolder(folderId, newId);
          }
          // Inject card directly into the page grid so no refresh is needed
          injectClonedCardToDOM(sourceDesignId, newId, item.title);

          results.push({ title: item.title, designId: newId, success: true });
        } catch (err) {
          results.push({ title: item.title, error: err.message, success: false });
        }
      }

      window.postMessage({
        source: "CANVA_EXT_ENGINE",
        type: "DUPLICATION_BATCH_COMPLETE",
        requestId,
        results
      }, "*");
    }
  });
})();
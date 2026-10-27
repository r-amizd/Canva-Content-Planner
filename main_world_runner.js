(function () {
  console.log("[Canva Automator] Main world runner loaded");

  // Helper to extract session credentials from Canva's runtime
  function getSession() {
    if (!window.bootstrap || !window.bootstrap.base || !window.bootstrap.base.a) {
      throw new Error("Canva session bootstrap not found on window");
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

  // Pure API call to clone a design
  async function cloneDesign(sourceDesignId, newTitle) {
    const s = getSession();

    const response = await fetch("https://www.canva.com/_ajax/design", {
      method: "POST",
      headers: {
        "content-type": "application/json;charset=UTF-8",
        "x-canva-accept-prefix": "no-prefix",
        "x-canva-active-user": s.activeUser,
        "x-canva-analytics": s.analytics,
        "x-canva-app": "home",
        "x-canva-authz": s.authz,
        "x-canva-brand": s.brand,
        "x-canva-locale": "en",
        "x-canva-request": "createdesign",
        "x-canva-user": s.user
      },
      credentials: "include",
      body: JSON.stringify({
        "I": crypto.randomUUID(),
        "O": newTitle,
        "A?": "M",
        "N": sourceDesignId
      })
    });

    if (!response.ok) {
      throw new Error(`Clone request failed with status: ${response.status}`);
    }

    const data = await response.json();
    const newDesignId = data?.A?.A;
    console.log(`[Canva Automator] Cloned ${sourceDesignId} -> ${newDesignId} ("${newTitle}")`);
    return newDesignId;
  }

  // Register on window for easy testing in console
  window.CanvaAutomator = {
    getSession,
    cloneDesign
  };
})();
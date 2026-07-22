const fs = require("fs");
const path = require("path");
const vm = require("vm");

const scriptPath = path.join(__dirname, "linuxdo_flip.user.js");
const scriptSource = fs.readFileSync(scriptPath, "utf8");

class StorageMock {
  constructor(seed) {
    this.map = new Map(seed ? Array.from(seed.entries()) : []);
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(String(key));
  }
}

class MockElement {
  constructor(document, tagName, id) {
    this.document = document;
    this.tagName = String(tagName || "div").toUpperCase();
    this.id = id || "";
    this.style = {};
    this.listeners = {};
    this.children = [];
    this.checked = false;
    this.value = "";
    this.textContent = "";
    this._innerHTML = "";
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];

    const elementRe = /<(input|button|div)[^>]*id="([^"]+)"[^>]*>/g;
    let match;
    while ((match = elementRe.exec(value))) {
      const tagName = match[1];
      const id = match[2];
      const elementMarkup = match[0];
      const child = new MockElement(this.document, tagName, id);

      const valueMatch = elementMarkup.match(/value="([^"]*)"/);
      if (valueMatch) {
        child.value = valueMatch[1];
      }
      if (/type="checkbox"/.test(elementMarkup)) {
        child.checked = /checked/.test(elementMarkup);
      }

      this.document._elements.set(id, child);
      this.children.push(child);
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    this.children.push(child);
    if (child.id) {
      this.document._elements.set(child.id, child);
    }
    return child;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  click() {
    if (this.listeners.click) {
      this.listeners.click({ target: this, preventDefault() {} });
    }
  }

  querySelectorAll(selector) {
    if (selector === "button") {
      return this.children.filter(function (child) {
        return child.tagName === "BUTTON";
      });
    }
    return [];
  }
}

class MockDocument {
  constructor() {
    this._elements = new Map();
    this.readyState = "complete";
    this.documentElement = { scrollHeight: 5200 };
    this.body = new MockElement(this, "body", "body");
    this.body.scrollHeight = 5200;
  }

  createElement(tagName) {
    return new MockElement(this, tagName, "");
  }

  getElementById(id) {
    return this._elements.get(id) || null;
  }

  addEventListener() {}
}

function buildLatestResponse() {
  return {
    topic_list: {
      topics: [
        {
          id: 101,
          slug: "ai-vps-guide",
          title: "AI VPS guide",
          pinned: false,
          category_id: 5,
        },
        {
          id: 102,
          slug: "trade-post",
          title: "Trade post",
          pinned: false,
          category_id: 8,
        },
        {
          id: 103,
          slug: "daily-chat",
          title: "Daily chat",
          pinned: true,
          category_id: 9,
        },
      ],
    },
  };
}

function createEnv(url, localStorage, sessionStorage, navigations) {
  const document = new MockDocument();
  let fakeNow = 0;
  let href = url;

  const location = {
    get href() {
      return href;
    },
    set href(value) {
      href = new URL(value, href).toString();
      navigations.push(href);
    },
    get origin() {
      return new URL(href).origin;
    },
    get pathname() {
      return new URL(href).pathname;
    },
  };

  const window = {
    innerHeight: 1000,
    scrollY: 0,
    document,
    location,
    localStorage,
    sessionStorage,
    Discourse: {
      Site: {
        current() {
          return {
            categories: [
              { id: 5, slug: "development", name: "Development" },
              { id: 8, slug: "market", name: "Market" },
              { id: 9, slug: "chat", name: "Chat" },
            ],
          };
        },
      },
    },
    fetch: async function (requestUrl) {
      if (!String(requestUrl).includes("/latest.json")) {
        throw new Error("Unexpected fetch: " + requestUrl);
      }
      return {
        ok: true,
        async json() {
          return buildLatestResponse();
        },
      };
    },
    setTimeout(callback, ms) {
      fakeNow += Number(ms || 0);
      callback();
      return 1;
    },
    scrollBy(options) {
      const delta = typeof options === "number" ? options : Number(options.top || 0);
      const maxScroll = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        0
      );
      window.scrollY = Math.max(0, Math.min(window.scrollY + delta, maxScroll));
    },
  };

  const context = {
    window,
    document,
    location,
    localStorage,
    sessionStorage,
    fetch: window.fetch,
    console,
    Math,
    JSON,
    Promise,
    URL,
    Array,
    Set,
    String,
    Number,
    Date: {
      now() {
        return fakeNow;
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(scriptSource, context, { filename: scriptPath });
  return { document };
}

async function flushAsync(rounds) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise(function (resolve) {
      setImmediate(resolve);
    });
  }
}

async function runSmokeTest() {
  const localStorage = new StorageMock();
  const sessionStorage = new StorageMock();
  const navigations = [];

  const env1 = createEnv(
    "https://linux.do/latest",
    localStorage,
    sessionStorage,
    navigations
  );

  env1.document.getElementById("linuxdo-flip-include").value = "AI";
  env1.document.getElementById("linuxdo-flip-exclude").value = "trade";
  env1.document.getElementById("linuxdo-flip-categories").value = "development";
  env1.document.getElementById("linuxdo-flip-limit").value = "2";

  await env1.document.getElementById("linuxdo-flip-start").listeners.click();
  await flushAsync(4);

  const afterStart = JSON.parse(localStorage.getItem("linuxdoFlipSession"));
  if (!afterStart || afterStart.queue.length !== 1 || afterStart.queue[0].id !== 101) {
    throw new Error("Start session filtering failed");
  }

  if (navigations[navigations.length - 1] !== "https://linux.do/t/ai-vps-guide/101") {
    throw new Error("Start navigation failed");
  }

  createEnv(
    "https://linux.do/t/ai-vps-guide/101",
    localStorage,
    sessionStorage,
    navigations
  );
  await flushAsync(8);

  if (localStorage.getItem("linuxdoFlipSession") !== null) {
    throw new Error("Session should be cleared after finishing");
  }

  const visited = JSON.parse(localStorage.getItem("linuxdoFlipVisited") || "[]");
  if (!visited.includes(101)) {
    throw new Error("Visited topic was not recorded");
  }

  return {
    visited,
    navigations,
  };
}

runSmokeTest()
  .then(function (result) {
    console.log("Smoke test passed");
    console.log("Visited:", JSON.stringify(result.visited));
    console.log("Navigations:", JSON.stringify(result.navigations));
  })
  .catch(function (error) {
    console.error("Smoke test failed:", error.message);
    process.exit(1);
  });

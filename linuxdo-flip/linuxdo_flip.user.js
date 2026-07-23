// ==UserScript==
// @name         Linux.do Flip
// @namespace    local.linuxdo.flip
// @version      1.0.0
// @description  Linux.do 只读翻帖助手：筛选主题、按正文长度停留、自动滚动并跨页面续跑
// @match        https://linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  var IDS = {
    panel: "linuxdo-flip-panel",
    drag: "linuxdo-flip-drag",
    resize: "linuxdo-flip-resize",
    status: "linuxdo-flip-status",
    pages: "linuxdo-flip-pages",
    limit: "linuxdo-flip-limit",
    minSeconds: "linuxdo-flip-min",
    maxSeconds: "linuxdo-flip-max",
    charsPerSecond: "linuxdo-flip-cps",
    includePinned: "linuxdo-flip-pinned",
    includeKeywords: "linuxdo-flip-include",
    excludeKeywords: "linuxdo-flip-exclude",
    categories: "linuxdo-flip-categories",
    start: "linuxdo-flip-start",
    pause: "linuxdo-flip-pause",
    stop: "linuxdo-flip-stop",
    reset: "linuxdo-flip-reset",
  };

  var KEYS = {
    config: "linuxdoFlipConfigV1",
    session: "linuxdoFlipSessionV1",
    visited: "linuxdoFlipVisitedV1",
    panel: "linuxdoFlipPanelV1",
    tabId: "linuxdoFlipTabIdV1",
    lock: "linuxdoFlipLockV1",
  };

  var TOPIC_RE = /\/t\/(?:[^/]+\/)?(\d+)(?:\/\d+)?(?:[/?#]|$)/;
  var VERSION = 1;
  var MAX_VISITED = 5000;
  var MAX_PAGES = 20;
  var MAX_TOPICS = 200;
  var TOPICS_PER_PAGE_ESTIMATE = 30;
  var LOCK_TTL_MS = 30000;
  var FETCH_DELAY_MIN_MS = 1100;
  var FETCH_DELAY_MAX_MS = 2200;
  var FETCH_RETRIES = 3;

  var DEFAULT_CONFIG = {
    pages: 3,
    limit: 10,
    minSeconds: 12,
    maxSeconds: 90,
    charsPerSecond: 10,
    includePinned: false,
    includeKeywords: [],
    excludeKeywords: [],
    categories: [],
  };

  var processing = false;
  var lockTimer = null;

  function loadJSON(storage, key, fallback) {
    try {
      var raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveJSON(storage, key, value) {
    storage.setItem(key, JSON.stringify(value));
  }

  function remove(storage, key) {
    storage.removeItem(key);
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  async function interruptibleSleep(ms, predicate) {
    var remaining = Math.max(0, ms);
    while (remaining > 0) {
      if (predicate && !predicate()) {
        return false;
      }
      var chunk = Math.min(remaining, 300);
      await sleep(chunk);
      remaining -= chunk;
    }
    return !predicate || predicate();
  }

  function parseList(value) {
    return String(value || "")
      .split(/[,，\n]/)
      .map(function (item) {
        return item.trim().toLowerCase();
      })
      .filter(Boolean);
  }

  function textLength(value) {
    return String(value || "").replace(/\s+/g, "").length;
  }

  function getTopicId(value) {
    var match = String(value || "").match(TOPIC_RE);
    return match ? Number(match[1]) : null;
  }

  function getTabId() {
    var tabId = sessionStorage.getItem(KEYS.tabId);
    if (!tabId) {
      tabId =
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(KEYS.tabId, tabId);
    }
    return tabId;
  }

  function getSession() {
    var session = loadJSON(localStorage, KEYS.session, null);
    if (!session || session.version !== VERSION) {
      return null;
    }
    return session;
  }

  function saveSession(session) {
    session.updatedAt = Date.now();
    saveJSON(localStorage, KEYS.session, session);
  }

  function clearSession() {
    remove(localStorage, KEYS.session);
    releaseLock();
  }

  function getVisited() {
    var value = loadJSON(localStorage, KEYS.visited, []);
    return new Set(Array.isArray(value) ? value.map(Number) : []);
  }

  function saveVisited(visited) {
    saveJSON(
      localStorage,
      KEYS.visited,
      Array.from(visited).slice(-MAX_VISITED)
    );
  }

  function markVisited(topicId) {
    var visited = getVisited();
    visited.add(Number(topicId));
    saveVisited(visited);
  }

  function readLock() {
    return loadJSON(localStorage, KEYS.lock, null);
  }

  function acquireLock() {
    var tabId = getTabId();
    var existing = readLock();
    var now = Date.now();

    if (
      existing &&
      existing.tabId !== tabId &&
      now - Number(existing.updatedAt || 0) < LOCK_TTL_MS
    ) {
      return false;
    }

    saveJSON(localStorage, KEYS.lock, {
      tabId: tabId,
      updatedAt: now,
    });

    if (!lockTimer) {
      lockTimer = window.setInterval(function () {
        var session = getSession();
        if (!session || session.status === "stopped") {
          releaseLock();
          return;
        }
        saveJSON(localStorage, KEYS.lock, {
          tabId: tabId,
          updatedAt: Date.now(),
        });
      }, 10000);
    }
    return true;
  }

  function releaseLock() {
    var existing = readLock();
    if (!existing || existing.tabId === getTabId()) {
      remove(localStorage, KEYS.lock);
    }
    if (lockTimer) {
      window.clearInterval(lockTimer);
      lockTimer = null;
    }
  }

  function setStatus(message, isError) {
    var status = document.getElementById(IDS.status);
    if (!status) {
      return;
    }
    status.textContent = message;
    status.style.color = isError ? "#b42318" : "#202124";
  }

  function loadConfig() {
    var stored = loadJSON(localStorage, KEYS.config, {});
    return Object.assign({}, DEFAULT_CONFIG, stored || {});
  }

  function normalizeConfig(config) {
    return {
      pages: clamp(Math.floor(Number(config.pages) || 1), 1, MAX_PAGES),
      limit: clamp(Math.floor(Number(config.limit) || 1), 1, MAX_TOPICS),
      minSeconds: clamp(
        Math.floor(Number(config.minSeconds) || DEFAULT_CONFIG.minSeconds),
        3,
        3600
      ),
      maxSeconds: clamp(
        Math.floor(Number(config.maxSeconds) || DEFAULT_CONFIG.maxSeconds),
        3,
        7200
      ),
      charsPerSecond: clamp(
        Number(config.charsPerSecond) || DEFAULT_CONFIG.charsPerSecond,
        1,
        100
      ),
      includePinned: Boolean(config.includePinned),
      includeKeywords: Array.isArray(config.includeKeywords)
        ? config.includeKeywords
        : parseList(config.includeKeywords),
      excludeKeywords: Array.isArray(config.excludeKeywords)
        ? config.excludeKeywords
        : parseList(config.excludeKeywords),
      categories: Array.isArray(config.categories)
        ? config.categories
        : parseList(config.categories),
    };
  }

  function readConfigFromPanel() {
    var config = normalizeConfig({
      pages: document.getElementById(IDS.pages).value,
      limit: document.getElementById(IDS.limit).value,
      minSeconds: document.getElementById(IDS.minSeconds).value,
      maxSeconds: document.getElementById(IDS.maxSeconds).value,
      charsPerSecond: document.getElementById(IDS.charsPerSecond).value,
      includePinned: document.getElementById(IDS.includePinned).checked,
      includeKeywords: parseList(
        document.getElementById(IDS.includeKeywords).value
      ),
      excludeKeywords: parseList(
        document.getElementById(IDS.excludeKeywords).value
      ),
      categories: parseList(document.getElementById(IDS.categories).value),
    });

    if (config.maxSeconds < config.minSeconds) {
      throw new Error("最长停留时间不能小于最短停留时间");
    }

    saveJSON(localStorage, KEYS.config, config);
    return config;
  }

  function applyConfigToPanel(config) {
    config = normalizeConfig(config);
    document.getElementById(IDS.pages).value = String(config.pages);
    document.getElementById(IDS.limit).value = String(config.limit);
    document.getElementById(IDS.minSeconds).value = String(config.minSeconds);
    document.getElementById(IDS.maxSeconds).value = String(config.maxSeconds);
    document.getElementById(IDS.charsPerSecond).value = String(
      config.charsPerSecond
    );
    document.getElementById(IDS.includePinned).checked = config.includePinned;
    document.getElementById(IDS.includeKeywords).value =
      config.includeKeywords.join(", ");
    document.getElementById(IDS.excludeKeywords).value =
      config.excludeKeywords.join(", ");
    document.getElementById(IDS.categories).value = config.categories.join(", ");
  }

  function normalizeTopic(topic) {
    return {
      id: Number(topic.id),
      title: String(topic.title || "(无标题)"),
      slug: String(topic.slug || "topic"),
      categoryId: topic.category_id ? Number(topic.category_id) : null,
      pinned: Boolean(topic.pinned),
      url:
        location.origin +
        "/t/" +
        String(topic.slug || "topic") +
        "/" +
        Number(topic.id),
    };
  }

  function titleMatches(title, includeKeywords, excludeKeywords) {
    var value = String(title || "").toLowerCase();
    var included =
      !includeKeywords.length ||
      includeKeywords.some(function (keyword) {
        return value.indexOf(keyword) !== -1;
      });
    var excluded = excludeKeywords.some(function (keyword) {
      return value.indexOf(keyword) !== -1;
    });
    return included && !excluded;
  }

  function categoryMatches(topic, config, categoryMap) {
    if (!config.categories.length) {
      return true;
    }
    var id = Number(topic.category_id || topic.categoryId || 0);
    var category = categoryMap[id];
    return config.categories.some(function (filter) {
      return (
        filter === String(id) ||
        Boolean(
          category &&
            (filter === category.slug.toLowerCase() ||
              filter === category.name.toLowerCase())
        )
      );
    });
  }

  function topicMatches(topic, config, categoryMap, seen) {
    var id = Number(topic && topic.id);
    if (!id || seen.has(id)) {
      return false;
    }
    if (!config.includePinned && topic.pinned) {
      return false;
    }
    if (
      !titleMatches(
        topic.title,
        config.includeKeywords,
        config.excludeKeywords
      )
    ) {
      return false;
    }
    return categoryMatches(topic, config, categoryMap);
  }

  async function fetchJsonWithRetry(url) {
    var lastError = null;
    for (var attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
      var response;
      try {
        response = await fetch(url, {
          credentials: "include",
          headers: { accept: "application/json" },
        });
      } catch (error) {
        lastError = error;
        response = null;
      }

      if (response && response.ok) {
        return response.json();
      }

      if (response && response.status !== 429 && response.status < 500) {
        throw new Error(url + " 返回 " + response.status);
      }

      if (attempt === FETCH_RETRIES) {
        break;
      }

      var retryAfter =
        response && response.headers
          ? Number(response.headers.get("retry-after") || 0)
          : 0;
      var waitMs =
        retryAfter > 0
          ? retryAfter * 1000
          : randomInt(2500, 4500) * (attempt + 1);
      setStatus(
        "请求受限，" + Math.ceil(waitMs / 1000) + " 秒后重试…"
      );
      await sleep(waitMs);
    }

    throw new Error(
      lastError ? "网络请求失败：" + lastError.message : "请求多次失败"
    );
  }

  async function loadCategoryMap(config) {
    if (!config.categories.length) {
      return {};
    }

    try {
      var data = await fetchJsonWithRetry("/categories.json");
      var categories =
        (((data || {}).category_list || {}).categories || []);
      var map = {};
      categories.forEach(function (category) {
        if (!category || !category.id) {
          return;
        }
        map[Number(category.id)] = {
          slug: String(category.slug || ""),
          name: String(category.name || ""),
        };
      });
      return map;
    } catch (error) {
      throw new Error("分类列表读取失败：" + error.message);
    }
  }

  function collectVisibleTopics(config, categoryMap, seen) {
    if (config.categories.length) {
      return [];
    }

    var links = document.querySelectorAll(
      "a.raw-topic-link, .topic-list a.title, .latest-topic-list-item a.title"
    );
    var result = [];

    links.forEach(function (link) {
      var href = link.getAttribute("href") || "";
      var id = getTopicId(href);
      var title = String(link.innerText || link.textContent || "").trim();
      var row = link.closest
        ? link.closest("tr, .topic-list-item, .latest-topic-list-item")
        : null;
      var topic = {
        id: id,
        title: title,
        slug:
          href.split("/").filter(Boolean).slice(-2, -1)[0] || "topic",
        pinned: Boolean(row && /pinned/i.test(String(row.className || ""))),
        category_id: null,
      };

      if (!title || !topicMatches(topic, config, categoryMap, seen)) {
        return;
      }
      seen.add(Number(id));
      result.push(normalizeTopic(topic));
    });
    return result;
  }

  async function fetchTopics(config) {
    config = normalizeConfig(config);
    var categoryMap = await loadCategoryMap(config);
    var seen = new Set();
    var result = collectVisibleTopics(config, categoryMap, seen);
    var requestedPages = Math.max(
      config.pages,
      Math.ceil(config.limit / TOPICS_PER_PAGE_ESTIMATE) + 1
    );
    var pageCount = clamp(requestedPages, 1, MAX_PAGES);
    var startPage = result.length ? 1 : 0;

    for (var page = startPage; page < pageCount; page += 1) {
      if (result.length >= config.limit) {
        break;
      }

      var data = await fetchJsonWithRetry("/latest.json?page=" + page);
      var topics = (((data || {}).topic_list || {}).topics || []);
      if (!topics.length) {
        break;
      }

      topics.forEach(function (topic) {
        if (!topicMatches(topic, config, categoryMap, seen)) {
          return;
        }
        seen.add(Number(topic.id));
        result.push(normalizeTopic(topic));
      });

      if (page + 1 < pageCount && result.length < config.limit) {
        await sleep(randomInt(FETCH_DELAY_MIN_MS, FETCH_DELAY_MAX_MS));
      }
    }
    return result.slice(0, config.limit);
  }

  function getArticleTextLength() {
    var nodes = document.querySelectorAll(
      "#post_1 .cooked, .topic-post .cooked, article .cooked"
    );
    var seen = new Set();
    var total = 0;
    nodes.forEach(function (node) {
      if (seen.has(node)) {
        return;
      }
      seen.add(node);
      total += textLength(node.innerText || node.textContent || "");
    });
    return total;
  }

  async function waitForArticle() {
    var deadline = Date.now() + 15000;
    var length = getArticleTextLength();
    while (length === 0 && Date.now() < deadline) {
      await sleep(350);
      length = getArticleTextLength();
    }
    return length;
  }

  function sampleReadingSpeed(base) {
    var factors = [0.75, 0.85, 0.95, 1, 1.05, 1.15, 1.3];
    var factor = factors[randomInt(0, factors.length - 1)];
    return Math.max(1, Math.round(Number(base || 10) * factor));
  }

  function calculateReadPlan(config, length, sampledSpeed) {
    var estimatedSeconds = Math.ceil(
      Math.max(0, Number(length) || 0) /
        Math.max(1, Number(sampledSpeed) || 1)
    );
    var seconds = clamp(
      estimatedSeconds,
      config.minSeconds,
      config.maxSeconds
    );
    return {
      textLength: Math.max(0, Number(length) || 0),
      charsPerSecond: sampledSpeed,
      estimatedSeconds: estimatedSeconds,
      seconds: seconds,
    };
  }

  function getScrollMetrics() {
    var height = Math.max(
      document.documentElement.scrollHeight || 0,
      document.body.scrollHeight || 0
    );
    return {
      current: Math.max(0, window.scrollY || 0),
      max: Math.max(0, height - window.innerHeight),
    };
  }

  async function scrollAndRead(topic, session) {
    var length = await waitForArticle();
    var speed = sampleReadingSpeed(session.config.charsPerSecond);
    var plan = calculateReadPlan(session.config, length, speed);
    var deadline = Date.now() + plan.seconds * 1000;
    var bottomPasses = 0;
    var steps = 0;

    while (Date.now() < deadline || bottomPasses < 2) {
      var currentSession = getSession();
      if (!currentSession || currentSession.status === "stopped") {
        return false;
      }

      if (currentSession.status === "paused") {
        setStatus("已暂停，点击“继续”恢复。");
        await interruptibleSleep(500, function () {
          var state = getSession();
          return Boolean(state && state.status === "paused");
        });
        continue;
      }

      var metrics = getScrollMetrics();
      var remaining = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000)
      );
      var atBottom = metrics.max <= 0 || metrics.current >= metrics.max - 28;

      setStatus(
        "阅读 " +
          (session.index + 1) +
          "/" +
          session.queue.length +
          " · " +
          topic.title +
          " · " +
          plan.textLength +
          " 字 · " +
          plan.charsPerSecond +
          " 字/秒 · 约剩 " +
          remaining +
          " 秒"
      );

      if (atBottom) {
        bottomPasses += 1;
        await interruptibleSleep(randomInt(1300, 2600), function () {
          var state = getSession();
          return Boolean(state && state.status !== "stopped");
        });
      } else {
        bottomPasses = 0;
        var viewport = Math.max(window.innerHeight, 500);
        window.scrollBy({
          top: randomInt(
            Math.floor(viewport * 0.38),
            Math.floor(viewport * 0.78)
          ),
          behavior: "smooth",
        });
        await interruptibleSleep(randomInt(1400, 3600), function () {
          var state = getSession();
          return Boolean(state && state.status !== "stopped");
        });
      }

      steps += 1;
      if (steps > 400) {
        throw new Error("滚动步骤异常，已停止本轮任务");
      }
    }
    return true;
  }

  function formatProgress(session) {
    var topic = session.queue[session.index];
    return (
      (session.index + 1) +
      "/" +
      session.queue.length +
      (topic ? " · " + topic.title : "")
    );
  }

  async function navigateToTopic(topic) {
    setStatus("打开：" + topic.title);
    await sleep(500);
    location.href = topic.url;
  }

  async function startSession() {
    try {
      var config = readConfigFromPanel();
      if (!acquireLock()) {
        throw new Error("另一个标签页正在运行翻帖任务");
      }

      setStatus("正在读取最新主题…");
      var topics = await fetchTopics(config);
      var visited = getVisited();
      var queue = topics.filter(function (topic) {
        return !visited.has(topic.id);
      });

      if (!queue.length) {
        releaseLock();
        setStatus("没有符合条件的未读主题。");
        return;
      }

      var session = {
        version: VERSION,
        status: "running",
        queue: queue,
        index: 0,
        completed: 0,
        config: config,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveSession(session);
      await navigateToTopic(queue[0]);
    } catch (error) {
      releaseLock();
      setStatus("启动失败：" + error.message, true);
    }
  }

  function togglePause() {
    var session = getSession();
    if (!session) {
      setStatus("当前没有运行中的任务。");
      return;
    }

    if (session.status === "paused") {
      session.status = "running";
      saveSession(session);
      document.getElementById(IDS.pause).textContent = "暂停";
      setStatus("继续：" + formatProgress(session));
      processCurrentTopic();
      return;
    }

    session.status = "paused";
    saveSession(session);
    document.getElementById(IDS.pause).textContent = "继续";
    setStatus("已暂停。");
  }

  function stopSession() {
    var session = getSession();
    if (session) {
      session.status = "stopped";
      saveSession(session);
    }
    clearSession();
    processing = false;
    setStatus("已停止，当前帖子不会计入已读。");
  }

  function resetVisited() {
    remove(localStorage, KEYS.visited);
    setStatus("已清空已读记录。");
  }

  async function processCurrentTopic() {
    if (processing) {
      return;
    }

    var session = getSession();
    if (!session || session.status === "stopped") {
      return;
    }
    if (!acquireLock()) {
      setStatus("另一个标签页正在执行任务。", true);
      return;
    }

    var topic = session.queue[session.index];
    if (!topic) {
      clearSession();
      setStatus("本轮翻帖完成。");
      return;
    }

    if (getTopicId(location.pathname) !== topic.id) {
      await navigateToTopic(topic);
      return;
    }

    processing = true;
    try {
      var completed = await scrollAndRead(topic, session);
      if (!completed) {
        return;
      }

      markVisited(topic.id);
      session = getSession();
      if (!session) {
        return;
      }
      session.index += 1;
      session.completed += 1;

      if (session.index >= session.queue.length) {
        clearSession();
        setStatus("本轮翻帖完成，共阅读 " + session.completed + " 个主题。");
        await sleep(1200);
        location.href = location.origin + "/latest";
        return;
      }

      saveSession(session);
      var gap = randomInt(7000, 15000);
      setStatus("帖间停留 " + Math.ceil(gap / 1000) + " 秒…");
      var shouldContinue = await interruptibleSleep(gap, function () {
        var state = getSession();
        return Boolean(state && state.status !== "stopped");
      });
      if (!shouldContinue) {
        return;
      }
      await navigateToTopic(session.queue[session.index]);
    } catch (error) {
      var failed = getSession();
      if (failed) {
        failed.status = "paused";
        failed.error = error.message;
        saveSession(failed);
      }
      setStatus("已暂停：" + error.message, true);
    } finally {
      processing = false;
    }
  }

  function loadPanelPosition() {
    return loadJSON(localStorage, KEYS.panel, {
      left: null,
      top: 16,
      width: 300,
      height: 520,
    });
  }

  function applyPanelPosition(panel) {
    var saved = loadPanelPosition();
    var maxWidth = Math.max(240, window.innerWidth - 16);
    var maxHeight = Math.max(260, window.innerHeight - 16);
    var width = clamp(Number(saved.width) || 300, 240, maxWidth);
    var height = clamp(Number(saved.height) || 520, 260, maxHeight);
    var defaultLeft = window.innerWidth - width - 16;
    var left =
      saved.left === null
        ? defaultLeft
        : clamp(Number(saved.left) || 8, 8, window.innerWidth - width - 8);
    var top = clamp(
      Number(saved.top) || 8,
      8,
      window.innerHeight - height - 8
    );

    panel.style.left = Math.max(8, left) + "px";
    panel.style.top = Math.max(8, top) + "px";
    panel.style.width = width + "px";
    panel.style.height = height + "px";
  }

  function savePanelPosition(panel) {
    saveJSON(localStorage, KEYS.panel, {
      left: panel.offsetLeft,
      top: panel.offsetTop,
      width: panel.offsetWidth,
      height: panel.offsetHeight,
    });
  }

  function enablePanelPointerControls(panel) {
    var drag = document.getElementById(IDS.drag);
    var resize = document.getElementById(IDS.resize);
    var action = null;

    function start(event, mode) {
      action = {
        mode: mode,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: panel.offsetLeft,
        top: panel.offsetTop,
        width: panel.offsetWidth,
        height: panel.offsetHeight,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    drag.addEventListener("pointerdown", function (event) {
      start(event, "drag");
    });
    resize.addEventListener("pointerdown", function (event) {
      start(event, "resize");
    });

    document.addEventListener("pointermove", function (event) {
      if (!action || event.pointerId !== action.pointerId) {
        return;
      }
      var dx = event.clientX - action.x;
      var dy = event.clientY - action.y;

      if (action.mode === "drag") {
        panel.style.left =
          clamp(
            action.left + dx,
            8,
            Math.max(8, window.innerWidth - panel.offsetWidth - 8)
          ) + "px";
        panel.style.top =
          clamp(
            action.top + dy,
            8,
            Math.max(8, window.innerHeight - panel.offsetHeight - 8)
          ) + "px";
      } else {
        panel.style.width =
          clamp(
            action.width + dx,
            240,
            Math.max(240, window.innerWidth - panel.offsetLeft - 8)
          ) + "px";
        panel.style.height =
          clamp(
            action.height + dy,
            260,
            Math.max(260, window.innerHeight - panel.offsetTop - 8)
          ) + "px";
      }
    });

    document.addEventListener("pointerup", function (event) {
      if (!action || event.pointerId !== action.pointerId) {
        return;
      }
      action = null;
      savePanelPosition(panel);
    });

    drag.addEventListener("dblclick", function () {
      remove(localStorage, KEYS.panel);
      applyPanelPosition(panel);
    });
  }

  function field(label, id, type, value, suffix) {
    return (
      '<label class="ldf-field">' +
      "<span>" +
      label +
      "</span>" +
      '<span class="ldf-control"><input id="' +
      id +
      '" type="' +
      type +
      '" value="' +
      value +
      '">' +
      (suffix || "") +
      "</span></label>"
    );
  }

  function buildPanel() {
    if (document.getElementById(IDS.panel)) {
      return;
    }

    var panel = document.createElement("section");
    panel.id = IDS.panel;
    panel.innerHTML = [
      "<style>",
      "#" + IDS.panel + "{position:fixed;z-index:999999;box-sizing:border-box;padding:12px;background:#fffdf7;border:1px solid #d8c9a7;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.2);font:13px/1.45 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;color:#202124;overflow:auto;min-width:240px;min-height:260px;}",
      "#" + IDS.panel + " *{box-sizing:border-box;}",
      "#" + IDS.drag + "{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-4px -4px 10px;padding:4px;cursor:move;touch-action:none;font-weight:750;font-size:15px;}",
      ".ldf-field{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:7px 0;}",
      ".ldf-control{display:flex;align-items:center;gap:5px;white-space:nowrap;}",
      ".ldf-field input[type=number]{width:76px;}",
      ".ldf-wide{display:block;margin:8px 0;}",
      ".ldf-wide input{display:block;width:100%;margin-top:4px;}",
      ".ldf-actions{display:flex;gap:6px;flex-wrap:wrap;margin:11px 0;}",
      ".ldf-actions button{border:1px solid #9e7b2f;background:#f5d889;color:#26200f;padding:6px 11px;border-radius:8px;cursor:pointer;font-weight:650;}",
      ".ldf-actions button:hover{background:#efca68;}",
      "#" + IDS.status + "{padding:8px;background:#f7f1e3;border-radius:8px;word-break:break-word;}",
      ".ldf-note{margin:8px 0;color:#6b5a32;font-size:12px;}",
      "#" + IDS.resize + "{position:absolute;right:5px;bottom:4px;width:22px;height:22px;cursor:nwse-resize;touch-action:none;opacity:.55;text-align:center;}",
      "</style>",
      '<header id="' + IDS.drag + '"><span>Linux.do Flip</span><small>拖动 · 双击复位</small></header>',
      field("读取页数", IDS.pages, "number", "3"),
      field("本轮数量", IDS.limit, "number", "10"),
      field("最短停留", IDS.minSeconds, "number", "12", "秒"),
      field("最长停留", IDS.maxSeconds, "number", "90", "秒"),
      field("基础速度", IDS.charsPerSecond, "number", "10", "字/秒"),
      '<label class="ldf-wide"><input id="' + IDS.includePinned + '" type="checkbox"> 包含置顶主题</label>',
      '<label class="ldf-wide">包含关键词<input id="' + IDS.includeKeywords + '" type="text" placeholder="AI, VPS"></label>',
      '<label class="ldf-wide">排除关键词<input id="' + IDS.excludeKeywords + '" type="text" placeholder="广告, 交易"></label>',
      '<label class="ldf-wide">分类名称、slug 或 ID<input id="' + IDS.categories + '" type="text" placeholder="development, 5"></label>',
      '<div class="ldf-actions">',
      '<button id="' + IDS.start + '" type="button">开始</button>',
      '<button id="' + IDS.pause + '" type="button">暂停</button>',
      '<button id="' + IDS.stop + '" type="button">停止</button>',
      '<button id="' + IDS.reset + '" type="button">清空已读</button>',
      "</div>",
      '<p class="ldf-note">只读取公开主题，不点赞、不回复、不收藏。最长停留时间是硬上限。</p>',
      '<div id="' + IDS.status + '">待命</div>',
      '<div id="' + IDS.resize + '">◢</div>',
    ].join("");

    document.body.appendChild(panel);
    applyPanelPosition(panel);
    applyConfigToPanel(loadConfig());
    enablePanelPointerControls(panel);

    document.getElementById(IDS.start).addEventListener("click", startSession);
    document.getElementById(IDS.pause).addEventListener("click", togglePause);
    document.getElementById(IDS.stop).addEventListener("click", stopSession);
    document.getElementById(IDS.reset).addEventListener("click", resetVisited);

    panel.querySelectorAll("input").forEach(function (input) {
      input.addEventListener("change", function () {
        try {
          readConfigFromPanel();
        } catch (error) {
          setStatus(error.message, true);
        }
      });
    });
  }

  function refreshPanelState() {
    var session = getSession();
    var pauseButton = document.getElementById(IDS.pause);
    if (!session) {
      setStatus("待命，已记录 " + getVisited().size + " 个已读主题。");
      pauseButton.textContent = "暂停";
      return;
    }
    pauseButton.textContent = session.status === "paused" ? "继续" : "暂停";
    setStatus(
      (session.status === "paused" ? "已暂停 " : "运行中 ") +
        formatProgress(session)
    );
  }

  function boot() {
    buildPanel();
    refreshPanelState();
    var session = getSession();
    if (session && session.status !== "stopped") {
      processCurrentTopic();
    }
  }

  if (window.__LINUXDO_FLIP_TEST__) {
    window.__linuxdoFlipTest = {
      VERSION: VERSION,
      DEFAULT_CONFIG: DEFAULT_CONFIG,
      parseList: parseList,
      textLength: textLength,
      getTopicId: getTopicId,
      normalizeConfig: normalizeConfig,
      titleMatches: titleMatches,
      categoryMatches: categoryMatches,
      topicMatches: topicMatches,
      normalizeTopic: normalizeTopic,
      fetchTopics: fetchTopics,
      calculateReadPlan: calculateReadPlan,
      sampleReadingSpeed: sampleReadingSpeed,
      getVisited: getVisited,
      markVisited: markVisited,
      getSession: getSession,
      saveSession: saveSession,
      clearSession: clearSession,
    };
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

// ==UserScript==
// @name         Linux.do Flip
// @namespace    local.linuxdo.flip
// @version      1.5.0
// @description  Linux.do 阅读进度助手：列表翻找选帖、长帖续读、手机常亮与故障恢复
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
    approveLike: "linuxdo-flip-approve-like",
    skipLike: "linuxdo-flip-skip-like",
    retryCurrent: "linuxdo-flip-retry-current",
    skipCurrent: "linuxdo-flip-skip-current",
    diagnostics: "linuxdo-flip-diagnostics",
    likeTarget: "linuxdo-flip-like-target",
    navigationMode: "linuxdo-flip-navigation-mode",
    interTopicMinSeconds: "linuxdo-flip-gap-min",
    interTopicMaxSeconds: "linuxdo-flip-gap-max",
    foregroundOnly: "linuxdo-flip-foreground-only",
    keepAwake: "linuxdo-flip-keep-awake",
    sizeDown: "linuxdo-flip-size-down",
    sizeUp: "linuxdo-flip-size-up",
    sizeReset: "linuxdo-flip-size-reset",
  };

  var KEYS = {
    config: "linuxdoFlipConfigV2",
    session: "linuxdoFlipSessionV2",
    visited: "linuxdoFlipVisitedV1",
    progress: "linuxdoFlipProgressV2",
    panel: "linuxdoFlipPanelV2",
    tabId: "linuxdoFlipTabIdV2",
    lock: "linuxdoFlipLockV2",
  };

  var TOPIC_RE = /\/t\/(?:[^/]+\/)?(\d+)(?:\/(?:\d+|last))?(?:[/?#]|$)/;
  var VERSION = 2;
  var MAX_VISITED = 5000;
  var MAX_PROGRESS = 2000;
  var MAX_PAGES = 20;
  var MAX_TOPICS = 200;
  var TOPICS_PER_PAGE_ESTIMATE = 30;
  var LOCK_TTL_MS = 30000;
  var FETCH_DELAY_MIN_MS = 1100;
  var FETCH_DELAY_MAX_MS = 2200;
  var FETCH_RETRIES = 3;
  var SEARCH_WAIT_MS = 9000;
  var NAVIGATION_TIMEOUT_MS = 25000;
  var MAX_NAVIGATION_RECOVERIES = 2;
  var PANEL_MIN_WIDTH = 240;
  var PANEL_MIN_HEIGHT = 260;
  var PANEL_DEFAULT_WIDTH = 300;
  var PANEL_DEFAULT_HEIGHT = 600;
  var PANEL_WIDTH_STEP = 40;
  var PANEL_HEIGHT_STEP = 60;

  var DEFAULT_CONFIG = {
    pages: 3,
    limit: 180,
    likeTarget: 30,
    navigationMode: "native",
    interTopicMinSeconds: 2,
    interTopicMaxSeconds: 6,
    foregroundOnly: true,
    keepAwake: true,
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
  var routeTimer = null;
  var lastObservedHref = "";
  var wakeLockSentinel = null;
  var wakeLockState = "idle";

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

  function isDocumentVisible() {
    return String(document.visibilityState || "visible") !== "hidden";
  }

  function shouldRunInForeground(session) {
    return Boolean(
      !session ||
        !session.config ||
        !session.config.foregroundOnly ||
        isDocumentVisible()
    );
  }

  function releaseWakeLock() {
    var sentinel = wakeLockSentinel;
    wakeLockSentinel = null;
    if (wakeLockState === "active") {
      wakeLockState = "idle";
    }
    if (sentinel && typeof sentinel.release === "function") {
      Promise.resolve(sentinel.release()).catch(function () {});
    }
  }

  function getWakeLockState() {
    return wakeLockState;
  }

  async function requestWakeLock(config) {
    config = normalizeConfig(
      Object.assign({}, DEFAULT_CONFIG, config || loadConfig())
    );
    if (!config.keepAwake) {
      releaseWakeLock();
      wakeLockState = "disabled";
      return false;
    }
    if (!isDocumentVisible()) {
      wakeLockState = "waiting";
      return false;
    }
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      wakeLockState = "active";
      return true;
    }
    if (
      !window.navigator ||
      !window.navigator.wakeLock ||
      typeof window.navigator.wakeLock.request !== "function"
    ) {
      wakeLockState = "unsupported";
      renderDiagnostics(getSession());
      return false;
    }

    try {
      var sentinel = await window.navigator.wakeLock.request("screen");
      wakeLockSentinel = sentinel;
      wakeLockState = "active";
      if (sentinel && typeof sentinel.addEventListener === "function") {
        sentinel.addEventListener("release", function () {
          if (wakeLockSentinel === sentinel) {
            wakeLockSentinel = null;
            wakeLockState = "idle";
            var session = getSession();
            renderDiagnostics(session);
            if (
              session &&
              session.status === "running" &&
              session.config.keepAwake &&
              isDocumentVisible()
            ) {
              window.setTimeout(function () {
                requestWakeLock(session.config);
              }, 1000);
            }
          }
        });
      }
      renderDiagnostics(getSession());
      return true;
    } catch (error) {
      wakeLockSentinel = null;
      wakeLockState = "denied";
      renderDiagnostics(getSession());
      return false;
    }
  }

  function calculateInterTopicDelay(config) {
    config = normalizeConfig(config || DEFAULT_CONFIG);
    return randomInt(
      config.interTopicMinSeconds * 1000,
      config.interTopicMaxSeconds * 1000
    );
  }

  async function waitForActiveDelay(ms) {
    var remaining = Math.max(0, Number(ms) || 0);
    while (remaining > 0) {
      var session = getSession();
      if (!session || session.status === "stopped") {
        return false;
      }
      if (session.status === "paused") {
        setStatus("已暂停，帖间计时不继续。");
        await sleep(300);
        continue;
      }
      if (!shouldRunInForeground(session)) {
        setStatus("页面在后台，帖间计时已暂停。");
        await sleep(300);
        continue;
      }

      var chunk = Math.min(remaining, 300);
      await sleep(chunk);
      remaining -= chunk;
    }
    return true;
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
    session.queue = Array.isArray(session.queue) ? session.queue : [];
    session.index = clamp(
      Math.floor(Number(session.index) || 0),
      0,
      session.queue.length
    );
    session.config = normalizeConfig(
      Object.assign({}, DEFAULT_CONFIG, session.config || {})
    );
    session.navigation = session.navigation || null;
    session.listContext = session.listContext || null;
    session.diagnostics = Object.assign(
      {
        stage: "idle",
        retries: 0,
        lastError: "",
        queueSkipped: 0,
        updatedAt: 0,
      },
      session.diagnostics || {}
    );
    return session;
  }

  function saveSession(session) {
    session.updatedAt = Date.now();
    saveJSON(localStorage, KEYS.session, session);
    renderDiagnostics(session);
  }

  function clearSession() {
    remove(localStorage, KEYS.session);
    releaseLock();
    releaseWakeLock();
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

  function getProgressMap() {
    var value = loadJSON(localStorage, KEYS.progress, {});
    return value && typeof value === "object" ? value : {};
  }

  function getTopicProgress(topicId) {
    var progress = getProgressMap()[String(Number(topicId))];
    return Object.assign(
      {
        topicId: Number(topicId),
        lastPostNumber: 1,
        highestPostNumber: null,
        accumulatedSeconds: 0,
        completed: false,
        liked: false,
        updatedAt: 0,
      },
      progress || {}
    );
  }

  function saveTopicProgress(topicId, patch) {
    var map = getProgressMap();
    var key = String(Number(topicId));
    map[key] = Object.assign({}, getTopicProgress(topicId), patch, {
      topicId: Number(topicId),
      updatedAt: Date.now(),
    });

    var entries = Object.keys(map)
      .map(function (itemKey) {
        return [itemKey, map[itemKey]];
      })
      .sort(function (left, right) {
        return Number(right[1].updatedAt || 0) - Number(left[1].updatedAt || 0);
      })
      .slice(0, MAX_PROGRESS);
    var trimmed = {};
    entries.forEach(function (entry) {
      trimmed[entry[0]] = entry[1];
    });
    saveJSON(localStorage, KEYS.progress, trimmed);
    return trimmed[key];
  }

  function clearProgress() {
    remove(localStorage, KEYS.progress);
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

  function stageLabel(stage) {
    var labels = {
      idle: "待命",
      list: "列表寻帖",
      searching: "站内搜索",
      "browsing-search": "宽泛翻找",
      opening: "打开主题",
      reading: "阅读主题",
      returning: "返回列表",
      review: "点赞审查",
      paused: "已暂停",
    };
    return labels[stage] || String(stage || "未知");
  }

  function renderDiagnostics(session) {
    var node = document.getElementById(IDS.diagnostics);
    if (!node) {
      return;
    }
    if (!session) {
      node.textContent = "阶段：待命";
      return;
    }

    var queue = Array.isArray(session.queue) ? session.queue : [];
    var topic = queue[session.index] || null;
    var navigation = session.navigation || {};
    var diagnostics = session.diagnostics || {};
    var wakeLabels = {
      active: "生效",
      waiting: "等待前台",
      unsupported: "浏览器不支持",
      denied: "未获系统许可",
      disabled: "关闭",
      idle: "待申请",
    };
    var parts = [
      "阶段：" +
        stageLabel(
          navigation.stage ||
            diagnostics.stage ||
            (session.status === "paused" ? "paused" : "idle")
        ),
      "队列：" +
        Math.min(Number(session.index || 0) + 1, queue.length) +
        "/" +
        queue.length,
      "恢复：" + Number(diagnostics.retries || navigation.retries || 0),
      "前台阅读：" + (session.config.foregroundOnly ? "开启" : "关闭"),
      "屏幕常亮：" + (wakeLabels[wakeLockState] || wakeLockState),
    ];
    if (topic) {
      var progress = getTopicProgress(topic.id);
      parts.push(
        "主题 #" +
          topic.id +
          " · 楼层 " +
          Number(progress.lastPostNumber || 1) +
          "/" +
          (progress.highestPostNumber || "?")
      );
    }
    if (diagnostics.lastError) {
      parts.push("上次错误：" + diagnostics.lastError);
    }
    node.textContent = parts.join("\n");
  }

  function setNavigationState(session, stage, patch) {
    session.navigation = Object.assign(
      {
        stage: stage,
        topicId: null,
        query: "",
        startedAt: Date.now(),
        retries: 0,
        lastError: "",
      },
      session.navigation || {},
      patch || {},
      {
        stage: stage,
        startedAt: Date.now(),
      }
    );
    session.diagnostics = Object.assign({}, session.diagnostics || {}, {
      stage: stage,
      retries: Number(session.navigation.retries || 0),
      lastError: String(session.navigation.lastError || ""),
      updatedAt: Date.now(),
    });
    saveSession(session);
    return session.navigation;
  }

  function recordSessionError(session, message) {
    if (!session) {
      return;
    }
    session.diagnostics = Object.assign({}, session.diagnostics || {}, {
      lastError: String(message || "未知错误"),
      updatedAt: Date.now(),
    });
    saveSession(session);
  }

  function auditSessionQueue(session) {
    if (!session || !Array.isArray(session.queue)) {
      return { changed: false, removed: 0, skipped: 0 };
    }
    if (session.status === "review") {
      return { changed: false, removed: 0, skipped: 0 };
    }

    var originalIndex = clamp(
      Math.floor(Number(session.index) || 0),
      0,
      session.queue.length
    );
    var visited = getVisited();
    var queue = [];
    var nextIndex = 0;
    var removed = 0;
    var skipped = 0;

    session.queue.slice(0, originalIndex).forEach(function (rawTopic) {
      var topic = rawTopic && rawTopic.id ? normalizeTopic(rawTopic) : null;
      if (!topic || !Number(topic.id)) {
        removed += 1;
        return;
      }
      queue.push(topic);
      nextIndex += 1;
    });

    var seenRemaining = new Set();
    session.queue.slice(originalIndex).forEach(function (rawTopic) {
      var topic = rawTopic && rawTopic.id ? normalizeTopic(rawTopic) : null;
      var id = topic ? Number(topic.id) : 0;
      if (!id || seenRemaining.has(id)) {
        removed += 1;
        skipped += 1;
        return;
      }
      seenRemaining.add(id);
      var completed =
        visited.has(id) || Boolean(getTopicProgress(id).completed);
      if (completed) {
        removed += 1;
        skipped += 1;
        return;
      }

      queue.push(topic);
    });

    var changed =
      removed > 0 ||
      nextIndex !== originalIndex ||
      queue.length !== session.queue.length;
    if (changed) {
      session.queue = queue;
      session.index = clamp(nextIndex, 0, queue.length);
      session.diagnostics = Object.assign({}, session.diagnostics || {}, {
        queueSkipped:
          Number((session.diagnostics || {}).queueSkipped || 0) + skipped,
        updatedAt: Date.now(),
      });
      saveSession(session);
    }
    return { changed: changed, removed: removed, skipped: skipped };
  }

  function loadConfig() {
    var stored = loadJSON(localStorage, KEYS.config, {});
    return Object.assign({}, DEFAULT_CONFIG, stored || {});
  }

  function normalizeConfig(config) {
    return {
      pages: clamp(Math.floor(Number(config.pages) || 1), 1, MAX_PAGES),
      limit: clamp(Math.floor(Number(config.limit) || 1), 1, MAX_TOPICS),
      likeTarget: clamp(
        Math.floor(Number(config.likeTarget) || 0),
        0,
        100
      ),
      navigationMode:
        config.navigationMode === "direct" ? "direct" : "native",
      interTopicMinSeconds: clamp(
        Math.floor(
          Number(config.interTopicMinSeconds) >= 0
            ? Number(config.interTopicMinSeconds)
            : DEFAULT_CONFIG.interTopicMinSeconds
        ),
        0,
        60
      ),
      interTopicMaxSeconds: clamp(
        Math.floor(
          Number(config.interTopicMaxSeconds) >= 0
            ? Number(config.interTopicMaxSeconds)
            : DEFAULT_CONFIG.interTopicMaxSeconds
        ),
        0,
        60
      ),
      foregroundOnly:
        config.foregroundOnly === undefined
          ? DEFAULT_CONFIG.foregroundOnly
          : Boolean(config.foregroundOnly),
      keepAwake:
        config.keepAwake === undefined
          ? DEFAULT_CONFIG.keepAwake
          : Boolean(config.keepAwake),
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
      likeTarget: document.getElementById(IDS.likeTarget).value,
      navigationMode: document.getElementById(IDS.navigationMode).value,
      interTopicMinSeconds: document.getElementById(
        IDS.interTopicMinSeconds
      ).value,
      interTopicMaxSeconds: document.getElementById(
        IDS.interTopicMaxSeconds
      ).value,
      foregroundOnly: document.getElementById(IDS.foregroundOnly).checked,
      keepAwake: document.getElementById(IDS.keepAwake).checked,
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
    if (config.interTopicMaxSeconds < config.interTopicMinSeconds) {
      throw new Error("帖间最长时间不能小于帖间最短时间");
    }

    saveJSON(localStorage, KEYS.config, config);
    return config;
  }

  function applyConfigToPanel(config) {
    config = normalizeConfig(config);
    document.getElementById(IDS.pages).value = String(config.pages);
    document.getElementById(IDS.limit).value = String(config.limit);
    document.getElementById(IDS.likeTarget).value = String(config.likeTarget);
    document.getElementById(IDS.navigationMode).value =
      config.navigationMode;
    document.getElementById(IDS.interTopicMinSeconds).value = String(
      config.interTopicMinSeconds
    );
    document.getElementById(IDS.interTopicMaxSeconds).value = String(
      config.interTopicMaxSeconds
    );
    document.getElementById(IDS.foregroundOnly).checked =
      config.foregroundOnly;
    document.getElementById(IDS.keepAwake).checked = config.keepAwake;
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
    var id = Number(topic.id);
    var slug = String(topic.slug || "topic");
    return {
      id: id,
      title: String(topic.title || "(无标题)"),
      slug: slug,
      categoryId:
        topic.category_id || topic.categoryId
          ? Number(topic.category_id || topic.categoryId)
          : null,
      pinned: Boolean(topic.pinned),
      highestPostNumber: topic.highest_post_number || topic.highestPostNumber
        ? Number(topic.highest_post_number || topic.highestPostNumber)
        : null,
      postsCount: topic.posts_count || topic.postsCount
        ? Number(topic.posts_count || topic.postsCount)
        : null,
      sourcePage:
        topic.sourcePage === null || topic.sourcePage === undefined
          ? null
          : Number(topic.sourcePage),
      listHref: topic.listHref ? String(topic.listHref) : null,
      url: String(
        topic.url || location.origin + "/t/" + slug + "/" + id
      ),
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
        sourcePage: null,
        listHref: href,
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
        topic.sourcePage = page;
        seen.add(Number(topic.id));
        result.push(normalizeTopic(topic));
      });

      if (page + 1 < pageCount && result.length < config.limit) {
        await sleep(randomInt(FETCH_DELAY_MIN_MS, FETCH_DELAY_MAX_MS));
      }
    }
    return result.slice(0, config.limit);
  }

  function parseTopicAudit(data, topic) {
    var stream = (((data || {}).post_stream || {}).stream || []);
    var loadedPosts = (((data || {}).post_stream || {}).posts || []);
    var firstPost = loadedPosts.find(function (post) {
      return Number(post.post_number) === 1;
    });
    var actions = firstPost && Array.isArray(firstPost.actions_summary)
      ? firstPost.actions_summary
      : [];
    var likeAction = actions.find(function (action) {
      return Number(action.id) === 2;
    });
    var highest = Number(
      (data || {}).highest_post_number ||
        (topic || {}).highestPostNumber ||
        stream.length ||
        1
    );

    return {
      highestPostNumber: Math.max(1, highest),
      postsCount: Number((data || {}).posts_count || stream.length || 1),
      firstPostId: firstPost ? Number(firstPost.id) : null,
      alreadyLiked: Boolean(likeAction && likeAction.acted),
      closed: Boolean((data || {}).closed),
      archived: Boolean((data || {}).archived),
    };
  }

  async function fetchTopicAudit(topic) {
    try {
      var data = await fetchJsonWithRetry(
        "/t/" +
          encodeURIComponent(topic.slug || "topic") +
          "/" +
          topic.id +
          ".json"
      );
      return parseTopicAudit(data, topic);
    } catch (error) {
      if (topic.highestPostNumber) {
        return {
          highestPostNumber: Number(topic.highestPostNumber),
          postsCount: Number(topic.postsCount || topic.highestPostNumber),
          firstPostId: null,
          alreadyLiked: false,
          closed: false,
          archived: false,
          warning: error.message,
        };
      }
      throw new Error("主题完成审查失败：" + error.message);
    }
  }

  function getHighestVisiblePostNumber() {
    var nodes = document.querySelectorAll(
      "article[data-post-number], .topic-post[data-post-number], [id^=post_]"
    );
    var highest = 0;
    nodes.forEach(function (node) {
      var fromData =
        node.dataset && node.dataset.postNumber
          ? Number(node.dataset.postNumber)
          : 0;
      var fromId = String(node.id || "").match(/^post_(\d+)$/);
      highest = Math.max(
        highest,
        fromData || (fromId ? Number(fromId[1]) : 0)
      );
    });
    return highest;
  }

  function buildResumeUrl(topic, progress) {
    var postNumber = Math.max(1, Number(progress.lastPostNumber) || 1);
    return topic.url + (postNumber > 1 ? "/" + postNumber : "");
  }

  function buildSearchQuery(topic) {
    return String((topic || {}).title || "")
      .replace(/["“”]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
  }

  function findExactSearchTopic(data, topicId) {
    var id = Number(topicId);
    var topics = Array.isArray((data || {}).topics) ? data.topics : [];
    var exactTopic = topics.find(function (topic) {
      return Number(topic && topic.id) === id;
    });
    if (exactTopic) {
      return normalizeTopic(exactTopic);
    }

    var posts = Array.isArray((data || {}).posts) ? data.posts : [];
    var exactPost = posts.find(function (post) {
      return Number(post && post.topic_id) === id;
    });
    if (!exactPost) {
      return null;
    }

    return normalizeTopic({
      id: id,
      slug: exactPost.topic_slug || exactPost.slug || "topic",
      title: exactPost.topic_title || exactPost.blurb || "主题 #" + id,
    });
  }

  async function searchExactTopic(topic) {
    var query = buildSearchQuery(topic);
    if (query.length < 2) {
      return { query: query, match: null };
    }
    var data = await fetchJsonWithRetry(
      "/search.json?q=" + encodeURIComponent(query)
    );
    return {
      query: query,
      match: findExactSearchTopic(data, topic.id),
    };
  }

  function isSearchPage() {
    return /^\/search(?:\/|$)/.test(String(location.pathname || ""));
  }

  function findTopicLink(topicId) {
    var links = document.querySelectorAll(
      'a.raw-topic-link, .topic-list a.title, .latest-topic-list-item a.title, a.search-link, .fps-result a[href*="/t/"], a[href*="/t/"]'
    );
    for (var index = 0; index < links.length; index += 1) {
      var href = links[index].getAttribute("href") || "";
      if (getTopicId(href) === Number(topicId)) {
        return links[index];
      }
    }
    return null;
  }

  function chooseBrowsableQueueIndex(session, topicIds) {
    if (!session || !Array.isArray(session.queue)) {
      return -1;
    }
    var visited = getVisited();
    var order = Array.isArray(topicIds) ? topicIds.map(Number) : [];
    for (var idIndex = 0; idIndex < order.length; idIndex += 1) {
      var topicId = order[idIndex];
      for (
        var queueIndex = Math.max(0, Number(session.index) || 0);
        queueIndex < session.queue.length;
        queueIndex += 1
      ) {
        if (Number(session.queue[queueIndex].id) !== topicId) {
          continue;
        }
        var progress = getTopicProgress(topicId);
        if (!visited.has(topicId) && !progress.completed) {
          return queueIndex;
        }
      }
    }
    return -1;
  }

  function findBrowsableQueueLink(session) {
    var links = Array.from(
      document.querySelectorAll(
        "a.raw-topic-link, .topic-list a.title, .latest-topic-list-item a.title, a.search-link, .fps-result a[href*='/t/']"
      )
    );
    var topicIds = links.map(function (link) {
      return getTopicId(link.getAttribute("href") || "");
    });
    var queueIndex = chooseBrowsableQueueIndex(session, topicIds);
    if (queueIndex < 0) {
      return null;
    }
    var topic = session.queue[queueIndex];
    var link = links.find(function (item) {
      return (
        getTopicId(item.getAttribute("href") || "") === Number(topic.id)
      );
    });
    return link
      ? { link: link, topic: topic, queueIndex: queueIndex }
      : null;
  }

  function promoteQueueTopic(session, queueIndex) {
    if (
      !session ||
      !Array.isArray(session.queue) ||
      queueIndex >= session.queue.length
    ) {
      return null;
    }
    var currentIndex = Math.max(0, Number(session.index) || 0);
    if (queueIndex < currentIndex) {
      return null;
    }
    if (queueIndex !== currentIndex) {
      var selected = session.queue[queueIndex];
      session.queue[queueIndex] = session.queue[currentIndex];
      session.queue[currentIndex] = selected;
      saveSession(session);
    }
    return session.queue[currentIndex];
  }

  function hasReadingProgress(topicId) {
    var progress = getTopicProgress(topicId);
    return Boolean(
      Number(progress.lastPostNumber || 1) > 1 ||
        Number(progress.accumulatedSeconds || 0) > 0
    );
  }

  async function findBrowsableTopicByScrolling(session) {
    var candidate = findBrowsableQueueLink(session);
    var unchangedBottomCount = 0;
    var previousMax = -1;

    for (var attempt = 0; !candidate && attempt < 28; attempt += 1) {
      var metrics = getScrollMetrics();
      var atBottom = metrics.max <= 0 || metrics.current >= metrics.max - 32;
      if (atBottom && metrics.max === previousMax) {
        unchangedBottomCount += 1;
      } else {
        unchangedBottomCount = 0;
      }
      previousMax = metrics.max;
      if (unchangedBottomCount >= 3) {
        break;
      }

      window.scrollBy({
        top: Math.max(320, Math.floor(window.innerHeight * 0.76)),
        behavior: "smooth",
      });
      setStatus(
        "正在翻找符合条件的未读话题 · 第 " +
          (attempt + 1) +
          " 次加载"
      );
      await sleep(700);
      candidate = findBrowsableQueueLink(session);
    }

    if (
      candidate &&
      candidate.link &&
      typeof candidate.link.scrollIntoView === "function"
    ) {
      candidate.link.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      await sleep(450);
    }
    return candidate;
  }

  async function findTopicLinkByScrolling(topic) {
    var link = findTopicLink(topic.id);
    var unchangedBottomCount = 0;
    var previousMax = -1;

    for (var attempt = 0; !link && attempt < 28; attempt += 1) {
      var metrics = getScrollMetrics();
      var atBottom = metrics.max <= 0 || metrics.current >= metrics.max - 32;

      if (atBottom && metrics.max === previousMax) {
        unchangedBottomCount += 1;
      } else {
        unchangedBottomCount = 0;
      }
      previousMax = metrics.max;
      if (unchangedBottomCount >= 3) {
        break;
      }

      window.scrollBy({
        top: Math.max(320, Math.floor(window.innerHeight * 0.76)),
        behavior: "smooth",
      });
      setStatus(
        "在主题列表中寻找：" +
          topic.title +
          " · 第 " +
          (attempt + 1) +
          " 次加载"
      );
      await sleep(700);
      link = findTopicLink(topic.id);
    }

    if (link && typeof link.scrollIntoView === "function") {
      link.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(450);
    }
    return link;
  }

  async function waitForSearchResult(topic) {
    var deadline = Date.now() + SEARCH_WAIT_MS;
    var link = findTopicLink(topic.id);
    var attempt = 0;
    while (!link && Date.now() < deadline) {
      attempt += 1;
      setStatus(
        "搜索结果核验中：" +
          topic.title +
          " · 等待精确主题 #" +
          topic.id
      );
      if (attempt % 4 === 0 && typeof window.scrollBy === "function") {
        window.scrollBy({
          top: Math.max(280, Math.floor(window.innerHeight * 0.62)),
          behavior: "smooth",
        });
      }
      await sleep(350);
      link = findTopicLink(topic.id);
    }
    if (link && typeof link.scrollIntoView === "function") {
      link.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(350);
    }
    return link;
  }

  async function openTopicFromSearch(topic, session) {
    var link = await waitForSearchResult(topic);
    if (link) {
      setNavigationState(session, "opening", {
        topicId: topic.id,
        query: (session.navigation || {}).query || buildSearchQuery(topic),
        retries: Number((session.navigation || {}).retries || 0),
        lastError: "",
        source: "search",
      });
      setStatus("搜索精确命中主题 #" + topic.id + "，点击打开。");
      link.click();
      return true;
    }

    var message = "搜索页未渲染精确主题 #" + topic.id;
    recordSessionError(session, message);
    setNavigationState(session, "opening", {
      topicId: topic.id,
      retries: Number((session.navigation || {}).retries || 0),
      lastError: message,
      source: "last",
    });
    setStatus(message + "，回退站点上次阅读入口。", true);
    location.href = topic.url + "/last";
    return false;
  }

  async function startTopicSearch(topic, session) {
    setStatus("列表未找到，正在站内搜索并核验主题 ID：" + topic.title);
    try {
      var result = await searchExactTopic(topic);
      if (!result.match) {
        recordSessionError(
          session,
          "站内搜索没有返回精确主题 #" + topic.id
        );
        return false;
      }

      session.listContext = Object.assign({}, session.listContext || {}, {
        canHistoryBack: false,
      });
      setNavigationState(session, "searching", {
        topicId: topic.id,
        query: result.query,
        retries: Number((session.navigation || {}).retries || 0),
        lastError: "",
        source: "list",
      });
      setStatus(
        "搜索已核验主题 #" + topic.id + "，打开站内搜索结果页。"
      );
      location.href =
        location.origin + "/search?q=" + encodeURIComponent(result.query);
      return true;
    } catch (error) {
      recordSessionError(session, "站内搜索失败：" + error.message);
      return false;
    }
  }

  function buildBrowseSearchQuery(config) {
    var keywords = Array.isArray((config || {}).includeKeywords)
      ? config.includeKeywords.filter(Boolean).slice(0, 3)
      : [];
    return keywords.length ? keywords.join(" ") : "order:latest";
  }

  async function startBrowseSearch(session) {
    var query = buildBrowseSearchQuery(session.config);
    session.listContext = Object.assign({}, session.listContext || {}, {
      canHistoryBack: false,
    });
    setNavigationState(session, "browsing-search", {
      topicId: null,
      query: query,
      retries: Number((session.navigation || {}).retries || 0),
      lastError: "",
      source: "list-browse",
    });
    setStatus("列表暂未翻到合格话题，进入宽泛搜索继续翻找。");
    location.href =
      location.origin + "/search?q=" + encodeURIComponent(query);
    return true;
  }

  async function openBrowsableTopicFromSearch(session) {
    var deadline = Date.now() + SEARCH_WAIT_MS;
    var candidate = findBrowsableQueueLink(session);
    var attempt = 0;
    while (!candidate && Date.now() < deadline) {
      attempt += 1;
      setStatus("正在宽泛搜索结果中翻找合格话题…");
      if (attempt % 4 === 0 && typeof window.scrollBy === "function") {
        window.scrollBy({
          top: Math.max(280, Math.floor(window.innerHeight * 0.62)),
          behavior: "smooth",
        });
      }
      await sleep(350);
      candidate = findBrowsableQueueLink(session);
    }

    if (candidate && candidate.link) {
      var topic = promoteQueueTopic(session, candidate.queueIndex);
      setNavigationState(session, "opening", {
        topicId: topic.id,
        query: (session.navigation || {}).query || "",
        retries: Number((session.navigation || {}).retries || 0),
        lastError: "",
        source: "browse-search",
      });
      if (typeof candidate.link.scrollIntoView === "function") {
        candidate.link.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        await sleep(350);
      }
      setStatus("翻到合格话题，点击：" + topic.title);
      candidate.link.click();
      return true;
    }

    var message = "列表和宽泛搜索都没有翻到剩余队列中的合格话题";
    session.status = "paused";
    session.navigation = null;
    session.diagnostics = Object.assign({}, session.diagnostics || {}, {
      stage: "paused",
      lastError: message,
      updatedAt: Date.now(),
    });
    saveSession(session);
    setStatus(
      "已安全暂停：" + message + "。可重试当前或跳过当前。",
      true
    );
    return false;
  }

  function captureListContext(session) {
    if (getTopicId(location.pathname)) {
      return session.listContext || {
        url: location.origin + "/latest",
        scrollY: 0,
        canHistoryBack: false,
      };
    }
    return {
      url: location.href,
      scrollY: Math.max(0, Number(window.scrollY) || 0),
      canHistoryBack: true,
    };
  }

  function resolveResumePost(localPostNumber, sitePostNumber) {
    return Math.max(
      1,
      Number(localPostNumber) || 1,
      Number(sitePostNumber) || 1
    );
  }

  async function reconcileResumePosition(topic) {
    await waitForArticle();
    var progress = getTopicProgress(topic.id);
    var sitePost = getHighestVisiblePostNumber();
    var resumePost = resolveResumePost(progress.lastPostNumber, sitePost);

    if (sitePost > Number(progress.lastPostNumber || 1)) {
      saveTopicProgress(topic.id, { lastPostNumber: sitePost });
      return true;
    }

    if (
      Number(progress.lastPostNumber || 1) > 1 &&
      sitePost > 0 &&
      sitePost + 1 < Number(progress.lastPostNumber)
    ) {
      setStatus(
        "站点恢复到第 " +
          sitePost +
          " 楼，本地记录更靠后；切到第 " +
          resumePost +
          " 楼。"
      );
      location.href = topic.url + "/" + resumePost;
      return false;
    }
    return true;
  }

  async function returnToList(session) {
    if (session.config.navigationMode !== "native") {
      return false;
    }

    var context = session.listContext || {
      url: location.origin + "/latest",
      scrollY: 0,
      canHistoryBack: false,
    };
    setNavigationState(session, "returning", {
      topicId:
        session.queue && session.queue[session.index]
          ? session.queue[session.index].id
          : null,
      url: context.url,
      scrollY: context.scrollY,
      retries: 0,
      lastError: "",
      source: "topic",
    });
    setStatus("返回主题列表…");

    if (
      context.canHistoryBack &&
      window.history &&
      window.history.length > 1
    ) {
      window.history.back();
      window.setTimeout(function () {
        if (getTopicId(location.pathname)) {
          location.href = context.url;
        }
      }, 1600);
    } else {
      location.href = context.url;
    }
    return true;
  }

  function restoreReturnedList(session) {
    if (
      !session ||
      !session.navigation ||
      session.navigation.stage !== "returning" ||
      getTopicId(location.pathname)
    ) {
      return false;
    }

    var scrollY = Math.max(0, Number(session.navigation.scrollY) || 0);
    session.navigation = null;
    session.listContext = {
      url: location.href,
      scrollY: scrollY,
      canHistoryBack: true,
    };
    session.diagnostics = Object.assign({}, session.diagnostics || {}, {
      stage: "list",
      retries: 0,
      lastError: "",
      updatedAt: Date.now(),
    });
    saveSession(session);
    window.setTimeout(function () {
      if (typeof window.scrollTo === "function") {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      }
      processCurrentTopic();
    }, 500);
    return true;
  }

  function isTopicComplete(progress, audit, bottomStableCount) {
    return Boolean(
      progress &&
        audit &&
        Number(progress.lastPostNumber || 0) >=
          Number(audit.highestPostNumber || Infinity) &&
        Number(bottomStableCount || 0) >= 2
    );
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
    var audit = await fetchTopicAudit(topic);
    var progress = getTopicProgress(topic.id);
    var length = await waitForArticle();
    var speed = sampleReadingSpeed(session.config.charsPerSecond);
    var plan = calculateReadPlan(session.config, length, speed);
    var deadline = Date.now() + plan.seconds * 1000;
    var startedAt = Date.now();
    var bottomPasses = 0;
    var steps = 0;
    var lastHeight = 0;

    progress.highestPostNumber = audit.highestPostNumber;

    while (Date.now() < deadline) {
      var currentSession = getSession();
      if (!currentSession || currentSession.status === "stopped") {
        return {
          stopped: true,
          complete: false,
          progress: progress,
          audit: audit,
        };
      }

      if (currentSession.status === "paused") {
        setStatus("已暂停，点击“继续”恢复。");
        await interruptibleSleep(500, function () {
          var state = getSession();
          return Boolean(state && state.status === "paused");
        });
        continue;
      }

      if (!shouldRunInForeground(currentSession)) {
        var hiddenAt = Date.now();
        setStatus("页面在后台，阅读与计时已暂停。");
        while (true) {
          await sleep(300);
          currentSession = getSession();
          if (
            !currentSession ||
            currentSession.status === "stopped" ||
            shouldRunInForeground(currentSession)
          ) {
            break;
          }
        }
        if (!currentSession || currentSession.status === "stopped") {
          return {
            stopped: true,
            complete: false,
            progress: progress,
            audit: audit,
          };
        }
        deadline += Math.max(0, Date.now() - hiddenAt);
        startedAt = Date.now();
        requestWakeLock(currentSession.config);
        continue;
      }

      var metrics = getScrollMetrics();
      var visiblePost = getHighestVisiblePostNumber();
      if (visiblePost > 0) {
        progress.lastPostNumber = Math.max(
          Number(progress.lastPostNumber || 1),
          visiblePost
        );
      }
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
          " 字/秒 · 楼层 " +
          progress.lastPostNumber +
          "/" +
          audit.highestPostNumber +
          " · 本段剩 " +
          remaining +
          " 秒"
      );

      if (atBottom) {
        if (metrics.max === lastHeight) {
          bottomPasses += 1;
        } else {
          bottomPasses = 0;
        }
        lastHeight = metrics.max;
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

      progress.accumulatedSeconds =
        Number(progress.accumulatedSeconds || 0) +
        Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      startedAt = Date.now();
      saveTopicProgress(topic.id, progress);

      if (isTopicComplete(progress, audit, bottomPasses)) {
        progress.completed = true;
        progress.accumulatedSeconds =
          Number(progress.accumulatedSeconds || 0) +
          Math.max(0, Math.round((Date.now() - startedAt) / 1000));
        progress = saveTopicProgress(topic.id, progress);
        return {
          stopped: false,
          complete: true,
          progress: progress,
          audit: audit,
        };
      }

      steps += 1;
      if (steps > 400) {
        throw new Error("滚动步骤异常，已停止本轮任务");
      }
    }

    progress.accumulatedSeconds =
      Number(progress.accumulatedSeconds || 0) +
      Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    progress = saveTopicProgress(topic.id, progress);
    return {
      stopped: false,
      complete: false,
      progress: progress,
      audit: audit,
    };
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

  async function navigateToTopic(topic, session) {
    session = session || getSession();
    var progress = getTopicProgress(topic.id);

    if (
      session &&
      session.config.navigationMode === "native" &&
      !getTopicId(location.pathname)
    ) {
      if (isSearchPage() && session.navigation) {
        if (session.navigation.stage === "browsing-search") {
          await openBrowsableTopicFromSearch(session);
          return;
        }
        if (
          session.navigation.stage === "searching" &&
          Number(session.navigation.topicId) === Number(topic.id) &&
          hasReadingProgress(topic.id)
        ) {
          await openTopicFromSearch(topic, session);
          return;
        }
      }

      if (!isSearchPage()) {
        session.listContext = captureListContext(session);
      }

      if (!hasReadingProgress(topic.id)) {
        setNavigationState(session, "list", {
          topicId: null,
          retries: Number((session.navigation || {}).retries || 0),
          lastError: "",
          source: "list-browse",
        });
        var candidate = await findBrowsableTopicByScrolling(session);
        if (candidate && candidate.link) {
          var selectedTopic = promoteQueueTopic(
            session,
            candidate.queueIndex
          );
          setNavigationState(session, "opening", {
            topicId: selectedTopic.id,
            retries: Number((session.navigation || {}).retries || 0),
            lastError: "",
            source: "list-browse",
          });
          setStatus("翻到合格话题，点击：" + selectedTopic.title);
          candidate.link.click();
          return;
        }

        await startBrowseSearch(session);
        return;
      }

      setNavigationState(session, "list", {
        topicId: topic.id,
        retries: Number((session.navigation || {}).retries || 0),
        lastError: "",
        source: "resume-list",
      });
      var link = await findTopicLinkByScrolling(topic);
      if (link) {
        setNavigationState(session, "opening", {
          topicId: topic.id,
          retries: Number((session.navigation || {}).retries || 0),
          lastError: "",
          source: "resume-list",
        });
        setStatus(
          "续读未完成主题：" +
            topic.title +
            " · 站点将恢复原阅读位置"
        );
        link.click();
        return;
      }

      if (await startTopicSearch(topic, session)) {
        return;
      }

      var searchError =
        ((session.diagnostics || {}).lastError || "站内搜索未精确命中");
      setNavigationState(session, "opening", {
        topicId: topic.id,
        retries: Number((session.navigation || {}).retries || 0),
        lastError: searchError,
        source: "last",
      });
      setStatus(
        searchError +
          "，未完成主题使用站点“上次阅读”入口：" +
          topic.title,
        true
      );
      await sleep(500);
      location.href = topic.url + "/last";
      return;
    }

    if (
      session &&
      session.config.navigationMode === "native" &&
      getTopicId(location.pathname) &&
      getTopicId(location.pathname) !== Number(topic.id) &&
      !hasReadingProgress(topic.id)
    ) {
      setStatus("当前页面不是待处理话题，返回列表继续翻找。");
      if (!(await returnToList(session))) {
        location.href =
          (session.listContext || {}).url || location.origin + "/latest";
      }
      return;
    }

    setStatus(
      "打开：" +
        topic.title +
        (progress.lastPostNumber > 1
          ? " · 从第 " + progress.lastPostNumber + " 楼继续"
          : "")
    );
    await sleep(500);
    if (session) {
      setNavigationState(session, "opening", {
        topicId: topic.id,
        retries: Number((session.navigation || {}).retries || 0),
        lastError: "",
        source:
          session.config.navigationMode === "native" ? "last" : "direct",
      });
    }
    location.href =
      session && session.config.navigationMode === "native"
        ? topic.url + "/last"
        : buildResumeUrl(topic, progress);
  }

  async function startSession() {
    try {
      var config = readConfigFromPanel();
      if (!acquireLock()) {
        throw new Error("另一个标签页正在运行翻帖任务");
      }
      await requestWakeLock(config);

      setStatus("正在读取最新主题…");
      var topics = await fetchTopics(config);
      var visited = getVisited();
      var queue = topics.filter(function (topic) {
        return !visited.has(topic.id);
      });

      if (!queue.length) {
        releaseLock();
        releaseWakeLock();
        setStatus("没有符合条件的未读主题。");
        return;
      }

      var session = {
        version: VERSION,
        status: "running",
        queue: queue,
        index: 0,
        completed: 0,
        likedCount: 0,
        reviewedCount: 0,
        reviewTopic: null,
        listContext: null,
        navigation: null,
        diagnostics: {
          stage: "idle",
          retries: 0,
          lastError: "",
          queueSkipped: 0,
          updatedAt: Date.now(),
        },
        config: config,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      session.listContext = captureListContext(session);
      saveSession(session);
      await navigateToTopic(queue[0], session);
    } catch (error) {
      releaseLock();
      releaseWakeLock();
      setStatus("启动失败：" + error.message, true);
    }
  }

  function togglePause() {
    var session = getSession();
    if (!session) {
      setStatus("当前没有运行中的任务。");
      return;
    }
    if (session.status === "review") {
      setStatus("当前正在等待点赞审查，请先确认点赞或跳过。");
      return;
    }

    if (session.status === "paused") {
      session.status = "running";
      saveSession(session);
      requestWakeLock(session.config);
      document.getElementById(IDS.pause).textContent = "暂停";
      setStatus("继续：" + formatProgress(session));
      processCurrentTopic();
      return;
    }

    session.status = "paused";
    saveSession(session);
    releaseWakeLock();
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
    clearProgress();
    setStatus("已清空已读记录。");
  }

  function retryCurrentTopic() {
    var session = getSession();
    if (!session || !session.queue[session.index]) {
      setStatus("当前没有可重试的话题。");
      return;
    }
    if (session.status === "review") {
      setStatus("当前处于点赞审查，请先确认或跳过点赞。");
      return;
    }

    session.status = "running";
    session.error = null;
    session.navigation = null;
    session.diagnostics = Object.assign({}, session.diagnostics || {}, {
      stage: "idle",
      retries: 0,
      lastError: "",
      updatedAt: Date.now(),
    });
    saveSession(session);
    setStatus("手动重试：" + session.queue[session.index].title);
    if (getTopicId(location.pathname) === session.queue[session.index].id) {
      processCurrentTopic();
    } else {
      navigateToTopic(session.queue[session.index], session);
    }
  }

  function skipCurrentTopic() {
    var session = getSession();
    if (!session || !session.queue[session.index]) {
      setStatus("当前没有可跳过的话题。");
      return;
    }
    if (session.status === "review") {
      setStatus("请使用“不点赞，继续”完成当前审查。");
      return;
    }

    var skipped = session.queue[session.index];
    session.status = "running";
    session.index += 1;
    session.navigation = null;
    session.diagnostics = Object.assign({}, session.diagnostics || {}, {
      stage: "idle",
      lastError: "",
      updatedAt: Date.now(),
    });

    if (session.index >= session.queue.length) {
      var listUrl =
        (session.listContext || {}).url || location.origin + "/latest";
      clearSession();
      setStatus(
        "已跳过但未标记已读：" + skipped.title + "；本轮队列结束。"
      );
      if (getTopicId(location.pathname) || isSearchPage()) {
        location.href = listUrl;
      }
      return;
    }

    saveSession(session);
    setStatus(
      "已跳过但未标记已读：" +
        skipped.title +
        "；下一项：" +
        session.queue[session.index].title
    );
    if (getTopicId(location.pathname)) {
      returnToList(session);
    } else {
      navigateToTopic(session.queue[session.index], session);
    }
  }

  function recoverStalledNavigation() {
    var session = getSession();
    if (
      processing ||
      !session ||
      session.status !== "running" ||
      !session.navigation
    ) {
      return false;
    }

    var navigation = session.navigation;
    if (
      [
        "list",
        "searching",
        "browsing-search",
        "opening",
        "returning",
      ].indexOf(
        navigation.stage
      ) === -1 ||
      Date.now() - Number(navigation.startedAt || 0) <
        NAVIGATION_TIMEOUT_MS
    ) {
      return false;
    }

    var topic = session.queue[session.index];
    if (!topic) {
      return false;
    }
    if (
      !hasReadingProgress(topic.id) &&
      ["list", "browsing-search"].indexOf(navigation.stage) !== -1
    ) {
      var browseMessage =
        stageLabel(navigation.stage) +
        "超时；新主题不会改成明确标题直达";
      session.status = "paused";
      session.navigation = null;
      session.diagnostics = Object.assign({}, session.diagnostics || {}, {
        stage: "paused",
        lastError: browseMessage,
        updatedAt: Date.now(),
      });
      saveSession(session);
      setStatus(
        "已安全暂停：" +
          browseMessage +
          "。可重试当前或调整筛选条件。",
        true
      );
      return true;
    }
    var retries = Number(navigation.retries || 0) + 1;
    var message =
      stageLabel(navigation.stage) +
      "超时，执行第 " +
      retries +
      " 次恢复";

    if (retries > MAX_NAVIGATION_RECOVERIES) {
      session.status = "paused";
      session.error = message;
      session.navigation.lastError = message;
      session.diagnostics = Object.assign({}, session.diagnostics || {}, {
        stage: "paused",
        retries: retries,
        lastError: message,
        updatedAt: Date.now(),
      });
      saveSession(session);
      setStatus(
        "已安全暂停：" +
          message +
          "。可点击“重试当前”或“跳过当前”。",
        true
      );
      return true;
    }

    setNavigationState(session, "opening", {
      topicId: topic.id,
      retries: retries,
      lastError: message,
      source: retries === 1 ? "last" : "direct",
    });
    setStatus(message + "。", true);
    location.href =
      retries === 1
        ? topic.url + "/last"
        : buildResumeUrl(topic, getTopicProgress(topic.id));
    return true;
  }

  function installRouteWatcher() {
    if (routeTimer) {
      return;
    }
    lastObservedHref = String(location.href || "");
    routeTimer = window.setInterval(function () {
      var href = String(location.href || "");
      if (href !== lastObservedHref) {
        lastObservedHref = href;
        window.setTimeout(function () {
          var session = getSession();
          if (!session || session.status === "stopped") {
            return;
          }
          if (!restoreReturnedList(session)) {
            processCurrentTopic();
          }
        }, 350);
        return;
      }
      recoverStalledNavigation();
    }, 1200);
  }

  function shouldRequestLikeReview(session, topic, audit) {
    var target = Number(session.config.likeTarget || 0);
    if (
      target <= 0 ||
      Number(session.likedCount || 0) >= target ||
      topic.pinned ||
      audit.alreadyLiked ||
      audit.closed ||
      audit.archived
    ) {
      return false;
    }

    var interval = Math.max(
      1,
      Math.floor(Number(session.config.limit || 1) / target)
    );
    return Number(session.completed || 0) % interval === 0;
  }

  function updateReviewButtons(session) {
    var approve = document.getElementById(IDS.approveLike);
    var skip = document.getElementById(IDS.skipLike);
    if (!approve || !skip) {
      return;
    }
    var reviewing = Boolean(session && session.status === "review");
    approve.disabled = !reviewing;
    skip.disabled = !reviewing;
    approve.style.display = reviewing ? "inline-block" : "none";
    skip.style.display = reviewing ? "inline-block" : "none";
  }

  function findFirstPostLikeButton() {
    var selectors = [
      '#post_1 button.like',
      'article[data-post-number="1"] button.like',
      '#post_1 button[aria-label*="赞"]',
      '#post_1 button[title*="赞"]',
      'article[data-post-number="1"] button[aria-label*="like" i]',
    ];
    for (var index = 0; index < selectors.length; index += 1) {
      var button = document.querySelector(selectors[index]);
      if (button) {
        return button;
      }
    }
    return null;
  }

  async function waitForFirstPostLikeButton() {
    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    var deadline = Date.now() + 8000;
    var button = findFirstPostLikeButton();
    while (!button && Date.now() < deadline) {
      await sleep(350);
      button = findFirstPostLikeButton();
    }
    return button;
  }

  function isLikeButtonActive(button) {
    if (!button) {
      return false;
    }
    var label = (
      String(button.getAttribute("aria-label") || "") +
      " " +
      String(button.getAttribute("title") || "")
    ).toLowerCase();
    return Boolean(
      button.getAttribute("aria-pressed") === "true" ||
        /has-like|liked|is-liked/.test(String(button.className || "")) ||
        /取消赞|移除赞|unlike|remove like/.test(label)
    );
  }

  function finishReviewAndAdvance(session) {
    session.status = "running";
    session.reviewTopic = null;
    session.index += 1;
    updateReviewButtons(session);
    if (session.index >= session.queue.length) {
      var context = session.listContext;
      clearSession();
      setStatus(
        "本轮完成：读完 " +
          session.completed +
          " 个主题，确认点赞 " +
          session.likedCount +
          " 个。"
      );
      if (
        session.config.navigationMode === "native" &&
        context &&
        getTopicId(location.pathname)
      ) {
        if (
          context.canHistoryBack &&
          window.history &&
          window.history.length > 1
        ) {
          window.history.back();
        } else {
          location.href = context.url;
        }
      }
      return;
    }
    saveSession(session);
    returnToList(session).then(function (returned) {
      if (!returned) {
        processCurrentTopic();
      }
    });
  }

  async function approveLikeAndContinue() {
    var session = getSession();
    if (!session || session.status !== "review" || !session.reviewTopic) {
      setStatus("当前没有等待确认的点赞候选。");
      return;
    }

    var button = await waitForFirstPostLikeButton();
    if (!button) {
      setStatus(
        "没有定位到站内点赞按钮。请手动点赞后点击“不赞，继续”，或刷新后重试。",
        true
      );
      return;
    }

    if (isLikeButtonActive(button)) {
      setStatus("该主题已经点赞，不会重复点击；继续下一主题。");
      finishReviewAndAdvance(session);
      return;
    }

    button.click();
    await sleep(900);
    session = getSession();
    if (!session || session.status !== "review") {
      return;
    }

    session.likedCount = Number(session.likedCount || 0) + 1;
    saveTopicProgress(session.reviewTopic.id, { liked: true });
    setStatus(
      "已提交点赞 " +
        session.likedCount +
        "/" +
        session.config.likeTarget +
        "，继续下一主题。"
    );
    finishReviewAndAdvance(session);
  }

  function skipLikeAndContinue() {
    var session = getSession();
    if (!session || session.status !== "review") {
      setStatus("当前没有等待确认的点赞候选。");
      return;
    }
    session.reviewedCount = Number(session.reviewedCount || 0) + 1;
    finishReviewAndAdvance(session);
  }

  async function processCurrentTopic() {
    if (processing) {
      return;
    }

    var session = getSession();
    if (!session || session.status === "stopped") {
      return;
    }
    if (session.status !== "review") {
      auditSessionQueue(session);
      session = getSession();
      if (!session) {
        return;
      }
    }
    if (session.status === "review") {
      session.diagnostics = Object.assign({}, session.diagnostics || {}, {
        stage: "review",
        updatedAt: Date.now(),
      });
      saveSession(session);
      updateReviewButtons(session);
      setStatus(
        "点赞候选待审查：" +
          session.reviewTopic.title +
          " · 已确认 " +
          session.likedCount +
          "/" +
          session.config.likeTarget
      );
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
      await navigateToTopic(topic, session);
      return;
    }

    if (!(await reconcileResumePosition(topic))) {
      return;
    }

    setNavigationState(session, "reading", {
      topicId: topic.id,
      retries: 0,
      lastError: "",
      source: (session.navigation || {}).source || "topic",
    });
    processing = true;
    try {
      var result = await scrollAndRead(topic, session);
      if (result.stopped) {
        return;
      }

      session = getSession();
      if (!session) {
        return;
      }

      if (result.complete) {
        markVisited(topic.id);
        session.completed += 1;

        if (shouldRequestLikeReview(session, topic, result.audit)) {
          session.status = "review";
          session.reviewedCount = Number(session.reviewedCount || 0) + 1;
          session.reviewTopic = {
            id: topic.id,
            title: topic.title,
            firstPostId: result.audit.firstPostId,
          };
          session.navigation = null;
          session.diagnostics = Object.assign(
            {},
            session.diagnostics || {},
            {
              stage: "review",
              retries: 0,
              lastError: "",
              updatedAt: Date.now(),
            }
          );
          saveSession(session);
          updateReviewButtons(session);
          setStatus(
            "已完整读到第 " +
              result.audit.highestPostNumber +
              " 楼，进入点赞审查。请确认是否点赞：" +
              topic.title
          );
          return;
        }

        session.index += 1;
      } else {
        session.queue.push(topic);
        session.index += 1;
        setStatus(
          "长帖本段结束，进度已保存到第 " +
            result.progress.lastPostNumber +
            "/" +
            result.audit.highestPostNumber +
            " 楼；稍后从这里续读。"
        );
      }

      if (session.index >= session.queue.length) {
        clearSession();
        setStatus(
          "本轮完成：读完 " +
            session.completed +
            " 个主题，确认点赞 " +
            session.likedCount +
            " 个。"
        );
        await sleep(1200);
        location.href = location.origin + "/latest";
        return;
      }

      saveSession(session);
      var gap = calculateInterTopicDelay(session.config);
      setStatus(
        gap > 0
          ? "帖间停留 " + Math.ceil(gap / 1000) + " 秒…"
          : "立即进入下一主题…"
      );
      var shouldContinue = await waitForActiveDelay(gap);
      if (!shouldContinue) {
        return;
      }
      if (await returnToList(session)) {
        return;
      }
      await navigateToTopic(session.queue[session.index], session);
    } catch (error) {
      var failed = getSession();
      if (failed) {
        failed.status = "paused";
        failed.error = error.message;
        failed.diagnostics = Object.assign(
          {},
          failed.diagnostics || {},
          {
            stage: "paused",
            lastError: error.message,
            updatedAt: Date.now(),
          }
        );
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
      width: PANEL_DEFAULT_WIDTH,
      height: PANEL_DEFAULT_HEIGHT,
    });
  }

  function calculatePanelSize(
    width,
    height,
    direction,
    maxWidth,
    maxHeight
  ) {
    var step = direction < 0 ? -1 : direction > 0 ? 1 : 0;
    return {
      width: clamp(
        (Number(width) || PANEL_DEFAULT_WIDTH) +
          step * PANEL_WIDTH_STEP,
        PANEL_MIN_WIDTH,
        Math.max(PANEL_MIN_WIDTH, Number(maxWidth) || PANEL_MIN_WIDTH)
      ),
      height: clamp(
        (Number(height) || PANEL_DEFAULT_HEIGHT) +
          step * PANEL_HEIGHT_STEP,
        PANEL_MIN_HEIGHT,
        Math.max(PANEL_MIN_HEIGHT, Number(maxHeight) || PANEL_MIN_HEIGHT)
      ),
    };
  }

  function applyPanelPosition(panel) {
    var saved = loadPanelPosition();
    var maxWidth = Math.max(PANEL_MIN_WIDTH, window.innerWidth - 16);
    var maxHeight = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - 16);
    var width = clamp(
      Number(saved.width) || PANEL_DEFAULT_WIDTH,
      PANEL_MIN_WIDTH,
      maxWidth
    );
    var height = clamp(
      Number(saved.height) || PANEL_DEFAULT_HEIGHT,
      PANEL_MIN_HEIGHT,
      maxHeight
    );
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

  function resizePanelByStep(panel, direction) {
    var size = calculatePanelSize(
      panel.offsetWidth,
      panel.offsetHeight,
      direction,
      window.innerWidth - panel.offsetLeft - 8,
      window.innerHeight - panel.offsetTop - 8
    );
    panel.style.width = size.width + "px";
    panel.style.height = size.height + "px";
    savePanelPosition(panel);
    setStatus(
      "面板尺寸：" + Math.round(size.width) + " × " + Math.round(size.height)
    );
    return size;
  }

  function resetPanelGeometry(panel) {
    remove(localStorage, KEYS.panel);
    applyPanelPosition(panel);
    savePanelPosition(panel);
    setStatus("面板尺寸和位置已恢复默认。");
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
            PANEL_MIN_WIDTH,
            Math.max(
              PANEL_MIN_WIDTH,
              window.innerWidth - panel.offsetLeft - 8
            )
          ) + "px";
        panel.style.height =
          clamp(
            action.height + dy,
            PANEL_MIN_HEIGHT,
            Math.max(
              PANEL_MIN_HEIGHT,
              window.innerHeight - panel.offsetTop - 8
            )
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
      resetPanelGeometry(panel);
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
      ".ldf-field select{width:116px;padding:3px;}",
      ".ldf-wide{display:block;margin:8px 0;}",
      ".ldf-wide input{display:block;width:100%;margin-top:4px;}",
      ".ldf-actions{display:flex;gap:6px;flex-wrap:wrap;margin:11px 0;}",
      ".ldf-actions button{border:1px solid #9e7b2f;background:#f5d889;color:#26200f;padding:6px 11px;border-radius:8px;cursor:pointer;font-weight:650;}",
      ".ldf-actions button:hover{background:#efca68;}",
      ".ldf-actions button:disabled{opacity:.5;cursor:not-allowed;}",
      ".ldf-size-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:0 0 9px;}",
      ".ldf-size-actions button{min-height:34px;border:1px solid #c8b98e;background:#faf4e4;color:#40371f;border-radius:8px;cursor:pointer;font-weight:650;touch-action:manipulation;}",
      "#" + IDS.status + "{padding:8px;background:#f7f1e3;border-radius:8px;word-break:break-word;}",
      "#" + IDS.diagnostics + "{margin-top:7px;padding:7px;background:#f2eee4;border-radius:8px;color:#655b47;font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word;}",
      ".ldf-note{margin:8px 0;color:#6b5a32;font-size:12px;}",
      "#" + IDS.resize + "{position:absolute;right:3px;bottom:2px;width:38px;height:38px;cursor:nwse-resize;touch-action:none;opacity:.65;text-align:right;padding:13px 5px 0 0;font-size:18px;}",
      "</style>",
      '<header id="' + IDS.drag + '"><span>Linux.do Flip</span><small>拖动 · 双击复位</small></header>',
      '<div class="ldf-size-actions">',
      '<button id="' + IDS.sizeDown + '" type="button">− 缩小</button>',
      '<button id="' + IDS.sizeReset + '" type="button">默认</button>',
      '<button id="' + IDS.sizeUp + '" type="button">＋ 放大</button>',
      "</div>",
      field("读取页数", IDS.pages, "number", "3"),
      field("本轮话题", IDS.limit, "number", "180"),
      field("点赞目标", IDS.likeTarget, "number", "30"),
      '<label class="ldf-field"><span>打开方式</span><select id="' +
        IDS.navigationMode +
        '"><option value="native">原生导航</option><option value="direct">直接续读</option></select></label>',
      field("帖间最短", IDS.interTopicMinSeconds, "number", "2", "秒"),
      field("帖间最长", IDS.interTopicMaxSeconds, "number", "6", "秒"),
      field("最短停留", IDS.minSeconds, "number", "12", "秒"),
      field("单次最长", IDS.maxSeconds, "number", "90", "秒"),
      field("基础速度", IDS.charsPerSecond, "number", "10", "字/秒"),
      '<label class="ldf-wide"><input id="' + IDS.includePinned + '" type="checkbox"> 包含置顶主题</label>',
      '<label class="ldf-wide"><input id="' + IDS.foregroundOnly + '" type="checkbox"> 仅在页面前台时阅读和计时</label>',
      '<label class="ldf-wide"><input id="' + IDS.keepAwake + '" type="checkbox"> 阅读时申请手机屏幕常亮</label>',
      '<label class="ldf-wide">包含关键词<input id="' + IDS.includeKeywords + '" type="text" placeholder="AI, VPS"></label>',
      '<label class="ldf-wide">排除关键词<input id="' + IDS.excludeKeywords + '" type="text" placeholder="广告, 交易"></label>',
      '<label class="ldf-wide">分类名称、slug 或 ID<input id="' + IDS.categories + '" type="text" placeholder="development, 5"></label>',
      '<div class="ldf-actions">',
      '<button id="' + IDS.start + '" type="button">开始</button>',
      '<button id="' + IDS.pause + '" type="button">暂停</button>',
      '<button id="' + IDS.stop + '" type="button">停止</button>',
      '<button id="' + IDS.retryCurrent + '" type="button">重试当前</button>',
      '<button id="' + IDS.skipCurrent + '" type="button">跳过当前</button>',
      '<button id="' + IDS.reset + '" type="button">清空已读</button>',
      '<button id="' + IDS.approveLike + '" type="button" style="display:none">确认点赞并继续</button>',
      '<button id="' + IDS.skipLike + '" type="button" style="display:none">不点赞，继续</button>',
      "</div>",
      '<p class="ldf-note">原生导航先翻主题列表，遇到第一个合格未读话题就点击；列表没有时再做宽泛搜索。只有未完成长帖续读才按明确主题恢复。</p>',
      '<div id="' + IDS.status + '">待命</div>',
      '<div id="' + IDS.diagnostics + '">阶段：待命</div>',
      '<div id="' + IDS.resize + '">◢</div>',
    ].join("");

    document.body.appendChild(panel);
    applyPanelPosition(panel);
    applyConfigToPanel(loadConfig());
    enablePanelPointerControls(panel);
    window.addEventListener("resize", function () {
      applyPanelPosition(panel);
      savePanelPosition(panel);
    });

    document.getElementById(IDS.start).addEventListener("click", startSession);
    document
      .getElementById(IDS.sizeDown)
      .addEventListener("click", function () {
        resizePanelByStep(panel, -1);
      });
    document
      .getElementById(IDS.sizeReset)
      .addEventListener("click", function () {
        resetPanelGeometry(panel);
      });
    document
      .getElementById(IDS.sizeUp)
      .addEventListener("click", function () {
        resizePanelByStep(panel, 1);
      });
    document.getElementById(IDS.pause).addEventListener("click", togglePause);
    document.getElementById(IDS.stop).addEventListener("click", stopSession);
    document
      .getElementById(IDS.retryCurrent)
      .addEventListener("click", retryCurrentTopic);
    document
      .getElementById(IDS.skipCurrent)
      .addEventListener("click", skipCurrentTopic);
    document.getElementById(IDS.reset).addEventListener("click", resetVisited);
    document
      .getElementById(IDS.approveLike)
      .addEventListener("click", approveLikeAndContinue);
    document
      .getElementById(IDS.skipLike)
      .addEventListener("click", skipLikeAndContinue);

    panel.querySelectorAll("input, select").forEach(function (control) {
      control.addEventListener("change", function () {
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
    renderDiagnostics(session);
    var pauseButton = document.getElementById(IDS.pause);
    if (!session) {
      setStatus("待命，已记录 " + getVisited().size + " 个已读主题。");
      pauseButton.textContent = "暂停";
      updateReviewButtons(null);
      return;
    }
    updateReviewButtons(session);
    if (session.status === "review") {
      setStatus(
        "点赞候选待审查：" +
          session.reviewTopic.title +
          " · 已确认 " +
          session.likedCount +
          "/" +
          session.config.likeTarget
      );
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
    installRouteWatcher();
    document.addEventListener("visibilitychange", function () {
      var session = getSession();
      if (!isDocumentVisible()) {
        releaseWakeLock();
        wakeLockState =
          session && session.config.keepAwake ? "waiting" : "disabled";
        renderDiagnostics(session);
        return;
      }
      if (
        session &&
        session.status !== "stopped" &&
        session.status !== "paused"
      ) {
        requestWakeLock(session.config);
      }
    });
    refreshPanelState();
    var session = getSession();
    if (session && session.status !== "stopped") {
      if (session.status !== "paused") {
        requestWakeLock(session.config);
      }
      auditSessionQueue(session);
      session = getSession();
      if (restoreReturnedList(session)) {
        return;
      }
      processCurrentTopic();
    }

    window.addEventListener("popstate", function () {
      window.setTimeout(function () {
        var current = getSession();
        if (!current || current.status === "stopped") {
          return;
        }
        if (!restoreReturnedList(current)) {
          processCurrentTopic();
        }
      }, 350);
    });
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
      buildSearchQuery: buildSearchQuery,
      buildBrowseSearchQuery: buildBrowseSearchQuery,
      findExactSearchTopic: findExactSearchTopic,
      searchExactTopic: searchExactTopic,
      chooseBrowsableQueueIndex: chooseBrowsableQueueIndex,
      promoteQueueTopic: promoteQueueTopic,
      hasReadingProgress: hasReadingProgress,
      parseTopicAudit: parseTopicAudit,
      buildResumeUrl: buildResumeUrl,
      resolveResumePost: resolveResumePost,
      isTopicComplete: isTopicComplete,
      calculateReadPlan: calculateReadPlan,
      sampleReadingSpeed: sampleReadingSpeed,
      calculateInterTopicDelay: calculateInterTopicDelay,
      shouldRunInForeground: shouldRunInForeground,
      requestWakeLock: requestWakeLock,
      releaseWakeLock: releaseWakeLock,
      getWakeLockState: getWakeLockState,
      calculatePanelSize: calculatePanelSize,
      getVisited: getVisited,
      markVisited: markVisited,
      getTopicProgress: getTopicProgress,
      saveTopicProgress: saveTopicProgress,
      clearProgress: clearProgress,
      shouldRequestLikeReview: shouldRequestLikeReview,
      stageLabel: stageLabel,
      auditSessionQueue: auditSessionQueue,
      recoverStalledNavigation: recoverStalledNavigation,
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

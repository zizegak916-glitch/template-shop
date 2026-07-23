// ==UserScript==
// @name         Linux.do Flip
// @namespace    local.linuxdo.flip
// @version      1.1.0
// @description  Linux.do 阅读进度助手：长帖分段续读、完成审查与手动点赞候选
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
    likeTarget: "linuxdo-flip-like-target",
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

  var TOPIC_RE = /\/t\/(?:[^/]+\/)?(\d+)(?:\/\d+)?(?:[/?#]|$)/;
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

  var DEFAULT_CONFIG = {
    pages: 3,
    limit: 180,
    likeTarget: 30,
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
    document.getElementById(IDS.likeTarget).value = String(config.likeTarget);
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
      highestPostNumber: topic.highest_post_number
        ? Number(topic.highest_post_number)
        : null,
      postsCount: topic.posts_count ? Number(topic.posts_count) : null,
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

  async function navigateToTopic(topic) {
    var progress = getTopicProgress(topic.id);
    setStatus(
      "打开：" +
        topic.title +
        (progress.lastPostNumber > 1
          ? " · 从第 " + progress.lastPostNumber + " 楼继续"
          : "")
    );
    await sleep(500);
    location.href = buildResumeUrl(topic, progress);
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
        likedCount: 0,
        reviewedCount: 0,
        reviewTopic: null,
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
    if (session.status === "review") {
      setStatus("当前正在等待点赞审查，请先确认点赞或跳过。");
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
    clearProgress();
    setStatus("已清空已读记录。");
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
      clearSession();
      setStatus(
        "本轮完成：读完 " +
          session.completed +
          " 个主题，确认点赞 " +
          session.likedCount +
          " 个。"
      );
      return;
    }
    saveSession(session);
    processCurrentTopic();
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
    if (session.status === "review") {
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
      await navigateToTopic(topic);
      return;
    }

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
      height: 600,
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
      ".ldf-actions button:disabled{opacity:.5;cursor:not-allowed;}",
      "#" + IDS.status + "{padding:8px;background:#f7f1e3;border-radius:8px;word-break:break-word;}",
      ".ldf-note{margin:8px 0;color:#6b5a32;font-size:12px;}",
      "#" + IDS.resize + "{position:absolute;right:5px;bottom:4px;width:22px;height:22px;cursor:nwse-resize;touch-action:none;opacity:.55;text-align:center;}",
      "</style>",
      '<header id="' + IDS.drag + '"><span>Linux.do Flip</span><small>拖动 · 双击复位</small></header>',
      field("读取页数", IDS.pages, "number", "3"),
      field("本轮话题", IDS.limit, "number", "180"),
      field("点赞目标", IDS.likeTarget, "number", "30"),
      field("最短停留", IDS.minSeconds, "number", "12", "秒"),
      field("单次最长", IDS.maxSeconds, "number", "90", "秒"),
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
      '<button id="' + IDS.approveLike + '" type="button" style="display:none">确认点赞并继续</button>',
      '<button id="' + IDS.skipLike + '" type="button" style="display:none">不点赞，继续</button>',
      "</div>",
      '<p class="ldf-note">长帖按楼层保存进度，单次时间到后排到队尾续读。点赞必须在完整读完并通过审查后手动确认。</p>',
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
    document
      .getElementById(IDS.approveLike)
      .addEventListener("click", approveLikeAndContinue);
    document
      .getElementById(IDS.skipLike)
      .addEventListener("click", skipLikeAndContinue);

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
      parseTopicAudit: parseTopicAudit,
      buildResumeUrl: buildResumeUrl,
      isTopicComplete: isTopicComplete,
      calculateReadPlan: calculateReadPlan,
      sampleReadingSpeed: sampleReadingSpeed,
      getVisited: getVisited,
      markVisited: markVisited,
      getTopicProgress: getTopicProgress,
      saveTopicProgress: saveTopicProgress,
      clearProgress: clearProgress,
      shouldRequestLikeReview: shouldRequestLikeReview,
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

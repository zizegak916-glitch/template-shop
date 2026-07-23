// ==UserScript==
// @name         Linux.do Topic Flipper
// @namespace    local.codex
// @version      0.4.0
// @description  在 linux.do 站内抓取最新主题并按弹性阅读速度估算整帖阅读时长
// @match        https://linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  var PANEL_ID = "linuxdo-flip-panel";
  var STATUS_ID = "linuxdo-flip-status";
  var DRAG_ID = "linuxdo-flip-drag";
  var RESIZE_ID = "linuxdo-flip-resize";
  var STATE_KEY = "linuxdoFlipSession";
  var VISITED_KEY = "linuxdoFlipVisited";
  var ACTIVE_KEY = "linuxdoFlipActive";
  var PANEL_STYLE_KEY = "linuxdoFlipPanelStyle";
  var TOPIC_RE = /\/t\/[^/]+\/(\d+)(?:\/|$)/;
  var SESSION_NOTE = "仅浏览，不点赞、不回复、不收藏。整帖时长按字数估算，阅读速度按你设置值做弹性波动。";
  var LATEST_PAGE_DELAY_MIN_MS = 1200;
  var LATEST_PAGE_DELAY_MAX_MS = 2600;
  var RATE_LIMIT_RETRY_MAX = 3;
  var ESTIMATED_TOPICS_PER_PAGE = 30;
  var MAX_AUTO_PAGES = 12;

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function loadState() {
    return loadJSON(STATE_KEY, null);
  }

  function saveState(state) {
    saveJSON(STATE_KEY, state);
  }

  function clearState() {
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  }

  function loadVisitedSet() {
    var items = loadJSON(VISITED_KEY, []);
    return new Set(Array.isArray(items) ? items : []);
  }

  function saveVisitedSet(visited) {
    var items = Array.from(visited).slice(-5000);
    saveJSON(VISITED_KEY, items);
  }

  function getTopicIdFromUrl(url) {
    var match = String(url || "").match(TOPIC_RE);
    return match ? Number(match[1]) : null;
  }

  function setStatus(text, isError) {
    var el = document.getElementById(STATUS_ID);
    if (!el) {
      return;
    }
    el.textContent = text;
    el.style.color = isError ? "#a61b1b" : "#1a1a1a";
  }

  function formatTopic(topic) {
    return "[" + topic.id + "] " + topic.title;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function chance(rate) {
    return Math.random() < rate;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeTextLength(text) {
    return String(text || "").replace(/\s+/g, "").length;
  }

  function parseListInput(value) {
    return String(value || "")
      .split(/[,\n]/)
      .map(function (item) {
        return item.trim().toLowerCase();
      })
      .filter(Boolean);
  }

  function matchesKeywordFilters(title, includeKeywords, excludeKeywords) {
    var normalizedTitle = String(title || "").toLowerCase();

    if (
      includeKeywords.length &&
      !includeKeywords.some(function (keyword) {
        return normalizedTitle.indexOf(keyword) !== -1;
      })
    ) {
      return false;
    }

    if (
      excludeKeywords.some(function (keyword) {
        return normalizedTitle.indexOf(keyword) !== -1;
      })
    ) {
      return false;
    }

    return true;
  }

  function getCategoryMap() {
    var categories = [];

    if (
      window.Discourse &&
      window.Discourse.Site &&
      typeof window.Discourse.Site.current === "function"
    ) {
      var currentSite = window.Discourse.Site.current();
      if (currentSite && Array.isArray(currentSite.categories)) {
        categories = currentSite.categories;
      }
    }

    if (!categories.length && window.site && Array.isArray(window.site.categories)) {
      categories = window.site.categories;
    }

    var map = {};
    categories.forEach(function (category) {
      if (!category || !category.id) {
        return;
      }
      map[Number(category.id)] = {
        id: Number(category.id),
        slug: String(category.slug || "").toLowerCase(),
        name: String(category.name || "").toLowerCase(),
      };
    });
    return map;
  }

  function matchesCategoryFilters(topic, categoryMap, categoryFilters) {
    if (!categoryFilters.length) {
      return true;
    }

    var category = categoryMap[Number(topic.category_id)];
    if (!category) {
      return false;
    }

    return categoryFilters.some(function (filter) {
      return filter === category.slug || filter === category.name || filter === String(category.id);
    });
  }

  function shouldIncludeTopic(topic, includePinned, filters, categoryMap, seen) {
    if (!topic || !topic.id || seen.has(Number(topic.id))) {
      return false;
    }
    if (!includePinned && topic.pinned) {
      return false;
    }
    if (
      !matchesKeywordFilters(
        topic.title,
        filters.includeKeywords,
        filters.excludeKeywords
      )
    ) {
      return false;
    }
    if (!matchesCategoryFilters(topic, categoryMap, filters.categoryFilters)) {
      return false;
    }
    return true;
  }

  function normalizeTopic(topic) {
    return {
      id: Number(topic.id),
      title: topic.title || "(无标题)",
      url: location.origin + "/t/" + (topic.slug || "topic") + "/" + topic.id,
      pinned: Boolean(topic.pinned),
      category_id: topic.category_id ? Number(topic.category_id) : null,
    };
  }

  function collectTopicsFromCurrentPage(filters, includePinned, categoryMap, seen) {
    var links = document.querySelectorAll(
      "a.raw-topic-link, .topic-list a.title, a.title.raw-link.raw-topic-link"
    );
    var topics = [];

    links.forEach(function (link) {
      var href = link.getAttribute("href") || "";
      var text = (link.innerText || link.textContent || "").trim();
      var match = href.match(TOPIC_RE);
      var row = link.closest ? link.closest("tr, .topic-list-item, .latest-topic-list-item") : null;
      var topic = null;

      if (!match || !text) {
        return;
      }

      topic = {
        id: Number(match[1]),
        slug: href.split("/").filter(Boolean).slice(-2, -1)[0] || "topic",
        title: text,
        pinned: Boolean(row && /pinned/i.test((row.className || ""))),
        category_id: row && row.dataset ? Number(row.dataset.categoryId || 0) || null : null,
      };

      if (!shouldIncludeTopic(topic, includePinned, filters, categoryMap, seen)) {
        return;
      }

      seen.add(topic.id);
      topics.push(normalizeTopic(topic));
    });

    return topics;
  }

  async function fetchLatestPageJson(page) {
    return fetch("/latest.json?page=" + page, {
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
      },
    });
  }

  async function fetchLatestPageWithRetry(page) {
    var attempt = 0;

    while (attempt <= RATE_LIMIT_RETRY_MAX) {
      var response = await fetchLatestPageJson(page);

      if (response.status !== 429) {
        if (!response.ok) {
          throw new Error("latest.json 返回 " + response.status);
        }
        return response.json();
      }

      attempt += 1;
      if (attempt > RATE_LIMIT_RETRY_MAX) {
        throw new Error("latest.json 返回 429，稍后再试，或把页数调低到 1");
      }

      var retryAfter = Number(response.headers.get("retry-after") || 0);
      var waitMs = retryAfter > 0
        ? retryAfter * 1000
        : randomInt(3000, 6000) * attempt;
      setStatus("触发 429，等待 " + Math.ceil(waitMs / 1000) + " 秒后重试...");
      await sleep(waitMs);
    }
  }

  async function fetchTopics(pageCount, includePinned, filters) {
    var topics = [];
    var seen = new Set();
    var categoryMap = getCategoryMap();
    var targetCount = Math.max(1, Number(filters.limit) || 10);
    var visibleTopics = collectTopicsFromCurrentPage(
      filters,
      includePinned,
      categoryMap,
      seen
    );
    var startPage = 0;
    var effectivePageCount = Math.min(
      MAX_AUTO_PAGES,
      Math.max(
        pageCount,
        Math.ceil(targetCount / ESTIMATED_TOPICS_PER_PAGE) + 1
      )
    );

    if (visibleTopics.length) {
      topics = topics.concat(visibleTopics);
      startPage = 1;
    }

    for (var page = startPage; page < effectivePageCount; page += 1) {
      if (topics.length >= targetCount) {
        break;
      }

      var data = await fetchLatestPageWithRetry(page);
      var items =
        (((data || {}).topic_list || {}).topics || []);

      if (!items.length) {
        break;
      }

      items.forEach(function (topic) {
        if (!shouldIncludeTopic(topic, includePinned, filters, categoryMap, seen)) {
          return;
        }
        seen.add(Number(topic.id));
        topics.push(normalizeTopic(topic));
      });

      if (page + 1 < effectivePageCount && topics.length < targetCount) {
        await sleep(randomInt(LATEST_PAGE_DELAY_MIN_MS, LATEST_PAGE_DELAY_MAX_MS));
      }
    }

    return topics;
  }

  function getScrollMetrics() {
    var maxScroll =
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      ) - window.innerHeight;

    return {
      maxScroll: Math.max(0, maxScroll),
      currentY: Math.max(window.scrollY, 0),
    };
  }

  function getReadingPauseMs() {
    if (chance(0.14)) {
      return randomInt(7000, 15000);
    }
    return randomInt(1400, 4200);
  }

  async function performHumanScrollStep() {
    var metrics = getScrollMetrics();
    var viewport = Math.max(window.innerHeight, 600);

    if (metrics.maxScroll <= 0) {
      await sleep(randomInt(1800, 4200));
      return true;
    }

    if (metrics.currentY >= metrics.maxScroll - 32) {
      if (chance(0.25)) {
        window.scrollBy({
          top: -randomInt(
            Math.floor(viewport * 0.12),
            Math.floor(viewport * 0.28)
          ),
          behavior: "smooth",
        });
        await sleep(randomInt(1500, 3200));
        return false;
      }
      await sleep(randomInt(1800, 3600));
      return true;
    }

    if (chance(0.16) && metrics.currentY > viewport * 0.5) {
      window.scrollBy({
        top: -randomInt(
          Math.floor(viewport * 0.08),
          Math.floor(viewport * 0.22)
        ),
        behavior: "smooth",
      });
      await sleep(randomInt(1200, 2600));
      return false;
    }

    window.scrollBy({
      top: randomInt(
        Math.floor(viewport * 0.35),
        Math.floor(viewport * 0.9)
      ),
      behavior: "smooth",
    });
    await sleep(getReadingPauseMs());
    return false;
  }

  function getTopicTextLength() {
    var nodes = document.querySelectorAll(
      ".topic-post .cooked, .post-stream .topic-post .cooked, article .cooked"
    );
    var total = 0;

    nodes.forEach(function (node) {
      total += normalizeTextLength(node.innerText || node.textContent || "");
    });

    return total;
  }

  function sampleReadingSpeed(baseCharsPerSecond) {
    var base = Math.max(1, Number(baseCharsPerSecond) || 10);
    var buckets = [
      { max: 0.12, factors: [0.6, 0.7] },
      { max: 0.58, factors: [0.8, 0.9, 1.0, 1.1, 1.2] },
      { max: 0.9, factors: [1.3, 1.5, 1.8] },
      { max: 1.0, factors: [2.0, 2.2] },
    ];
    var roll = Math.random();
    var selected = buckets[buckets.length - 1].factors;

    buckets.some(function (bucket) {
      if (roll <= bucket.max) {
        selected = bucket.factors;
        return true;
      }
      return false;
    });

    return Math.max(1, Math.round(base * selected[randomInt(0, selected.length - 1)]));
  }

  function estimateReadDurationMs(options) {
    var charsPerSecond = sampleReadingSpeed(options.charsPerSecond);
    var textLength = getTopicTextLength();
    var estimatedSec = Math.ceil(textLength / charsPerSecond);
    var minSec = Math.max(Number(options.readMinSec) || 0, estimatedSec);
    var maxSec = Math.max(Number(options.readMaxSec) || 0, minSec);

    return {
      textLength: textLength,
      charsPerSecond: charsPerSecond,
      estimatedSec: estimatedSec,
      readForMs: randomInt(minSec * 1000, maxSec * 1000),
    };
  }

  function loadPanelStyle() {
    return loadJSON(PANEL_STYLE_KEY, {
      top: 16,
      left: null,
      width: 260,
      height: 360,
    });
  }

  function savePanelStyle(style) {
    saveJSON(PANEL_STYLE_KEY, style);
  }

  function applyPanelStyle(panel) {
    var style = loadPanelStyle();
    var viewportWidth = Math.max(window.innerWidth || 0, 320);
    var viewportHeight = Math.max(window.innerHeight || 0, 320);
    var width = clamp(Number(style.width) || 260, 220, Math.max(220, viewportWidth - 16));
    var height = clamp(Number(style.height) || 360, 220, Math.max(220, viewportHeight - 16));
    var leftDefault = viewportWidth - width - 16;
    var left = style.left === null || style.left === undefined
      ? leftDefault
      : Number(style.left);
    var top = Number(style.top);

    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.width = width + "px";
    panel.style.height = height + "px";
    panel.style.left = clamp(left, 8, Math.max(8, viewportWidth - width - 8)) + "px";
    panel.style.top = clamp(top, 8, Math.max(8, viewportHeight - height - 8)) + "px";
  }

  function persistPanelStyle(panel) {
    savePanelStyle({
      top: panel.style.top ? parseInt(panel.style.top, 10) : 16,
      left: panel.style.left ? parseInt(panel.style.left, 10) : null,
      width: panel.offsetWidth || parseInt(panel.style.width, 10) || 260,
      height: panel.offsetHeight || parseInt(panel.style.height, 10) || 360,
    });
  }

  function enablePanelInteractions(panel) {
    var dragHandle = document.getElementById(DRAG_ID);
    var resizeHandle = document.getElementById(RESIZE_ID);
    if (!dragHandle || !resizeHandle) {
      return;
    }

    var dragState = null;
    var resizeState = null;

    dragHandle.addEventListener("mousedown", function (event) {
      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        startLeft: panel.offsetLeft,
        startTop: panel.offsetTop,
      };
      event.preventDefault();
    });

    dragHandle.addEventListener("dblclick", function () {
      savePanelStyle({
        top: 16,
        left: null,
        width: 260,
        height: 360,
      });
      applyPanelStyle(panel);
    });

    resizeHandle.addEventListener("mousedown", function (event) {
      resizeState = {
        startX: event.clientX,
        startY: event.clientY,
        startWidth: panel.offsetWidth,
        startHeight: panel.offsetHeight,
      };
      event.preventDefault();
      event.stopPropagation();
    });

    document.addEventListener("mousemove", function (event) {
      if (dragState) {
        var viewportWidth = Math.max(window.innerWidth || 0, 320);
        var viewportHeight = Math.max(window.innerHeight || 0, 320);
        var nextLeft = dragState.startLeft + (event.clientX - dragState.startX);
        var nextTop = dragState.startTop + (event.clientY - dragState.startY);

        panel.style.left =
          clamp(nextLeft, 8, Math.max(8, viewportWidth - panel.offsetWidth - 8)) + "px";
        panel.style.top =
          clamp(nextTop, 8, Math.max(8, viewportHeight - panel.offsetHeight - 8)) + "px";
      }

      if (resizeState) {
        var viewWidth = Math.max(window.innerWidth || 0, 320);
        var viewHeight = Math.max(window.innerHeight || 0, 320);
        var width = resizeState.startWidth + (event.clientX - resizeState.startX);
        var height = resizeState.startHeight + (event.clientY - resizeState.startY);

        panel.style.width =
          clamp(width, 220, Math.max(220, viewWidth - panel.offsetLeft - 8)) + "px";
        panel.style.height =
          clamp(height, 220, Math.max(220, viewHeight - panel.offsetTop - 8)) + "px";
      }
    });

    document.addEventListener("mouseup", function () {
      if (dragState || resizeState) {
        dragState = null;
        resizeState = null;
        persistPanelStyle(panel);
      }
    });
  }

  async function waitBetweenTopics(index) {
    var gapMs = randomInt(9000, 22000);
    setStatus("帖间等待 " + Math.ceil(gapMs / 1000) + " 秒");
    await sleep(gapMs);

    if (index > 0 && index % 4 === 0 && chance(0.6)) {
      var restMs = randomInt(25000, 70000);
      setStatus("阶段性休息 " + Math.ceil(restMs / 1000) + " 秒");
      await sleep(restMs);
    }
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }

    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = [
      '<div id="' + DRAG_ID + '" style="font-weight:700;font-size:14px;margin-bottom:8px;cursor:move;display:flex;justify-content:space-between;align-items:center;">Linux.do 翻帖 <span style="font-size:11px;font-weight:400;opacity:.7;">拖动 / 双击复位</span></div>',
      '<label style="display:block;margin-bottom:6px;">页数 <input id="linuxdo-flip-pages" type="number" min="1" value="3" style="width:72px;margin-left:8px;"></label>',
      '<label style="display:block;margin-bottom:6px;">数量 <input id="linuxdo-flip-limit" type="number" min="1" value="10" style="width:72px;margin-left:8px;"></label>',
      '<label style="display:block;margin-bottom:6px;">阅读最短秒数 <input id="linuxdo-flip-min" type="number" min="3" value="12" style="width:72px;margin-left:8px;"></label>',
      '<label style="display:block;margin-bottom:6px;">阅读最长秒数 <input id="linuxdo-flip-max" type="number" min="5" value="28" style="width:72px;margin-left:8px;"></label>',
      '<label style="display:block;margin-bottom:6px;">基础速度 <input id="linuxdo-flip-cps" type="number" min="1" value="10" style="width:72px;margin-left:8px;"> 字/秒</label>',
      '<label style="display:block;margin-bottom:8px;"><input id="linuxdo-flip-pinned" type="checkbox"> 包含置顶帖</label>',
      '<label style="display:block;margin-bottom:6px;">包含关键词 <input id="linuxdo-flip-include" type="text" placeholder="AI, VPS" style="width:100%;margin-top:4px;box-sizing:border-box;"></label>',
      '<label style="display:block;margin-bottom:6px;">排除关键词 <input id="linuxdo-flip-exclude" type="text" placeholder="广告, 交易" style="width:100%;margin-top:4px;box-sizing:border-box;"></label>',
      '<label style="display:block;margin-bottom:8px;">分类过滤 <input id="linuxdo-flip-categories" type="text" placeholder="development, 5" style="width:100%;margin-top:4px;box-sizing:border-box;"></label>',
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">',
      '<button id="linuxdo-flip-start" type="button">开始</button>',
      '<button id="linuxdo-flip-stop" type="button">停止</button>',
      '<button id="linuxdo-flip-reset" type="button">清空记录</button>',
      "</div>",
      '<div style="font-size:12px;line-height:1.5;margin-bottom:6px;color:#5a4a22;">' + SESSION_NOTE + "</div>",
      '<div style="font-size:12px;line-height:1.5;margin-bottom:6px;color:#5a4a22;">例：基础速度 10，实际单帖可能采样成 8 / 9 / 11 / 15 / 22。</div>',
      '<div id="' + STATUS_ID + '" style="font-size:12px;line-height:1.5;">待命</div>',
      '<div id="' + RESIZE_ID + '" style="position:absolute;right:6px;bottom:6px;width:16px;height:16px;cursor:nwse-resize;opacity:.55;user-select:none;">◢</div>',
    ].join("");

    panel.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:999999",
      "width:260px",
      "min-width:220px",
      "height:360px",
      "min-height:220px",
      "padding:12px",
      "background:#fff6df",
      "border:1px solid #d7b46a",
      "border-radius:12px",
      "box-shadow:0 10px 30px rgba(0,0,0,.15)",
      "font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "color:#1a1a1a",
      "overflow:auto",
      "box-sizing:border-box",
    ].join(";");

    document.body.appendChild(panel);
    applyPanelStyle(panel);
    enablePanelInteractions(panel);

    panel.querySelectorAll("button").forEach(function (button) {
      button.style.cssText = [
        "border:1px solid #b88a2f",
        "background:#f4d084",
        "color:#222",
        "padding:6px 10px",
        "border-radius:8px",
        "cursor:pointer",
      ].join(";");
    });

    document
      .getElementById("linuxdo-flip-start")
      .addEventListener("click", startSession);
    document
      .getElementById("linuxdo-flip-stop")
      .addEventListener("click", stopSession);
    document
      .getElementById("linuxdo-flip-reset")
      .addEventListener("click", resetVisited);

    refreshStatusFromState();
  }

  function readOptionsFromPanel() {
    var pages = Number(document.getElementById("linuxdo-flip-pages").value || 3);
    var limit = Number(document.getElementById("linuxdo-flip-limit").value || 10);
    var readMinSec = Number(document.getElementById("linuxdo-flip-min").value || 12);
    var readMaxSec = Number(document.getElementById("linuxdo-flip-max").value || 28);
    var charsPerSecond = Number(document.getElementById("linuxdo-flip-cps").value || 10);
    var includePinned = document.getElementById("linuxdo-flip-pinned").checked;
    var includeKeywords = parseListInput(
      document.getElementById("linuxdo-flip-include").value
    );
    var excludeKeywords = parseListInput(
      document.getElementById("linuxdo-flip-exclude").value
    );
    var categoryFilters = parseListInput(
      document.getElementById("linuxdo-flip-categories").value
    );

    if (
      pages < 1 ||
      limit < 1 ||
      readMinSec < 1 ||
      readMaxSec < readMinSec ||
      charsPerSecond < 1
    ) {
      throw new Error("参数不合法");
    }

    return {
      pages: pages,
      limit: limit,
      readMinSec: readMinSec,
      readMaxSec: readMaxSec,
      charsPerSecond: charsPerSecond,
      includePinned: includePinned,
      includeKeywords: includeKeywords,
      excludeKeywords: excludeKeywords,
      categoryFilters: categoryFilters,
    };
  }

  function refreshStatusFromState() {
    var state = loadState();
    var visited = loadVisitedSet();

    if (!state || !state.running) {
      setStatus("待命，已记录 " + visited.size + " 个已读主题。");
      return;
    }

    var current = state.queue[state.index];
    if (!current) {
      setStatus("任务即将完成。");
      return;
    }

    setStatus(
      "运行中 " +
        (state.index + 1) +
        "/" +
        state.queue.length +
        " : " +
        formatTopic(current)
    );
  }

  async function startSession() {
    try {
      var options = readOptionsFromPanel();
      setStatus("收集中...");

      var topics = await fetchTopics(options.pages, options.includePinned, options);
      var visited = loadVisitedSet();
      var queue = topics.filter(function (topic) {
        return !visited.has(topic.id);
      }).slice(0, options.limit);

      if (!queue.length) {
        setStatus("没有新的主题可处理。");
        return;
      }

      saveState({
        running: true,
        queue: queue,
        index: 0,
        options: options,
        completedCount: 0,
        createdAt: Date.now(),
      });

      setStatus("开始，准备打开 " + queue.length + " 个主题。");
      await sleep(600);
      location.href = queue[0].url;
    } catch (error) {
      setStatus("启动失败: " + error.message, true);
    }
  }

  function stopSession() {
    clearState();
    setStatus("已停止。");
  }

  function resetVisited() {
    localStorage.removeItem(VISITED_KEY);
    setStatus("已清空已读记录。");
  }

  function finishSession(message) {
    clearState();
    setStatus(message);
  }

  function markVisited(topicId) {
    var visited = loadVisitedSet();
    visited.add(Number(topicId));
    saveVisitedSet(visited);
  }

  async function processCurrentTopic() {
    var state = loadState();
    if (!state || !state.running) {
      return;
    }

    var current = state.queue[state.index];
    if (!current) {
      finishSession("本轮翻帖已完成。");
      return;
    }

    var currentTopicId = getTopicIdFromUrl(location.pathname);
    if (currentTopicId !== current.id) {
      setStatus("跳转到当前任务主题...");
      await sleep(800);
      location.href = current.url;
      return;
    }

    if (sessionStorage.getItem(ACTIVE_KEY) === String(current.id)) {
      return;
    }

    sessionStorage.setItem(ACTIVE_KEY, String(current.id));

    var readEstimate = estimateReadDurationMs(state.options);
    var readForMs = readEstimate.readForMs;
    var deadline = Date.now() + readForMs;
    var bottomHits = 0;
    var stepCount = 0;

    setStatus(
      "阅读中 " +
        (state.index + 1) +
        "/" +
        state.queue.length +
        " : " +
        formatTopic(current) +
        " · 约 " +
        readEstimate.textLength +
        " 字 · " +
        readEstimate.charsPerSecond +
        " 字/秒"
    );

    await sleep(randomInt(1200, 3600));

    while (Date.now() < deadline || bottomHits < 2 || stepCount < 4) {
      var metrics = getScrollMetrics();
      var remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      var nearBottom = metrics.currentY >= metrics.maxScroll - 24;

      setStatus(
        "阅读中 " +
          (state.index + 1) +
          "/" +
          state.queue.length +
          " 剩余约 " +
          remaining +
          " 秒" +
          " · " +
          readEstimate.textLength +
          " 字" +
          " · 实际 " +
          readEstimate.charsPerSecond +
          " 字/秒"
      );

      if (nearBottom) {
        bottomHits += 1;
      } else {
        bottomHits = 0;
      }

      if (await performHumanScrollStep()) {
        bottomHits += 1;
      }
      stepCount += 1;
    }

    markVisited(current.id);
    sessionStorage.removeItem(ACTIVE_KEY);
    state.index += 1;
    state.completedCount = (state.completedCount || 0) + 1;

    if (state.index >= state.queue.length) {
      finishSession("本轮翻帖已完成。");
      await sleep(randomInt(2000, 6000));
      location.href = location.origin + "/latest";
      return;
    }

    saveState(state);
    await waitBetweenTopics(state.completedCount);
    setStatus("切到下一个主题...");
    await sleep(randomInt(1500, 4200));
    location.href = state.queue[state.index].url;
  }

  function boot() {
    buildPanel();
    refreshStatusFromState();

    var state = loadState();
    if (!state || !state.running) {
      return;
    }

    processCurrentTopic().catch(function (error) {
      clearState();
      setStatus("运行失败: " + error.message, true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

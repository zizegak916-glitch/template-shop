// ==UserScript==
// @name         Linux.do Flip
// @namespace    local.linuxdo.flip
// @version      1.10.0
// @description  Linux.do 阅读进度助手：150 话题、25 次确认点赞、千楼帖约 300 楼上限、独立心跳与断点自愈
// @match        https://linux.do/*
// @grant        none
// @run-at       document-start
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
    runtime: "linuxdoFlipRuntimeV1",
  };

  var TOPIC_RE = /\/t\/(?:[^/]+\/)?(\d+)(?:\/(?:\d+|last))?(?:[/?#]|$)/;
  var VERSION = 2;
  var MAX_VISITED = 5000;
  var MAX_PROGRESS = 2000;
  var MAX_PAGES = 20;
  var MAX_TOPICS = 200;
  var CONFIG_REVISION = 4;
  var TOPICS_PER_PAGE_ESTIMATE = 30;
  var LOCK_TTL_MS = 30000;
  var FETCH_DELAY_MIN_MS = 1100;
  var FETCH_DELAY_MAX_MS = 2200;
  var FETCH_RETRIES = 3;
  var FETCH_TIMEOUT_MS = 20000;
  var SEARCH_WAIT_MS = 9000;
  var NAVIGATION_TIMEOUT_MS = 25000;
  var RUNTIME_HEARTBEAT_MIN_MS = 2000;
  var RUNTIME_WATCHDOG_INTERVAL_MS = 5000;
  var RUNTIME_STALE_MS = 35000;
  var PAGE_LOAD_RECOVERY_MS = 45000;
  var MAX_RUNTIME_RELOADS = 3;
  var WAKE_LOCK_RETRY_MS = 8000;
  var WAKE_LOCK_REQUEST_TIMEOUT_MS = 5000;
  var MAX_NAVIGATION_RECOVERIES = 2;
  var MAX_TOPIC_AUTO_RETRIES = 2;
  var MAX_BROWSE_AUTO_RETRIES = 2;
  var MAX_CONSECUTIVE_FAILURES = 6;
  var RECOVERY_BACKOFF_BASE_MS = 1500;
  var READ_VERIFICATION_ATTEMPTS = 3;
  var READ_VERIFICATION_WAIT_MS = 3000;
  var LIKE_CONFIRM_TIMEOUT_MS = 6000;
  var LONG_TOPIC_THRESHOLD = 1000;
  var LONG_TOPIC_READ_CAP = 300;
  var LONG_TOPIC_CAP_TOLERANCE = 20;
  var PANEL_MIN_WIDTH = 240;
  var PANEL_MIN_HEIGHT = 260;
  var PANEL_DEFAULT_WIDTH = 300;
  var PANEL_DEFAULT_HEIGHT = 600;
  var PANEL_WIDTH_STEP = 40;
  var PANEL_HEIGHT_STEP = 60;
  var KEEP_AWAKE_VIDEO =
    "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAH6EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggHk7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiECfQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYigM/VRO6eRKpyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhDuaygDgibCBELqBEJqBAhJUw2dAgHNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjAuMTYuMTAwc3PaY8CLY8WIoDP1UTunkSpnyKVFo4dFTkNPREVSRIeYTGF2YzYwLjMxLjEwMiBsaWJ2cHgtdnA5Z8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMi4wMDAwMDAwMDAAH0O2dbvngQCjoYEAAICCSYNCAADwAPYAOCQcGEIAADBgAAAQv//9iyoAAKOTgQPoAIYAQJKcAElAAANgAABCQBxTu2uRu4+zgQC3iveBAfGCAaTwgQM=";

  var DEFAULT_CONFIG = {
    configRevision: CONFIG_REVISION,
    pages: 3,
    limit: 150,
    likeTarget: 25,
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
  var runtimeWatchdogTimer = null;
  var wakeLockTimer = null;
  var pageLoadRecoveryTimer = null;
  var lastObservedHref = "";
  var lastRuntimeHeartbeatAt = 0;
  var wakeLockSentinel = null;
  var wakeLockState = "idle";
  var wakeLockRequestInFlight = false;
  var keepAwakeVideo = null;
  var likeSubmitting = false;
  var booted = false;

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
      touchRuntime("waiting");
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

  function stopMediaKeepAwake() {
    var video = keepAwakeVideo;
    keepAwakeVideo = null;
    if (!video) {
      return;
    }
    try {
      if (typeof video.pause === "function") {
        video.pause();
      }
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    } catch (error) {}
  }

  async function requestMediaKeepAwake(config) {
    config = normalizeConfig(config || loadConfig());
    if (
      !config.keepAwake ||
      !isDocumentVisible() ||
      !document.body ||
      typeof document.createElement !== "function"
    ) {
      return false;
    }
    if (keepAwakeVideo && !keepAwakeVideo.paused) {
      wakeLockState = "media";
      return true;
    }

    stopMediaKeepAwake();
    var video = document.createElement("video");
    video.setAttribute("aria-hidden", "true");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = KEEP_AWAKE_VIDEO;
    video.style.cssText =
      "position:fixed;width:1px;height:1px;opacity:.001;pointer-events:none;left:-10px;top:-10px;";
    document.body.appendChild(video);
    keepAwakeVideo = video;
    var timeoutId = null;
    try {
      await Promise.race([
        Promise.resolve(video.play()),
        new Promise(function (_, reject) {
          timeoutId = window.setTimeout(function () {
            reject(new Error("媒体常亮启动超时"));
          }, 3000);
        }),
      ]);
      if (
        timeoutId !== null &&
        typeof window.clearTimeout === "function"
      ) {
        window.clearTimeout(timeoutId);
      }
      wakeLockState = "media";
      touchRuntime("media-keep-awake");
      renderDiagnostics(getSession());
      return true;
    } catch (error) {
      if (
        timeoutId !== null &&
        typeof window.clearTimeout === "function"
      ) {
        window.clearTimeout(timeoutId);
      }
      stopMediaKeepAwake();
      return false;
    }
  }

  function releaseWakeLock() {
    var sentinel = wakeLockSentinel;
    wakeLockSentinel = null;
    stopMediaKeepAwake();
    if (wakeLockState === "active" || wakeLockState === "media") {
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
    config = normalizeConfig(config || loadConfig());
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
    if (wakeLockRequestInFlight) {
      return false;
    }
    if (
      !window.navigator ||
      !window.navigator.wakeLock ||
      typeof window.navigator.wakeLock.request !== "function"
    ) {
      wakeLockState = (await requestMediaKeepAwake(config))
        ? "media"
        : "unsupported";
      renderDiagnostics(getSession());
      return wakeLockState === "media";
    }

    wakeLockRequestInFlight = true;
    var timeoutId = null;
    var timedOut = false;
    try {
      var requestPromise = window.navigator.wakeLock.request("screen");
      Promise.resolve(requestPromise).then(
        function (lateSentinel) {
          if (
            timedOut &&
            lateSentinel &&
            typeof lateSentinel.release === "function"
          ) {
            Promise.resolve(lateSentinel.release()).catch(function () {});
          }
        },
        function () {}
      );
      var sentinel = await Promise.race([
        requestPromise,
        new Promise(function (_, reject) {
          timeoutId = window.setTimeout(function () {
            timedOut = true;
            reject(new Error("屏幕常亮请求超时"));
          }, WAKE_LOCK_REQUEST_TIMEOUT_MS);
        }),
      ]);
      if (
        timeoutId !== null &&
        typeof window.clearTimeout === "function"
      ) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      wakeLockSentinel = sentinel;
      wakeLockState = "active";
      stopMediaKeepAwake();
      touchRuntime("wake-lock-active");
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
              requestMediaKeepAwake(session.config);
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
      if (
        timeoutId !== null &&
        typeof window.clearTimeout === "function"
      ) {
        window.clearTimeout(timeoutId);
      }
      wakeLockSentinel = null;
      wakeLockState = (await requestMediaKeepAwake(config))
        ? "media"
        : timedOut
          ? "timeout"
          : "denied";
      renderDiagnostics(getSession());
      return wakeLockState === "media";
    } finally {
      wakeLockRequestInFlight = false;
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

      touchRuntime("inter-topic-delay");
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
    session.config = normalizeConfig(session.config || {});
    session.navigation = session.navigation || null;
    session.listContext = session.listContext || null;
    session.pendingCompletion = session.pendingCompletion || null;
    session.likeTopic = session.likeTopic || null;
    if (session.status === "review" && session.reviewTopic) {
      session.status = "liking";
      session.likeTopic = Object.assign({}, session.reviewTopic);
      session.reviewTopic = null;
    }
    ensureRecoveryState(session);
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

  function getRuntimeState() {
    var runtime = loadJSON(localStorage, KEYS.runtime, null);
    return runtime && typeof runtime === "object" ? runtime : null;
  }

  function isRuntimeStalled(runtime, now, staleMs) {
    return Boolean(
      runtime &&
        Number(runtime.heartbeatAt || 0) > 0 &&
        Number(now || Date.now()) - Number(runtime.heartbeatAt || 0) >=
          Math.max(1, Number(staleMs || RUNTIME_STALE_MS))
    );
  }

  function touchRuntime(stage, patch, force) {
    var now = Date.now();
    if (
      !force &&
      now - Number(lastRuntimeHeartbeatAt || 0) <
        RUNTIME_HEARTBEAT_MIN_MS
    ) {
      return getRuntimeState();
    }
    var session = getSession();
    if (!session || session.status === "stopped") {
      return null;
    }
    var existing = getRuntimeState();
    if (
      !existing ||
      Number(existing.sessionCreatedAt || 0) !==
        Number(session.createdAt || 0)
    ) {
      existing = {
        sessionCreatedAt: Number(session.createdAt || 0),
        ownerTabId: getTabId(),
        stage: "booting",
        heartbeatAt: 0,
        lastProgressAt: 0,
        recoveryAttempts: 0,
        lastError: "",
        href: "",
      };
    }
    var runtime = Object.assign({}, existing, patch || {}, {
      sessionCreatedAt: Number(session.createdAt || 0),
      ownerTabId: getTabId(),
      stage: String(stage || existing.stage || "running"),
      heartbeatAt: now,
      href: String(location.href || ""),
    });
    lastRuntimeHeartbeatAt = now;
    saveJSON(localStorage, KEYS.runtime, runtime);
    return runtime;
  }

  function markRuntimeProgress(stage, patch) {
    var runtime = touchRuntime(
      stage,
      Object.assign({}, patch || {}, {
        lastProgressAt: Date.now(),
        recoveryAttempts: 0,
        lastError: "",
      }),
      true
    );
    return runtime;
  }

  function clearRuntimeState() {
    remove(localStorage, KEYS.runtime);
    lastRuntimeHeartbeatAt = 0;
  }

  function clearSession() {
    remove(localStorage, KEYS.session);
    clearRuntimeState();
    releaseLock();
    releaseWakeLock();
  }

  function ensureRecoveryState(session) {
    if (!session) {
      return null;
    }
    session.recovery = Object.assign(
      {
        totalFailures: 0,
        consecutiveFailures: 0,
        topicFailures: {},
        browseFailures: 0,
        lastAction: "",
        lastError: "",
        updatedAt: 0,
      },
      session.recovery || {}
    );
    if (
      !session.recovery.topicFailures ||
      typeof session.recovery.topicFailures !== "object"
    ) {
      session.recovery.topicFailures = {};
    }
    return session.recovery;
  }

  function hasResumableSession(session) {
    return Boolean(
      session &&
        session.status !== "stopped" &&
        (Boolean(session.pendingCompletion) ||
          session.status === "liking" ||
          (Array.isArray(session.queue) &&
            Number(session.index || 0) < session.queue.length))
    );
  }

  function markRecoverySuccess(session, topicId) {
    var recovery = ensureRecoveryState(session);
    if (!recovery) {
      return null;
    }
    recovery.consecutiveFailures = 0;
    recovery.browseFailures = 0;
    if (topicId !== null && topicId !== undefined) {
      delete recovery.topicFailures[String(Number(topicId))];
    }
    recovery.lastAction = "success";
    recovery.lastError = "";
    recovery.updatedAt = Date.now();
    session.error = null;
    markRuntimeProgress("recovery-success", {
      topicId:
        topicId !== null && topicId !== undefined
          ? Number(topicId)
          : null,
    });
    return recovery;
  }

  function moveCurrentTopicToQueueTail(session) {
    if (
      !session ||
      !Array.isArray(session.queue) ||
      !session.queue[session.index]
    ) {
      return null;
    }
    var topic = session.queue.splice(session.index, 1)[0];
    session.queue.push(topic);
    return topic;
  }

  function planTopicFailureRecovery(session, topic, error) {
    var recovery = ensureRecoveryState(session);
    var message = String(
      error && error.message ? error.message : error || "未知阅读错误"
    );
    var topicId = Number((topic || {}).id || 0);
    var key = String(topicId);
    var attempt = Number(recovery.topicFailures[key] || 0) + 1;
    recovery.topicFailures[key] = attempt;
    recovery.totalFailures = Number(recovery.totalFailures || 0) + 1;
    recovery.consecutiveFailures =
      Number(recovery.consecutiveFailures || 0) + 1;
    recovery.lastError = message;
    recovery.updatedAt = Date.now();
    session.error = message;
    session.navigation = null;

    var action;
    if (
      recovery.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
    ) {
      action = {
        type: "pause",
        topicId: topicId,
        attempt: attempt,
        delayMs: 0,
        message: "连续故障达到上限：" + message,
      };
    } else if (attempt <= MAX_TOPIC_AUTO_RETRIES) {
      action = {
        type: "retry-topic",
        topicId: topicId,
        attempt: attempt,
        delayMs: RECOVERY_BACKOFF_BASE_MS * attempt,
        message: message,
      };
    } else if (
      Array.isArray(session.queue) &&
      session.queue.length - Number(session.index || 0) > 1
    ) {
      moveCurrentTopicToQueueTail(session);
      action = {
        type: "next-topic",
        topicId: topicId,
        attempt: attempt,
        delayMs: RECOVERY_BACKOFF_BASE_MS,
        message: message,
      };
    } else {
      action = {
        type: "pause",
        topicId: topicId,
        attempt: attempt,
        delayMs: 0,
        message: "当前主题多次失败且没有其他待处理主题：" + message,
      };
    }

    recovery.lastAction = action.type;
    session.status = action.type === "pause" ? "paused" : "running";
    session.diagnostics = Object.assign({}, session.diagnostics || {}, {
      stage: action.type === "pause" ? "paused" : "recovering",
      retries: attempt,
      lastError: action.message,
      updatedAt: Date.now(),
    });
    saveSession(session);
    return action;
  }

  function planBrowseFailureRecovery(session, error) {
    var recovery = ensureRecoveryState(session);
    var message = String(
      error && error.message ? error.message : error || "列表翻找失败"
    );
    var attempt = Number(recovery.browseFailures || 0) + 1;
    recovery.browseFailures = attempt;
    recovery.totalFailures = Number(recovery.totalFailures || 0) + 1;
    recovery.consecutiveFailures =
      Number(recovery.consecutiveFailures || 0) + 1;
    recovery.lastError = message;
    recovery.updatedAt = Date.now();
    session.error = message;
    session.navigation = null;

    var canRetry =
      attempt <= MAX_BROWSE_AUTO_RETRIES &&
      recovery.consecutiveFailures < MAX_CONSECUTIVE_FAILURES;
    var action = {
      type: canRetry ? "retry-list" : "pause",
      attempt: attempt,
      delayMs: canRetry ? RECOVERY_BACKOFF_BASE_MS * attempt : 0,
      message: canRetry
        ? message
        : "列表连续恢复失败，已停止自动重试：" + message,
    };
    recovery.lastAction = action.type;
    session.status = canRetry ? "running" : "paused";
    session.diagnostics = Object.assign({}, session.diagnostics || {}, {
      stage: canRetry ? "recovering" : "paused",
      retries: attempt,
      lastError: action.message,
      updatedAt: Date.now(),
    });
    saveSession(session);
    return action;
  }

  function appendRecoveryMarker(url) {
    try {
      var parsed = new URL(String(url || location.origin + "/latest"));
      parsed.searchParams.set("linuxdo_flip_recover", String(Date.now()));
      return parsed.toString();
    } catch (error) {
      return location.origin + "/latest?linuxdo_flip_recover=" + Date.now();
    }
  }

  function scheduleRecoveryAction(action) {
    if (!action || action.type === "pause") {
      if (action) {
        setStatus("已安全暂停：" + action.message, true);
      }
      return;
    }

    setStatus(
      action.type === "retry-list"
        ? "列表故障，" +
            Math.ceil(action.delayMs / 1000) +
            " 秒后回到原列表重试…"
        : action.type === "retry-topic"
          ? "当前主题故障，" +
            Math.ceil(action.delayMs / 1000) +
            " 秒后从已核验楼层重试…"
          : "当前主题多次失败，保留进度并移到队尾，继续下一主题…",
      true
    );

    window.setTimeout(function () {
      var session = getSession();
      if (!session || session.status !== "running") {
        return;
      }
      if (action.type === "retry-list") {
        var listUrl =
          (session.listContext || {}).url || location.origin + "/latest";
        var listPath = "";
        try {
          listPath = new URL(listUrl, location.origin).pathname;
        } catch (error) {}
        if (getTopicId(listUrl) || /^\/search/.test(listPath)) {
          listUrl = location.origin + "/latest";
        }
        location.href = appendRecoveryMarker(listUrl);
        return;
      }

      var topic = session.queue[session.index];
      if (!topic) {
        session.status = "paused";
        session.diagnostics = Object.assign(
          {},
          session.diagnostics || {},
          {
            stage: "paused",
            lastError: "恢复时找不到当前主题",
            updatedAt: Date.now(),
          }
        );
        saveSession(session);
        setStatus("已安全暂停：恢复时找不到当前主题。", true);
        return;
      }

      if (action.type === "retry-topic") {
        location.href = appendRecoveryMarker(
          buildResumeUrl(topic, getTopicProgress(topic.id))
        );
        return;
      }

      if (action.type === "next-topic") {
        returnToList(session).then(function (returned) {
          if (!returned) {
            processCurrentTopic();
          }
        });
      }
    }, Math.max(0, Number(action.delayMs) || 0));
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
    var normalized = Object.assign(
      {
        topicId: Number(topicId),
        lastPostNumber: 1,
        highestPostNumber: null,
        accumulatedSeconds: 0,
        completed: false,
        liked: false,
        observedPostNumber: 1,
        verifiedPostNumber: 0,
        verificationStatus: "idle",
        verificationAttempts: 0,
        serverCheckedAt: 0,
        updatedAt: 0,
      },
      progress || {}
    );
    if (
      progress &&
      !Object.prototype.hasOwnProperty.call(
        progress,
        "verifiedPostNumber"
      )
    ) {
      normalized.observedPostNumber = Math.max(
        1,
        Number(progress.lastPostNumber) || 1
      );
      normalized.lastPostNumber = 1;
      normalized.verifiedPostNumber = 0;
      normalized.verificationStatus =
        normalized.observedPostNumber > 1
          ? "legacy-unverified"
          : "idle";
      normalized.completed = false;
    }
    return normalized;
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
      verifying: "核验站点记录",
      recovering: "自动恢复",
      returning: "返回列表",
      review: "旧版点赞审查",
      liking: "自动点赞",
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
    var recovery = ensureRecoveryState(session) || {};
    var runtime = getRuntimeState() || {};
    var wakeLabels = {
      active: "生效",
      waiting: "等待前台",
      unsupported: "浏览器不支持",
      denied: "未获系统许可",
      timeout: "申请超时，自动重试",
      media: "媒体后备常亮",
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
      "连续故障：" +
        Number(recovery.consecutiveFailures || 0) +
        "/" +
        MAX_CONSECUTIVE_FAILURES,
      "点赞：" +
        Number(session.likedCount || 0) +
        "/" +
        Number(session.config.likeTarget || 0) +
        " · 未确认 " +
        Number(session.likeFailureCount || 0),
      "前台阅读：" + (session.config.foregroundOnly ? "开启" : "关闭"),
      "屏幕常亮：" + (wakeLabels[wakeLockState] || wakeLockState),
      "运行心跳：" +
        (runtime.heartbeatAt
          ? Math.max(
              0,
              Math.floor((Date.now() - runtime.heartbeatAt) / 1000)
            ) + " 秒前"
          : "待建立") +
        " · 自愈 " +
        Number(runtime.recoveryAttempts || 0) +
        "/" +
        MAX_RUNTIME_RELOADS,
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
      var verificationLabels = {
        idle: "待核验",
        checking: "核验中",
        verified: "已记录",
        "not-recorded": "未记录",
        unavailable: "无法读取",
        error: "核验失败",
        "legacy-unverified": "旧版未核验",
      };
      parts.push(
        "站点已读：" +
          (verificationLabels[progress.verificationStatus] ||
            progress.verificationStatus ||
            "待核验") +
          (Number(progress.verifiedPostNumber || 0) > 0
            ? " · 第 " + Number(progress.verifiedPostNumber) + " 楼"
            : "")
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
    touchRuntime(
      stage,
      { topicId: session.navigation.topicId },
      true
    );
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
    touchRuntime(
      "error",
      { lastError: String(message || "未知错误") },
      true
    );
  }

  function auditSessionQueue(session) {
    if (!session || !Array.isArray(session.queue)) {
      return { changed: false, removed: 0, skipped: 0 };
    }
    if (session.status === "liking") {
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
    var config = normalizeConfig(stored || {});
    if (
      Number((stored || {}).configRevision || 0) < CONFIG_REVISION
    ) {
      saveJSON(localStorage, KEYS.config, config);
    }
    return config;
  }

  function normalizeConfig(config) {
    config = config || {};
    var needsDefaultMigration =
      Number(config.configRevision || 0) < CONFIG_REVISION;
    config = Object.assign({}, DEFAULT_CONFIG, config);
    return {
      configRevision: CONFIG_REVISION,
      pages: clamp(Math.floor(Number(config.pages) || 1), 1, MAX_PAGES),
      limit: clamp(
        Math.floor(
          Number(
            needsDefaultMigration ? DEFAULT_CONFIG.limit : config.limit
          ) || 1
        ),
        1,
        MAX_TOPICS
      ),
      likeTarget: clamp(
        Math.floor(
          Number(
            needsDefaultMigration
              ? DEFAULT_CONFIG.likeTarget
              : config.likeTarget
          ) || 0
        ),
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
      configRevision: CONFIG_REVISION,
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

  async function fetchJsonWithRetry(url, options) {
    options = options || {};
    var lastError = null;
    for (var attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
      var response;
      touchRuntime("network-request", {
        networkAttempt: attempt + 1,
        networkUrl: String(url || ""),
      }, true);
      var controller =
        window.AbortController &&
        typeof window.AbortController === "function"
          ? new window.AbortController()
          : null;
      var timeoutId = controller
        ? window.setTimeout(function () {
            controller.abort();
          }, FETCH_TIMEOUT_MS)
        : null;
      try {
        response = await fetch(url, {
          credentials: "include",
          headers: { accept: "application/json" },
          signal: controller ? controller.signal : undefined,
          cache: options.noCache ? "no-store" : "default",
        });
        if (response && response.ok) {
          var data = await response.json();
          markRuntimeProgress("network-complete", {
            networkAttempt: attempt + 1,
            networkUrl: String(url || ""),
          });
          return data;
        }
      } catch (error) {
        lastError =
          error && error.name === "AbortError"
            ? new Error("请求超过 20 秒未响应")
            : error;
        response = null;
      } finally {
        if (
          timeoutId !== null &&
          typeof window.clearTimeout === "function"
        ) {
          window.clearTimeout(timeoutId);
        }
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
      await interruptibleSleep(waitMs, function () {
        var session = getSession();
        return Boolean(!session || session.status !== "stopped");
      });
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

  function parseServerReadPostNumber(data) {
    var candidates = [
      { owner: data, key: "last_read_post_number" },
      { owner: data, key: "last_read_post" },
      {
        owner: data && data.details,
        key: "last_read_post_number",
      },
    ];
    for (var index = 0; index < candidates.length; index += 1) {
      var candidate = candidates[index];
      if (
        !candidate.owner ||
        !Object.prototype.hasOwnProperty.call(
          candidate.owner,
          candidate.key
        )
      ) {
        continue;
      }
      var rawValue = candidate.owner[candidate.key];
      if (
        rawValue === null ||
        rawValue === undefined ||
        rawValue === ""
      ) {
        return 0;
      }
      var value = Number(rawValue);
      if (Number.isFinite(value) && value >= 0) {
        return value;
      }
    }
    return null;
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
    var currentUserReaction =
      firstPost && firstPost.current_user_reaction
        ? firstPost.current_user_reaction
        : null;
    var currentUserUsedMainReaction = Boolean(
      firstPost && firstPost.current_user_used_main_reaction
    );
    var highest = Number(
      (data || {}).highest_post_number ||
        (topic || {}).highestPostNumber ||
        stream.length ||
        1
    );

    return {
      highestPostNumber: Math.max(1, highest),
      postsCount: Number((data || {}).posts_count || stream.length || 1),
      firstPostId: firstPost
        ? Number(firstPost.id)
        : Number(stream[0]) || null,
      alreadyLiked: Boolean(
        (likeAction && likeAction.acted) ||
          currentUserReaction ||
          currentUserUsedMainReaction
      ),
      canLike:
        likeAction &&
        Object.prototype.hasOwnProperty.call(likeAction, "can_act")
          ? Boolean(likeAction.can_act)
          : null,
      closed: Boolean((data || {}).closed),
      archived: Boolean((data || {}).archived),
      lastReadPostNumber: parseServerReadPostNumber(data),
    };
  }

  function topicJsonUrl(topic, cacheBust) {
    var url =
      "/t/" +
      encodeURIComponent(topic.slug || "topic") +
      "/" +
      topic.id +
      ".json";
    return cacheBust
      ? url + "?linuxdo_flip_verify=" + encodeURIComponent(cacheBust)
      : url;
  }

  async function fetchTopicAudit(topic) {
    try {
      var data = await fetchJsonWithRetry(
        topicJsonUrl(topic, "baseline-" + Date.now()),
        { noCache: true }
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
          lastReadPostNumber: null,
          warning: error.message,
        };
      }
      throw new Error("主题完成审查失败：" + error.message);
    }
  }

  function resolveVerificationBaseline(
    serverPostNumber,
    verifiedPostNumber
  ) {
    return Math.max(
      0,
      Number(serverPostNumber) || 0,
      Number(verifiedPostNumber) || 0
    );
  }

  function evaluateReadVerification(
    baselinePostNumber,
    observedPostNumber,
    serverPostNumber,
    highestPostNumber
  ) {
    var baseline = Math.max(0, Number(baselinePostNumber) || 0);
    var observed = Math.max(1, Number(observedPostNumber) || 1);
    var highest = Math.max(1, Number(highestPostNumber) || 1);
    if (
      serverPostNumber === null ||
      serverPostNumber === undefined ||
      !Number.isFinite(Number(serverPostNumber))
    ) {
      return {
        supported: false,
        effective: false,
        complete: false,
        baselinePostNumber: baseline,
        observedPostNumber: observed,
        serverPostNumber: null,
      };
    }

    var server = Math.max(0, Number(serverPostNumber) || 0);
    var complete = server >= highest;
    return {
      supported: true,
      effective:
        server > baseline || (complete && observed >= highest),
      complete: complete,
      baselinePostNumber: baseline,
      observedPostNumber: observed,
      serverPostNumber: server,
    };
  }

  async function verifyServerReadProgress(
    topic,
    baselinePostNumber,
    observedPostNumber,
    highestPostNumber
  ) {
    var lastResult = null;
    var lastError = null;
    for (
      var attempt = 1;
      attempt <= READ_VERIFICATION_ATTEMPTS;
      attempt += 1
    ) {
      if (attempt > 1) {
        await sleep(READ_VERIFICATION_WAIT_MS * (attempt - 1));
      }
      try {
        var data = await fetchJsonWithRetry(
          topicJsonUrl(topic, Date.now() + "-" + attempt),
          { noCache: true }
        );
        lastResult = evaluateReadVerification(
          baselinePostNumber,
          observedPostNumber,
          parseServerReadPostNumber(data),
          highestPostNumber
        );
        lastResult.attempts = attempt;
        if (lastResult.supported && lastResult.effective) {
          return lastResult;
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (lastResult) {
      return lastResult;
    }
    throw new Error(
      "站点阅读进度核验请求失败：" +
        (lastError ? lastError.message : "未知错误")
    );
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
    var action = planBrowseFailureRecovery(session, message);
    scheduleRecoveryAction(action);
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
      url: normalizeListUrl(location.href),
      scrollY: Math.max(0, Number(window.scrollY) || 0),
      canHistoryBack: false,
    };
  }

  function isTopicListPath(pathname) {
    var path = String(pathname || "").replace(/\/+$/, "") || "/";
    return Boolean(
      /^\/(?:latest|new|unread|hot|top)$/.test(path) ||
        /^\/c\/[^/]+(?:\/\d+)?$/.test(path) ||
        /^\/tag\/[^/]+(?:\/\d+)?$/.test(path)
    );
  }

  function normalizeListUrl(rawUrl) {
    try {
      var parsed = new URL(String(rawUrl || ""), location.origin);
      if (
        parsed.origin === location.origin &&
        isTopicListPath(parsed.pathname)
      ) {
        return parsed.href;
      }
    } catch (error) {
      // Fall through to the canonical latest list.
    }
    return location.origin + "/latest";
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
      saveTopicProgress(topic.id, {
        observedPostNumber: sitePost,
        verificationStatus: "idle",
      });
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
          " 楼，已核验记录更靠后；切到第 " +
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
    context.url = normalizeListUrl(context.url);
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

    location.href = context.url;
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
    var listUrl = normalizeListUrl(location.href);
    if (listUrl !== location.href) {
      location.href = listUrl;
      return true;
    }
    session.navigation = null;
    session.listContext = {
      url: listUrl,
      scrollY: scrollY,
      canHistoryBack: false,
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

  function getLongTopicReadCap(highestPostNumber) {
    return Number(highestPostNumber || 0) > LONG_TOPIC_THRESHOLD
      ? LONG_TOPIC_READ_CAP
      : null;
  }

  function hasReachedLongTopicCap(
    highestPostNumber,
    observedPostNumber,
    serverPostNumber
  ) {
    var cap = getLongTopicReadCap(highestPostNumber);
    if (!cap) {
      return false;
    }
    return Boolean(
      Number(observedPostNumber || 0) >= cap &&
        Number(serverPostNumber || 0) >=
          cap - LONG_TOPIC_CAP_TOLERANCE
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
    var baselineServerPost = resolveVerificationBaseline(
      audit.lastReadPostNumber,
      progress.verifiedPostNumber
    );
    var observedPostNumber = Math.max(
      1,
      Number(progress.lastPostNumber) || 1
    );
    var longTopicCap = getLongTopicReadCap(audit.highestPostNumber);
    if (
      longTopicCap &&
      Number(baselineServerPost || 0) >=
        longTopicCap - LONG_TOPIC_CAP_TOLERANCE
    ) {
      progress.lastPostNumber = Math.max(
        1,
        Number(baselineServerPost) || 1
      );
      progress.verifiedPostNumber = progress.lastPostNumber;
      progress.highestPostNumber = audit.highestPostNumber;
      progress.verificationStatus = "verified";
      progress.capped = true;
      progress.cappedAtPostNumber = progress.lastPostNumber;
      progress.completed = false;
      progress = saveTopicProgress(topic.id, progress);
      return {
        stopped: false,
        complete: false,
        capped: true,
        progress: progress,
        audit: audit,
      };
    }
    var length = await waitForArticle();
    var speed = sampleReadingSpeed(session.config.charsPerSecond);
    var plan = calculateReadPlan(session.config, length, speed);
    var deadline = Date.now() + plan.seconds * 1000;
    var startedAt = Date.now();
    var bottomPasses = 0;
    var steps = 0;
    var lastHeight = 0;
    var reachedEnd = false;

    progress.highestPostNumber = audit.highestPostNumber;
    progress.verificationStatus = "checking";
    progress.verificationAttempts = 0;
    saveTopicProgress(topic.id, progress);

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
        observedPostNumber = Math.max(
          observedPostNumber,
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
          observedPostNumber +
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
      progress.observedPostNumber = observedPostNumber;
      saveTopicProgress(topic.id, progress);
      markRuntimeProgress("reading", {
        topicId: topic.id,
        observedPostNumber: observedPostNumber,
      });

      if (
        isTopicComplete(
          { lastPostNumber: observedPostNumber },
          audit,
          bottomPasses
        )
      ) {
        reachedEnd = true;
        break;
      }

      if (
        longTopicCap &&
        observedPostNumber >= longTopicCap
      ) {
        break;
      }

      steps += 1;
      if (steps > 400) {
        throw new Error("滚动步骤异常，已停止本轮任务");
      }
    }

    progress.accumulatedSeconds =
      Number(progress.accumulatedSeconds || 0) +
      Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    progress.observedPostNumber = observedPostNumber;
    progress.verificationStatus = "checking";
    progress = saveTopicProgress(topic.id, progress);
    markRuntimeProgress("verifying", {
      topicId: topic.id,
      observedPostNumber: observedPostNumber,
    });

    var currentSession = getSession();
    if (currentSession) {
      currentSession.navigation = Object.assign(
        {},
        currentSession.navigation || {},
        {
          stage: "verifying",
          topicId: topic.id,
          startedAt: Date.now(),
        }
      );
      currentSession.diagnostics = Object.assign(
        {},
        currentSession.diagnostics || {},
        {
          stage: "verifying",
          lastError: "",
          updatedAt: Date.now(),
        }
      );
      saveSession(currentSession);
    }
    setStatus(
      "正在核验站点是否记录阅读进度 · 本页到第 " +
        observedPostNumber +
        " 楼…"
    );

    var verification;
    try {
      verification = await verifyServerReadProgress(
        topic,
        baselineServerPost,
        observedPostNumber,
        audit.highestPostNumber
      );
    } catch (error) {
      saveTopicProgress(topic.id, {
        observedPostNumber: observedPostNumber,
        verificationStatus: "error",
        serverCheckedAt: Date.now(),
      });
      throw error;
    }

    if (!verification.supported) {
      saveTopicProgress(topic.id, {
        observedPostNumber: observedPostNumber,
        verificationStatus: "unavailable",
        verificationAttempts: verification.attempts || 1,
        serverCheckedAt: Date.now(),
      });
      throw new Error(
        "站点没有返回 last_read_post_number，无法确认阅读是否被记录"
      );
    }
    if (!verification.effective) {
      saveTopicProgress(topic.id, {
        observedPostNumber: observedPostNumber,
        verifiedPostNumber: Math.max(
          Number(progress.verifiedPostNumber) || 0,
          Number(verification.serverPostNumber) || 0
        ),
        verificationStatus: "not-recorded",
        verificationAttempts: verification.attempts || 1,
        serverCheckedAt: Date.now(),
      });
      throw new Error(
        "站点阅读进度未增长：服务端仍在第 " +
          verification.serverPostNumber +
          " 楼，本页已到第 " +
          observedPostNumber +
          " 楼"
      );
    }

    progress.lastPostNumber = Math.max(
      1,
      Number(verification.serverPostNumber) || 1
    );
    progress.verifiedPostNumber = progress.lastPostNumber;
    progress.verificationStatus = "verified";
    progress.verificationAttempts = verification.attempts || 1;
    progress.serverCheckedAt = Date.now();
    progress.completed = false;
    progress.capped = hasReachedLongTopicCap(
      audit.highestPostNumber,
      observedPostNumber,
      verification.serverPostNumber
    );
    progress.cappedAtPostNumber = progress.capped
      ? progress.lastPostNumber
      : Number(progress.cappedAtPostNumber || 0);
    progress = saveTopicProgress(topic.id, progress);
    markRuntimeProgress("verified", {
      topicId: topic.id,
      verifiedPostNumber: progress.lastPostNumber,
    });
    return {
      stopped: false,
      complete: Boolean(reachedEnd && verification.complete),
      capped: Boolean(progress.capped),
      progress: progress,
      audit: audit,
      verification: verification,
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
      var existingSession = getSession();
      if (hasResumableSession(existingSession)) {
        setStatus(
          "已有任务正在保留中：" +
            (existingSession.pendingCompletion
              ? "正在补交主题完成状态"
              : formatProgress(existingSession)) +
            "。请继续当前任务，或先停止再新建。",
          true
        );
        return;
      }
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
        likeFailureCount: 0,
        likeTopic: null,
        pendingCompletion: null,
        listContext: null,
        navigation: null,
        recovery: {
          totalFailures: 0,
          consecutiveFailures: 0,
          topicFailures: {},
          browseFailures: 0,
          lastAction: "",
          lastError: "",
          updatedAt: Date.now(),
        },
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
      markRuntimeProgress("session-start", {
        topicId: queue[0].id,
      });
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
    if (session.status === "liking") {
      setStatus("当前正在自动点赞并等待站点确认，请稍候。");
      return;
    }

    if (session.status === "paused") {
      session.status = "running";
      saveSession(session);
      markRuntimeProgress("manual-resume");
      requestWakeLock(session.config);
      document.getElementById(IDS.pause).textContent = "暂停";
      setStatus("继续：" + formatProgress(session));
      processCurrentTopic();
      return;
    }

    session.status = "paused";
    saveSession(session);
    touchRuntime("paused", {}, true);
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
    if (session.status === "liking") {
      setStatus("当前正在自动点赞并等待站点确认，请稍候。");
      return;
    }

    session.status = "running";
    session.error = null;
    session.navigation = null;
    var retryRecovery = ensureRecoveryState(session);
    retryRecovery.consecutiveFailures = 0;
    delete retryRecovery.topicFailures[
      String(Number(session.queue[session.index].id))
    ];
    retryRecovery.lastAction = "manual-retry";
    retryRecovery.lastError = "";
    retryRecovery.updatedAt = Date.now();
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
    if (session.status === "liking") {
      setStatus("当前正在自动点赞并等待站点确认，请稍候。");
      return;
    }

    var skipped = session.queue[session.index];
    session.status = "running";
    session.index += 1;
    session.navigation = null;
    var skipRecovery = ensureRecoveryState(session);
    skipRecovery.consecutiveFailures = 0;
    delete skipRecovery.topicFailures[String(Number(skipped.id))];
    skipRecovery.lastAction = "manual-skip";
    skipRecovery.lastError = "";
    skipRecovery.updatedAt = Date.now();
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

  function getRuntimeRecoveryUrl(session, runtime, attempt) {
    var topic =
      session &&
      Array.isArray(session.queue) &&
      session.queue[session.index]
        ? session.queue[session.index]
        : null;
    if (
      topic &&
      Number(attempt || 0) > 1 &&
      hasReadingProgress(topic.id)
    ) {
      return appendRecoveryMarker(
        buildResumeUrl(topic, getTopicProgress(topic.id))
      );
    }

    var candidate = String(
      (runtime || {}).href || location.href || location.origin + "/latest"
    );
    try {
      var parsed = new URL(candidate, location.origin);
      if (parsed.origin !== location.origin) {
        candidate = location.origin + "/latest";
      }
    } catch (error) {
      candidate = location.origin + "/latest";
    }
    return appendRecoveryMarker(candidate);
  }

  function recoverStalledRuntime(now) {
    var session = getSession();
    if (
      !session ||
      session.status === "stopped" ||
      session.status === "paused" ||
      !shouldRunInForeground(session)
    ) {
      return false;
    }

    var runtime = getRuntimeState();
    if (!runtime) {
      touchRuntime(
        (session.navigation || {}).stage ||
          (session.diagnostics || {}).stage ||
          "booting",
        {},
        true
      );
      return false;
    }
    now = Number(now || Date.now());
    if (!isRuntimeStalled(runtime, now, RUNTIME_STALE_MS)) {
      return false;
    }

    var attempt = Number(runtime.recoveryAttempts || 0) + 1;
    var message =
      "主循环 " +
      Math.max(
        1,
        Math.floor((now - Number(runtime.heartbeatAt || 0)) / 1000)
      ) +
      " 秒无心跳";

    if (attempt > MAX_RUNTIME_RELOADS) {
      runtime.recoveryAttempts = 0;
      runtime.heartbeatAt = now;
      runtime.stage = "watchdog-escalation";
      runtime.lastError = message;
      saveJSON(localStorage, KEYS.runtime, runtime);
      processing = false;
      var topic = session.queue[session.index];
      var action = topic
        ? planTopicFailureRecovery(session, topic, new Error(message))
        : planBrowseFailureRecovery(session, new Error(message));
      scheduleRecoveryAction(action);
      return true;
    }

    runtime.recoveryAttempts = attempt;
    runtime.heartbeatAt = now;
    runtime.stage = "watchdog-reload";
    runtime.lastError = message;
    runtime.href = String(location.href || runtime.href || "");
    saveJSON(localStorage, KEYS.runtime, runtime);
    session.diagnostics = Object.assign({}, session.diagnostics || {}, {
      stage: "recovering",
      retries: attempt,
      lastError:
        message + "，正在执行第 " + attempt + " 次整页自愈",
      updatedAt: now,
    });
    saveSession(session);
    processing = false;
    setStatus(
      message + "，正在从持久化进度恢复（" + attempt + "/" +
        MAX_RUNTIME_RELOADS + "）…",
      true
    );
    location.href = getRuntimeRecoveryUrl(session, runtime, attempt);
    return true;
  }

  function installRuntimeWatchdog() {
    if (runtimeWatchdogTimer) {
      return;
    }
    runtimeWatchdogTimer = window.setInterval(function () {
      recoverStalledRuntime(Date.now());
    }, RUNTIME_WATCHDOG_INTERVAL_MS);
  }

  function installWakeLockKeeper() {
    if (wakeLockTimer) {
      return;
    }
    wakeLockTimer = window.setInterval(function () {
      var session = getSession();
      if (
        !session ||
        session.status === "stopped" ||
        session.status === "paused" ||
        !session.config.keepAwake ||
        !isDocumentVisible()
      ) {
        return;
      }
      if (!wakeLockSentinel || wakeLockSentinel.released) {
        requestWakeLock(session.config);
      }
    }, WAKE_LOCK_RETRY_MS);
  }

  function installPageLoadRecovery() {
    if (pageLoadRecoveryTimer) {
      return;
    }
    pageLoadRecoveryTimer = window.setTimeout(function () {
      pageLoadRecoveryTimer = null;
      var session = getSession();
      if (
        !session ||
        session.status === "stopped" ||
        session.status === "paused" ||
        document.readyState !== "loading"
      ) {
        return;
      }
      var runtime = getRuntimeState();
      if (
        document.body &&
        !isRuntimeStalled(runtime, Date.now(), PAGE_LOAD_RECOVERY_MS)
      ) {
        return;
      }
      if (typeof window.stop === "function") {
        window.stop();
      }
      touchRuntime(
        "page-load-timeout",
        { lastError: "页面加载超过 45 秒" },
        true
      );
      recoverStalledRuntime(
        Date.now() + RUNTIME_STALE_MS
      );
    }, PAGE_LOAD_RECOVERY_MS);
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
      ["list", "browsing-search", "returning"].indexOf(
        navigation.stage
      ) !== -1
    ) {
      var browseMessage =
        stageLabel(navigation.stage) +
        "超时；新主题不会改成明确标题直达";
      var browseAction = planBrowseFailureRecovery(
        session,
        browseMessage
      );
      scheduleRecoveryAction(browseAction);
      return true;
    }
    var retries = Number(navigation.retries || 0) + 1;
    var message =
      stageLabel(navigation.stage) +
      "超时，执行第 " +
      retries +
      " 次恢复";

    if (retries > MAX_NAVIGATION_RECOVERIES) {
      var topicAction = planTopicFailureRecovery(
        session,
        topic,
        new Error(message)
      );
      scheduleRecoveryAction(topicAction);
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

  function shouldAutoLikeTopic(session, topic, audit) {
    var target = Number(session.config.likeTarget || 0);
    if (
      target <= 0 ||
      Number(session.likedCount || 0) >= target ||
      topic.pinned ||
      audit.alreadyLiked ||
      audit.canLike === false ||
      audit.archived
    ) {
      return false;
    }

    var desiredLikesByNow = Math.min(
      target,
      Math.floor(
        (Number(session.completed || 0) * target) /
          Math.max(1, Number(session.config.limit || 1))
      )
    );
    return Number(session.likedCount || 0) < desiredLikesByNow;
  }

  function prepareTopicCompletion(session, topic, result) {
    var completedNumber = Number(session.completed || 0) + 1;
    var projectedSession = Object.assign({}, session, {
      completed: completedNumber,
    });
    var shouldAutoLike = shouldAutoLikeTopic(
      projectedSession,
      topic,
      result.audit
    );
    session.pendingCompletion = {
      topicId: Number(topic.id),
      queueIndex: Number(session.index || 0),
      completedNumber: completedNumber,
      highestPostNumber: Number(result.audit.highestPostNumber || 1),
      verifiedPostNumber: Number(result.progress.lastPostNumber || 1),
      shouldAutoLike: shouldAutoLike,
      title: topic.title,
      slug: topic.slug,
      firstPostId: result.audit.firstPostId,
      preparedAt: Date.now(),
    };
    saveSession(session);
    return session.pendingCompletion;
  }

  function resolvePostCompletionIndex(session, topicId) {
    var queue = Array.isArray((session || {}).queue)
      ? session.queue
      : [];
    var topicIndex = queue.findIndex(function (topic) {
      return Number((topic || {}).id) === Number(topicId);
    });
    if (topicIndex >= 0) {
      return topicIndex + 1;
    }
    return clamp(
      Number((session || {}).index) || 0,
      0,
      queue.length
    );
  }

  function finalizePendingCompletion(session) {
    if (!session || !session.pendingCompletion) {
      return session;
    }
    var pending = session.pendingCompletion;
    var topicId = Number(pending.topicId);
    saveTopicProgress(topicId, {
      lastPostNumber: Math.max(
        1,
        Number(pending.verifiedPostNumber) || 1
      ),
      verifiedPostNumber: Math.max(
        1,
        Number(pending.verifiedPostNumber) || 1
      ),
      highestPostNumber: Math.max(
        1,
        Number(pending.highestPostNumber) || 1
      ),
      verificationStatus: "verified",
      completed: true,
    });
    markVisited(topicId);
    session.completed = Math.max(
      Number(session.completed || 0),
      Number(pending.completedNumber || 0)
    );
    session.navigation = null;

    if (pending.shouldAutoLike || pending.shouldReview) {
      var nextIndex = resolvePostCompletionIndex(session, topicId);
      session.status = "liking";
      session.likeTopic = {
        id: topicId,
        title: pending.title,
        slug: pending.slug,
        firstPostId: pending.firstPostId,
        nextIndex: nextIndex,
      };
      session.diagnostics = Object.assign(
        {},
        session.diagnostics || {},
        {
          stage: "liking",
          retries: 0,
          lastError: "",
          updatedAt: Date.now(),
        }
      );
    } else {
      session.status = "running";
      session.likeTopic = null;
      session.index = resolvePostCompletionIndex(session, topicId);
      session.diagnostics = Object.assign(
        {},
        session.diagnostics || {},
        {
          stage: "idle",
          retries: 0,
          lastError: "",
          updatedAt: Date.now(),
        }
      );
    }

    session.pendingCompletion = null;
    saveSession(session);
    return session;
  }

  function finalizeCappedLongTopic(session, topic, result) {
    if (!session || !topic || !result || !result.capped) {
      return session;
    }
    saveTopicProgress(topic.id, {
      lastPostNumber: Number(result.progress.lastPostNumber || 1),
      verifiedPostNumber: Number(result.progress.lastPostNumber || 1),
      highestPostNumber: Number(result.audit.highestPostNumber || 1),
      verificationStatus: "verified",
      completed: false,
      capped: true,
      cappedAtPostNumber: Number(result.progress.lastPostNumber || 1),
    });
    markVisited(topic.id);
    session.completed = Number(session.completed || 0) + 1;
    session.status = "running";
    session.navigation = null;
    session.index = resolvePostCompletionIndex(session, topic.id);
    session.diagnostics = Object.assign({}, session.diagnostics || {}, {
      stage: "idle",
      retries: 0,
      lastError: "",
      updatedAt: Date.now(),
    });
    saveSession(session);
    return session;
  }

  function findFirstPostLikeButton() {
    var selectors = [
      '#post_1 button.btn-toggle-reaction-like',
      '#post_1 .discourse-reactions-reaction-button button.reaction-button',
      '#post_1 button.reaction-button',
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
        /取消.*(?:赞|回应|反应)|移除.*(?:赞|回应|反应)|unlike|remove (?:your )?(?:like|reaction)/.test(
          label
        )
    );
  }

  function parseLikeActionConfirmation(data) {
    var payload = data && data.result ? data.result : data;
    var actions = Array.isArray(payload)
      ? payload
      : Array.isArray((payload || {}).actions_summary)
        ? payload.actions_summary
        : [];
    var likeAction = actions.find(function (action) {
      return Number((action || {}).id) === 2;
    });
    return Boolean(
      (likeAction && likeAction.acted) ||
        (payload || {}).current_user_reaction ||
        (payload || {}).current_user_used_main_reaction
    );
  }

  function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? String(meta.getAttribute("content") || "") : "";
  }

  async function submitPostLike(postId) {
    var id = Number(postId || 0);
    if (!id) {
      throw new Error("主题首帖 ID 缺失");
    }
    var csrfToken = getCsrfToken();
    if (!csrfToken) {
      throw new Error("页面没有登录动作令牌，请确认当前账号仍处于登录状态");
    }

    var response = await fetch("/post_actions", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-CSRF-Token": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
      },
      body:
        "id=" +
        encodeURIComponent(id) +
        "&post_action_type_id=2",
    });
    var data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }
    if (!response.ok) {
      var errors = Array.isArray(data.errors)
        ? data.errors.join("；")
        : String(data.error || data.message || "");
      throw new Error(
        "站内点赞接口返回 " +
          response.status +
          (errors ? "：" + errors : "")
      );
    }
    return parseLikeActionConfirmation(data);
  }

  async function waitForLikeConfirmation(topic, button) {
    var deadline = Date.now() + LIKE_CONFIRM_TIMEOUT_MS;
    var currentButton = button;
    while (Date.now() < deadline) {
      if (isLikeButtonActive(currentButton)) {
        return true;
      }
      await sleep(350);
      currentButton = findFirstPostLikeButton() || currentButton;
    }

    try {
      var audit = await fetchTopicAudit(topic);
      return Boolean(audit.alreadyLiked);
    } catch (error) {
      return false;
    }
  }

  function finishAutoLikeAndAdvance(session, errorMessage) {
    var nextIndex =
      session.likeTopic &&
      Number.isFinite(Number(session.likeTopic.nextIndex))
        ? Number(session.likeTopic.nextIndex)
        : Number(session.index || 0) + 1;
    session.status = "running";
    session.likeTopic = null;
    session.reviewTopic = null;
    session.index = clamp(nextIndex, 0, session.queue.length);
    session.diagnostics = Object.assign(
      {},
      session.diagnostics || {},
      {
        stage: "idle",
        retries: 0,
        lastError: String(errorMessage || ""),
        updatedAt: Date.now(),
      }
    );
    if (session.index >= session.queue.length) {
      var context = session.listContext;
      clearSession();
      setStatus(
        "本轮完成：读完 " +
          session.completed +
          " 个主题，确认点赞 " +
          session.likedCount +
          " 个，未确认 " +
          Number(session.likeFailureCount || 0) +
          " 次。"
      );
      if (
        session.config.navigationMode === "native" &&
        context &&
        getTopicId(location.pathname)
      ) {
        location.href = normalizeListUrl(context.url);
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

  function recordAutoLikeFailure(session, message) {
    session.likeFailureCount =
      Number(session.likeFailureCount || 0) + 1;
    setStatus(
      "自动点赞未获站点确认，未计数并继续：" + message,
      true
    );
    finishAutoLikeAndAdvance(session, message);
  }

  async function autoLikeAndContinue() {
    var session = getSession();
    if (!session || session.status !== "liking" || !session.likeTopic) {
      return;
    }
    if (likeSubmitting) {
      return;
    }

    if (getTopicId(location.pathname) !== Number(session.likeTopic.id)) {
      var resumeTopic = normalizeTopic(session.likeTopic);
      setNavigationState(session, "opening", {
        topicId: resumeTopic.id,
        retries: 0,
        lastError: "",
        source: "automatic-like-resume",
      });
      setStatus("恢复待完成的自动点赞：" + resumeTopic.title);
      location.href = resumeTopic.url;
      return;
    }

    likeSubmitting = true;
    try {
      var button = await waitForFirstPostLikeButton();
      session = getSession();
      if (!session || session.status !== "liking" || !session.likeTopic) {
        return;
      }
      if (button && isLikeButtonActive(button)) {
        session.likedCount = Math.min(
          Number(session.config.likeTarget || 0),
          Number(session.likedCount || 0) + 1
        );
        saveTopicProgress(session.likeTopic.id, { liked: true });
        setStatus(
          "站点已确认点赞 " +
            session.likedCount +
            "/" +
            session.config.likeTarget +
            "，继续下一主题。"
        );
        finishAutoLikeAndAdvance(session);
        return;
      }

      var topic = normalizeTopic(session.likeTopic);
      var confirmed = await submitPostLike(session.likeTopic.firstPostId);
      if (!confirmed) {
        confirmed = await waitForLikeConfirmation(topic, button);
      }
      session = getSession();
      if (!session || session.status !== "liking" || !session.likeTopic) {
        return;
      }
      if (!confirmed) {
        recordAutoLikeFailure(
          session,
          "点赞点击后未得到站点确认"
        );
        return;
      }

      session.likedCount = Math.min(
        Number(session.config.likeTarget || 0),
        Number(session.likedCount || 0) + 1
      );
      saveTopicProgress(session.likeTopic.id, { liked: true });
      setStatus(
        "站点已确认点赞 " +
          session.likedCount +
          "/" +
          session.config.likeTarget +
          "，继续下一主题。"
      );
      finishAutoLikeAndAdvance(session);
    } catch (error) {
      session = getSession();
      if (session && session.status === "liking" && session.likeTopic) {
        recordAutoLikeFailure(
          session,
          "自动点赞异常：" + String(error.message || error)
        );
      }
    } finally {
      likeSubmitting = false;
    }
  }

  async function processCurrentTopicImpl() {
    if (processing) {
      return;
    }

    var session = getSession();
    if (!session || session.status === "stopped") {
      return;
    }
    touchRuntime("runner-start", {}, true);
    if (session.pendingCompletion) {
      finalizePendingCompletion(session);
      session = getSession();
      if (!session) {
        return;
      }
    }
    if (session.status !== "liking") {
      auditSessionQueue(session);
      session = getSession();
      if (!session) {
        return;
      }
    }
    if (session.status === "liking") {
      session.diagnostics = Object.assign({}, session.diagnostics || {}, {
        stage: "liking",
        updatedAt: Date.now(),
      });
      saveSession(session);
      setStatus(
        "自动点赞中：" +
          session.likeTopic.title +
          " · 已确认 " +
          session.likedCount +
          "/" +
          session.config.likeTarget
      );
      await autoLikeAndContinue();
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
    var recoveryAction = null;
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
      markRecoverySuccess(session, topic.id);

      if (result.capped) {
        session = finalizeCappedLongTopic(session, topic, result);
        setStatus(
          "超长话题已按规则读到站点确认的第 " +
            result.progress.lastPostNumber +
            "/" +
            result.audit.highestPostNumber +
            " 楼；不点赞，进入下一主题。"
        );
      } else if (result.complete) {
        prepareTopicCompletion(session, topic, result);
        session = finalizePendingCompletion(getSession());
        if (session.status === "liking") {
          setStatus(
            "站点已记录到第 " +
              result.audit.highestPostNumber +
              " 楼，开始自动点赞：" +
              topic.title
          );
          window.setTimeout(autoLikeAndContinue, 0);
          return;
        }
      } else {
        moveCurrentTopicToQueueTail(session);
        setStatus(
          "长帖本段结束，站点已记录到第 " +
            result.progress.lastPostNumber +
            "/" +
            result.audit.highestPostNumber +
            " 楼；稍后从这里续读。"
        );
      }

      if (session.index >= session.queue.length) {
        var completedListUrl = normalizeListUrl(
          (session.listContext || {}).url
        );
        clearSession();
        setStatus(
          "本轮完成：读完 " +
            session.completed +
            " 个主题，确认点赞 " +
            session.likedCount +
            " 个，未确认 " +
            Number(session.likeFailureCount || 0) +
            " 次。"
        );
        await sleep(1200);
        location.href = completedListUrl;
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
        recoveryAction = planTopicFailureRecovery(
          failed,
          topic,
          error
        );
      } else {
        setStatus("任务状态已丢失：" + error.message, true);
      }
    } finally {
      processing = false;
      if (recoveryAction) {
        scheduleRecoveryAction(recoveryAction);
      }
    }
  }

  function processCurrentTopic() {
    return Promise.resolve()
      .then(processCurrentTopicImpl)
      .catch(function (error) {
        processing = false;
        var message =
          "运行器异常：" +
          String(error && error.message ? error.message : error);
        var session = getSession();
        touchRuntime("runner-error", { lastError: message }, true);
        if (!session || session.status === "stopped") {
          setStatus(message, true);
          return;
        }
        if (session.status === "liking" && session.likeTopic) {
          recordAutoLikeFailure(session, message);
          return;
        }
        var topic = session.queue[session.index];
        var action = topic
          ? planTopicFailureRecovery(session, topic, new Error(message))
          : planBrowseFailureRecovery(session, new Error(message));
        scheduleRecoveryAction(action);
      });
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
      field("本轮话题", IDS.limit, "number", "150"),
      field("点赞目标", IDS.likeTarget, "number", "25"),
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
      "</div>",
      '<p class="ldf-note">原生导航先翻主题列表，遇到第一个合格未读话题就点击；列表没有时再做宽泛搜索。只有未完成长帖续读才按明确主题恢复。站点核验确认的是 Discourse 已读楼层，不等同于 XP 已结算。</p>',
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
      return;
    }
    if (session.status === "liking") {
      setStatus(
        "自动点赞中：" +
          session.likeTopic.title +
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
    if (booted) {
      return;
    }
    if (!document.body) {
      window.setTimeout(boot, 100);
      return;
    }
    booted = true;
    buildPanel();
    installRouteWatcher();
    installRuntimeWatchdog();
    installWakeLockKeeper();
    installPageLoadRecovery();
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
    window.addEventListener("online", function () {
      var session = getSession();
      if (!session || session.status === "stopped") {
        return;
      }
      markRuntimeProgress("network-online");
      requestWakeLock(session.config);
      processCurrentTopic();
    });
    window.addEventListener("offline", function () {
      var session = getSession();
      if (!session || session.status === "stopped") {
        return;
      }
      touchRuntime(
        "network-offline",
        { lastError: "设备网络已断开，等待恢复" },
        true
      );
      setStatus("网络已断开，进度已保存；联网后自动继续。", true);
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
      fetchJsonWithRetry: fetchJsonWithRetry,
      buildSearchQuery: buildSearchQuery,
      buildBrowseSearchQuery: buildBrowseSearchQuery,
      findExactSearchTopic: findExactSearchTopic,
      searchExactTopic: searchExactTopic,
      chooseBrowsableQueueIndex: chooseBrowsableQueueIndex,
      promoteQueueTopic: promoteQueueTopic,
      hasReadingProgress: hasReadingProgress,
      parseServerReadPostNumber: parseServerReadPostNumber,
      parseTopicAudit: parseTopicAudit,
      resolveVerificationBaseline: resolveVerificationBaseline,
      evaluateReadVerification: evaluateReadVerification,
      verifyServerReadProgress: verifyServerReadProgress,
      buildResumeUrl: buildResumeUrl,
      resolveResumePost: resolveResumePost,
      getLongTopicReadCap: getLongTopicReadCap,
      hasReachedLongTopicCap: hasReachedLongTopicCap,
      isTopicListPath: isTopicListPath,
      normalizeListUrl: normalizeListUrl,
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
      shouldAutoLikeTopic: shouldAutoLikeTopic,
      prepareTopicCompletion: prepareTopicCompletion,
      resolvePostCompletionIndex: resolvePostCompletionIndex,
      finalizePendingCompletion: finalizePendingCompletion,
      finalizeCappedLongTopic: finalizeCappedLongTopic,
      stageLabel: stageLabel,
      auditSessionQueue: auditSessionQueue,
      ensureRecoveryState: ensureRecoveryState,
      hasResumableSession: hasResumableSession,
      markRecoverySuccess: markRecoverySuccess,
      moveCurrentTopicToQueueTail: moveCurrentTopicToQueueTail,
      planTopicFailureRecovery: planTopicFailureRecovery,
      planBrowseFailureRecovery: planBrowseFailureRecovery,
      recoverStalledNavigation: recoverStalledNavigation,
      getSession: getSession,
      saveSession: saveSession,
      clearSession: clearSession,
      isLikeButtonActive: isLikeButtonActive,
      parseLikeActionConfirmation: parseLikeActionConfirmation,
      submitPostLike: submitPostLike,
      waitForLikeConfirmation: waitForLikeConfirmation,
      getRuntimeState: getRuntimeState,
      isRuntimeStalled: isRuntimeStalled,
      touchRuntime: touchRuntime,
      markRuntimeProgress: markRuntimeProgress,
      getRuntimeRecoveryUrl: getRuntimeRecoveryUrl,
      recoverStalledRuntime: recoverStalledRuntime,
    };
    return;
  }

  function startEarlyRuntime() {
    installRuntimeWatchdog();
    installWakeLockKeeper();
    installPageLoadRecovery();
    var session = getSession();
    if (
      session &&
      session.status !== "stopped" &&
      session.status !== "paused"
    ) {
      touchRuntime(
        (session.navigation || {}).stage ||
          (session.diagnostics || {}).stage ||
          "document-start",
        {},
        true
      );
      requestWakeLock(session.config);
    }
  }

  function bootWhenReady() {
    if (document.body) {
      boot();
      return;
    }
    window.setTimeout(bootWhenReady, 100);
  }

  startEarlyRuntime();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootWhenReady, {
      once: true,
    });
    window.setTimeout(bootWhenReady, 500);
  } else {
    bootWhenReady();
  }
})();

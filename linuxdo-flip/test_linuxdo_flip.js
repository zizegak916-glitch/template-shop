const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const scriptPath = path.join(__dirname, "linuxdo_flip.user.js");
const source = fs.readFileSync(scriptPath, "utf8");

class StorageMock {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

function topicBatch(page) {
  const topics = [];
  const first = page * 40 + 1;
  for (let index = 0; index < 40; index += 1) {
    const id = first + index;
    topics.push({
      id,
      slug: `topic-${id}`,
      title: id % 7 === 0 ? `交易帖 ${id}` : `AI 开发帖 ${id}`,
      pinned: id % 19 === 0,
      category_id: id % 2 === 0 ? 5 : 8,
    });
  }
  return topics;
}

function createEnvironment(options = {}) {
  const localStorage = options.localStorage || new StorageMock();
  const sessionStorage = options.sessionStorage || new StorageMock();
  const calls = [];
  const postActionRequests = [];
  const wakeLockRequests = [];
  const mediaPlayCalls = [];
  const slowJsonAttempts = [];
  let fakeNow = 1_000_000;
  let retry429 = Boolean(options.retry429);
  let releaseListener = null;

  const location = {
    origin: "https://linux.do",
    pathname: "/latest",
    href: "https://linux.do/latest",
  };

  const body = {
    scrollHeight: 5000,
    appendChild(node) {
      node.parentNode = body;
    },
    removeChild(node) {
      if (node) node.parentNode = null;
    },
  };

  const document = {
    readyState: "complete",
    visibilityState: options.hidden ? "hidden" : "visible",
    documentElement: { scrollHeight: 5000 },
    body,
    createElement:
      options.mediaKeepAwakeSupported === true
        ? function (tagName) {
            assert.strictEqual(tagName, "video");
            return {
              paused: true,
              parentNode: null,
              style: {},
              setAttribute() {},
              async play() {
                this.paused = false;
                mediaPlayCalls.push("play");
              },
              pause() {
                this.paused = true;
              },
            };
          }
        : undefined,
    getElementById() {
      return null;
    },
    querySelector(selector) {
      if (
        selector === 'meta[name="csrf-token"]' &&
        options.csrfToken !== null
      ) {
        return {
          getAttribute(name) {
            return name === "content"
              ? String(options.csrfToken || "test-csrf-token")
              : "";
          },
        };
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
  };

  const math = Object.create(Math);
  math.random = () => 0.5;

  const window = {
    __LINUXDO_FLIP_TEST__: true,
    location,
    localStorage,
    sessionStorage,
    innerWidth: 1280,
    innerHeight: 800,
    scrollY: 0,
    setTimeout(callback, ms) {
      fakeNow += Number(ms || 0);
      callback();
      return 1;
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    scrollBy() {},
    navigator:
      options.wakeLockSupported === false
        ? {}
        : {
            wakeLock: {
              async request(type) {
                wakeLockRequests.push(type);
                return {
                  released: false,
                  addEventListener(event, listener) {
                    if (event === "release") {
                      releaseListener = listener;
                    }
                  },
                  async release() {
                    this.released = true;
                    if (releaseListener) {
                      releaseListener();
                    }
                  },
                };
              },
            },
          },
  };
  if (options.abortController === true) {
    window.AbortController = class AbortControllerMock {
      constructor() {
        const listeners = [];
        this.signal = {
          aborted: false,
          addEventListener(event, listener) {
            if (event === "abort") listeners.push(listener);
          },
        };
        this.listeners = listeners;
      }

      abort() {
        this.signal.aborted = true;
        this.listeners.forEach((listener) => listener());
      }
    };
  }

  async function fetch(url, requestOptions = {}) {
    calls.push(String(url));

    if (String(url) === "/slow-json.json" && options.slowJson === true) {
      slowJsonAttempts.push(String(url));
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          if (requestOptions.signal && requestOptions.signal.aborted) {
            const error = new Error("aborted while reading JSON");
            error.name = "AbortError";
            throw error;
          }
          return new Promise((resolve, reject) => {
            requestOptions.signal.addEventListener("abort", () => {
              const error = new Error("aborted while reading JSON");
              error.name = "AbortError";
              reject(error);
            });
          });
        },
      };
    }

    if (String(url) === "/post_actions") {
      postActionRequests.push(requestOptions);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return {
            result: [
              {
                id: 2,
                acted: true,
                can_act: false,
                can_undo: true,
              },
            ],
          };
        },
      };
    }

    if (String(url) === "/categories.json") {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return {
            category_list: {
              categories: [
                { id: 5, slug: "development", name: "开发调优" },
                { id: 8, slug: "market", name: "交易市场" },
              ],
            },
          };
        },
      };
    }

    if (retry429) {
      retry429 = false;
      return {
        ok: false,
        status: 429,
        headers: { get: () => "1" },
        async json() {
          return {};
        },
      };
    }

    const parsed = new URL(String(url), location.origin);
    if (parsed.pathname === "/search.json") {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return {
            topics: [
              {
                id: 42,
                slug: "exact-search-result",
                title: "精确搜索结果",
                category_id: 5,
              },
              {
                id: 420,
                slug: "similar-search-result",
                title: "相似但错误的搜索结果",
                category_id: 5,
              },
            ],
            posts: [{ id: 9001, topic_id: 42 }],
          };
        },
      };
    }
    const page = Number(parsed.searchParams.get("page") || 0);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() {
        return {
          topic_list: {
            topics: page < 6 ? topicBatch(page) : [],
          },
        };
      },
    };
  }

  window.fetch = fetch;

  const context = {
    window,
    document,
    location,
    localStorage,
    sessionStorage,
    fetch,
    console,
    Math: math,
    JSON,
    Promise,
    URL,
    Array,
    Set,
    String,
    Number,
    Boolean,
    Object,
    Date: {
      now() {
        return fakeNow;
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: scriptPath });
  return {
    api: window.__linuxdoFlipTest,
    calls,
    localStorage,
    sessionStorage,
    document,
    window,
    wakeLockRequests,
    mediaPlayCalls,
    slowJsonAttempts,
    postActionRequests,
  };
}

async function run() {
  const env = createEnvironment();
  const api = env.api;

  assert(api, "test API should be exposed");
  assert(
    source.includes("// @run-at       document-start"),
    "the runner must start before a slow page reaches document-idle"
  );
  assert(
    source.includes("// @version      1.10.0"),
    "the watchdog release should publish a new userscript version"
  );
  assert.deepStrictEqual(
    Array.from(api.parseList(" AI，VPS\n开发 ")),
    ["ai", "vps", "开发"]
  );
  assert.strictEqual(api.textLength(" 你 好\nLinux.do "), 10);
  assert.strictEqual(api.getTopicId("/t/hello/123/4"), 123);
  assert.strictEqual(api.getTopicId("/t/hello/123/last"), 123);
  assert.strictEqual(api.getTopicId("/t/123"), 123);
  assert.strictEqual(api.getTopicId("/latest"), null);
  assert.strictEqual(
    api.buildSearchQuery({ title: '  “Linux.do”   搜索 "能力"  ' }),
    "Linux.do 搜索 能力"
  );
  assert.strictEqual(
    api.buildBrowseSearchQuery({
      includeKeywords: ["AI", "VPS", "开发", "第四项"],
    }),
    "AI VPS 开发"
  );
  assert.strictEqual(
    api.buildBrowseSearchQuery({ includeKeywords: [] }),
    "order:latest"
  );
  assert.strictEqual(
    api.findExactSearchTopic(
      {
        topics: [
          { id: 420, slug: "wrong", title: "相似结果" },
          { id: 42, slug: "right", title: "精确结果" },
        ],
      },
      42
    ).id,
    42
  );
  assert.strictEqual(
    api.findExactSearchTopic(
      { topics: [{ id: 420, slug: "wrong", title: "相似结果" }] },
      42
    ),
    null
  );
  const searchResult = await api.searchExactTopic({
    id: 42,
    title: "精确搜索结果",
  });
  assert.strictEqual(searchResult.match.id, 42);
  assert(
    env.calls.some((url) =>
      url.startsWith("/search.json?q=")
    ),
    "site search should use the Discourse search endpoint"
  );

  assert.strictEqual(
    api.titleMatches("AI 开发工具", ["ai"], ["交易"]),
    true
  );
  assert.strictEqual(
    api.titleMatches("AI 交易工具", ["ai"], ["交易"]),
    false
  );

  const config = api.normalizeConfig({
    configRevision: api.DEFAULT_CONFIG.configRevision,
    pages: 1,
    limit: 180,
    likeTarget: 30,
    minSeconds: 12,
    maxSeconds: 90,
    charsPerSecond: 10,
    includePinned: false,
    includeKeywords: ["ai"],
    excludeKeywords: ["交易"],
    categories: [],
    navigationMode: "native",
  });
  assert.strictEqual(config.navigationMode, "native");
  assert.strictEqual(api.DEFAULT_CONFIG.limit, 150);
  assert.strictEqual(api.DEFAULT_CONFIG.likeTarget, 25);
  const migratedDefaults = api.normalizeConfig({
    limit: 180,
    likeTarget: 30,
  });
  assert.strictEqual(migratedDefaults.limit, 150);
  assert.strictEqual(migratedDefaults.likeTarget, 25);
  assert.strictEqual(
    migratedDefaults.configRevision,
    api.DEFAULT_CONFIG.configRevision
  );
  assert.strictEqual(config.interTopicMinSeconds, 2);
  assert.strictEqual(config.interTopicMaxSeconds, 6);
  assert.strictEqual(config.foregroundOnly, true);
  assert.strictEqual(config.keepAwake, true);
  assert.strictEqual(api.calculateInterTopicDelay(config), 4000);
  assert.strictEqual(
    api.normalizeListUrl("https://linux.do/"),
    "https://linux.do/latest"
  );
  assert.strictEqual(
    api.normalizeListUrl("https://linux.do/u/test"),
    "https://linux.do/latest"
  );
  assert.strictEqual(
    api.normalizeListUrl("https://linux.do/c/develop/4"),
    "https://linux.do/c/develop/4"
  );
  assert.strictEqual(api.isTopicListPath("/latest"), true);
  assert.strictEqual(api.isTopicListPath("/t/topic/123"), false);
  assert.strictEqual(
    api.hasResumableSession({
      status: "running",
      queue: [{ id: 1 }],
      index: 0,
    }),
    true
  );
  assert.strictEqual(
    api.hasResumableSession({
      status: "running",
      queue: [{ id: 1 }],
      index: 1,
    }),
    false
  );
  assert.strictEqual(
    api.hasResumableSession({
      status: "running",
      queue: [],
      index: 0,
      pendingCompletion: { topicId: 1 },
    }),
    true
  );
  const browseSession = {
    version: api.VERSION,
    status: "running",
    queue: [
      { id: 901, title: "第一个" },
      { id: 902, title: "第二个" },
      { id: 903, title: "列表先遇到的第三个" },
    ],
    index: 0,
    config,
  };
  assert.strictEqual(
    api.chooseBrowsableQueueIndex(browseSession, [903, 901]),
    2,
    "native browsing should select the first eligible topic encountered in the list"
  );
  assert.strictEqual(api.promoteQueueTopic(browseSession, 2).id, 903);
  assert.deepStrictEqual(
    Array.from(browseSession.queue, (topic) => topic.id),
    [903, 902, 901]
  );
  const rotationSession = {
    queue: [
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ],
    index: 1,
  };
  api.moveCurrentTopicToQueueTail(rotationSession);
  assert.deepStrictEqual(
    Array.from(rotationSession.queue, (topic) => topic.id),
    [1, 3, 2],
    "repeatedly failing topics should rotate without growing the queue"
  );
  assert.strictEqual(rotationSession.queue.length, 3);
  const activeLikeButton = {
    className: "",
    getAttribute(name) {
      return name === "aria-pressed" ? "true" : "";
    },
  };
  assert.strictEqual(api.isLikeButtonActive(activeLikeButton), true);
  const activeReactionButton = {
    className: "btn-toggle-reaction-like reaction-button",
    getAttribute(name) {
      return name === "title" ? "Remove your reaction" : "";
    },
  };
  assert.strictEqual(api.isLikeButtonActive(activeReactionButton), true);
  assert.strictEqual(
    api.parseLikeActionConfirmation({
      result: [{ id: 2, acted: true }],
    }),
    true
  );
  assert.strictEqual(await api.submitPostLike(7001), true);
  assert.strictEqual(env.postActionRequests.length, 1);
  assert.strictEqual(
    env.postActionRequests[0].headers["X-CSRF-Token"],
    "test-csrf-token"
  );
  assert.strictEqual(
    await api.waitForLikeConfirmation(
      { id: 1, slug: "one" },
      activeLikeButton
    ),
    true
  );
  api.clearSession();
  assert.deepStrictEqual(
    Object.assign({}, api.calculatePanelSize(300, 500, 1, 500, 700)),
    { width: 340, height: 560 }
  );
  assert.deepStrictEqual(
    Object.assign({}, api.calculatePanelSize(300, 500, -1, 500, 700)),
    { width: 260, height: 440 }
  );
  assert.deepStrictEqual(
    Object.assign({}, api.calculatePanelSize(240, 260, -1, 500, 700)),
    { width: 240, height: 260 }
  );
  assert.deepStrictEqual(
    Object.assign({}, api.calculatePanelSize(490, 690, 1, 500, 700)),
    { width: 500, height: 700 }
  );
  assert.strictEqual(
    api.normalizeConfig({ ...config, navigationMode: "direct" }).navigationMode,
    "direct"
  );
  assert.strictEqual(await api.requestWakeLock(config), true);
  assert.deepStrictEqual(env.wakeLockRequests, ["screen"]);
  assert.strictEqual(api.getWakeLockState(), "active");
  api.releaseWakeLock();
  await Promise.resolve();
  assert.strictEqual(api.getWakeLockState(), "idle");

  const hiddenEnv = createEnvironment({ hidden: true });
  assert.strictEqual(
    hiddenEnv.api.shouldRunInForeground({
      config: { foregroundOnly: true },
    }),
    false
  );
  assert.strictEqual(
    await hiddenEnv.api.requestWakeLock(hiddenEnv.api.DEFAULT_CONFIG),
    false
  );
  assert.strictEqual(hiddenEnv.api.getWakeLockState(), "waiting");

  const unsupportedWakeEnv = createEnvironment({
    wakeLockSupported: false,
  });
  assert.strictEqual(
    await unsupportedWakeEnv.api.requestWakeLock(
      unsupportedWakeEnv.api.DEFAULT_CONFIG
    ),
    false
  );
  assert.strictEqual(
    unsupportedWakeEnv.api.getWakeLockState(),
    "unsupported"
  );

  const fallbackWakeEnv = createEnvironment({
    wakeLockSupported: false,
    mediaKeepAwakeSupported: true,
  });
  assert.strictEqual(
    await fallbackWakeEnv.api.requestWakeLock(
      fallbackWakeEnv.api.DEFAULT_CONFIG
    ),
    true
  );
  assert.strictEqual(
    fallbackWakeEnv.api.getWakeLockState(),
    "media"
  );
  assert.deepStrictEqual(fallbackWakeEnv.mediaPlayCalls, ["play"]);
  fallbackWakeEnv.api.releaseWakeLock();
  assert.strictEqual(fallbackWakeEnv.api.getWakeLockState(), "idle");
  const topics = await api.fetchTopics(config);
  assert.strictEqual(topics.length, 180, "180-topic queues should fetch extra pages");
  assert(topics.every((topic) => topic.title.includes("AI")));
  assert(topics.every((topic) => !topic.pinned));
  assert(topics.every((topic) => Number.isInteger(topic.sourcePage)));

  const categoryConfig = api.normalizeConfig({
    ...config,
    limit: 20,
    categories: ["development"],
  });
  const categoryTopics = await api.fetchTopics(categoryConfig);
  assert.strictEqual(categoryTopics.length, 20);
  assert(categoryTopics.every((topic) => topic.categoryId === 5));
  assert(env.calls.includes("/categories.json"));

  const shortPlan = api.calculateReadPlan(config, 20, 10);
  assert.strictEqual(shortPlan.seconds, 12, "minimum should be honored");
  const normalPlan = api.calculateReadPlan(config, 500, 10);
  assert.strictEqual(normalPlan.seconds, 50, "estimated duration should be used");
  const longPlan = api.calculateReadPlan(config, 5000, 10);
  assert.strictEqual(longPlan.seconds, 90, "maximum should be a hard cap");

  const audit = api.parseTopicAudit(
    {
      highest_post_number: 850,
      last_read_post_number: 437,
      posts_count: 812,
      post_stream: {
        stream: Array.from({ length: 812 }, (_, index) => index + 1000),
        posts: [
          {
            id: 1000,
            post_number: 1,
            actions_summary: [{ id: 2, acted: false, can_act: true }],
          },
        ],
      },
    },
    topics[0]
  );
  assert.strictEqual(audit.highestPostNumber, 850);
  assert.strictEqual(audit.lastReadPostNumber, 437);
  assert.strictEqual(audit.firstPostId, 1000);
  assert.strictEqual(audit.alreadyLiked, false);
  assert.strictEqual(audit.canLike, true);
  const reactionAudit = api.parseTopicAudit(
    {
      highest_post_number: 10,
      post_stream: {
        stream: Array.from({ length: 10 }, (_, index) => index + 1),
        posts: [
          {
            id: 9000,
            post_number: 1,
            actions_summary: [{ id: 2, acted: false, can_act: false }],
            current_user_reaction: {
              id: "heart",
              type: "emoji",
              can_undo: true,
            },
          },
        ],
      },
    },
    topics[0]
  );
  assert.strictEqual(reactionAudit.alreadyLiked, true);
  assert.strictEqual(
    api.parseTopicAudit(
      {
        highest_post_number: 1200,
        post_stream: {
          stream: [9123, 9124],
          posts: [],
        },
      },
      topics[0]
    ).firstPostId,
    9123,
    "the stream should recover the first post id when it is not preloaded"
  );
  assert.strictEqual(
    api.parseServerReadPostNumber({
      details: { last_read_post_number: 88 },
    }),
    88
  );
  assert.strictEqual(
    api.parseServerReadPostNumber({ last_read_post_number: null }),
    0,
    "a present but empty Discourse read field means no recorded post yet"
  );
  assert.strictEqual(api.parseServerReadPostNumber({}), null);
  assert.strictEqual(
    api.resolveVerificationBaseline(120, 180),
    180,
    "a lower fresh response must not roll back the trusted baseline"
  );
  assert.deepStrictEqual(
    Object.assign({}, api.evaluateReadVerification(40, 80, 65, 100)),
    {
      supported: true,
      effective: true,
      complete: false,
      baselinePostNumber: 40,
      observedPostNumber: 80,
      serverPostNumber: 65,
    },
    "server progress growth should prove that reading was recorded"
  );
  assert.strictEqual(
    api.evaluateReadVerification(65, 80, 65, 100).effective,
    false,
    "unchanged server progress must not be treated as effective reading"
  );
  assert.strictEqual(
    api.evaluateReadVerification(65, 65, 65, 100).effective,
    false,
    "matching an incomplete baseline must not hide a stalled reader"
  );
  assert.strictEqual(
    api.evaluateReadVerification(80, 100, 100, 100).complete,
    true
  );
  assert.strictEqual(
    api.evaluateReadVerification(100, 100, 100, 100).effective,
    true,
    "an already server-confirmed final post is valid without further growth"
  );
  assert.strictEqual(
    api.evaluateReadVerification(0, 10, null, 100).supported,
    false
  );
  const unsupportedVerification = await api.verifyServerReadProgress(
    topics[0],
    0,
    10,
    100
  );
  assert.strictEqual(unsupportedVerification.supported, false);
  assert.strictEqual(
    unsupportedVerification.attempts,
    3,
    "a temporarily missing read field should be checked three times"
  );

  const legacyStorage = new StorageMock();
  legacyStorage.setItem(
    "linuxdoFlipProgressV2",
    JSON.stringify({
      990001: {
        topicId: 990001,
        lastPostNumber: 437,
        highestPostNumber: 850,
        accumulatedSeconds: 300,
        completed: true,
      },
    })
  );
  const legacyEnv = createEnvironment({ localStorage: legacyStorage });
  const migrated = legacyEnv.api.getTopicProgress(990001);
  assert.strictEqual(
    migrated.lastPostNumber,
    1,
    "pre-v1.6 local positions must not become trusted resume points"
  );
  assert.strictEqual(migrated.observedPostNumber, 437);
  assert.strictEqual(migrated.verifiedPostNumber, 0);
  assert.strictEqual(migrated.verificationStatus, "legacy-unverified");
  assert.strictEqual(migrated.completed, false);

  const partial = api.saveTopicProgress(topics[0].id, {
    lastPostNumber: 437,
    highestPostNumber: 850,
    accumulatedSeconds: 300,
  });
  assert.strictEqual(api.hasReadingProgress(topics[0].id), true);
  assert.strictEqual(api.hasReadingProgress(999999), false);
  assert.strictEqual(partial.lastPostNumber, 437);
  assert.strictEqual(
    api.buildResumeUrl(topics[0], partial),
    `${topics[0].url}/437`
  );
  assert.strictEqual(api.resolveResumePost(437, 512), 512);
  assert.strictEqual(api.resolveResumePost(640, 512), 640);
  assert.strictEqual(api.isTopicComplete(partial, audit, 2), false);
  const finished = api.saveTopicProgress(topics[0].id, {
    lastPostNumber: 850,
    highestPostNumber: 850,
    completed: true,
  });
  assert.strictEqual(api.isTopicComplete(finished, audit, 2), true);
  assert.strictEqual(api.isTopicComplete(finished, audit, 1), false);
  assert.strictEqual(api.getLongTopicReadCap(1000), null);
  assert.strictEqual(api.getLongTopicReadCap(1001), 300);
  assert.strictEqual(
    api.hasReachedLongTopicCap(1500, 305, 280),
    true
  );
  assert.strictEqual(
    api.hasReachedLongTopicCap(1500, 299, 290),
    false
  );
  assert.strictEqual(
    api.hasReachedLongTopicCap(1500, 310, 279),
    false
  );

  const autoLikeSession = {
    config: { limit: 150, likeTarget: 25 },
    completed: 6,
    likedCount: 0,
  };
  assert.strictEqual(
    api.shouldAutoLikeTopic(autoLikeSession, topics[0], audit),
    true
  );
  autoLikeSession.likedCount = 1;
  assert.strictEqual(
    api.shouldAutoLikeTopic(autoLikeSession, topics[0], audit),
    false
  );
  autoLikeSession.completed = 7;
  autoLikeSession.likedCount = 0;
  assert.strictEqual(
    api.shouldAutoLikeTopic(autoLikeSession, topics[0], audit),
    true,
    "a failed automatic like should be caught up on the next eligible topic"
  );
  assert.strictEqual(
    api.shouldAutoLikeTopic(
      autoLikeSession,
      topics[0],
      { ...audit, closed: true }
    ),
    true,
    "closed topics can still receive reactions in current Discourse"
  );

  const autoLikeTopic = {
    id: 990009,
    slug: "automatic-like",
    title: "自动点赞状态测试",
  };
  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [autoLikeTopic],
    index: 0,
    completed: 5,
    likedCount: 0,
    config: {
      ...api.DEFAULT_CONFIG,
      limit: 150,
      likeTarget: 25,
    },
  });
  let autoLikeCompletion = api.getSession();
  const preparedAutoLike = api.prepareTopicCompletion(
    autoLikeCompletion,
    autoLikeTopic,
    {
      audit: {
        highestPostNumber: 25,
        firstPostId: 6901,
        alreadyLiked: false,
        closed: false,
        archived: false,
      },
      progress: { lastPostNumber: 25 },
    }
  );
  assert.strictEqual(preparedAutoLike.shouldAutoLike, true);
  autoLikeCompletion = api.finalizePendingCompletion(api.getSession());
  assert.strictEqual(autoLikeCompletion.status, "liking");
  assert.strictEqual(autoLikeCompletion.likeTopic.id, autoLikeTopic.id);
  assert.strictEqual(autoLikeCompletion.likeTopic.nextIndex, 1);
  api.clearSession();

  const cappedTopic = {
    id: 990008,
    slug: "capped-long-topic",
    title: "千楼截断测试",
  };
  const afterCappedTopic = {
    id: 990007,
    slug: "after-capped-topic",
    title: "截断后的下一主题",
  };
  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [cappedTopic, afterCappedTopic],
    index: 0,
    completed: 0,
    likedCount: 0,
    config: api.DEFAULT_CONFIG,
  });
  let cappedSession = api.finalizeCappedLongTopic(
    api.getSession(),
    cappedTopic,
    {
      capped: true,
      progress: { lastPostNumber: 294 },
      audit: { highestPostNumber: 1800 },
    }
  );
  assert.strictEqual(cappedSession.completed, 1);
  assert.strictEqual(cappedSession.index, 1);
  assert.strictEqual(cappedSession.likedCount, 0);
  assert.strictEqual(api.getVisited().has(cappedTopic.id), true);
  assert.strictEqual(api.getTopicProgress(cappedTopic.id).capped, true);
  assert.strictEqual(
    api.getTopicProgress(cappedTopic.id).completed,
    false
  );
  api.clearSession();

  const completionTopic = {
    id: 990010,
    slug: "completion-transaction",
    title: "两阶段完成测试",
  };
  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [completionTopic],
    index: 0,
    completed: 0,
    config: { ...config, likeTarget: 0 },
  });
  let completionSession = api.getSession();
  api.prepareTopicCompletion(completionSession, completionTopic, {
    audit: {
      highestPostNumber: 80,
      firstPostId: 7001,
      alreadyLiked: false,
      closed: false,
      archived: false,
    },
    progress: { lastPostNumber: 80 },
  });
  assert(api.getSession().pendingCompletion);
  completionSession = api.finalizePendingCompletion(api.getSession());
  assert.strictEqual(completionSession.pendingCompletion, null);
  assert.strictEqual(completionSession.completed, 1);
  assert.strictEqual(completionSession.index, 1);
  assert.strictEqual(api.getTopicProgress(completionTopic.id).completed, true);
  assert.strictEqual(api.getVisited().has(completionTopic.id), true);
  completionSession = api.finalizePendingCompletion(api.getSession());
  assert.strictEqual(
    completionSession.completed,
    1,
    "replaying a finalized completion must be idempotent"
  );
  api.clearSession();

  const crashTopic = {
    id: 990011,
    slug: "crash-window",
    title: "崩溃窗口主题",
  };
  const nextAfterCrash = {
    id: 990012,
    slug: "next-after-crash",
    title: "崩溃后的下一主题",
  };
  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [crashTopic, nextAfterCrash],
    index: 0,
    completed: 0,
    config: { ...config, likeTarget: 0 },
  });
  api.prepareTopicCompletion(api.getSession(), crashTopic, {
    audit: {
      highestPostNumber: 20,
      firstPostId: 7101,
      alreadyLiked: false,
      closed: false,
      archived: false,
    },
    progress: { lastPostNumber: 20 },
  });
  api.saveTopicProgress(crashTopic.id, {
    lastPostNumber: 20,
    verifiedPostNumber: 20,
    highestPostNumber: 20,
    completed: true,
  });
  api.markVisited(crashTopic.id);
  api.auditSessionQueue(api.getSession());
  assert.deepStrictEqual(
    Array.from(api.getSession().queue, (topic) => topic.id),
    [nextAfterCrash.id]
  );
  completionSession = api.finalizePendingCompletion(api.getSession());
  assert.strictEqual(
    completionSession.index,
    0,
    "recovery must not skip the next topic after audit removed the completed one"
  );
  assert.strictEqual(
    completionSession.queue[completionSession.index].id,
    nextAfterCrash.id
  );
  api.clearSession();
  env.localStorage.removeItem("linuxdoFlipVisitedV1");

  api.markVisited(101);
  api.markVisited(102);
  assert.deepStrictEqual(
    Array.from(api.getVisited()).sort((a, b) => a - b),
    [101, 102]
  );

  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [{ id: 1 }],
    index: 0,
    createdAt: 12345,
    config,
  });
  assert.strictEqual(api.getSession().status, "running");
  let runtime = api.touchRuntime("reading", {}, true);
  assert.strictEqual(runtime.stage, "reading");
  assert.strictEqual(
    api.isRuntimeStalled(runtime, runtime.heartbeatAt + 34_999, 35_000),
    false
  );
  assert.strictEqual(
    api.isRuntimeStalled(runtime, runtime.heartbeatAt + 35_000, 35_000),
    true
  );
  env.localStorage.setItem(
    "linuxdoFlipRuntimeV1",
    JSON.stringify({ ...runtime, recoveryAttempts: 2 })
  );
  runtime = api.markRuntimeProgress("verified");
  assert.strictEqual(runtime.recoveryAttempts, 0);
  assert.strictEqual(runtime.stage, "verified");
  api.clearSession();
  assert.strictEqual(api.getSession(), null);
  assert.strictEqual(api.getRuntimeState(), null);

  const watchdogTopic = {
    id: 765432,
    slug: "watchdog-topic",
    title: "看门狗恢复主题",
    url: "https://linux.do/t/watchdog-topic/765432",
  };
  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [watchdogTopic],
    index: 0,
    createdAt: 23456,
    config,
  });
  runtime = api.touchRuntime("reading", {}, true);
  env.localStorage.setItem(
    "linuxdoFlipRuntimeV1",
    JSON.stringify({
      ...runtime,
      heartbeatAt: runtime.heartbeatAt - 40_000,
      recoveryAttempts: 0,
      href: watchdogTopic.url,
    })
  );
  const hrefBeforeWatchdog = env.window.location.href;
  assert.strictEqual(
    api.recoverStalledRuntime(runtime.heartbeatAt + 1),
    true,
    "the independent watchdog must recover even outside navigation timeout handling"
  );
  assert.strictEqual(api.getRuntimeState().recoveryAttempts, 1);
  assert.notStrictEqual(env.window.location.href, hrefBeforeWatchdog);
  assert(
    env.window.location.href.includes("linuxdo_flip_recover="),
    "watchdog recovery should force a fresh same-origin navigation"
  );
  api.clearSession();
  env.window.location.href = "https://linux.do/latest";
  env.window.location.pathname = "/latest";

  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [topics[0], topics[0], topics[1]],
    index: 0,
    config,
  });
  const queueAudit = api.auditSessionQueue(api.getSession());
  assert.strictEqual(queueAudit.changed, true);
  assert.strictEqual(queueAudit.removed, 2);
  assert.strictEqual(api.getSession().queue.length, 1);
  assert.strictEqual(api.getSession().queue[0].id, topics[1].id);
  assert.strictEqual(api.stageLabel("searching"), "站内搜索");
  api.clearSession();

  api.saveTopicProgress(topics[2].id, {
    lastPostNumber: 20,
    highestPostNumber: 100,
    completed: false,
  });
  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [topics[2], topics[3], topics[2]],
    index: 1,
    config,
  });
  api.auditSessionQueue(api.getSession());
  assert.deepStrictEqual(
    Array.from(api.getSession().queue, (topic) => topic.id),
    [topics[2].id, topics[3].id, topics[2].id],
    "a partial long topic requeued after the current index must be preserved"
  );
  api.clearSession();

  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [topics[4]],
    index: 0,
    config,
    navigation: {
      stage: "opening",
      topicId: topics[4].id,
      startedAt: 0,
      retries: 2,
    },
  });
  assert.strictEqual(api.recoverStalledNavigation(), true);
  assert.strictEqual(api.getSession().status, "running");
  assert.strictEqual(
    api.getSession().recovery.lastAction,
    "retry-topic",
    "a stalled selected topic should recover automatically first"
  );
  api.clearSession();

  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [{ id: 999998, slug: "fresh", title: "未读新主题" }],
    index: 0,
    config,
    navigation: {
      stage: "list",
      topicId: null,
      startedAt: 0,
      retries: 0,
    },
  });
  const hrefBeforeBrowseRecovery = env.window.location.href;
  assert.strictEqual(api.recoverStalledNavigation(), true);
  assert.strictEqual(api.getSession().status, "running");
  assert.strictEqual(
    api.getSession().recovery.lastAction,
    "retry-list"
  );
  assert.strictEqual(
    api.getTopicId(env.window.location.href),
    null,
    "fresh-topic browsing recovery must not fall back to a targeted URL"
  );
  assert.notStrictEqual(env.window.location.href, hrefBeforeBrowseRecovery);
  api.clearSession();

  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [{ id: 999997, slug: "fresh-return", title: "返回后待翻主题" }],
    index: 0,
    config,
    listContext: {
      url: "https://linux.do/latest",
      scrollY: 1200,
      canHistoryBack: false,
    },
    navigation: {
      stage: "returning",
      topicId: 999997,
      startedAt: 0,
      retries: 0,
    },
  });
  assert.strictEqual(api.recoverStalledNavigation(), true);
  assert.strictEqual(
    api.getSession().recovery.lastAction,
    "retry-list",
    "a fresh topic must still recover through the list after return timeout"
  );
  assert.strictEqual(api.getTopicId(env.window.location.href), null);
  api.clearSession();

  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [topics[5], topics[6], topics[7]],
    index: 0,
    config,
  });
  let recoverySession = api.getSession();
  let recoveryAction = api.planTopicFailureRecovery(
    recoverySession,
    recoverySession.queue[0],
    new Error("temporary read failure")
  );
  assert.strictEqual(recoveryAction.type, "retry-topic");
  assert.strictEqual(recoveryAction.delayMs, 1500);
  recoverySession = api.getSession();
  recoveryAction = api.planTopicFailureRecovery(
    recoverySession,
    recoverySession.queue[0],
    new Error("temporary read failure")
  );
  assert.strictEqual(recoveryAction.type, "retry-topic");
  assert.strictEqual(recoveryAction.delayMs, 3000);
  recoverySession = api.getSession();
  const failedTopicId = recoverySession.queue[0].id;
  recoveryAction = api.planTopicFailureRecovery(
    recoverySession,
    recoverySession.queue[0],
    new Error("persistent read failure")
  );
  assert.strictEqual(recoveryAction.type, "next-topic");
  assert.deepStrictEqual(
    Array.from(api.getSession().queue, (topic) => topic.id),
    [topics[6].id, topics[7].id, failedTopicId],
    "a repeatedly failing topic should keep progress and move to the tail"
  );
  recoverySession = api.getSession();
  api.markRecoverySuccess(recoverySession, recoverySession.queue[0].id);
  api.saveSession(recoverySession);
  assert.strictEqual(api.getSession().recovery.consecutiveFailures, 0);
  api.clearSession();

  api.saveSession({
    version: api.VERSION,
    status: "running",
    queue: [topics[8]],
    index: 0,
    config,
  });
  let browseSessionState = api.getSession();
  assert.strictEqual(
    api.planBrowseFailureRecovery(browseSessionState, "list failed").type,
    "retry-list"
  );
  browseSessionState = api.getSession();
  assert.strictEqual(
    api.planBrowseFailureRecovery(browseSessionState, "list failed").type,
    "retry-list"
  );
  browseSessionState = api.getSession();
  assert.strictEqual(
    api.planBrowseFailureRecovery(browseSessionState, "list failed").type,
    "pause"
  );
  assert.strictEqual(api.getSession().status, "paused");
  api.clearSession();

  const retryEnv = createEnvironment({ retry429: true });
  const retried = await retryEnv.api.fetchTopics(
    retryEnv.api.normalizeConfig({
      ...config,
      limit: 5,
    })
  );
  assert.strictEqual(retried.length, 5);
  assert(
    retryEnv.calls.filter((url) => url === "/latest.json?page=0").length >= 2,
    "429 responses should be retried"
  );

  const slowJsonEnv = createEnvironment({
    abortController: true,
    slowJson: true,
  });
  await assert.rejects(
    slowJsonEnv.api.fetchJsonWithRetry("/slow-json.json"),
    /网络请求失败：请求超过 20 秒未响应/
  );
  assert.strictEqual(
    slowJsonEnv.slowJsonAttempts.length,
    4,
    "a body-read timeout should stay inside the retry loop"
  );

  console.log("Linux.do Flip tests passed");
  console.log(`Fetched topics: ${topics.length}`);
  console.log(`Category-filtered topics: ${categoryTopics.length}`);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

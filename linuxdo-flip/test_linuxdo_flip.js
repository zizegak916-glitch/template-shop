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
  const wakeLockRequests = [];
  let fakeNow = 1_000_000;
  let retry429 = Boolean(options.retry429);
  let releaseListener = null;

  const location = {
    origin: "https://linux.do",
    pathname: "/latest",
    href: "https://linux.do/latest",
  };

  const document = {
    readyState: "complete",
    visibilityState: options.hidden ? "hidden" : "visible",
    documentElement: { scrollHeight: 5000 },
    body: { scrollHeight: 5000 },
    getElementById() {
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

  async function fetch(url) {
    calls.push(String(url));

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
  };
}

async function run() {
  const env = createEnvironment();
  const api = env.api;

  assert(api, "test API should be exposed");
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
  assert.strictEqual(config.interTopicMinSeconds, 2);
  assert.strictEqual(config.interTopicMaxSeconds, 6);
  assert.strictEqual(config.foregroundOnly, true);
  assert.strictEqual(config.keepAwake, true);
  assert.strictEqual(api.calculateInterTopicDelay(config), 4000);
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
      posts_count: 812,
      post_stream: {
        stream: Array.from({ length: 812 }, (_, index) => index + 1000),
        posts: [
          {
            id: 1000,
            post_number: 1,
            actions_summary: [{ id: 2, acted: false }],
          },
        ],
      },
    },
    topics[0]
  );
  assert.strictEqual(audit.highestPostNumber, 850);
  assert.strictEqual(audit.firstPostId, 1000);
  assert.strictEqual(audit.alreadyLiked, false);

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

  const reviewSession = {
    config: { limit: 180, likeTarget: 30 },
    completed: 6,
    likedCount: 0,
  };
  assert.strictEqual(
    api.shouldRequestLikeReview(reviewSession, topics[0], audit),
    true
  );
  reviewSession.completed = 5;
  assert.strictEqual(
    api.shouldRequestLikeReview(reviewSession, topics[0], audit),
    false
  );

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
  });
  assert.strictEqual(api.getSession().status, "running");
  api.clearSession();
  assert.strictEqual(api.getSession(), null);

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
  assert.strictEqual(api.getSession().status, "paused");
  assert.strictEqual(api.getSession().diagnostics.stage, "paused");
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
  assert.strictEqual(api.getSession().status, "paused");
  assert.strictEqual(
    env.window.location.href,
    hrefBeforeBrowseRecovery,
    "fresh-topic browsing timeout must not fall back to a targeted URL"
  );
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

  console.log("Linux.do Flip tests passed");
  console.log(`Fetched topics: ${topics.length}`);
  console.log(`Category-filtered topics: ${categoryTopics.length}`);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

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
  let fakeNow = 1_000_000;
  let retry429 = Boolean(options.retry429);

  const location = {
    origin: "https://linux.do",
    pathname: "/latest",
    href: "https://linux.do/latest",
  };

  const document = {
    readyState: "complete",
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
  assert.strictEqual(
    api.normalizeConfig({ ...config, navigationMode: "direct" }).navigationMode,
    "direct"
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

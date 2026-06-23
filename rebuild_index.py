#!/usr/bin/env python3
"""Rebuild index.html - 50 templates, 6 categories, curated ordering"""
import re

# ═══════════════════════════════════════════════════════════
# TEMPLATE DATA - curated order (best first)
# ═══════════════════════════════════════════════════════════

# (file, name, cat, tag_class, tag_text, desc, feats, accent)
# cat supports multi: "dark ink" means it appears in both dark and ink filters

TEMPLATES = [
    # ── TOP TIER: Codex旗舰 ──────────────────────────────
    ("aurora-borealis.html", "极光", "dark luxury", "tag-aurora", "北极光", "北极光动态渐变 · Canvas粒子帘幕 · 玻璃态卡片 · 丝滑滚动", ["极光渐变", "粒子帘幕", "玻璃态", "丝滑动画"], "#22c55e"),
    ("marble-luxe.html", "大理石", "light luxury", "tag-luxury", "大理石轻奢", "大理石纹理CSS渐变 · 金色线条 · 视差滚动 · 深阴影卡片", ["大理石纹", "金色线条", "视差滚动", "深阴影"], "#c9a96e"),
    ("neon-district.html", "霓虹街区", "dark", "tag-cyber", "赛博霓虹", "赛博霓虹发光 · 故障动画 · 扫描线 · 闪烁灯牌", ["霓虹发光", "故障动画", "扫描线", "闪烁灯牌"], "#ff00ff"),
    ("silk-road.html", "丝路", "light luxury", "tag-warm", "丝路暖奢", "勃艮第+金+奶油色 · 丝绸流动渐变 · 金色粒子尘", ["丝绸渐变", "金色粒子", "暖色奢华", "优雅排版"], "#c9a96e"),

    # ── TOP TIER: 精选现有 ────────────────────────────────
    ("gemini-flow.html", "Gemini Flow", "dark", "tag-dark", "黑白流动", "纯黑白Gemini风格 · 流动渐变 · 玻璃态 · 粒子连线 · 丝滑动画", ["流动渐变", "玻璃态", "粒子连线", "丝滑动画"], "#7c3aed"),
    ("mojian.html", "墨剑", "dark ink", "tag-dark", "剑气水墨", "《剑来》剑气水墨 · Canvas毛笔 · 飞白飞溅 · 金色剑气粒子", ["毛笔模拟", "剑气粒子", "飞白飞溅", "PNG导出"], "#C9A959"),
    ("noir.html", "Noir旗舰", "dark luxury", "tag-dark", "顶级暗色", "纯黑底+银白 · 自定义光标 · 磁力按钮 · 3D倾斜 · 颗粒覆盖", ["自定义光标", "磁力按钮", "3D倾斜", "颗粒覆盖"], "#e2e8f0"),

    # ── MiMo Code旗舰 ────────────────────────────────────
    ("cloud-nine.html", "云端", "light minimal", "tag-minimal", "云端轻盈", "浮云动画 · 天空渐变 · 呼吸感 · 轻盈卡片", ["浮云动画", "天空渐变", "轻盈卡片", "呼吸动效"], "#87ceeb"),
    ("ember-glow.html", "余烬", "dark", "tag-warm", "余烬暖调", "CSS余烬粒子上升 · 火焰渐变 · 篝火氛围", ["余烬粒子", "火焰渐变", "暖光卡片", "篝火氛围"], "#ff6b35"),
    ("gold-leaf.html", "金箔", "dark luxury", "tag-luxury", "金箔轻奢", "Canvas金色粒子闪烁 · 金色渐变文字 · 奢华卡片", ["金粉粒子", "金色渐变字", "奢华卡片", "光晕边框"], "#c9a96e"),
    ("dawn-break.html", "破晓", "light", "tag-warm", "破晓晨光", "日出渐变 · 光线动画 · 晨曦卡片 · 温暖色调", ["日出渐变", "光线动画", "晨曦卡片", "温暖色调"], "#ffb347"),
    ("void-space.html", "虚空", "dark", "tag-ai", "虚空深空", "CSS星空 · 星云渐变 · 虫洞动画 · 宇宙深邃", ["星空粒子", "星云渐变", "虫洞动画", "深空探索"], "#6b21a8"),

    # ── DeepSeek精选 ──────────────────────────────────────
    ("mountain-spirit.html", "山魂", "dark ink", "tag-ink", "山魂国风", "CSS山峦剪影 · 云雾缭绕 · 水墨远山 · 巍峨壮阔", ["山峦剪影", "云雾缭绕", "层叠构图", "水墨远山"], "#4a5568"),
    ("tide-rise.html", "潮起", "light", "tag-ocean", "潮起海浪", "波浪动画 · 海洋渐变 · 潮汐节奏 · 澎湃力量", ["波浪动画", "海洋渐变", "潮汐节奏", "澎湃力量"], "#0077b6"),
    ("moonlight.html", "月华", "light minimal", "tag-minimal", "月华银辉", "月光渐变 · 星星点缀 · 银辉卡片 · 静谧优雅", ["月光渐变", "星星点缀", "银辉卡片", "静谧之夜"], "#c0c0c0"),

    # ── 水墨国风 ──────────────────────────────────────────
    ("ink-mist.html", "水墨雾", "dark ink", "tag-ink", "水墨雾气", "CSS墨迹扩散 · 雾气动画 · 书法字体 · 水墨卡片", ["墨分五色", "雾气扩散", "水墨卡片", "留白构图"], "#6366f1"),
    ("ink-wash.html", "丹青水墨", "dark ink", "tag-ink", "水墨山水", "Canvas墨迹渲染 · Perlin山脉 · 粒子扩散 · 纸张吸墨", ["Perlin山脉", "粒子扩散", "纸张吸墨", "真实渲染"], "#94a3b8"),
    ("ink-wash-v2.html", "丹青水墨V2", "dark ink", "tag-ink", "水墨进阶", "水墨进阶版 · 更强墨迹物理模拟 · 交互效果", ["进阶墨迹", "物理模拟", "交互效果", "动态渲染"], "#94a3b8"),
    ("ink-ultimate.html", "水墨极致", "dark ink", "tag-ink", "水墨动画", "墨分五色 · SVG滤镜 · 留白构图 · 极致水墨", ["墨分五色", "SVG滤镜", "留白构图", "极致水墨"], "#94a3b8"),
    ("wabi-sabi.html", "侘寂", "dark ink", "tag-wabi", "日式侘寂", "侘寂美学 · 不完美之美 · 自然质感 · 极简留白", ["侘寂美学", "自然质感", "不完美美", "极简留白"], "#a3927a"),

    # ── 暗色系 ────────────────────────────────────────────
    ("cyber-zen.html", "赛博禅", "dark", "tag-dark", "赛博禅意", "赛博朋克+禅意碰撞 · 霓虹+佛系美学", ["赛博美学", "禅意碰撞", "霓虹效果", "故障动画"], "#6366f1"),
    ("cyberpunk.html", "赛博朋克", "dark", "tag-cyber", "霓虹都市", "经典赛博朋克 · 霓虹灯 · 雨夜 · 全息投影", ["霓虹灯效", "雨夜氛围", "全息投影", "赛博排版"], "#ff66ff"),
    ("glassmorphism.html", "玻璃态", "dark", "tag-glass", "毛玻璃", "毛玻璃设计 · 半透明卡片 · 模糊背景 · 光影折射", ["毛玻璃", "半透明", "光影折射", "模糊背景"], "#7dd3fc"),
    ("fluid-gradient.html", "流体渐变", "dark", "tag-gradient", "流体美学", "动态色彩流动 · 柔和过渡 · 有机形态", ["流体渐变", "动态色彩", "柔和过渡", "有机形态"], "#ec4899"),
    ("dark-minimal.html", "暗色极简", "dark minimal", "tag-minimal", "极简暗色", "克制用色 · 大量留白 · 精致排版", ["极简设计", "克制用色", "大量留白", "精致排版"], "#6b7280"),
    ("dark-saas.html", "暗色SaaS", "dark industry", "tag-dark", "SaaS产品", "数据可视化 · 功能展示 · 定价表", ["SaaS风格", "数据展示", "功能网格", "定价表"], "#6366f1"),
    ("pixel-retro.html", "像素复古", "dark", "tag-dark", "像素风", "8-bit美学 · 像素字体 · 复古配色", ["像素美学", "8-bit风格", "复古配色", "像素字体"], "#f59e0b"),
    ("vaporwave.html", "蒸汽波", "dark", "tag-dark", "蒸汽波美学", "渐变网格 · 古典雕塑 · 故障效果", ["蒸汽波", "渐变网格", "古典元素", "故障美学"], "#ec4899"),
    ("aurora.html", "极光幻彩", "dark", "tag-aurora", "极光幻彩", "多彩渐变 · 流动光效 · 梦幻氛围", ["极光渐变", "流动光效", "梦幻氛围", "多彩配色"], "#22c55e"),
    ("deep-forest.html", "密林", "dark", "tag-botanical", "密林幽深", "树影婆娑 · 苔藓质感 · 森林呼吸 · 斑驳光影", ["树影婆娑", "苔藓质感", "森林呼吸", "幽深秘境"], "#166534"),
    ("shadow-flow.html", "暗流", "dark", "tag-dark", "暗流涌动", "流体渐变 · 暗涌动画 · 深邃卡片 · 神秘纹理", ["流体渐变", "暗涌动画", "深邃卡片", "神秘纹理"], "#1e1b4b"),
    ("frost-crystal.html", "霜晶", "light", "tag-glass", "霜晶冰感", "冰晶图案 · 磨砂玻璃 · 雪花粒子 · 极地蓝调", ["冰晶图案", "磨砂玻璃", "雪花粒子", "极地蓝调"], "#a8d8ea"),

    # ── 亮色系 ────────────────────────────────────────────
    ("botanical-green.html", "植物绿", "light", "tag-light", "自然清新", "植物绿色 · 自然元素 · 清新配色 · 有机形态", ["植物元素", "清新配色", "有机形态", "自然质感"], "#22c55e"),
    ("gradient-bold.html", "大胆渐变", "light", "tag-gradient", "大胆渐变", "鲜明色彩 · 活力渐变 · 视觉冲击", ["鲜明色彩", "活力渐变", "视觉冲击", "大胆排版"], "#ec4899"),
    ("neobrutalism.html", "新粗野主义", "light", "tag-brutal", "粗野主义", "粗边框 · 高对比 · 原始排版 · 大胆撞色", ["粗边框", "高对比", "原始排版", "大胆撞色"], "#111"),
    ("editorial.html", "编辑风", "light", "tag-editorial", "编辑排版", "杂志感布局 · 优雅字体 · 图文混排", ["杂志布局", "优雅字体", "图文混排", "编辑美感"], "#374151"),
    ("gallery.html", "画廊", "light", "tag-light", "画廊展示", "作品网格 · 悬停详情 · 画框效果", ["作品网格", "悬停详情", "画框效果", "画廊氛围"], "#6b7280"),
    ("warm-organic.html", "暖色有机", "light", "tag-warm", "暖色自然", "自然暖色调 · 有机形态 · 舒适质感", ["暖色调", "有机形态", "舒适质感", "自然元素"], "#d97706"),
    ("bamboo-grove.html", "竹林", "light minimal", "tag-minimal", "竹林极简", "竹节装饰 · 竹叶飘动 · 极简留白 · 清新绿调", ["竹节装饰", "竹叶飘动", "极简留白", "清新绿调"], "#2d5016"),
    ("pearl-oyster.html", "珍珠", "light luxury", "tag-luxury", "珍珠柔光", "虹彩渐变 · 贝壳纹理 · 柔光卡片 · 圆润优雅", ["虹彩渐变", "贝壳纹理", "柔光卡片", "圆润优雅"], "#f0f0ff"),
    ("bloom-burst.html", "绽放", "light", "tag-warm", "绽放生机", "花瓣飞舞 · 春日色彩 · 绽放动画 · 生机卡片", ["花瓣飞舞", "春日色彩", "绽放动画", "生机卡片"], "#ffb7c5"),
    ("light-clean.html", "清爽亮色", "light minimal", "tag-light", "清爽干净", "干净整洁 · 充足留白 · 明快配色", ["清爽设计", "充足留白", "明快配色", "干净整洁"], "#3b82f6"),

    # ── 简约极简 ──────────────────────────────────────────
    ("minimal.html", "极简", "minimal", "tag-minimal", "极简主义", "克制用色 · 大量留白 · 精致排版 · 纯净美学", ["极简设计", "克制用色", "大量留白", "精致排版"], "#6b7280"),

    # ── 行业专属 ──────────────────────────────────────────
    ("ai-product.html", "AI产品", "dark industry", "tag-ai", "AI科技", "科技感界面 · 数据流 · 智能交互 · 未来感", ["科技界面", "数据流动", "智能交互", "未来感"], "#06b6d4"),
    ("agency.html", "工作室", "industry", "tag-agency", "设计工作室", "作品集展示 · 团队介绍 · 项目流程 · 服务报价", ["作品展示", "团队介绍", "项目流程", "服务报价"], "#d4af37"),
    ("ecommerce.html", "电商", "industry", "tag-ecom", "电商落地", "产品展示 · 价格对比 · 购买按钮 · 促销信息", ["产品展示", "价格对比", "促销信息", "购买引导"], "#ef4444"),
    ("fintech.html", "金融科技", "industry", "tag-finance", "金融理财", "数据图表 · 安全认证 · 理财方案 · 信任背书", ["数据图表", "安全认证", "理财方案", "信任背书"], "#3b82f6"),
    ("mobile-app.html", "移动应用", "industry", "tag-mobile", "App推广", "手机mockup · 功能截图 · 下载引导 · 评分展示", ["手机展示", "功能截图", "下载引导", "评分展示"], "#f97316"),
    ("steel-forge.html", "铸铁", "dark luxury", "tag-brutal", "铸铁工业", "金属质感 · 火花飞溅 · 锻造动画 · 硬核风格", ["金属质感", "火花飞溅", "锻造动画", "工业硬核"], "#71717a"),
]

TOTAL = len(TEMPLATES)
print(f"Total templates: {TOTAL}")

# Category counts
dark_c = sum(1 for t in TEMPLATES if 'dark' in t[2])
light_c = sum(1 for t in TEMPLATES if 'light' in t[2])
ink_c = sum(1 for t in TEMPLATES if 'ink' in t[2])
min_c = sum(1 for t in TEMPLATES if 'minimal' in t[2])
ind_c = sum(1 for t in TEMPLATES if 'industry' in t[2])
print(f"Dark: {dark_c}, Light: {light_c}, Ink: {ink_c}, Minimal: {min_c}, Industry: {ind_c}")

def gen_card(t):
    file, name, cat, tag_class, tag_text, desc, feats, accent = t
    feats_html = "".join(f'<span class="tpl-feat">{f}</span>' for f in feats)
    bg = '#0a0a0f' if 'dark' in cat else '#f8f9fa'
    return f'''  <div class="tpl-card reveal" data-cat="{cat}" data-name="{name}" data-desc="{desc}" style="--card-accent:{accent}">
    <div class="tpl-preview" style="background:{bg}"><iframe src="{file}" loading="lazy" tabindex="-1"></iframe><div class="overlay"></div>
      <div class="preview-hover">
        <a href="{file}" target="_blank" class="preview-hover-btn primary"><i data-lucide="eye"></i> 预览</a>
        <a href="{file}" download class="preview-hover-btn secondary"><i data-lucide="download"></i> 源码</a>
      </div>
    </div>
    <div class="tpl-info">
      <div class="tpl-head"><div class="tpl-name">{name}</div><span class="tpl-tag {tag_class}">{tag_text}</span></div>
      <div class="tpl-desc">{desc}</div>
      <div class="tpl-features">{feats_html}</div>
      <div class="tpl-btns">
        <a href="{file}" target="_blank" class="tpl-btn primary"><i data-lucide="eye"></i> 预览</a>
        <a href="{file}" download class="tpl-btn secondary"><i data-lucide="download"></i> 源码</a>
      </div>
    </div>
  </div>'''

cards_html = "\n\n".join(gen_card(t) for t in TEMPLATES)

# Read existing index.html to preserve CSS
with open('/root/template-shop/index.html', 'r') as f:
    content = f.read()

# Find body start (after </style>)
body_marker = '</style>\n</head>\n<body>'
body_idx = content.find(body_marker)
if body_idx < 0:
    body_marker = '</style>'
    # Find the LAST </style> before <body>
    style_end = content.rfind('</style>')
    body_start = content.find('<body>', style_end)
    body_idx = body_start

# Find the CSS portion (everything up to and including </style>)
style_end = content.rfind('</style>') + len('</style>')
css_section = content[:style_end]

# Build new body
new_body = f'''{css_section}
</head>
<body>

<!-- AUTH WALL -->
<div id="auth-wall">
  <div class="auth-bg-orbs">
    <div class="auth-orb"></div>
    <div class="auth-orb"></div>
  </div>
  <div class="auth-card">
    <div class="auth-icon-wrap">
      <i data-lucide="lock"></i>
    </div>
    <h2>访问验证</h2>
    <p class="auth-sub">输入密钥解锁全部功能，或以游客身份浏览</p>
    <div class="auth-tabs">
      <button class="auth-tab active" onclick="switchAuthTab('key')"><i data-lucide="key"></i> 密钥登录</button>
      <button class="auth-tab" onclick="switchAuthTab('guest')"><i data-lucide="user"></i> 游客浏览</button>
    </div>
    <div class="auth-panel active" id="panel-key">
      <div class="key-input-wrap">
        <input type="text" id="key-input" class="key-input" placeholder="TMPL-XXXX-XXXX-XXXX" maxlength="18" autocomplete="off" spellcheck="false">
        <i data-lucide="key"></i>
      </div>
      <button id="key-submit" class="auth-btn primary"><i data-lucide="unlock"></i> 验证并登录</button>
      <div id="key-error" class="auth-msg error"></div>
      <div id="key-success" class="auth-msg success">✅ 验证通过，正在进入...</div>
    </div>
    <div class="auth-panel" id="panel-guest">
      <p class="auth-sub" style="margin-bottom:18px">游客模式可<strong style="color:var(--acc)">预览</strong>全部模板<br>但<strong style="color:#f87171">无法下载</strong>源码文件</p>
      <button id="guest-btn" class="auth-btn ghost"><i data-lucide="arrow-right"></i> 进入预览</button>
      <div class="guest-hint">
        <p>💡 <strong>需要源码？</strong><br>购买密钥后输入即可解锁下载，一个密钥限一台设备。</p>
      </div>
    </div>
  </div>
</div>

<!-- GUEST NOTICE -->
<div id="guest-notice">
  <span><i data-lucide="lock"></i> 游客模式 — 源码下载已锁定</span>
  <button class="notice-btn" id="open-auth-btn">输入密钥</button>
</div>

<!-- BACKGROUND -->
<div class="bg-grid"></div>
<div class="bg-orb purple"></div>
<div class="bg-orb teal"></div>
<div class="bg-orb pink"></div>
<canvas id="particles"></canvas>

<!-- TOP BAR -->
<div class="top-bar" id="topBar">
  <div class="logo">
    <i data-lucide="layout-grid" style="width:20px;height:20px;color:var(--p)"></i>
    <span>Template Shop</span>
  </div>
  <button class="theme-toggle" id="themeToggle" aria-label="切换主题">
    <i data-lucide="sun" id="themeIcon"></i>
  </button>
</div>

<!-- CONTENT -->
<div class="wrap">

<!-- HERO -->
<header class="hero">
  <div class="badge reveal"><span class="dot"></span> {TOTAL} 套模板 · 持续更新</div>
  <h1 class="reveal">落地页<br><span class="gradient-text">模板合集</span></h1>
  <p class="sub reveal">精选 {TOTAL} 套不同风格的落地页模板，即买即用。<br>纯 HTML/CSS/JS，无依赖，完全响应式，一键换色。</p>
  <div class="hero-tags reveal">
    <span class="hero-tag"><i data-lucide="file-code"></i> 纯 HTML 单文件</span>
    <span class="hero-tag"><i data-lucide="smartphone"></i> 完全响应式</span>
    <span class="hero-tag"><i data-lucide="palette"></i> CSS 变量换色</span>
    <span class="hero-tag"><i data-lucide="zap"></i> 零依赖</span>
    <span class="hero-tag"><i data-lucide="package"></i> 即买即发</span>
  </div>
</header>

<!-- STATS -->
<div class="stats reveal">
  <div class="stat-item"><div class="stat-num">{TOTAL}</div><div class="stat-label">套模板</div></div>
  <div class="stat-item"><div class="stat-num">6</div><div class="stat-label">种分类</div></div>
  <div class="stat-item"><div class="stat-num">100%</div><div class="stat-label">响应式</div></div>
  <div class="stat-item"><div class="stat-num">0</div><div class="stat-label">依赖</div></div>
</div>

<!-- SEARCH & FILTERS -->
<div class="controls reveal">
  <div class="search-bar">
    <i data-lucide="search"></i>
    <input type="text" id="searchInput" placeholder="搜索模板名称或描述...">
  </div>
  <div class="search-count" id="searchCount"></div>
  <div class="filters" id="filterBar">
    <button class="fbtn active" data-filter="all">全部 ({TOTAL})</button>
    <button class="fbtn" data-filter="dark">暗色系 ({dark_c})</button>
    <button class="fbtn" data-filter="light">亮色系 ({light_c})</button>
    <button class="fbtn" data-filter="ink">水墨国风 ({ink_c})</button>
    <button class="fbtn" data-filter="minimal">简约极简 ({min_c})</button>
    <button class="fbtn" data-filter="industry">行业专属 ({ind_c})</button>
  </div>
</div>

<!-- TEMPLATE GRID -->
<div class="tpl-grid" id="tpl-grid">

{cards_html}

</div>

<!-- CTA -->
<div class="cta-banner reveal">
  <h2>需要定制落地页？</h2>
  <p>所有模板支持 CSS 变量一键换色，轻松适配你的品牌。</p>
  <a href="docs.html" class="btn"><i data-lucide="book-open"></i> 查看使用文档</a>
</div>

</div><!-- .wrap -->

<!-- FOOTER -->
<footer class="page-footer">
  <div class="footer-badge"><i data-lucide="sparkles"></i> {TOTAL} 套模板 · 持续更新</div>
  <div class="footer-links">
    <a href="docs.html"><i data-lucide="book-open"></i> 使用文档</a>
    <a href="changelog.html"><i data-lucide="git-branch"></i> 更新日志</a>
  </div>
  <div class="footer-copy">© 2026 Template Shop · 单文件 · 零依赖 · 即买即用</div>
</footer>

<!-- SCROLL TOP -->
<button class="scroll-top" id="scrollTop" aria-label="回到顶部">
  <i data-lucide="arrow-up"></i>
</button>

<script src="keys.js"></script>
<script src="auth.js"></script>
<script>
// ── Theme Toggle ──
const toggle = document.getElementById('themeToggle');
const icon = document.getElementById('themeIcon');
const html = document.documentElement;
function setTheme(t) {{
  html.dataset.theme = t;
  localStorage.setItem('theme', t);
  icon.setAttribute('data-lucide', t === 'dark' ? 'sun' : 'moon');
  if (window.lucide) lucide.createIcons();
}}
toggle.addEventListener('click', () => setTheme(html.dataset.theme === 'dark' ? 'light' : 'dark'));
const saved = localStorage.getItem('theme');
if (saved) setTheme(saved);

// ── Top Bar Scroll ──
const topBar = document.getElementById('topBar');
window.addEventListener('scroll', () => topBar.classList.toggle('scrolled', window.scrollY > 40));

// ── Scroll Top ──
const stb = document.getElementById('scrollTop');
window.addEventListener('scroll', () => stb.classList.toggle('visible', window.scrollY > 600));
stb.addEventListener('click', () => window.scrollTo({{ top: 0, behavior: 'smooth' }}));

// ── Search & Filter ──
const searchInput = document.getElementById('searchInput');
const searchCount = document.getElementById('searchCount');
const filterBtns = document.querySelectorAll('.fbtn');
const grid = document.getElementById('tpl-grid');
let currentFilter = 'all';

function filterCards() {{
  const q = searchInput.value.toLowerCase();
  let shown = 0;
  grid.querySelectorAll('.tpl-card').forEach(card => {{
    const name = (card.dataset.name || '').toLowerCase();
    const desc = (card.dataset.desc || '').toLowerCase();
    const cat = (card.dataset.cat || '');
    const matchSearch = !q || name.includes(q) || desc.includes(q);
    const matchFilter = currentFilter === 'all' || cat.includes(currentFilter);
    const show = matchSearch && matchFilter;
    card.style.display = show ? '' : 'none';
    if (show) shown++;
  }});
  searchCount.textContent = q || currentFilter !== 'all' ? `找到 ${{shown}} 个模板` : '';
  // empty state
  let empty = document.getElementById('emptyState');
  if (shown === 0) {{
    if (!empty) {{
      empty = document.createElement('div');
      empty.id = 'emptyState';
      empty.className = 'empty-state';
      empty.innerHTML = '<i data-lucide="search-x"></i><p>没有找到匹配的模板</p>';
      grid.appendChild(empty);
      if (window.lucide) lucide.createIcons();
    }}
    empty.style.display = '';
  }} else if (empty) {{
    empty.style.display = 'none';
  }}
}}

searchInput.addEventListener('input', filterCards);
filterBtns.forEach(btn => {{
  btn.addEventListener('click', () => {{
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    filterCards();
  }});
}});

// ── Scroll Reveal ──
const observer = new IntersectionObserver((entries) => {{
  entries.forEach(e => {{ if (e.isIntersecting) {{ e.target.classList.add('visible'); observer.unobserve(e.target); }} }});
}}, {{ threshold: 0.1 }});
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ── Particles ──
(function() {{
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];
  function resize() {{ w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }}
  resize();
  window.addEventListener('resize', resize);
  for (let i = 0; i < 50; i++) particles.push({{ x: Math.random()*w, y: Math.random()*h, r: Math.random()*1.5+0.5, dx: (Math.random()-0.5)*0.3, dy: (Math.random()-0.5)*0.3, o: Math.random()*0.3+0.1 }});
  function draw() {{
    ctx.clearRect(0,0,w,h);
    particles.forEach(p => {{
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = `rgba(108,92,231,${{p.o}})`;
      ctx.fill();
    }});
    // draw lines
    for (let i = 0; i < particles.length; i++) {{
      for (let j = i+1; j < particles.length; j++) {{
        const dx = particles[i].x-particles[j].x, dy = particles[i].y-particles[j].y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 120) {{
          ctx.beginPath(); ctx.moveTo(particles[i].x,particles[i].y);
          ctx.lineTo(particles[j].x,particles[j].y);
          ctx.strokeStyle = `rgba(108,92,231,${{0.06*(1-dist/120)}})`;
          ctx.stroke();
        }}
      }}
    }}
    requestAnimationFrame(draw);
  }}
  draw();
}})();
</script>
</body>
</html>'''

with open('/root/template-shop/index.html', 'w') as f:
    f.write(new_body)

print(f"✅ index.html rebuilt: {len(new_body)} bytes, {new_body.count(chr(10))+1} lines")
cards_count = new_body.count('tpl-card reveal')
print(f"   Cards: {cards_count}")

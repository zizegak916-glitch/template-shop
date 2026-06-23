#!/usr/bin/env python3
"""Generate index.html with all 50 templates and 6 categories"""
import os

# Template data: (file, name, cat, tag_class, tag_text, desc, feats, accent)
TEMPLATES = [
    # === FLAGSHIP (Codex) ===
    ("aurora-borealis.html", "极光", "dark luxury", "tag-aurora", "北极光", "北极光动态渐变背景 · Canvas粒子帘幕 · 玻璃态卡片 · 丝滑滚动动画", ["极光渐变", "粒子帘幕", "玻璃态", "丝滑动画"], "#22c55e"),
    ("mojian.html", "墨剑", "dark ink", "tag-dark", "剑气水墨", "《剑来》风格剑气水墨交互落地页。Canvas毛笔模拟+速度感应线条+飞白+墨点飞溅+金色剑气粒子", ["毛笔模拟", "剑气粒子", "飞白飞溅", "PNG导出"], "#C9A959"),
    ("noir.html", "Noir旗舰", "dark luxury", "tag-dark", "顶级暗色", "纯黑底+银白文字，自定义光标、磁力吸附按钮、文字乱码动画、3D倾斜卡片、渐变发光边框", ["自定义光标", "磁力按钮", "3D倾斜", "颗粒覆盖"], "#e2e8f0"),
    ("gemini-flow.html", "Gemini Flow", "dark", "tag-dark", "黑白流动", "纯黑白Gemini风格。滚动渐变背景、玻璃态卡片、Canvas粒子连线、丝滑reveal动画", ["流动渐变", "玻璃态", "粒子连线", "丝滑动画"], "#7c3aed"),
    ("neon-district.html", "霓虹街区", "dark", "tag-cyber", "赛博霓虹", "赛博朋克霓虹风格。霓虹发光文字、扫描线、故障动画、闪烁霓虹灯牌", ["霓虹发光", "故障动画", "扫描线", "闪烁灯牌"], "#ff00ff"),
    ("silk-road.html", "丝路", "light luxury", "tag-warm", "丝路暖奢", "丝路暖色奢华风格。勃艮第+金+奶油色、丝绸流动渐变、金色粒子尘", ["丝绸渐变", "金色粒子", "暖色奢华", "优雅排版"], "#c9a96e"),
    ("marble-luxe.html", "大理石", "light luxury", "tag-luxury", "大理石轻奢", "大理石纹理轻奢风格。CSS大理石渐变、金色线条、视差滚动、深阴影卡片", ["大理石纹", "金色线条", "视差滚动", "深阴影"], "#c9a96e"),

    # === INK / CULTURE ===
    ("ink-mist.html", "水墨雾", "dark ink", "tag-ink", "水墨雾气", "暗色水墨雾气风格。CSS墨迹扩散、雾气动画层、书法字体、水墨卡片边框", ["墨分五色", "雾气扩散", "水墨卡片", "留白构图"], "#6366f1"),
    ("ink-wash.html", "丹青水墨", "dark ink", "tag-ink", "水墨山水", "Canvas真实墨迹渲染。Perlin山脉、粒子扩散、纸张吸墨效果", ["Perlin山脉", "粒子扩散", "纸张吸墨", "真实渲染"], "#94a3b8"),
    ("ink-wash-v2.html", "丹青水墨V2", "dark ink", "tag-ink", "水墨进阶", "水墨动画进阶版。更强的墨迹物理模拟和交互效果", ["进阶墨迹", "物理模拟", "交互效果", "动态渲染"], "#94a3b8"),
    ("ink-ultimate.html", "水墨极致", "dark ink", "tag-ink", "水墨动画", "水墨动画风格落地页。墨分五色、SVG滤镜、留白构图", ["墨分五色", "SVG滤镜", "留白构图", "极致水墨"], "#94a3b8"),
    ("mountain-spirit.html", "山魂", "dark ink", "tag-ink", "山魂国风", "暗色山魂国风。CSS山峦剪影、云雾缭绕层、水墨远山、巍峨壮阔", ["山峦剪影", "云雾缭绕", "层叠构图", "水墨远山"], "#4a5568"),
    ("wabi-sabi.html", "侘寂", "dark ink", "tag-wabi", "日式侘寂", "日式侘寂美学。不完美之美、自然质感、极简留白", ["侘寂美学", "自然质感", "不完美美", "极简留白"], "#a3927a"),

    # === DARK ===
    ("cyber-zen.html", "赛博禅", "dark", "tag-dark", "赛博禅意", "赛博朋克与禅意结合。霓虹+佛系、故障+宁静的碰撞美学", ["赛博美学", "禅意碰撞", "霓虹效果", "故障动画"], "#6366f1"),
    ("cyberpunk.html", "赛博朋克", "dark", "tag-cyber", "霓虹都市", "经典赛博朋克风格。霓虹灯、雨夜、全息投影效果", ["霓虹灯效", "雨夜氛围", "全息投影", "赛博排版"], "#ff66ff"),
    ("glassmorphism.html", "玻璃态", "dark", "tag-glass", "毛玻璃", "毛玻璃设计风格。半透明卡片、模糊背景、光影折射", ["毛玻璃", "半透明", "光影折射", "模糊背景"], "#7dd3fc"),
    ("fluid-gradient.html", "流体渐变", "dark", "tag-gradient", "流体美学", "流体渐变美学。动态色彩流动、柔和过渡、有机形态", ["流体渐变", "动态色彩", "柔和过渡", "有机形态"], "#ec4899"),
    ("dark-minimal.html", "暗色极简", "dark minimal", "tag-minimal", "极简暗色", "暗色极简设计。克制的用色、大量留白、精致排版", ["极简设计", "克制用色", "大量留白", "精致排版"], "#6b7280"),
    ("dark-saas.html", "暗色SaaS", "dark industry", "tag-dark", "SaaS产品", "暗色SaaS产品落地页。数据可视化、功能展示、定价表", ["SaaS风格", "数据展示", "功能网格", "定价表"], "#6366f1"),
    ("pixel-retro.html", "像素复古", "dark", "tag-dark", "像素风", "像素复古风格。8-bit美学、像素字体、复古配色", ["像素美学", "8-bit风格", "复古配色", "像素字体"], "#f59e0b"),
    ("vaporwave.html", "蒸汽波", "dark", "tag-dark", "蒸汽波美学", "蒸汽波美学风格。渐变网格、古典雕塑、故障效果", ["蒸汽波", "渐变网格", "古典元素", "故障美学"], "#ec4899"),
    ("aurora.html", "极光幻彩", "dark", "tag-aurora", "极光幻彩", "极光幻彩风格。多彩渐变、流动光效、梦幻氛围", ["极光渐变", "流动光效", "梦幻氛围", "多彩配色"], "#22c55e"),
    ("ai-product.html", "AI产品", "dark industry", "tag-ai", "AI科技", "AI产品落地页。科技感界面、数据流、智能交互", ["科技界面", "数据流动", "智能交互", "未来感"], "#06b6d4"),
    ("gold-leaf.html", "金箔", "dark luxury", "tag-luxury", "金箔轻奢", "暗色金箔轻奢。Canvas金色粒子闪烁、金色渐变文字、奢华卡片", ["金粉粒子", "金色渐变字", "奢华卡片", "光晕边框"], "#c9a96e"),
    ("ember-glow.html", "余烬", "dark", "tag-warm", "余烬暖调", "暗色余烬暖调。CSS余烬粒子上升、火焰渐变、篝火氛围", ["余烬粒子", "火焰渐变", "暖光卡片", "篝火氛围"], "#ff6b35"),
    ("void-space.html", "虚空", "dark", "tag-ai", "虚空深空", "暗色虚空深空。CSS星空、星云渐变、虫洞动画、宇宙深邃", ["星空粒子", "星云渐变", "虫洞动画", "深空探索"], "#6b21a8"),
    ("deep-forest.html", "密林", "dark", "tag-botanical", "密林幽深", "暗色密林幽深。树影婆娑、苔藓质感、森林呼吸、斑驳光影", ["树影婆娑", "苔藓质感", "森林呼吸", "幽深秘境"], "#166534"),
    ("steel-forge.html", "铸铁", "dark luxury", "tag-brutal", "铸铁工业", "暗色铸铁工业。金属质感、火花飞溅、锻造动画、硬核风格", ["金属质感", "火花飞溅", "锻造动画", "工业硬核"], "#71717a"),
    ("shadow-flow.html", "暗流", "dark", "tag-dark", "暗流涌动", "暗色暗流涌动。流体渐变、暗涌动画、深邃卡片、神秘纹理", ["流体渐变", "暗涌动画", "深邃卡片", "神秘纹理"], "#1e1b4b"),
    ("neobrutalism.html", "新粗野主义", "light", "tag-brutal", "粗野主义", "新粗野主义风格。粗边框、高对比、原始排版、大胆撞色", ["粗边框", "高对比", "原始排版", "大胆撞色"], "#111"),

    # === LIGHT ===
    ("botanical-green.html", "植物绿", "light", "tag-light", "自然清新", "植物绿色系。自然元素、清新配色、有机形态", ["植物元素", "清新配色", "有机形态", "自然质感"], "#22c55e"),
    ("light-clean.html", "清爽亮色", "light minimal", "tag-light", "清爽干净", "清爽亮色设计。干净整洁、充足留白、明快配色", ["清爽设计", "充足留白", "明快配色", "干净整洁"], "#3b82f6"),
    ("gradient-bold.html", "大胆渐变", "light", "tag-gradient", "大胆渐变", "大胆渐变风格。鲜明色彩、活力渐变、视觉冲击", ["鲜明色彩", "活力渐变", "视觉冲击", "大胆排版"], "#ec4899"),
    ("editorial.html", "编辑风", "light", "tag-editorial", "编辑排版", "编辑排版风格。杂志感布局、优雅字体、图文混排", ["杂志布局", "优雅字体", "图文混排", "编辑美感"], "#374151"),
    ("gallery.html", "画廊", "light", "tag-light", "画廊展示", "画廊展示风格。作品网格、悬停详情、画框效果", ["作品网格", "悬停详情", "画框效果", "画廊氛围"], "#6b7280"),
    ("warm-organic.html", "暖色有机", "light", "tag-warm", "暖色自然", "暖色有机风格。自然暖色调、有机形态、舒适质感", ["暖色调", "有机形态", "舒适质感", "自然元素"], "#d97706"),
    ("bamboo-grove.html", "竹林", "light minimal", "tag-minimal", "竹林极简", "亮色竹林极简。竹节装饰、竹叶飘动、极简留白、清新绿调", ["竹节装饰", "竹叶飘动", "极简留白", "清新绿调"], "#2d5016"),
    ("cloud-nine.html", "云端", "light minimal", "tag-minimal", "云端轻盈", "亮色云端轻盈。浮云动画、天空渐变、呼吸感、轻盈卡片", ["浮云动画", "天空渐变", "轻盈卡片", "呼吸动效"], "#87ceeb"),
    ("frost-crystal.html", "霜晶", "light", "tag-glass", "霜晶冰感", "亮色霜晶冰感。冰晶图案、磨砂玻璃、雪花粒子、极地蓝调", ["冰晶图案", "磨砂玻璃", "雪花粒子", "极地蓝调"], "#a8d8ea"),
    ("dawn-break.html", "破晓", "light", "tag-warm", "破晓晨光", "亮色破晓晨光。日出渐变、光线动画、晨曦卡片、温暖色调", ["日出渐变", "光线动画", "晨曦卡片", "温暖色调"], "#ffb347"),
    ("tide-rise.html", "潮起", "light", "tag-ocean", "潮起海浪", "亮色潮起海浪。波浪动画、海洋渐变、潮汐节奏、澎湃力量", ["波浪动画", "海洋渐变", "潮汐节奏", "澎湃力量"], "#0077b6"),
    ("moonlight.html", "月华", "light minimal", "tag-minimal", "月华银辉", "亮色月华银辉。月光渐变、星星点缀、银辉卡片、静谧优雅", ["月光渐变", "星星点缀", "银辉卡片", "静谧之夜"], "#c0c0c0"),
    ("pearl-oyster.html", "珍珠", "light luxury", "tag-luxury", "珍珠柔光", "亮色珍珠柔光。虹彩渐变、贝壳纹理、柔光卡片、圆润优雅", ["虹彩渐变", "贝壳纹理", "柔光卡片", "圆润优雅"], "#f0f0ff"),
    ("bloom-burst.html", "绽放", "light", "tag-warm", "绽放生机", "亮色绽放生机。花瓣飞舞、春日色彩、绽放动画、生机卡片", ["花瓣飞舞", "春日色彩", "绽放动画", "生机卡片"], "#ffb7c5"),

    # === INDUSTRY ===
    ("agency.html", "工作室", "industry", "tag-agency", "设计工作室", "设计工作室风格。作品集展示、团队介绍、项目流程", ["作品展示", "团队介绍", "项目流程", "服务报价"], "#d4af37"),
    ("ecommerce.html", "电商", "industry", "tag-ecom", "电商落地", "电商产品落地页。产品展示、价格对比、购买按钮、促销信息", ["产品展示", "价格对比", "促销信息", "购买引导"], "#ef4444"),
    ("fintech.html", "金融科技", "industry", "tag-finance", "金融理财", "金融科技风格。数据图表、安全认证、理财方案、信任背书", ["数据图表", "安全认证", "理财方案", "信任背书"], "#3b82f6"),
    ("mobile-app.html", "移动应用", "industry", "tag-mobile", "App推广", "移动应用推广页。手机mockup、功能截图、下载引导、评分展示", ["手机展示", "功能截图", "下载引导", "评分展示"], "#f97316"),
]

# Count categories
dark_count = sum(1 for t in TEMPLATES if 'dark' in t[2])
light_count = sum(1 for t in TEMPLATES if 'light' in t[2])
ink_count = sum(1 for t in TEMPLATES if 'ink' in t[2])
minimal_count = sum(1 for t in TEMPLATES if 'minimal' in t[2])
industry_count = sum(1 for t in TEMPLATES if 'industry' in t[2])
total = len(TEMPLATES)

print(f"Total: {total}, Dark: {dark_count}, Light: {light_count}, Ink: {ink_count}, Minimal: {minimal_count}, Industry: {industry_count}")

def gen_card(t):
    file, name, cat, tag_class, tag_text, desc, feats, accent = t
    feats_html = "".join(f'<span class="tpl-feat">{f}</span>' for f in feats)
    # Determine preview background
    if 'dark' in cat:
        bg = '#0a0a0f'
    else:
        bg = '#f8f9fa'
    
    return f'''  <!-- {name} -->
  <div class="tpl-card reveal" data-cat="{cat}" data-name="{name}" data-desc="{desc}" style="--card-accent:{accent}">
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

# Read current index.html and replace the grid section
with open('/root/template-shop/index.html', 'r') as f:
    content = f.read()

# Replace stats
import re
content = re.sub(r'<div class="stat-num">28</div><div class="stat-label">套模板</div>', f'<div class="stat-num">{total}</div><div class="stat-label">套模板</div>', content)
content = re.sub(r'<div class="stat-num">10\+</div><div class="stat-label">种风格</div>', f'<div class="stat-num">6</div><div class="stat-label">种分类</div>', content)
content = re.sub(r'精选 28 套不同风格的落地页模板', f'精选 {total} 套不同风格的落地页模板', content)
content = re.sub(r'28 套模板 · 持续更新', f'{total} 套模板 · 持续更新', content)

# Replace filter buttons
old_filters = '''    <button class="fbtn active" data-filter="all">全部 (28)</button>
    <button class="fbtn" data-filter="dark">暗色系 (15)</button>
    <button class="fbtn" data-filter="light">亮色系 (11)</button>
    <button class="fbtn" data-filter="industry">行业专属 (3)</button>
    <button class="fbtn" data-filter="culture">国风文化 (3)</button>'''
new_filters = f'''    <button class="fbtn active" data-filter="all">全部 ({total})</button>
    <button class="fbtn" data-filter="dark">暗色系 ({dark_count})</button>
    <button class="fbtn" data-filter="light">亮色系 ({light_count})</button>
    <button class="fbtn" data-filter="ink">水墨国风 ({ink_count})</button>
    <button class="fbtn" data-filter="minimal">简约极简 ({minimal_count})</button>
    <button class="fbtn" data-filter="industry">行业专属 ({industry_count})</button>'''
content = content.replace(old_filters, new_filters)

# Replace the template grid content
# Find the grid section boundaries
grid_start = content.find('<div class="tpl-grid" id="tpl-grid">')
grid_end_marker = '\n</div>\n\n<!-- CTA BANNER -->'
grid_end = content.find(grid_end_marker, grid_start)

if grid_start > 0 and grid_end > 0:
    new_grid = f'''<div class="tpl-grid" id="tpl-grid">

{cards_html}

'''
    content = content[:grid_start] + new_grid + content[grid_end:]
    print(f"✅ Replaced grid section ({grid_start} to {grid_end})")
else:
    print(f"❌ Could not find grid boundaries: start={grid_start}, end={grid_end}")
    # Fallback: find and replace between markers
    import_marker = '<!-- TEMPLATE GRID -->'
    end_marker = '<!-- CTA BANNER -->'
    imp = content.find(import_marker)
    end = content.find(end_marker, imp)
    if imp > 0 and end > 0:
        content = content[:imp] + f'<!-- TEMPLATE GRID -->\n<div class="tpl-grid" id="tpl-grid">\n\n{cards_html}\n\n' + content[end:]
        print(f"✅ Fallback replacement worked")

with open('/root/template-shop/index.html', 'w') as f:
    f.write(content)

print(f"✅ index.html updated with {total} templates, {dark_count}+{light_count}+{ink_count}+{minimal_count}+{industry_count} categories")
print(f"File size: {len(content)} bytes, {content.count(chr(10))+1} lines")

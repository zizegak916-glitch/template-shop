#!/usr/bin/env python3
"""批量文本处理 - 模板描述英文化 + README + SEO metadata"""
import os, json, time, requests

# Load API key
KEY = ""
with open(os.path.expanduser('/root/.hermes/config.yaml')) as f:
    for line in f:
        if 'api_key' in line and 'tp-' in line:
            key = line.split('api_key:')[1].strip().strip('"').strip("'")
            if key.startswith('tp-'):
                KEY = key
                break

URL = "https://token-plan-cn.xiaomimimo.com/v1/chat/completions"
MODEL = "mimo-v2.5-pro"
OUTDIR = "/root/template-shop"

def call_api(system, user, max_tokens=4000):
    headers = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
        "max_tokens": max_tokens,
        "temperature": 0.5
    }
    resp = requests.post(URL, headers=headers, json=payload, timeout=120)
    data = resp.json()
    if "choices" in data and data["choices"]:
        return data["choices"][0]["message"]["content"], data.get("usage", {})
    else:
        err = data.get("error", {}).get("message", json.dumps(data)[:200])
        raise Exception(f"API error: {err}")

# ============================================================
# Task 1: Generate English descriptions for all templates
# ============================================================
print("=" * 60)
print("Task 1: 批量生成英文描述")
print("=" * 60)

# Collect all template info from index.html
import re

templates = []
with open(os.path.join(OUTDIR, "index.html"), "r") as f:
    content = f.read()

# Extract template cards
cards = re.findall(
    r'data-cat="([^"]*)"\s+data-name="([^"]*)"\s+data-desc="([^"]*)"',
    content
)

# Map Chinese names to English filenames
name_to_file = {}
for fname in os.listdir(OUTDIR):
    if fname.endswith('.html') and fname not in ['index.html', 'index-v1.html', 'changelog.html', 'docs.html']:
        name_to_file[fname.replace('.html', '')] = fname

# Known mappings
known_map = {
    "极光": "aurora", "大理石": "marble-luxe", "霓虹街区": "neon-district",
    "丝路": "silk-road", "Gemini Flow": "gemini-flow", "墨剑": "ink-wash",
    "Noir旗舰": "noir", "云端": "cloud-nine", "余烬": "ember-glow",
    "金箔": "gold-leaf", "破晓": "dawn-break", "虚空": "void-space",
    "山魂": "mountain-spirit", "潮起": "tide-rise", "月华": "moonlight",
    "水墨雾": "ink-mist", "丹青水墨": "ink-wash-v2", "丹青水墨V2": "ink-wash-v2",
    "水墨极致": "ink-ultimate", "侘寂": "wabi-sabi", "赛博禅": "cyber-zen",
    "赛博朋克": "cyberpunk", "流体渐变": "fluid-gradient", "玻璃态": "glassmorphism",
    "暗色极简": "dark-minimal", "暗色SaaS": "dark-saas", "像素复古": "pixel-retro",
    "蒸汽波": "vaporwave", "极光幻彩": "aurora-borealis", "霜晶": "frost-crystal",
    "深海": "deep-forest", "竹林": "bamboo-grove", "珍珠": "pearl-oyster",
    "绽放": "bloom-burst", "清爽亮色": "light-clean", "极简": "minimal",
    "AI产品": "ai-product", "工作室": "agency", "电商": "ecommerce",
    "金融科技": "fintech", "移动应用": "mobile-app", "铸铁": "steel-forge",
    "暗夜霓虹": "neon-nightscape", "翡翠森林": "jade-forest",
    "星轨银河": "star-trails", "深海幽光": "deep-sea-glow",
    "火山熔岩": "volcanic-lava", "极光冰原": "aurora-icefield",
    "节日灯火": "festival-lantern", "沙漠星空": "desert-starscape",
    "竹简古卷": "bamboo-scroll", "赛博水墨": "cyber-ink",
    "机械齿轮": "mech-gears", "樱花雨": "cherry-rain",
}

print(f"找到 {len(cards)} 个模板卡片")

# Batch translate descriptions (send all at once to save tokens)
sys_prompt = """You are a professional web designer and translator.
Given a list of Chinese landing page template descriptions, generate English versions.
For each template, output a JSON array with objects containing:
- "name_cn": the Chinese name
- "name_en": a short English name (2-3 words, kebab-case for URL)
- "desc_en": English description (same style as Chinese: feature1 · feature2 · feature3 · feature4)
- "tags_en": array of 2-3 English tags

Output ONLY valid JSON, no markdown fences."""

# Split into batches of 20 to avoid token limits
all_results = []
batch_size = 20
for i in range(0, len(cards), batch_size):
    batch = cards[i:i+batch_size]
    batch_input = json.dumps([{"cat": c[0], "name": c[1], "desc": c[2]} for c in batch], ensure_ascii=False)

    print(f"  翻译批次 {i//batch_size + 1} ({len(batch)} 个)...", end=" ", flush=True)
    try:
        result, usage = call_api(sys_prompt, f"Translate these templates:\n{batch_input}", max_tokens=4000)
        # Parse JSON
        if result.startswith("```"):
            result = result.split("\n", 1)[1].rsplit("```", 1)[0]
        parsed = json.loads(result)
        all_results.extend(parsed)
        print(f"✅ ({usage.get('total_tokens', 0)} tokens)")
    except Exception as e:
        print(f"❌ {str(e)[:80]}")
    time.sleep(2)

# Save English descriptions
desc_path = os.path.join(OUTDIR, "templates-en.json")
with open(desc_path, 'w') as f:
    json.dump(all_results, f, indent=2, ensure_ascii=False)
print(f"  已保存: {desc_path} ({len(all_results)} 条)")

# ============================================================
# Task 2: Generate README.md
# ============================================================
print(f"\n{'=' * 60}")
print("Task 2: 生成 README.md")
print("=" * 60)

readme_prompt = f"""Generate a professional README.md for a Template Shop project.

Project: Template Shop — 落地页模板合集
Total templates: {len(cards)} (was 50, now 63 with 12 new additions)
Hosted on: GitHub Pages (Cloudflare)
Stack: Pure HTML/CSS/JS, no frameworks

Categories:
- Dark themes (cyberpunk, noir, space, ember, steel, etc.)
- Light themes (cloud, dawn, frost, bloom, clean, etc.)
- Chinese ink/art themes (ink wash, mountain, bamboo, scroll, etc.)
- Luxury themes (gold, silk, marble, pearl, etc.)
- Industry themes (SaaS, fintech, ecommerce, agency, etc.)
- AI/Tech themes

New templates added (mimo-v2.5-pro):
1. 深海幽光 (Deep Sea Glow) — bioluminescent ocean
2. 火山熔岩 (Volcanic Lava) — molten lava flows
3. 极光冰原 (Aurora Icefield) — northern lights over ice
4. 节日灯火 (Festival Lantern) — Chinese lantern festival
5. 沙漠星空 (Desert Starscape) — desert night sky
6. 竹简古卷 (Bamboo Scroll) — ancient Chinese scrolls
7. 赛博水墨 (Cyber Ink) — cyberpunk + ink fusion
8. 机械齿轮 (Mech Gears) — steampunk gears
9. 樱花雨 (Cherry Rain) — sakura petals
10. 暗夜霓虹 (Neon Nightscape) — city neon
11. 翡翠森林 (Jade Forest) — jade green mystical forest
12. 星轨银河 (Star Trails) — star trail photography

Features:
- Dark/Light theme toggle
- Search & filter
- Lazy-loaded iframe previews
- Responsive design
- All templates are single HTML files (500+ lines each)

Write a complete README.md in Chinese with English section headers. Include:
1. Project title and description
2. Features list
3. Template categories table
4. Quick start / usage
5. Tech stack
6. License (MIT)
7. How to add new templates

Output ONLY the README content, no markdown fences around it."""

print("  生成README...", end=" ", flush=True)
try:
    readme_content, usage = call_api("You are a technical writer.", readme_prompt, max_tokens=3000)
    if readme_content.startswith("```"):
        readme_content = readme_content.split("\n", 1)[1].rsplit("```", 1)[0]
    readme_path = os.path.join(OUTDIR, "README.md")
    with open(readme_path, 'w') as f:
        f.write(readme_content)
    print(f"✅ ({usage.get('total_tokens', 0)} tokens, {len(readme_content)} chars)")
except Exception as e:
    print(f"❌ {str(e)[:80]}")

# ============================================================
# Task 3: Generate SEO metadata for all templates
# ============================================================
print(f"\n{'=' * 60}")
print("Task 3: 生成SEO元数据")
print("=" * 60)

seo_prompt = f"""Generate SEO metadata for {len(cards)} landing page templates.
For each template, create:
- title: SEO-optimized title (Chinese, 30-50 chars)
- description: Meta description (Chinese, 120-160 chars)
- keywords: Array of 5-8 relevant keywords

Input templates:
{json.dumps([{"name": c[1], "desc": c[2], "cat": c[0]} for c in cards], ensure_ascii=False)}

Output a JSON array. Output ONLY valid JSON."""

print("  生成SEO metadata...", end=" ", flush=True)
try:
    seo_result, usage = call_api("You are an SEO specialist.", seo_prompt, max_tokens=6000)
    if seo_result.startswith("```"):
        seo_result = seo_result.split("\n", 1)[1].rsplit("```", 1)[0]
    seo_data = json.loads(seo_result)
    seo_path = os.path.join(OUTDIR, "seo-metadata.json")
    with open(seo_path, 'w') as f:
        json.dump(seo_data, f, indent=2, ensure_ascii=False)
    print(f"✅ ({usage.get('total_tokens', 0)} tokens, {len(seo_data)} entries)")
except Exception as e:
    print(f"❌ {str(e)[:80]}")

print(f"\n{'=' * 60}")
print("批量文本处理完成!")
print(f"{'=' * 60}")

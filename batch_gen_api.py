#!/usr/bin/env python3
"""批量生成新模板 - mimo-v2.5-pro via token-plan-cn API"""
import os, json, time, requests, sys

# Load API key
env = {}
with open(os.path.expanduser('/root/.hermes/config.yaml')) as f:
    for line in f:
        line = line.strip()
        if 'api_key' in line and 'tp-' in line:
            key = line.split('api_key:')[1].strip().strip('"').strip("'")
            if key.startswith('tp-'):
                env['XIAOMI_API_KEY'] = key
                break

KEY = env.get('XIAOMI_API_KEY', '')
if not KEY:
    # fallback: try .bashrc
    import subprocess
    result = subprocess.run(['bash', '-c', 'source /root/.bashrc && echo $XIAOMI_API_KEY'], capture_output=True, text=True)
    KEY = result.stdout.strip()

URL = "https://token-plan-cn.xiaomimimo.com/v1/chat/completions"
MODEL = "mimo-v2.5-pro"
OUTDIR = "/root/template-shop"

SYSTEM_PROMPT = """You are a world-class frontend developer creating premium landing page templates.
Create a COMPLETE, PRODUCTION-READY single HTML file with ALL CSS and JS embedded inline.
Requirements:
- SINGLE HTML FILE: all CSS in <style>, all JS in <script>
- Visually stunning with smooth CSS animations (transform/opacity based)
- Fully responsive (mobile-first breakpoints at 640px, 1024px)
- CSS custom properties for theming
- data-theme="dark" or "light" on <html>
- Theme toggle button (sun/moon icon, top-right corner)
- Chinese demo text for all content
- Sections: hero, features grid (3-4 items), stats/testimonials, CTA, footer
- Minimum 500 lines of code
- NO external JS libraries (Google Fonts via <link> is OK)
- Smooth scroll, intersection observer for reveal animations
- Beautiful hover effects on cards and buttons
- Output ONLY the complete HTML code, no markdown fences, no explanations"""

TEMPLATES = [
    {"file": "deep-sea-glow.html", "name": "深海幽光", "prompt":
     "Deep sea bioluminescence. Dark ocean bg #020814. CSS bioluminescent particles floating upward. Jellyfish CSS shapes. Color: deep navy #0a1628, cyan #00e5ff, purple #1a0033, green #39ff14. Hero with depth gradient + glow particles + '深海幽光' title. Bubble-shaped cards. Glowing stats. CTA bioluminescent gradient. data-theme=dark."},
    {"file": "volcanic-lava.html", "name": "火山熔岩", "prompt":
     "Volcanic lava flow. Dark bg #0f0503. CSS lava gradient morphing animation. Ember particles rising. Cracked earth CSS texture. Color: obsidian #0f0503, orange #ff4500, red #8b0000, gold #ffa500. Hero with flowing lava + heat haze + '火山熔岩' fire text. Ember-glow cards. Fire stats. CTA lava gradient. data-theme=dark."},
    {"file": "aurora-icefield.html", "name": "极光冰原", "prompt":
     "Aurora over frozen landscape. Dark sky #0a0a2e. CSS aurora wave bands (green/purple/pink). Snowflake particles. Ice crystals. Color: night #0a0a2e, aurora green #00ff88, purple #8844ff, ice white #e8f0ff. Hero with animated aurora + snow + '极光冰原' title. Frost-glass cards. Aurora stats. CTA aurora gradient. data-theme=dark."},
    {"file": "festival-lantern.html", "name": "节日灯火", "prompt":
     "Chinese lantern festival. Dark red bg #1a0a0a. CSS hanging lanterns with glow. Floating sky lanterns rising. Color: red #cc0000, gold #ffd700, amber #ff8c00. Hero with glowing lanterns + floating lanterns + '节日灯火' gold title. Lantern-framed cards. Gold stats. CTA red-gold gradient. data-theme=dark."},
    {"file": "desert-starscape.html", "name": "沙漠星空", "prompt":
     "Desert night sky. Gradient sand #d4a574 bottom to night #0a0a2e top. CSS twinkling stars. Sand dune silhouettes. Milky way band. Color: sand #d4a574, night #0a0a2e, white #fff, amber #e8a849. Hero with stars + dunes + '沙漠星空' title. Star-accented cards. Warm stats. CTA desert gradient. data-theme=dark."},
    {"file": "bamboo-scroll.html", "name": "竹简古卷", "prompt":
     "Ancient bamboo scroll. Parchment bg #f5e6c8. Bamboo green #2d5016 accents. Scroll texture patterns. Brush strokes. Color: parchment #f5e6c8, bamboo #2d5016, ink #1a1a1a, gold seal #c9a96e. Hero with scroll unroll animation + '竹简古卷' title. Scroll-shaped cards. Seal-stamp stats. CTA brush button. data-theme=light."},
    {"file": "cyber-ink.html", "name": "赛博水墨", "prompt":
     "Cyberpunk ink fusion. Dark bg #080810. Ink wash + neon overlay. Glitch calligraphy. Color: ink #0a0a0f, neon purple #bf00ff, electric blue #00d4ff, gray #888. Hero with ink background + neon glitch + '赛博水墨' title. Ink-neon hybrid cards. Glitch stats. CTA neon-on-ink. data-theme=dark."},
    {"file": "mech-gears.html", "name": "机械齿轮", "prompt":
     "Steampunk mechanical gears. Dark industrial bg #1a1510. CSS rotating gear animations. Rivets + metal textures. Color: brass #b8860b, copper #b87333, iron #2a2520, steam #e8dcc8. Hero with rotating gears + steam + '机械齿轮' brass title. Gear-framed cards. Mechanical counter stats. CTA brass gradient. data-theme=dark."},
    {"file": "cherry-rain.html", "name": "樱花雨", "prompt":
     "Cherry blossom rain. Light pink bg #fff5f5. Sakura pink #ffb7c5. CSS falling petals (multi-layer). Branch silhouettes. Color: sakura #ffb7c5, white #fff5f5, brown #5c4033, green #90ee90. Hero with falling petals + branch + '樱花雨' elegant title. Petal-shaped cards. Pink stats. CTA sakura gradient. data-theme=light."},
    {"file": "neon-nightscape.html", "name": "暗夜霓虹", "prompt":
     "Neon city nightscape. Very dark bg #050510. Neon reflections. CSS rain + neon glow. Wet street gradients. Color: dark #050510, pink #ff1493, blue #00bfff, green #39ff14. Hero with neon cityscape + rain + '暗夜霓虹' flickering title. Neon glass cards. Neon glow stats. CTA neon pulse. data-theme=dark."},
    {"file": "jade-forest.html", "name": "翡翠森林", "prompt":
     "Mystical jade forest. Dark green bg #041a0f. Jade green #00c878. Dappled light (moving gradients). Crystal CSS shapes. Color: forest #041a0a, jade #00c878, emerald #50c878, gold #d4af37. Hero with forest layers + jade glow + '翡翠森林' title. Crystal-framed cards. Jade stats. CTA emerald gradient. data-theme=dark."},
    {"file": "star-trails.html", "name": "星轨银河", "prompt":
     "Star trails long-exposure. Dark sky #050510. CSS rotating star trails (conic-gradient). Meteor streaks. Color: night #050510, white #fff, blue #4488ff, purple #8844ff. Hero with rotating trails + meteor + '星轨银河' title. Constellation cards. Trail-gradient stats. CTA galaxy gradient. data-theme=dark."},
]

def call_api(prompt, max_tokens=16000):
    headers = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": max_tokens,
        "temperature": 0.7
    }
    resp = requests.post(URL, headers=headers, json=payload, timeout=300)
    data = resp.json()
    if "choices" in data and data["choices"]:
        content = data["choices"][0]["message"]["content"]
        # Strip markdown fences
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            content = "\n".join(lines)
        return content, data.get("usage", {})
    else:
        err = data.get("error", {}).get("message", json.dumps(data)[:300])
        raise Exception(f"API error: {err}")

# Progress
PROGRESS = "/tmp/template_api_progress.json"
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f:
        prog = json.load(f)
else:
    prog = {"completed": [], "failed": []}

completed = set(prog["completed"])
total = len(TEMPLATES)

print(f"=== 批量生成 {total} 个新模板 (mimo-v2.5-pro API) ===")
print(f"开始: {time.strftime('%Y-%m-%d %H:%M:%S')}")

total_tokens = 0

for i, t in enumerate(TEMPLATES):
    fname = t["file"]
    num = i + 1

    # Skip if already done
    fpath = os.path.join(OUTDIR, fname)
    if fname in completed and os.path.exists(fpath) and os.path.getsize(fpath) > 1000:
        print(f"[{num}/{total}] SKIP: {fname} (已完成)")
        continue

    # Also skip if file already exists and is big enough
    if os.path.exists(fpath) and os.path.getsize(fpath) > 1000:
        print(f"[{num}/{total}] SKIP: {fname} (文件已存在 {os.path.getsize(fpath)} bytes)")
        prog["completed"].append(fname)
        completed.add(fname)
        with open(PROGRESS, 'w') as f:
            json.dump(prog, f)
        continue

    print(f"[{num}/{total}] 生成: {fname} ({t['name']})...", end=" ", flush=True)

    try:
        content, usage = call_api(t["prompt"])
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)

        lines = content.count('\n') + 1
        size = len(content)
        tokens = usage.get('total_tokens', 0)
        total_tokens += tokens
        print(f"✅ {lines} 行, {size} 字节, {tokens} tokens")

        prog["completed"].append(fname)
        completed.add(fname)
        with open(PROGRESS, 'w') as f:
            json.dump(prog, f)

    except Exception as e:
        print(f"❌ {str(e)[:100]}")
        prog["failed"].append({"file": fname, "error": str(e)[:200]})
        with open(PROGRESS, 'w') as f:
            json.dump(prog, f)

    # Memory check
    with open('/proc/meminfo') as mf:
        for line in mf:
            if 'MemAvailable' in line:
                avail_kb = int(line.split()[1])
                if avail_kb < 80000:
                    print(f"  ⚠️ 内存紧张 ({avail_kb}kB), 等20秒...")
                    time.sleep(20)
                break

    # Rate limit pause
    if i < len(TEMPLATES) - 1:
        time.sleep(3)

print(f"\n=== 完成 {time.strftime('%Y-%m-%d %H:%M:%S')} ===")
print(f"✅ 成功: {len(prog['completed'])} 个")
print(f"❌ 失败: {len(prog['failed'])} 个")
print(f"🪙 总tokens: {total_tokens}")
for f in prog["completed"]:
    print(f"  ✅ {f}")
for f in prog["failed"]:
    print(f"  ❌ {f['file']}: {f.get('error', '')[:80]}")

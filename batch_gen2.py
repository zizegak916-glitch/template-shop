#!/usr/bin/env python3
"""第二批模板生成 - 11个全新主题"""
import os, json, time, requests

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

SYSTEM = """You are a world-class frontend developer creating premium landing page templates.
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
    {"file": "dark-matter.html", "name": "暗物质", "prompt": "Dark matter cosmic visualization. Pure black bg #000 with dark matter web filaments (CSS gradients + animation). Particle cluster effects. Color: void black #000, dark matter purple #1a0033, energy blue #0066ff, cluster glow #ff3366. Hero with dark matter web animation + particle clusters + '暗物质' title in energy glow. Network-connected cards. Cosmic stats. CTA energy gradient. data-theme=dark."},
    {"file": "ink-painting.html", "name": "水墨丹青", "prompt": "Traditional Chinese ink painting. Rice paper bg #f5f0e8 with ink black #1a1a1a accents. CSS brush stroke animations. Ink splash effects. Color: rice paper #f5f0e8, ink black #1a1a1a, seal red #cc0000, jade green #00c878. Hero with ink painting landscape + brush stroke animation + '水墨丹青' calligraphy title. Ink-splash cards. Seal stamp stats. CTA ink brush button. data-theme=light."},
    {"file": "minimal-white.html", "name": "极简白", "prompt": "Ultra clean minimal white. Pure white bg #ffffff with subtle gray accents. Extreme whitespace. Hairline borders. Color: white #ffffff, near-black #111, subtle gray #e5e5e5, accent blue #2563eb. Hero with massive whitespace + single bold headline + '极简白' title. Ultra-clean cards with hairline borders. Minimal stats. CTA outline button. data-theme=light."},
    {"file": "coral-reef.html", "name": "深海珊瑚", "prompt": "Underwater coral reef. Deep ocean bg #001833 with coral colors. CSS coral shapes (branching borders). Bubble particles rising. Color: ocean deep #001833, coral pink #ff6b6b, coral orange #ff8c42, sea green #20bf55, water blue #0099ff. Hero with coral reef scene + rising bubbles + '深海珊瑚' title. Coral-shaped cards. Underwater stats. CTA ocean gradient. data-theme=dark."},
    {"file": "cyber-cultivation.html", "name": "赛博修仙", "prompt": "Cyberpunk cultivation fusion. Dark bg #0a0a14 with neon qi circuits. Digital mandalas. Holographic cultivation stages. Color: void #0a0a14, qi cyan #00ffcc, stage gold #ffd700, tribulation red #ff1744. Hero with digital mandala + qi flow circuits + '赛博修仙' title in neon. Circuit-mandala cards. Cultivation stage stats. CTA qi gradient. data-theme=dark."},
    {"file": "dark-gothic.html", "name": "暗黑哥特", "prompt": "Dark gothic cathedral. Near-black bg #0a0510 with stained glass colors. CSS rose window pattern. Flying buttress shapes. Color: void #0a0510, stained red #8b0000, stained blue #1a237e, gold #c9a96e, stone gray #3a3a3a. Hero with gothic arch + stained glass light + '暗黑哥特' title. Gothic arch cards. Cathedral stats. CTA stained glass gradient. data-theme=dark."},
    {"file": "warp-drive.html", "name": "星际迷航", "prompt": "Space exploration warp drive. Deep space bg #000011 with star streaks. CSS warp speed lines (radial animation). Nebula clouds. Color: space #000011, warp blue #00bfff, nebula purple #7b2ff7, star white #ffffff, alert red #ff3333. Hero with warp speed star streaks + nebula + '星际迷航' title with motion blur. Starship-inspired cards. Fleet stats. CTA warp gradient. data-theme=dark."},
    {"file": "neon-city.html", "name": "赛博城市", "prompt": "Cyberpunk city streetscape. Dark rain bg #0a0a14 with neon reflections. CSS rain animation. Holographic billboards. Color: dark #0a0a14, neon pink #ff1493, neon cyan #00e5ff, neon yellow #ffd700, rain gray #1a1a2e. Hero with neon cityscape + rain + holographic signs + '赛博城市' title. Holographic cards. City stats. CTA neon gradient. data-theme=dark."},
    {"file": "ink-landscape.html", "name": "水墨山水", "prompt": "Chinese ink landscape painting. Misty bg #f0ece4 with ink mountains. CSS mountain layers with mist. Flowing water effect. Color: mist #f0ece4, ink #1a1a1a, water blue #4a6fa5, bamboo green #2d5016. Hero with layered ink mountains + mist animation + '水墨山水' title in calligraphy. Mountain-layer cards. Landscape stats. CTA ink button. data-theme=light."},
    {"file": "aurora-forest.html", "name": "极光森林", "prompt": "Northern lights over mystical forest. Dark forest bg #020a05 with aurora bands above trees. CSS tree silhouettes. Aurora wave animation. Color: forest #020a05, aurora green #00ff88, aurora purple #8844ff, tree black #0a1a0a, firefly gold #ffd700. Hero with aurora over forest silhouette + fireflies + '极光森林' title. Forest-mist cards. Nature stats. CTA aurora gradient. data-theme=dark."},
    {"file": "glacier.html", "name": "冰川", "prompt": "Massive glacier landscape. Ice blue bg #e8f4f8 with glacier formations. CSS ice crystal patterns. Crevasse depth effects. Color: ice white #e8f4f8, glacier blue #4fc3f7, deep crevasse #0d47a1, snow #ffffff. Hero with glacier formation + ice crystal particles + '冰川' title in ice text. Ice-block cards. Glacier stats. CTA ice gradient. data-theme=light."},
]

def call_api(prompt, max_tokens=16000):
    headers = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    payload = {"model": MODEL, "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}], "max_tokens": max_tokens, "temperature": 0.7}
    resp = requests.post(URL, headers=headers, json=payload, timeout=300)
    data = resp.json()
    if "choices" in data and data["choices"]:
        content = data["choices"][0]["message"]["content"]
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"): lines = lines[1:]
            if lines and lines[-1].strip() == "```": lines = lines[:-1]
            content = "\n".join(lines)
        return content, data.get("usage", {})
    raise Exception(f"API error: {data.get('error',{}).get('message',json.dumps(data)[:200])}")

total = len(TEMPLATES)
print(f"=== 第二批 {total} 个模板 (mimo-v2.5-pro) ===")
print(f"开始: {time.strftime('%H:%M:%S')}")

for i, t in enumerate(TEMPLATES):
    fpath = os.path.join(OUTDIR, t["file"])
    if os.path.exists(fpath) and os.path.getsize(fpath) > 1000:
        print(f"[{i+1}/{total}] SKIP: {t['file']}")
        continue

    print(f"[{i+1}/{total}] {t['name']}...", end=" ", flush=True)
    try:
        content, usage = call_api(t["prompt"])
        with open(fpath, 'w') as f: f.write(content)
        lines = content.count('\n') + 1
        print(f"✅ {lines}行 {len(content)}B {usage.get('total_tokens',0)}tok")
    except Exception as e:
        print(f"❌ {str(e)[:80]}")
    time.sleep(3)

print(f"\n完成: {time.strftime('%H:%M:%S')}")

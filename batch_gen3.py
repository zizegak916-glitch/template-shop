#!/usr/bin/env python3
"""第三批模板 - 10个"""
import os, json, time, requests

KEY = ""
with open(os.path.expanduser('/root/.hermes/config.yaml')) as f:
    for line in f:
        if 'api_key' in line and 'tp-' in line:
            key = line.split('api_key:')[1].strip().strip('"').strip("'")
            if key.startswith('tp-'): KEY = key; break

URL = "https://token-plan-cn.xiaomimimo.com/v1/chat/completions"
SYSTEM = """You are a world-class frontend developer creating premium landing page templates.
Create a COMPLETE, PRODUCTION-READY single HTML file with ALL CSS and JS embedded inline.
Requirements: SINGLE HTML FILE, CSS in <style>, JS in <script>, responsive, data-theme, theme toggle, Chinese text, hero+features+stats+CTA+footer, 500+ lines, Google Fonts OK, NO external JS, smooth animations. Output ONLY complete HTML."""

TEMPLATES = [
    {"file": "sakura-dream.html", "name": "樱花梦", "prompt": "Cherry blossom dreamlike. Soft pink-white bg #fff0f5. CSS sakura petals falling (multiple layers, varying speeds). Dreamy blur effects. Color: sakura #ffb7c5, dream white #fff0f5, soft pink #ffc0cb, branch brown #5c4033. Hero with floating petals + dreamy blur + '樱花梦' title. Dreamy cards. Pink stats. CTA sakura gradient. data-theme=light."},
    {"file": "neon-velocity.html", "name": "霓虹极速", "prompt": "Neon velocity racing. Dark bg #0a0a0f with speed lines. CSS neon streaks (linear gradients + animation). Color: dark #0a0a0f, neon red #ff0040, neon blue #00d4ff, speed white #fff. Hero with speed lines + neon glow + '霓虹极速' title. Racing cards. Speed stats. CTA neon gradient. data-theme=dark."},
    {"file": "ink-bamboo.html", "name": "墨竹", "prompt": "Ink bamboo minimalist. Off-white bg #f8f6f0 with ink black. CSS bamboo stalks (gradients). Ink wash effect. Color: paper #f8f6f0, ink #1a1a1a, bamboo green #2d5016, seal red #cc0000. Hero with ink bamboo + brush stroke + '墨竹' title. Minimal ink cards. Brush stats. CTA ink button. data-theme=light."},
    {"file": "cosmos-deep.html", "name": "宇宙深渊", "prompt": "Deep cosmos abyss. Pure black #000 with distant galaxies. CSS star field + galaxy spiral. Color: void #000, galaxy purple #4a0080, star white #fff, nebula pink #ff69b4. Hero with galaxy spiral + star field + '宇宙深渊' title. Galaxy cards. Cosmic stats. CTA nebula gradient. data-theme=dark."},
    {"file": "golden-dragon.html", "name": "金龙", "prompt": "Golden dragon Chinese luxury. Dark red bg #1a0000 with gold. CSS dragon scale pattern. Color: dragon red #8b0000, imperial gold #ffd700, black #0a0a0a. Hero with dragon scale texture + gold glow + '金龙' title. Imperial cards. Dragon stats. CTA gold-red gradient. data-theme=dark."},
    {"file": "frost-bloom.html", "name": "霜花", "prompt": "Frost bloom ice flowers. Cool white bg #f0f8ff with ice blue. CSS frost crystal patterns (hexagonal). Color: ice #f0f8ff, frost blue #b0d4f1, crystal #e0f0ff, accent purple #7c3aed. Hero with frost crystals + ice bloom + '霜花' title. Crystal cards. Frost stats. CTA ice gradient. data-theme=light."},
    {"file": "cyber-samurai.html", "name": "赛博武士", "prompt": "Cyberpunk samurai. Dark bg #0a0515 with neon katana. CSS neon blade glow. Color: void #0a0515, katana red #ff1744, neon blue #00e5ff, steel #c0c0c0. Hero with neon katana + digital bushido + '赛博武士' title. Samurai cards. Blade stats. CTA neon-red gradient. data-theme=dark."},
    {"file": "autumn-maple.html", "name": "秋枫", "prompt": "Autumn maple warmth. Warm bg #fdf6e3 with maple colors. CSS falling maple leaves. Color: parchment #fdf6e3, maple red #d4380d, orange #ff8c00, gold #daa520. Hero with falling maple leaves + warm gradient + '秋枫' title. Warm cards. Autumn stats. CTA maple gradient. data-theme=light."},
    {"file": "deep-ocean.html", "name": "深海", "prompt": "Deep ocean abyss. Dark blue bg #001122 with depth layers. CSS light rays from surface. Color: deep #001122, light ray #0099ff, surface #0066aa, bioluminescent #00ffcc. Hero with depth gradient + light rays + '深海' title. Depth-layer cards. Ocean stats. CTA depth gradient. data-theme=dark."},
    {"file": "pixel-city.html", "name": "像素都市", "prompt": "Pixel art city. Dark bg #1a1a2e with pixel grid. CSS pixel blocks. Retro colors. Color: dark #1a1a2e, pixel green #00ff41, pixel pink #ff6ec7, pixel blue #00d4ff. Hero with pixel cityscape + grid overlay + '像素都市' title. Pixel-art cards. Retro stats. CTA pixel gradient. data-theme=dark."},
]

def call_api(prompt, max_tokens=16000):
    headers = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    payload = {"model": "mimo-v2.5-pro", "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}], "max_tokens": max_tokens, "temperature": 0.7}
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
    raise Exception(f"API: {data.get('error',{}).get('message','?')[:200]}")

total = len(TEMPLATES)
print(f"=== 第三批 {total} 个模板 ===")
for i, t in enumerate(TEMPLATES):
    fpath = os.path.join("/root/template-shop", t["file"])
    if os.path.exists(fpath) and os.path.getsize(fpath) > 1000:
        print(f"[{i+1}/{total}] SKIP: {t['file']}")
        continue
    print(f"[{i+1}/{total}] {t['name']}...", end=" ", flush=True)
    try:
        content, usage = call_api(t["prompt"])
        with open(fpath, 'w') as f: f.write(content)
        print(f"✅ {content.count(chr(10))+1}行 {len(content)}B")
    except Exception as e:
        print(f"❌ {str(e)[:80]}")
    time.sleep(3)
print(f"\n完成: {time.strftime('%H:%M:%S')}")

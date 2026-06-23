#!/usr/bin/env python3
"""Batch generate 20 landing page templates using MIMO + DeepSeek APIs"""
import os, json, time, requests, sys

# Load API keys
env = {}
with open(os.path.expanduser('/root/.hermes/.env')) as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k] = v

MIMO_KEY = env.get('XIAOMI_API_KEY', '')
DS_KEY = env.get('DEEPSEEK_API_KEY', '')

MIMO_URL = "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions"
DS_URL = "https://api.deepseek.com/v1/chat/completions"

SYSTEM_PROMPT = """You are a world-class frontend developer creating premium landing page templates sold as a product pack.
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
- Minimum 400 lines of code
- NO external JS libraries (Google Fonts via <link> is OK)
- Smooth scroll, intersection observer for reveal animations
- Beautiful hover effects on cards and buttons
- Output ONLY the complete HTML code, no markdown fences, no explanations"""

TEMPLATES = [
    # === MIMO TEMPLATES (8) ===
    {"file": "ink-mist.html", "name": "水墨雾", "cat": "dark", "tag": "tag-ink",
     "desc": "暗色水墨雾气 · 墨分五色 · CSS雾气扩散 · 水墨卡片",
     "feats": ["墨分五色", "雾气扩散", "水墨卡片", "留白构图"],
     "prompt": "Dark ink wash mist landing page. Background #0a0a0f. CSS ink diffusion via radial gradients + blur. Animated mist layers with CSS keyframes. Chinese calligraphy headings (Noto Serif SC). Cards with ink-splash borders using clip-path. Scroll-triggered ink spreading. Color: black, charcoal, misty white, subtle indigo. Hero: large '墨' character with ink mist. 3 feature cards with ink backgrounds. Stats. CTA with brush stroke button."},
    
    {"file": "bamboo-grove.html", "name": "竹林", "cat": "light", "tag": "tag-minimal",
     "desc": "亮色竹林极简 · 竹节装饰 · 竹叶飘动 · 简约留白",
     "feats": ["竹节装饰", "竹叶飘动", "极简留白", "清新绿调"],
     "prompt": "Light bamboo grove minimalist landing page. Clean white bg #fafaf8 with bamboo green #2d5016 accents. CSS bamboo stalk decorations. Gentle swaying animation. Clean sans-serif (Inter). Leaf SVG dividers. Cards with green border-left. Scroll fade-up. Hero with floating bamboo leaves. Features grid. Testimonials. CTA green gradient. Footer with bamboo border."},
    
    {"file": "gold-leaf.html", "name": "金箔", "cat": "dark", "tag": "tag-luxury",
     "desc": "暗色金箔轻奢 · 金粉粒子 · 金色渐变文字 · 奢华质感",
     "feats": ["金粉粒子", "金色渐变字", "奢华卡片", "光晕边框"],
     "prompt": "Dark gold leaf luxury landing page. Black bg #0a0a0a with gold #c9a96e accents. Canvas gold particle shimmer. Gold gradient text headings. Luxury cards with gold borders + glow. Thin gold line dividers. Serif headings (Cormorant Garamond + Inter). Floating gold dust animation. Hero with gold text + particle bg. Features with gold icons. Stats. CTA with gold gradient border."},
    
    {"file": "cloud-nine.html", "name": "云端", "cat": "light", "tag": "tag-minimal",
     "desc": "亮色云端轻盈 · 浮云动画 · 天空渐变 · 呼吸感",
     "feats": ["浮云动画", "天空渐变", "轻盈卡片", "呼吸动效"],
     "prompt": "Light cloud nine airy landing page. Soft gradient bg light blue to white. Floating cloud shapes (CSS border-radius + animation). Gentle parallax on cloud layers. Clean airy typography, lots of whitespace. Cards with soft shadows + rounded corners. Smooth fade animations. Hero with animated floating clouds. Features with cloud-shaped icons. Stats. CTA sky-blue gradient. Footer with cloud border."},
    
    {"file": "ember-glow.html", "name": "余烬", "cat": "dark", "tag": "tag-warm",
     "desc": "暗色余烬暖调 · 余烬粒子 · 火焰渐变 · 暗夜篝火",
     "feats": ["余烬粒子", "火焰渐变", "暖光卡片", "篝火氛围"],
     "prompt": "Dark ember glow landing page. Dark bg #0f0a08 with warm ember effects. CSS ember particles rising from bottom. Warm gradients: deep red, orange, amber. Cards with ember-glow border (box-shadow cycling). Bold sans-serif, warm white text. Fire gradient animations. Scroll ember burst. Hero with rising ember particles. Features with fire-glow icons. Stats warm numbers. CTA ember gradient + glow."},
    
    {"file": "frost-crystal.html", "name": "霜晶", "cat": "light", "tag": "tag-glass",
     "desc": "亮色霜晶冰感 · 冰晶图案 · 磨砂玻璃 · 极地蓝调",
     "feats": ["冰晶图案", "磨砂玻璃", "雪花粒子", "极地蓝调"],
     "prompt": "Light frost crystal landing page. Cool white bg #f0f4f8 with ice-blue #a8d8ea accents. CSS frost crystal hexagonal patterns. Ice-shimmer animation on borders. Clean crisp typography. Frosted glass cards (backdrop-filter: blur). CSS snowflake particles. Ice-crystal reveal on scroll. Hero with frost pattern bg. Features hexagonal icon frames. Stats ice-blue numbers. CTA frost gradient + crystal border."},
    
    {"file": "void-space.html", "name": "虚空", "cat": "dark", "tag": "tag-ai",
     "desc": "暗色虚空深空 · 星空粒子 · 星云渐变 · 宇宙深邃",
     "feats": ["星空粒子", "星云渐变", "虫洞动画", "深空探索"],
     "prompt": "Dark void space landing page. Pure black #000 with deep purple/blue nebula gradients. CSS starfield (box-shadow or animation). Floating nebula clouds (radial gradients + animation). Futuristic sans-serif with glow. Dark glass cards + star borders. Warp-speed lines on scroll. Parallax star layers. Hero with starfield + nebula + glowing text. Features constellation-connected icons. Stats glowing counters. CTA nebula gradient + pulse glow."},
    
    {"file": "dawn-break.html", "name": "破晓", "cat": "light", "tag": "tag-warm",
     "desc": "亮色破晓晨光 · 日出渐变 · 光线动画 · 温暖希望",
     "feats": ["日出渐变", "光线动画", "晨曦卡片", "温暖色调"],
     "prompt": "Light dawn break landing page. Gradient bg warm peach to light blue (dawn sky). Animated sun-rise CSS gradient. Gentle light ray animations. Clean hopeful typography with warm tones. Cards with sunrise gradient borders. Scroll light burst animations. Hero with animated sunrise bg + centered text. Features sun-ray icon backgrounds. Stats warm gradient numbers. CTA sunrise gradient button. Footer horizon line."},
    
    # === DEEPSEEK TEMPLATES (8) ===
    {"file": "mountain-spirit.html", "name": "山魂", "cat": "dark", "tag": "tag-ink",
     "desc": "暗色山魂国风 · 山峦剪影 · 云雾缭绕 · 巍峨壮阔",
     "feats": ["山峦剪影", "云雾缭绕", "层叠构图", "水墨远山"],
     "prompt": "Dark mountain spirit Chinese landscape landing page. Dark bg #0a0a12. CSS mountain silhouettes using layered gradients. Animated cloud/mist layers drifting across. Color: dark indigo, misty gray, warm gold accents. Hero: layered mountain silhouettes with mist animation + '山魂' title. Features with mountain-peak shaped cards. Stats section. CTA with gold accent on dark. Traditional Chinese aesthetic meets modern web design. Scroll parallax on mountain layers."},
    
    {"file": "tide-rise.html", "name": "潮起", "cat": "light", "tag": "tag-ocean",
     "desc": "亮色潮起海浪 · 波浪动画 · 海洋蓝调 · 动感澎湃",
     "feats": ["波浪动画", "海洋渐变", "潮汐节奏", "澎湃力量"],
     "prompt": "Light tide rise ocean landing page. Gradient bg ocean blue to white. CSS wave animations at bottom of sections (SVG waves or border-radius animation). Typography clean modern. Cards with wave-shaped top borders. Scroll-triggered wave ripple. Color: ocean blue #0077b6, sea foam #90e0ef, white, sand beige. Hero with animated wave background. Features with wave icon decorations. Stats. CTA ocean gradient. Footer with wave border."},
    
    {"file": "deep-forest.html", "name": "密林", "cat": "dark", "tag": "tag-botanical",
     "desc": "暗色密林幽深 · 树影婆娑 · 苔藓质感 · 森林呼吸",
     "feats": ["树影婆娑", "苔藓质感", "森林呼吸", "幽深秘境"],
     "prompt": "Dark deep forest landing page. Dark green bg #0a1a0f with layered forest canopy gradients. CSS leaf/branch shadow patterns. Animated dappled light effects (moving gradient spots). Typography earthy elegant. Cards with moss-green accents + bark texture borders. Subtle breathing animation (scale pulse). Hero with layered forest silhouettes + light rays. Features with leaf-shaped icons. Stats. CTA green gradient. Footer with vine border."},
    
    {"file": "moonlight.html", "name": "月华", "cat": "light", "tag": "tag-minimal",
     "desc": "亮色月华银辉 · 月光渐变 · 星星点缀 · 静谧优雅",
     "feats": ["月光渐变", "星星点缀", "银辉卡片", "静谧之夜"],
     "prompt": "Light moonlight silver landing page. Gradient from deep blue-purple top to silver-white bottom (moonlit sky). CSS moon circle glow effect. Twinkling star dots animation. Typography elegant thin weight. Cards with silver borders + moonlight glow. Scroll-triggered star twinkle. Color: midnight #1a1a3e (hero), silver #c0c0c0, moonlight #f0f0ff, lavender. Hero with large glowing moon + stars + '月华' title. Features with crescent moon icons. Stats. CTA silver gradient."},
    
    {"file": "steel-forge.html", "name": "铸铁", "cat": "dark", "tag": "tag-brutal",
     "desc": "暗色铸铁工业 · 金属质感 · 火花飞溅 · 硬核锻造",
     "feats": ["金属质感", "火花飞溅", "锻造动画", "工业硬核"],
     "prompt": "Dark steel forge industrial landing page. Dark metallic bg #111 with steel gray accents. CSS metallic gradient effects on cards/headers. Animated sparks/particles (small bright dots rising). Bold industrial typography. Cards with metallic borders + rivets (CSS dots). Heavy weight feel. Hero with steel texture + spark particles + '铸铁' title. Features with gear/anvil icons. Stats metallic numbers. CTA with fire-orange gradient on dark. Footer with industrial border."},
    
    {"file": "pearl-oyster.html", "name": "珍珠", "cat": "light", "tag": "tag-luxury",
     "desc": "亮色珍珠柔光 · 虹彩渐变 · 贝壳纹理 · 优雅圆润",
     "feats": ["虹彩渐变", "贝壳纹理", "柔光卡片", "圆润优雅"],
     "prompt": "Light pearl oyster luxury landing page. Soft pearlescent gradient bg (white to soft pink to soft blue - iridescent). CSS iridescent shimmer animation on cards/headers. Elegant rounded typography. Cards with pearl-like border gradients + soft glow. Nacre/mother-of-pearl color shifting effect. Hero with large pearl sphere (CSS gradient) + iridescent background. Features with shell-shaped decorations. Stats. CTA with pearlescent gradient. Footer with shell pattern."},
    
    {"file": "shadow-flow.html", "name": "暗流", "cat": "dark", "tag": "tag-dark",
     "desc": "暗色暗流涌动 · 流体渐变 · 暗涌动画 · 神秘深邃",
     "feats": ["流体渐变", "暗涌动画", "深邃卡片", "神秘纹理"],
     "prompt": "Dark shadow flow landing page. Very dark bg #050508 with subtle flowing gradients (dark purple to dark blue). CSS fluid gradient animation (slow color morphing). Typography modern geometric. Cards with dark glass effect + subtle gradient borders. Animated shadow waves in background. Hero with flowing dark gradient + large '暗流' title with gradient text. Features with flow/wave icons. Stats with gradient numbers. CTA dark gradient with glow edge. Footer minimal."},
    
    {"file": "bloom-burst.html", "name": "绽放", "cat": "light", "tag": "tag-warm",
     "desc": "亮色绽放生机 · 花瓣飞舞 · 春日色彩 · 生机盎然",
     "feats": ["花瓣飞舞", "春日色彩", "绽放动画", "生机卡片"],
     "prompt": "Light bloom burst spring landing page. Gradient bg from soft white to pale pink to pale green (spring garden). CSS flower petal animations floating down. Color: cherry blossom pink #ffb7c5, spring green #90ee90, soft white, lavender. Typography fresh modern. Cards with floral-inspired rounded borders + petal accents. Scroll-triggered bloom animation (elements growing from small to full). Hero with floating petals + '绽放' title. Features with flower icons. Stats. CTA pink-to-green gradient."},
]

def call_api(url, key, prompt, model, max_tokens=16000):
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": max_tokens,
        "temperature": 0.7
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=180)
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
        return content
    else:
        err = data.get("error", {}).get("message", json.dumps(data)[:300])
        raise Exception(f"API error: {err}")

# Progress tracking
PROGRESS_FILE = "/tmp/template_progress.json"
def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"completed": [], "failed": []}

def save_progress(prog):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(prog, f)

prog = load_progress()
completed = set(prog["completed"])

outdir = "/root/template-shop"

for i, t in enumerate(TEMPLATES):
    fname = t["file"]
    if fname in completed:
        print(f"[{i+1}/20] SKIP (already done): {fname}")
        continue
    
    is_mimo = i < 8
    api_url = MIMO_URL if is_mimo else DS_URL
    api_key = MIMO_KEY if is_mimo else DS_KEY
    model = "mimo-v2.5" if is_mimo else "deepseek-chat"
    provider = "MIMO" if is_mimo else "DeepSeek"
    
    print(f"[{i+1}/20] {provider} → {t['name']} ({fname})...", flush=True)
    
    try:
        content = call_api(api_url, api_key, t["prompt"], model)
        filepath = os.path.join(outdir, fname)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        size = len(content)
        lines = content.count('\n') + 1
        print(f"  ✅ {size} bytes, {lines} lines")
        
        prog["completed"].append(fname)
        completed.add(fname)
        save_progress(prog)
        
    except Exception as e:
        print(f"  ❌ {str(e)[:200]}")
        prog["failed"].append({"file": fname, "error": str(e)[:200]})
        save_progress(prog)
    
    # Rate limit pause
    if i < len(TEMPLATES) - 1:
        time.sleep(3)

print(f"\n=== DONE: {len(prog['completed'])} succeeded, {len(prog['failed'])} failed ===")
for f in prog["failed"]:
    print(f"  FAILED: {f['file']} - {f['error'][:80]}")

#!/usr/bin/env python3
"""用MIMO生成新版auth.js - 用户系统+权限控制+Bug反馈"""
import requests, json, time, os

KEY = ""
with open(os.path.expanduser('/root/.hermes/config.yaml')) as f:
    for line in f:
        if 'api_key' in line and 'tp-' in line:
            key = line.split('api_key:')[1].strip().strip('"').strip("'")
            if key.startswith('tp-'): KEY = key; break

URL = "https://token-plan-cn.xiaomimimo.com/v1/chat/completions"

def call_api(system, user, max_tokens=16000):
    headers = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    payload = {"model": "mimo-v2.5-pro", "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "max_tokens": max_tokens, "temperature": 0.3}
    resp = requests.post(URL, headers=headers, json=payload, timeout=300)
    data = resp.json()
    if "choices" in data and data["choices"]:
        return data["choices"][0]["message"]["content"], data.get("usage", {})
    raise Exception(f"API: {data.get('error',{}).get('message','?')[:200]}")

# ============================================================
# Task 1: New auth.js with user system + premium control + bug feedback
# ============================================================
print("Task 1: 生成 auth.js (用户系统+权限+反馈)...", flush=True)

auth_prompt = """Create a complete auth.js file for a Template Shop landing page collection.

REQUIREMENTS:

1. USER SYSTEM (localStorage-based, no backend):
   - Registration: username (unique), displayName, password (SHA-256 hashed)
   - Login with username+password OR key code
   - Session persistence via localStorage + cookies
   - User profile: {username, displayName, passwordHash, createdAt, isPremium: false}

2. KEY SYSTEM (existing SHA-256 hashes in window.__VALID_HASHES):
   - Key login binds the CURRENT DEVICE (store device fingerprint)
   - Device fingerprint = hash of navigator.userAgent + screen.width + screen.height + timezone
   - First key login: mark device as "bound" in localStorage
   - Subsequent logins with same key: recognize bound device

3. PREMIUM (旗舰) ACCESS CONTROL:
   - Premium templates are listed in window.__PREMIUM_TEMPLATES array (filenames)
   - Regular users (password login): can VIEW all templates, CANNOT download premium ones
   - Key-bound device (key or password login on bound device): CAN download everything
   - Download buttons for premium templates show lock icon for non-premium users
   - Visual indicator on premium cards (gold badge "旗舰")

4. AUTH WALL UI:
   - Modal overlay with tabs: "密钥登录" | "账号登录" | "注册"
   - Key tab: input + submit button (existing style)
   - Login tab: username + password inputs + submit
   - Register tab: username + displayName + password + confirm password + submit
   - Error/success messages
   - "游客模式" button to continue without login
   - Bottom bar shows: username if logged in, or "游客模式"

5. BUG FEEDBACK:
   - Floating button (bottom-right, above scroll-top)
   - Opens modal with: textarea for description, optional email input, submit button
   - Saves to localStorage as array of {id, text, email, timestamp, status:'pending'}
   - Admin view: triple-click on logo shows all submitted bugs

6. UI STYLE:
   - Dark theme matching the template shop (--bg:#07070e, --p:#6C5CE7, --acc:#00cec9)
   - Glassmorphism cards (backdrop-filter: blur)
   - Smooth transitions (0.3s ease)
   - Mobile responsive
   - Chinese text for all labels

7. INTEGRATION:
   - On page load: check auth state, update UI
   - Update download buttons based on auth level
   - Update guest/logged-in bar at bottom
   - Premium badge injection on premium template cards

Output ONLY the complete JavaScript code, no markdown fences, no explanations.
The code should be a self-executing IIFE that sets up everything on DOMContentLoaded."""

try:
    auth_code, usage = call_api("You are a senior frontend developer. Write production-ready vanilla JavaScript.", auth_prompt, max_tokens=16000)
    # Strip markdown fences
    if auth_code.startswith("```"):
        lines = auth_code.split("\n")
        if lines[0].startswith("```"): lines = lines[1:]
        if lines and lines[-1].strip() == "```": lines = lines[:-1]
        auth_code = "\n".join(lines)
    
    with open("/root/template-shop/auth.js", 'w') as f:
        f.write(auth_code)
    print(f"  ✅ auth.js: {len(auth_code)} chars, {usage.get('total_tokens',0)} tokens")
except Exception as e:
    print(f"  ❌ {str(e)[:100]}")

time.sleep(3)

# ============================================================
# Task 2: Premium templates list
# ============================================================
print("Task 2: 生成 premium 模板列表...", flush=True)

# Select premium templates (the most visually impressive ones)
premium_list = """window.__PREMIUM_TEMPLATES = [
  "aurora-borealis.html",
  "noir.html",
  "gold-leaf.html",
  "ink-wash.html",
  "gemini-flow.html",
  "dark-gothic.html",
  "warp-drive.html",
  "cyber-cultivation.html",
  "deep-sea-glow.html",
  "jade-forest.html",
  "star-trails.html",
  "volcanic-lava.html"
];"""

with open("/root/template-shop/premium.js", 'w') as f:
    f.write(premium_list)
print(f"  ✅ premium.js: {len(premium_list)} chars")

# ============================================================
# Task 3: Performance - pagination & lazy load
# ============================================================
print("Task 3: 生成性能优化JS...", flush=True)

perf_prompt = """Create a performance optimization module (perf.js) for a template shop with 73+ template cards.

REQUIREMENTS:

1. PAGINATION:
   - Show 12 templates initially
   - "加载更多" button at bottom
   - Each click loads 12 more
   - Smooth scroll to new content
   - Show count: "显示 12/73 个模板"

2. VIRTUAL SCROLL (optional enhancement):
   - If user scrolls fast, use IntersectionObserver to pre-load nearby cards
   - Throttle scroll events

3. LAZY LOAD OPTIMIZATION:
   - Only load iframe previews when card enters viewport (within 300px)
   - Pause off-screen iframes (set srcdoc="" when scrolled far away)
   - Debounce search input (300ms)

4. SMOOTH ANIMATIONS:
   - Cards fade in with staggered delay (50ms per card)
   - Use CSS transform + opacity for animations (GPU accelerated)
   - will-change: transform on animated elements

5. MEMORY MANAGEMENT:
   - Limit concurrent iframe loads to 3
   - Queue additional loads
   - Clean up observers when cards are removed from DOM

6. SEARCH OPTIMIZATION:
   - Index template names and descriptions on load
   - Use Map for O(1) lookups
   - Highlight matching text in results

Output ONLY the complete JavaScript code, no markdown fences."""

try:
    perf_code, usage = call_api("You are a performance optimization expert. Write efficient vanilla JavaScript.", perf_prompt, max_tokens=12000)
    if perf_code.startswith("```"):
        lines = perf_code.split("\n")
        if lines[0].startswith("```"): lines = lines[1:]
        if lines and lines[-1].strip() == "```": lines = lines[:-1]
        perf_code = "\n".join(lines)
    
    with open("/root/template-shop/perf.js", 'w') as f:
        f.write(perf_code)
    print(f"  ✅ perf.js: {len(perf_code)} chars, {usage.get('total_tokens',0)} tokens")
except Exception as e:
    print(f"  ❌ {str(e)[:100]}")

print(f"\n完成: {time.strftime('%H:%M:%S')}")

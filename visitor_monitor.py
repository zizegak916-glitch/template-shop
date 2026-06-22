#!/usr/bin/env python3
"""
Template Shop — 访客计数监控后台
轻量级 HTTP 服务，提供访客统计 API + 简易 Dashboard
端口: 8077
数据存储: /root/template-shop/visitor_data.json
"""

import http.server
import json
import os
import time
import hashlib
import threading
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs

DATA_FILE = Path(__file__).parent / "visitor_data.json"
PORT = 8077
LOCK = threading.Lock()

# ─── 数据管理 ──────────────────────────────────────────────────

def load_data():
    if DATA_FILE.exists():
        try:
            return json.loads(DATA_FILE.read_text())
        except:
            pass
    return {
        "total_visits": 0,
        "unique_visitors": 0,
        "visitors": {},  # hash -> {first_seen, last_seen, visits, ua, referrer}
        "daily": {},     # YYYY-MM-DD -> count
        "hourly": {},    # YYYY-MM-DD-HH -> count
        "pages": {},     # path -> count
        "referers": {},  # referrer -> count
        "countries": {}, # country (from header) -> count
    }

def save_data(data):
    with LOCK:
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))

def get_client_id(ip, ua):
    """Generate a semi-stable visitor ID from IP + User-Agent hash"""
    raw = f"{ip}:{ua}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]

# ─── Dashboard HTML ───────────────────────────────────────────

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>📊 访客监控 — Template Shop</title>
<meta http-equiv="refresh" content="30">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#07070e;color:#e8e8f4;min-height:100vh;padding:24px}
h1{font-size:24px;font-weight:800;margin-bottom:8px}
.sub{color:#6e6e96;font-size:13px;margin-bottom:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px}
.card{background:#0e0e1a;border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:24px}
.card-label{font-size:12px;color:#6e6e96;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.card-value{font-size:32px;font-weight:800;letter-spacing:-.03em}
.card-value.purple{color:#a78bfa}
.card-value.teal{color:#00cec9}
.card-value.pink{color:#f472b6}
.card-value.green{color:#34d399}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);color:#6e6e96;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.03)}
td:first-child{color:#e8e8f4;font-weight:600}
td:last-child{color:#a78bfa;font-weight:700;text-align:right}
.section{margin-bottom:40px}
.section-title{font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.bar{height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:4px}
.bar-fill{height:100%;border-radius:3px;transition:width .6s}
.refresh-note{position:fixed;bottom:20px;right:20px;font-size:11px;color:#6e6e96;background:#0e0e1a;border:1px solid rgba(255,255,255,.06);padding:6px 14px;border-radius:8px}
</style>
</head>
<body>
<h1>📊 访客监控面板</h1>
<p class="sub">实时统计 · 每30秒自动刷新 · 数据存储于本地</p>

<div class="grid" id="stats"></div>

<div class="section">
  <div class="section-title">📅 近7天趋势</div>
  <table><thead><tr><th>日期</th><th>访问量</th></tr></thead><tbody id="daily"></tbody></table>
</div>

<div class="section">
  <div class="section-title">🔥 热门页面</div>
  <table><thead><tr><th>页面</th><th>访问</th></tr></thead><tbody id="pages"></tbody></table>
</div>

<div class="section">
  <div class="section-title">🔗 来源统计</div>
  <table><thead><tr><th>来源</th><th>访问</th></tr></thead><tbody id="referers"></tbody></table>
</div>

<div class="section">
  <div class="section-title">⏰ 今日分时</div>
  <table><thead><tr><th>时段</th><th>访问</th></tr></thead><tbody id="hourly"></tbody></table>
</div>

<div class="refresh-note">自动刷新 30s</div>

<script>
async function load(){
  const r=await fetch('/api/stats');
  const d=await r.json();

  // Stats cards
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('stats').innerHTML=`
    <div class="card"><div class="card-label">总访问量</div><div class="card-value purple">${d.total_visits.toLocaleString()}</div></div>
    <div class="card"><div class="card-label">独立访客</div><div class="card-value teal">${d.unique_visitors.toLocaleString()}</div></div>
    <div class="card"><div class="card-label">今日访问</div><div class="card-value pink">${(d.daily[today]||0).toLocaleString()}</div></div>
    <div class="card"><div class="card-label">页面数</div><div class="card-value green">${Object.keys(d.pages).length}</div></div>
  `;

  // Daily (last 7 days)
  const days=Object.entries(d.daily).sort().slice(-7);
  const maxDay=Math.max(...days.map(([,v])=>v),1);
  document.getElementById('daily').innerHTML=days.map(([k,v])=>`
    <tr><td>${k}</td><td>${v} <div class="bar"><div class="bar-fill" style="width:${v/maxDay*100}%;background:linear-gradient(90deg,#6C5CE7,#00cec9)"></div></div></td></tr>
  `).join('');

  // Pages
  const pages=Object.entries(d.pages).sort((a,b)=>b[1]-a[1]).slice(0,10);
  document.getElementById('pages').innerHTML=pages.map(([k,v])=>`<tr><td>${k}</td><td>${v}</td></tr>`).join('')||'<tr><td colspan="2" style="color:#6e6e96">暂无数据</td></tr>';

  // Referers
  const refs=Object.entries(d.referers).sort((a,b)=>b[1]-a[1]).slice(0,10);
  document.getElementById('referers').innerHTML=refs.map(([k,v])=>`<tr><td>${k||'(直接访问)'}</td><td>${v}</td></tr>`).join('')||'<tr><td colspan="2" style="color:#6e6e96">暂无数据</td></tr>';

  // Hourly
  const todayPrefix=today;
  const hours=Object.entries(d.hourly).filter(([k])=>k.startsWith(todayPrefix)).sort();
  document.getElementById('hourly').innerHTML=hours.map(([k,v])=>{
    const h=k.split('-').pop();
    return `<tr><td>${h}:00</td><td>${v}</td></tr>`;
  }).join('')||'<tr><td colspan="2" style="color:#6e6e96">今日暂无数据</td></tr>';
}
load();
</script>
</body>
</html>"""

# ─── HTTP Handler ─────────────────────────────────────────────

class VisitorHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # Silence request logs

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

    def _json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._cors()
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Dashboard
        if path == '/' or path == '/dashboard':
            body = DASHBOARD_HTML.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', len(body))
            self.end_headers()
            self.wfile.write(body)
            return

        # Stats API
        if path == '/api/stats':
            data = load_data()
            self._json_response(data)
            return

        # Pixel tracker (1x1 transparent gif)
        if path == '/pixel.gif':
            self._track_visit()
            # 1x1 transparent GIF
            gif = bytes([
                0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,
                0x01,0x00,0x80,0x00,0x00,0xff,0xff,0xff,
                0x00,0x00,0x00,0x21,0xf9,0x04,0x01,0x00,
                0x00,0x00,0x00,0x2c,0x00,0x00,0x00,0x00,
                0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,
                0x01,0x00,0x3b
            ])
            self.send_response(200)
            self.send_header('Content-Type', 'image/gif')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Content-Length', len(gif))
            self._cors()
            self.end_headers()
            self.wfile.write(gif)
            return

        # JSONP counter (for frontend embedding)
        if path == '/api/count':
            data = load_data()
            self._json_response({
                "total": data["total_visits"],
                "unique": data["unique_visitors"],
                "today": data["daily"].get(datetime.now().strftime("%Y-%m-%d"), 0)
            })
            return

        self.send_error(404)

    def do_POST(self):
        if self.path == '/api/track':
            content_len = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_len)
            try:
                payload = json.loads(body)
                self._track_visit(payload.get('page', '/'), payload.get('referrer', ''))
            except:
                self._track_visit()
            self._json_response({"ok": True})
            return
        self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _track_visit(self, page=None, referrer=None):
        data = load_data()
        ip = self.client_address[0]
        ua = self.headers.get('User-Agent', '')
        ref = referrer or self.headers.get('Referer', '') or self.headers.get('HTTP_REFERER', '')
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        hour = now.strftime("%Y-%m-%d-%H")
        page_path = page or urlparse(self.path).path

        visitor_id = get_client_id(ip, ua)

        data["total_visits"] += 1

        if visitor_id not in data["visitors"]:
            data["unique_visitors"] += 1
            data["visitors"][visitor_id] = {
                "first_seen": now.isoformat(),
                "visits": 0,
                "ua": ua[:200]
            }

        data["visitors"][visitor_id]["last_seen"] = now.isoformat()
        data["visitors"][visitor_id]["visits"] += 1

        data["daily"][today] = data["daily"].get(today, 0) + 1
        data["hourly"][hour] = data["hourly"].get(hour, 0) + 1
        data["pages"][page_path] = data["pages"].get(page_path, 0) + 1

        if ref:
            # Clean referrer
            try:
                ref_domain = urlparse(ref).netloc or ref
            except:
                ref_domain = ref
            data["referers"][ref_domain] = data["referers"].get(ref_domain, 0) + 1

        save_data(data)

# ─── Main ─────────────────────────────────────────────────────

if __name__ == '__main__':
    server = http.server.HTTPServer(('0.0.0.0', PORT), VisitorHandler)
    print(f"📊 访客监控已启动: http://0.0.0.0:{PORT}")
    print(f"   Dashboard: http://localhost:{PORT}/")
    print(f"   API:       http://localhost:{PORT}/api/stats")
    print(f"   像素追踪:  http://localhost:{PORT}/pixel.gif")
    print(f"   JSON计数:  http://localhost:{PORT}/api/count")
    server.serve_forever()

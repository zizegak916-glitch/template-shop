#!/bin/bash
# 批量生成新模板 - mimo-v2.5-pro via token-plan-cn
# mimo run 会直接写文件到磁盘，不需要从stdout提取

source /root/.bashrc
cd /root/template-shop

PROGRESS="/tmp/template_batch_progress.json"
echo '{"completed":[],"failed":[],"skipped":[]}' > "$PROGRESS"

FILES=(
  "deep-sea-glow"
  "volcanic-lava"
  "aurora-icefield"
  "festival-lantern"
  "desert-starscape"
  "bamboo-scroll"
  "cyber-ink"
  "mech-gears"
  "cherry-rain"
  "neon-nightscape"
  "jade-forest"
  "star-trails"
)

NAMES=(
  "深海幽光"
  "火山熔岩"
  "极光冰原"
  "节日灯火"
  "沙漠星空"
  "竹简古卷"
  "赛博水墨"
  "机械齿轮"
  "樱花雨"
  "暗夜霓虹"
  "翡翠森林"
  "星轨银河"
)

PROMPTS=(
  "Deep sea bioluminescence landing page. Dark ocean bg #020814. CSS bioluminescent particles floating upward. Jellyfish CSS shapes. Color: deep navy #0a1628, cyan #00e5ff, purple #1a0033, green #39ff14. Hero with depth gradient + glow particles + '深海幽光' title. Bubble-shaped feature cards. Glowing stats. CTA bioluminescent gradient. data-theme=dark."
  "Volcanic lava flow landing page. Dark bg #0f0503. CSS lava gradient morphing animation. Ember particles rising. Cracked earth CSS texture. Color: obsidian #0f0503, orange #ff4500, red #8b0000, gold #ffa500. Hero with flowing lava + heat haze + '火山熔岩' fire text. Ember-glow cards. Fire stats. CTA lava gradient. data-theme=dark."
  "Aurora over frozen landscape. Dark sky #0a0a2e. CSS aurora wave bands (green/purple/pink). Snowflake particles. Ice crystals. Color: night #0a0a2e, aurora green #00ff88, purple #8844ff, ice white #e8f0ff. Hero with animated aurora + snow + '极光冰原' title. Frost-glass cards. Aurora stats. CTA aurora gradient. data-theme=dark."
  "Chinese lantern festival. Dark red bg #1a0a0a. CSS hanging lanterns with glow. Floating sky lanterns rising. Color: red #cc0000, gold #ffd700, amber #ff8c00. Hero with glowing lanterns + floating lanterns + '节日灯火' gold title. Lantern-framed cards. Gold stats. CTA red-gold gradient. data-theme=dark."
  "Desert night sky. Gradient sand #d4a574 bottom to night #0a0a2e top. CSS twinkling stars. Sand dune silhouettes. Milky way band. Color: sand #d4a574, night #0a0a2e, white #fff, amber #e8a849. Hero with stars + dunes + '沙漠星空' title. Star-accented cards. Warm stats. CTA desert gradient. data-theme=dark."
  "Ancient bamboo scroll. Parchment bg #f5e6c8. Bamboo green #2d5016 accents. Scroll texture patterns. Brush strokes. Color: parchment #f5e6c8, bamboo #2d5016, ink #1a1a1a, gold seal #c9a96e. Hero with scroll unroll animation + '竹简古卷' title. Scroll-shaped cards. Seal-stamp stats. CTA brush button. data-theme=light."
  "Cyberpunk ink fusion. Dark bg #080810. Ink wash + neon overlay. Glitch calligraphy. Color: ink #0a0a0f, neon purple #bf00ff, electric blue #00d4ff, gray #888. Hero with ink background + neon glitch + '赛博水墨' title. Ink-neon hybrid cards. Glitch stats. CTA neon-on-ink. data-theme=dark."
  "Steampunk mechanical gears. Dark industrial bg #1a1510. CSS rotating gear animations. Rivets + metal textures. Color: brass #b8860b, copper #b87333, iron #2a2520, steam #e8dcc8. Hero with rotating gears + steam + '机械齿轮' brass title. Gear-framed cards. Mechanical counter stats. CTA brass gradient. data-theme=dark."
  "Cherry blossom rain. Light pink bg #fff5f5. Sakura pink #ffb7c5. CSS falling petals (multi-layer). Branch silhouettes. Color: sakura #ffb7c5, white #fff5f5, brown #5c4033, green #90ee90. Hero with falling petals + branch + '樱花雨' elegant title. Petal-shaped cards. Pink stats. CTA sakura gradient. data-theme=light."
  "Neon city nightscape. Very dark bg #050510. Neon reflections. CSS rain + neon glow. Wet street gradients. Color: dark #050510, pink #ff1493, blue #00bfff, green #39ff14. Hero with neon cityscape + rain + '暗夜霓虹' flickering title. Neon glass cards. Neon glow stats. CTA neon pulse. data-theme=dark."
  "Mystical jade forest. Dark green bg #041a0f. Jade green #00c878. Dappled light (moving gradients). Crystal CSS shapes. Color: forest #041a0a, jade #00c878, emerald #50c878, gold #d4af37. Hero with forest layers + jade glow + '翡翠森林' title. Crystal-framed cards. Jade stats. CTA emerald gradient. data-theme=dark."
  "Star trails long-exposure. Dark sky #050510. CSS rotating star trails (conic-gradient). Meteor streaks. Color: night #050510, white #fff, blue #4488ff, purple #8844ff. Hero with rotating trails + meteor + '星轨银河' title. Constellation cards. Trail-gradient stats. CTA galaxy gradient. data-theme=dark."
)

TOTAL=${#FILES[@]}
echo "=== 批量生成 $TOTAL 个新模板 (mimo-v2.5-pro) ==="
echo "开始: $(date)"
echo "内存: $(free -m | awk '/Mem:/{printf "%dMB/%dMB\n", $3, $2}')"

for i in "${!FILES[@]}"; do
  FILE="${FILES[$i]}.html"
  NAME="${NAMES[$i]}"
  PROMPT="${PROMPTS[$i]}"
  NUM=$((i + 1))

  # Skip if already exists and has content
  if [ -f "$FILE" ] && [ $(wc -c < "$FILE") -gt 1000 ]; then
    echo "[$NUM/$TOTAL] SKIP: $FILE (已存在 $(wc -l < "$FILE") 行)"
    python3 -c "
import json; p=json.load(open('$PROGRESS')); p['skipped'].append('$FILE'); json.dump(p,open('$PROGRESS','w'))
"
    continue
  fi

  echo "[$NUM/$TOTAL] 生成: $FILE ($NAME)..."

  FULL_PROMPT="Create a COMPLETE, PRODUCTION-READY single HTML file called '${FILE}'.
ALL CSS in <style>, ALL JS in <script>. Minimum 500 lines.
data-theme dark/light on html. Theme toggle. Responsive. Chinese text.
Sections: hero, features grid, stats, CTA, footer.
Google Fonts OK, NO other external JS. Smooth animations.

Theme: ${NAME} — ${PROMPT}

Write the file now."

  # Run mimo - it writes file directly to disk
  timeout 180 mimo run \
    -m xiaomi-token-plan-cn/mimo-v2.5-pro \
    --pure \
    "$FULL_PROMPT" > /tmp/mimo_stdout.txt 2>&1

  # Check if file was created
  if [ -f "$FILE" ] && [ $(wc -c < "$FILE") -gt 500 ]; then
    LINES=$(wc -l < "$FILE")
    BYTES=$(wc -c < "$FILE")
    echo "  ✅ ${LINES} 行, ${BYTES} 字节"
    python3 -c "
import json; p=json.load(open('$PROGRESS')); p['completed'].append('$FILE'); json.dump(p,open('$PROGRESS','w'))
"
  else
    # Maybe mimo output contains the code in a code block
    HTML=$(sed -n '/```html/,/```/{/```/d;p}' /tmp/mimo_stdout.txt)
    if [ -n "$HTML" ] && [ ${#HTML} -gt 500 ]; then
      echo "$HTML" > "$FILE"
      LINES=$(wc -l < "$FILE")
      BYTES=$(wc -c < "$FILE")
      echo "  ✅ 从输出提取: ${LINES} 行, ${BYTES} 字节"
      python3 -c "
import json; p=json.load(open('$PROGRESS')); p['completed'].append('$FILE'); json.dump(p,open('$PROGRESS','w'))
"
    else
      ERR=$(tail -3 /tmp/mimo_stdout.txt | tr '\n' ' ')
      echo "  ❌ 文件未生成: $ERR"
      python3 -c "
import json; p=json.load(open('$PROGRESS')); p['failed'].append({'file':'$FILE','error':'''$ERR'''}); json.dump(p,open('$PROGRESS','w'))
"
    fi
  fi

  # Memory check
  MEM_AVAIL=$(awk '/MemAvailable/{print $2}' /proc/meminfo)
  if [ "$MEM_AVAIL" -lt 80000 ]; then
    echo "  ⚠️ 内存紧张 (${MEM_AVAIL}kB), 等20秒..."
    sleep 20
  fi

  sleep 3
done

echo ""
echo "=== 完成 $(date) ==="
python3 -c "
import json
p=json.load(open('$PROGRESS'))
print(f'✅ 成功: {len(p[\"completed\"])} 个')
print(f'⏭️ 跳过: {len(p.get(\"skipped\",[]))} 个')
print(f'❌ 失败: {len(p[\"failed\"])} 个')
for f in p['completed']:
    print(f'  ✅ {f}')
for f in p['failed']:
    print(f'  ❌ {f[\"file\"]}: {f.get(\"error\",\"\")[:60]}')
"
echo "内存: $(free -m | awk '/Mem:/{printf "%dMB/%dMB\n", $3, $2}')"

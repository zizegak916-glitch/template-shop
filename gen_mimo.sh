#!/bin/bash
# Run MiMo Code CLI for 7 remaining MIMO templates sequentially
cd /root/template-shop

echo "=== [1/7] bamboo-grove.html (竹林) ==="
mimo run -m mimo/mimo-auto --dangerously-skip-permissions "Create bamboo-grove.html - light theme '竹林' (Bamboo Grove) minimalist landing page. Single HTML file. Clean white bg #fafaf8 with bamboo green #2d5016 accents. CSS bamboo stalk decorations (gradients). Gentle swaying animation. Clean sans-serif Inter. Leaf SVG dividers (inline). Cards with green border-left. Scroll fade-up. Hero with floating bamboo leaves animation. Features grid (3 items). Testimonials section. CTA green gradient button. Footer bamboo border. data-theme=light, theme toggle, responsive, Chinese text, 500+ lines, NO external JS except Google Fonts." 2>&1 | tail -3

echo "=== [2/7] gold-leaf.html (金箔) ==="
mimo run -m mimo/mimo-auto --dangerously-skip-permissions "Create gold-leaf.html - dark luxury '金箔' (Gold Leaf) landing page. Single HTML file. Black bg #0a0a0a with gold #c9a96e accents. Canvas gold particle shimmer. Gold gradient text headings. Luxury cards with gold borders + glow. Thin gold line dividers. Serif headings (Cormorant Garamond + Inter from Google Fonts). Floating gold dust animation. Hero: gold text + particle bg. Features with gold icons. Stats. CTA gold gradient border animation. data-theme=dark, theme toggle, responsive, Chinese text, 500+ lines, NO external JS." 2>&1 | tail -3

echo "=== [3/7] cloud-nine.html (云端) ==="
mimo run -m mimo/mimo-auto --dangerously-skip-permissions "Create cloud-nine.html - light airy '云端' (Cloud Nine) landing page. Single HTML file. Soft gradient bg light blue to white. Floating cloud shapes (CSS border-radius + animation). Gentle parallax on cloud layers. Clean airy typography, whitespace. Cards with soft shadows + rounded corners. Smooth fade animations. Hero with animated floating clouds. Features with cloud-shaped icon backgrounds. Stats. CTA sky-blue gradient button. Footer cloud border. data-theme=light, theme toggle, responsive, Chinese text, 500+ lines, NO external JS except Google Fonts." 2>&1 | tail -3

echo "=== [4/7] ember-glow.html (余烬) ==="
mimo run -m mimo/mimo-auto --dangerously-skip-permissions "Create ember-glow.html - dark warm '余烬' (Ember Glow) landing page. Single HTML file. Dark bg #0f0a08 with warm ember effects. CSS ember particles rising from bottom. Warm gradients: deep red, orange, amber. Cards with ember-glow border (box-shadow cycling). Bold sans-serif, warm white text. Fire gradient animations. Scroll ember burst. Hero with rising ember particles. Features fire-glow icons. Stats warm numbers. CTA ember gradient + glow. data-theme=dark, theme toggle, responsive, Chinese text, 500+ lines, NO external JS except Google Fonts." 2>&1 | tail -3

echo "=== [5/7] frost-crystal.html (霜晶) ==="
mimo run -m mimo/mimo-auto --dangerously-skip-permissions "Create frost-crystal.html - light ice '霜晶' (Frost Crystal) landing page. Single HTML file. Cool white bg #f0f4f8 with ice-blue #a8d8ea accents. CSS frost crystal hexagonal patterns. Ice-shimmer animation on borders. Clean crisp typography. Frosted glass cards (backdrop-filter: blur). CSS snowflake particles. Ice-crystal reveal on scroll. Hero with frost pattern bg + '霜晶' title. Features hexagonal icon frames. Stats ice-blue numbers. CTA frost gradient + crystal border. data-theme=light, theme toggle, responsive, Chinese text, 500+ lines, NO external JS except Google Fonts." 2>&1 | tail -3

echo "=== [6/7] void-space.html (虚空) ==="
mimo run -m mimo/mimo-auto --dangerously-skip-permissions "Create void-space.html - dark space '虚空' (Void Space) landing page. Single HTML file. Pure black #000 with deep purple/blue nebula gradients. CSS starfield (box-shadow). Floating nebula clouds (radial gradients + animation). Futuristic sans-serif with glow. Dark glass cards + star borders. Warp-speed lines on scroll. Parallax star layers. Hero with starfield + nebula + glowing '虚空' text. Features constellation-connected icons. Stats glowing counters. CTA nebula gradient + pulse glow. data-theme=dark, theme toggle, responsive, Chinese text, 500+ lines, NO external JS except Google Fonts." 2>&1 | tail -3

echo "=== [7/7] dawn-break.html (破晓) ==="
mimo run -m mimo/mimo-auto --dangerously-skip-permissions "Create dawn-break.html - light sunrise '破晓' (Dawn Break) landing page. Single HTML file. Gradient bg warm peach to light blue (dawn sky). Animated sun-rise CSS gradient. Gentle light ray animations. Clean hopeful typography. Cards with sunrise gradient borders. Scroll light burst. Hero with animated sunrise bg + '破晓' title. Features sun-ray icon backgrounds. Stats warm gradient numbers. CTA sunrise gradient button. Footer horizon line. data-theme=light, theme toggle, responsive, Chinese text, 500+ lines, NO external JS except Google Fonts." 2>&1 | tail -3

echo "=== ALL MIMO TEMPLATES DONE ==="

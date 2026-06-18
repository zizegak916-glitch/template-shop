/**
 * Template Shop — Auth System v2
 * 设备指纹 + Cloudflare Worker 后端 + 本地缓存
 * 支持两种模式: 有 Worker (真·设备绑定) / 无 Worker (本地模式)
 */
(function () {
  // ─── Config ────────────────────────────────────────────────────
  const STORAGE_KEY = 'tmpl_auth_level';
  const STORAGE_KEY_VAL = 'tmpl_auth_key';
  const STORAGE_FP = 'tmpl_device_fp';
  const STORAGE_BINDINGS = 'tmpl_bindings';

  // Cloudflare Worker URL (部署后填入, 留空=本地模式)
  // 例如: 'https://template-shop-auth.YOUR_SUBDOMAIN.workers.dev'
  const WORKER_URL = window.__AUTH_API__ || 'https://template-shop-auth.zizegak916.workers.dev';

  // ─── Device Fingerprint ────────────────────────────────────────

  function getOrCreateFingerprint() {
    let cached = localStorage.getItem(STORAGE_FP);
    if (cached) return cached;

    const components = [
      navigator.userAgent,
      screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.language,
      navigator.platform,
      navigator.hardwareConcurrency || 0,
      navigator.maxTouchPoints || 0,
      // Canvas fingerprint
      getCanvasFingerprint(),
    ];

    // Simple hash
    let hash = 0;
    const str = components.join('|||');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    const fp = 'fp_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);
    localStorage.setItem(STORAGE_FP, fp);
    return fp;
  }

  function getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('TemplateShop', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('TemplateShop', 4, 17);
      return canvas.toDataURL().slice(-50);
    } catch (e) {
      return 'no-canvas';
    }
  }

  // ─── SHA-256 ───────────────────────────────────────────────────

  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ─── Local Validation (fallback) ──────────────────────────────

  async function validateKeyLocal(key) {
    const normalized = key.trim().toUpperCase();
    const hash = await sha256(normalized);
    return window.__VALID_HASHES && window.__VALID_HASHES.includes(hash);
  }

  // ─── Server Validation ────────────────────────────────────────

  async function validateKeyServer(key, fingerprint, action = 'login') {
    const resp = await fetch(`${WORKER_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, key: key.trim().toUpperCase(), fingerprint }),
    });
    return await resp.json();
  }

  // ─── Local Binding Check ──────────────────────────────────────

  function getLocalBinding(keyHash) {
    try {
      const bindings = JSON.parse(localStorage.getItem(STORAGE_BINDINGS) || '{}');
      return bindings[keyHash] || null;
    } catch { return null; }
  }

  function setLocalBinding(keyHash, fingerprint) {
    try {
      const bindings = JSON.parse(localStorage.getItem(STORAGE_BINDINGS) || '{}');
      bindings[keyHash] = { fingerprint, boundAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_BINDINGS, JSON.stringify(bindings));
    } catch (e) { /* ignore */ }
  }

  // ─── Auth State ───────────────────────────────────────────────

  function getAuth() { return localStorage.getItem(STORAGE_KEY); }

  function setAuth(level, key) {
    localStorage.setItem(STORAGE_KEY, level);
    if (key) localStorage.setItem(STORAGE_KEY_VAL, key);
  }

  // ─── UI Helpers ────────────────────────────────────────────────

  function showWall() {
    const wall = document.getElementById('auth-wall');
    if (wall) { wall.style.display = 'flex'; requestAnimationFrame(() => wall.classList.add('show')); }
    document.body.style.overflow = 'hidden';
  }

  function hideWall() {
    const wall = document.getElementById('auth-wall');
    if (wall) {
      wall.classList.remove('show');
      setTimeout(() => { wall.style.display = 'none'; }, 400);
    }
    document.body.style.overflow = '';
  }

  function setDownloadState(enabled) {
    document.querySelectorAll('.tpl-btn.secondary').forEach(btn => {
      btn.style.opacity = enabled ? '1' : '0.3';
      btn.style.pointerEvents = enabled ? 'auto' : 'none';
      btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
      const lock = btn.querySelector('.lock-icon');
      if (enabled && lock) lock.remove();
      if (!enabled && !lock) {
        const l = document.createElement('span');
        l.className = 'lock-icon';
        l.innerHTML = '&nbsp;🔒';
        l.style.fontSize = '12px';
        btn.appendChild(l);
      }
    });
    const notice = document.getElementById('guest-notice');
    if (notice) notice.style.display = enabled ? 'none' : 'flex';
  }

  function showToast(msg, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function setLoading(btn, loading) {
    if (loading) {
      btn.dataset.origText = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>验证中...';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.origText || '验证并登录';
    }
  }

  // ─── Main Init ────────────────────────────────────────────────

  window.addEventListener('DOMContentLoaded', async () => {
    const auth = getAuth();
    const fingerprint = getOrCreateFingerprint();

    if (auth === 'key') {
      // Already logged in — verify binding is still valid
      const savedKey = localStorage.getItem(STORAGE_KEY_VAL);
      if (savedKey && WORKER_URL) {
        try {
          const result = await validateKeyServer(savedKey, fingerprint, 'login');
          if (!result.success && result.errorType === 'device_mismatch') {
            // Device changed — force re-login
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(STORAGE_KEY_VAL);
            showToast('设备已变更，请重新登录', 'error');
            showWall();
            setDownloadState(false);
            return;
          }
        } catch (e) {
          // Server unreachable — allow local auth
        }
      }
      hideWall();
      setDownloadState(true);
      return;
    }

    // No auth — show wall
    showWall();
    setDownloadState(false);

    // ─── Key Login ─────────────────────────────────────────────
    const keyInput = document.getElementById('key-input');
    const keyBtn = document.getElementById('key-submit');
    const keyError = document.getElementById('key-error');
    const keySuccess = document.getElementById('key-success');

    async function tryKeyLogin() {
      const val = keyInput.value.trim();
      if (!val) {
        keyError.textContent = '请输入密钥';
        keyError.style.display = 'block';
        keyInput.focus();
        return;
      }

      // Format check
      if (!/^TMPL-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(val)) {
        keyError.textContent = '密钥格式: TMPL-XXXX-XXXX-XXXX';
        keyError.style.display = 'block';
        keyInput.focus();
        return;
      }

      setLoading(keyBtn, true);
      keyError.style.display = 'none';
      keySuccess.style.display = 'none';

      try {
        // Step 1: Validate key hash
        const valid = await validateKeyLocal(val);
        if (!valid) {
          keyError.textContent = '密钥无效，请检查后重试';
          keyError.style.display = 'block';
          keyInput.value = '';
          keyInput.focus();
          shakeInput(keyInput);
          setLoading(keyBtn, false);
          return;
        }

        // Step 2: Server binding check (if Worker configured)
        if (WORKER_URL) {
          try {
            const result = await validateKeyServer(val, fingerprint, 'login');
            if (!result.success) {
              keyError.textContent = result.message || '验证失败';
              keyError.style.display = 'block';
              keyInput.value = '';
              keyInput.focus();
              shakeInput(keyInput);
              setLoading(keyBtn, false);
              return;
            }
            // Show binding info
            if (result.bound) {
              showToast('✅ 设备验证通过', 'success');
            } else {
              showToast('🔒 密钥已绑定到当前设备', 'success');
            }
          } catch (e) {
            // Server unreachable — fall back to local mode
            console.warn('Worker unreachable, using local mode:', e);
            checkLocalBinding(val);
          }
        } else {
          // Local-only mode
          checkLocalBinding(val);
        }

        // Login success
        setAuth('key', val);
        keySuccess.style.display = 'block';
        keyError.style.display = 'none';
        setTimeout(() => { hideWall(); setDownloadState(true); }, 600);

      } catch (e) {
        keyError.textContent = '网络错误，请重试';
        keyError.style.display = 'block';
      }

      setLoading(keyBtn, false);
    }

    function checkLocalBinding(key) {
      const keyHash = key.trim().toUpperCase();
      // We need the hash, but for local mode just store the key
      const localBind = getLocalBinding(keyHash);
      if (localBind && localBind.fingerprint !== fingerprint) {
        showToast('⚠️ 本地模式：密钥已在其他会话使用', 'info');
      } else {
        setLocalBinding(keyHash, fingerprint);
      }
    }

    keyBtn.addEventListener('click', tryKeyLogin);
    keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryKeyLogin(); });

    // Auto-format key input
    keyInput.addEventListener('input', (e) => {
      let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      // Auto-insert dashes
      const raw = val.replace(/-/g, '');
      if (raw.length > 4 && raw.length <= 8) {
        val = raw.slice(0, 4) + '-' + raw.slice(4);
      } else if (raw.length > 8) {
        val = raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8, 12);
      }
      e.target.value = val;
    });

    // ─── Guest Login ───────────────────────────────────────────
    document.getElementById('guest-btn').addEventListener('click', () => {
      setAuth('guest');
      hideWall();
      setDownloadState(false);
      showToast('游客模式 — 可预览，不可下载', 'info');
    });

    // ─── Bottom bar "输入密钥" button ──────────────────────────
    document.getElementById('open-auth-btn')?.addEventListener('click', () => {
      showWall();
      switchAuthTab('key');
    });
  });

  // ─── Shake animation for wrong input ──────────────────────────
  function shakeInput(el) {
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = 'shake .4s ease';
    setTimeout(() => { el.style.animation = ''; }, 500);
  }

  // ─── Auth Tab Switch ──────────────────────────────────────────
  window.switchAuthTab = function (tab) {
    document.querySelectorAll('.auth-tab').forEach((t, i) => {
      t.classList.toggle('active', (tab === 'key' && i === 0) || (tab === 'guest' && i === 1));
    });
    document.getElementById('panel-key').classList.toggle('active', tab === 'key');
    document.getElementById('panel-guest').classList.toggle('active', tab === 'guest');
  };

  // ─── Logout ───────────────────────────────────────────────────
  window.__logout = function () {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_VAL);
    location.reload();
  };
})();

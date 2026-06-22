/**
 * Template Shop — Auth System v3 (Simplified)
 * Pure local mode: key validated against format, stored in localStorage + cookie
 */
(function () {
  const STORAGE_KEY = 'tmpl_auth_level';
  const STORAGE_FP = 'tmpl_device_fp';

  // ── Cookie helpers ──────────────────────────────────────────
  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = name + '=' + encodeURIComponent(value) +
      ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // ── Auth state (dual: localStorage + cookie) ───────────────
  function getAuth() {
    var v = localStorage.getItem(STORAGE_KEY);
    if (v) return v;
    // Fallback: try cookie (survives Chrome mode switch that clears localStorage)
    var c = getCookie(STORAGE_KEY);
    if (c) {
      // Restore to localStorage so we don't need cookie fallback next time
      try { localStorage.setItem(STORAGE_KEY, c); } catch (e) {}
      return c;
    }
    return null;
  }

  function setAuth(level) {
    try { localStorage.setItem(STORAGE_KEY, level); } catch (e) {}
    setCookie(STORAGE_KEY, level, 365);
  }

  function clearAuth() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_FP);
    } catch (e) {}
    setCookie(STORAGE_KEY, '', -1);
  }

  // ── Fingerprint ─────────────────────────────────────────────
  function getFingerprint() {
    var fp = localStorage.getItem(STORAGE_FP);
    if (fp) return fp;
    fp = 'fp_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2));
    try { localStorage.setItem(STORAGE_FP, fp); } catch (e) {}
    return fp;
  }

  // ── UI ──────────────────────────────────────────────────────
  function showWall() {
    var wall = document.getElementById('auth-wall');
    if (wall) { wall.style.display = 'flex'; requestAnimationFrame(function() { wall.classList.add('show'); }); }
    document.body.style.overflow = 'hidden';
  }

  function hideWall() {
    var wall = document.getElementById('auth-wall');
    if (wall) {
      wall.classList.remove('show');
      setTimeout(function() { wall.style.display = 'none'; }, 400);
    }
    document.body.style.overflow = '';
  }

  function setDownloadState(enabled) {
    document.querySelectorAll('.tpl-btn.secondary, .preview-hover-btn.secondary').forEach(function (btn) {
      btn.style.opacity = enabled ? '1' : '0.3';
      btn.style.pointerEvents = enabled ? 'auto' : 'none';
      btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
      if (enabled) {
        btn.removeAttribute('data-locked');
        if (btn.dataset.origHref) btn.href = btn.dataset.origHref;
      } else {
        if (!btn.dataset.origHref) btn.dataset.origHref = btn.href;
        btn.removeAttribute('download');
        btn.setAttribute('data-locked', '1');
        btn.href = '#';
      }
      var lock = btn.querySelector('.lock-icon');
      if (enabled && lock) lock.remove();
      if (!enabled && !lock) {
        var l = document.createElement('span');
        l.className = 'lock-icon';
        l.innerHTML = '&nbsp;\uD83D\uDD12';
        l.style.fontSize = '12px';
        btn.appendChild(l);
      }
    });
    var notice = document.getElementById('guest-notice');
    if (notice) notice.style.display = enabled ? 'none' : 'flex';
  }

  function showToast(msg, type) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(function() { toast.classList.add('show'); });
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
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

  function shakeInput(el) {
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'shake .4s ease';
    setTimeout(function() { el.style.animation = ''; }, 500);
  }

  // ── Init ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var auth = getAuth();
    var fp = getFingerprint();

    if (auth === 'key' || auth === 'guest') {
      hideWall();
      setDownloadState(auth === 'key');
      if (auth === 'guest') {
        var notice = document.getElementById('guest-notice');
        if (notice) notice.style.display = 'flex';
      }
      return;
    }

    // No auth — show wall
    showWall();
    setDownloadState(false);

    var keyInput = document.getElementById('key-input');
    var keyBtn = document.getElementById('key-submit');
    var keyError = document.getElementById('key-error');
    var keySuccess = document.getElementById('key-success');

    function tryKeyLogin() {
      var val = keyInput.value.trim();
      if (!val) {
        keyError.textContent = '请输入密钥';
        keyError.style.display = 'block';
        keyInput.focus();
        return;
      }

      if (!/^TMPL-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(val)) {
        keyError.textContent = '密钥格式: TMPL-XXXX-XXXX-XXXX';
        keyError.style.display = 'block';
        keyInput.focus();
        shakeInput(keyInput);
        return;
      }

      setLoading(keyBtn, true);
      keyError.style.display = 'none';
      keySuccess.style.display = 'none';

      // Accept any valid-format key (pure local mode)
      setTimeout(function() {
        setAuth('key');
        keySuccess.style.display = 'block';
        keyError.style.display = 'none';
        showToast('✅ 登录成功', 'success');
        setTimeout(function() { hideWall(); setDownloadState(true); }, 600);
        setLoading(keyBtn, false);
      }, 400);
    }

    keyBtn.addEventListener('click', tryKeyLogin);
    keyInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryKeyLogin(); });

    // Auto-format key input
    keyInput.addEventListener('input', function (e) {
      var val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      var raw = val.replace(/-/g, '');
      if (raw.length > 4 && raw.length <= 8) {
        val = raw.slice(0, 4) + '-' + raw.slice(4);
      } else if (raw.length > 8) {
        val = raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8, 12);
      }
      e.target.value = val;
    });

    // Guest login
    document.getElementById('guest-btn').addEventListener('click', function () {
      setAuth('guest');
      hideWall();
      setDownloadState(false);
      showToast('游客模式 — 可预览，不可下载', 'info');
    });

    // Bottom bar button
    var openBtn = document.getElementById('open-auth-btn');
    if (openBtn) {
      openBtn.addEventListener('click', function () { showWall(); });
    }
  });

  // ── Logout ──────────────────────────────────────────────────
  window.__logout = function () {
    clearAuth();
    location.reload();
  };

  // ── Tab switch ──────────────────────────────────────────────
  window.switchAuthTab = function (tab) {
    document.querySelectorAll('.auth-tab').forEach(function (t, i) {
      t.classList.toggle('active', (tab === 'key' && i === 0) || (tab === 'guest' && i === 1));
    });
    document.getElementById('panel-key').classList.toggle('active', tab === 'key');
    document.getElementById('panel-guest').classList.toggle('active', tab === 'guest');
  };
})();

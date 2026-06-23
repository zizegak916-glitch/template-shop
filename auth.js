/**
 * Template Shop — Auth System v4
 * Key validation against SHA-256 hashes (keys.js)
 * Dual persistence: localStorage + cookie
 */
(function () {
  var STORAGE_KEY = 'tmpl_auth_level';
  var STORAGE_FP = 'tmpl_device_fp';

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
    var c = getCookie(STORAGE_KEY);
    if (c) {
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

  // ── SHA-256 hash ───────────────────────────────────────────
  async function sha256(message) {
    var msgBuffer = new TextEncoder().encode(message);
    var hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // ── UI ──────────────────────────────────────────────────────
  function showWall() {
    var wall = document.getElementById('auth-wall');
    if (wall) {
      wall.style.display = 'flex';
      requestAnimationFrame(function() { wall.classList.add('show'); });
    }
    document.body.style.overflow = 'hidden';
    // Auto-switch to key tab when opening from guest
    if (typeof window.switchAuthTab === 'function') {
      window.switchAuthTab('key');
    }
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

    async function tryKeyLogin() {
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

      // Validate against hashes in keys.js
      try {
        var hash = await sha256(val);
        var validHashes = window.__VALID_HASHES || [];
        var isValid = validHashes.indexOf(hash) !== -1;

        // Fallback: if no hashes loaded, accept any valid format key
        if (validHashes.length === 0) isValid = true;

        if (isValid) {
          setAuth('key');
          keySuccess.style.display = 'block';
          keyError.style.display = 'none';
          showToast('\u2705 登录成功', 'success');
          setTimeout(function() { hideWall(); setDownloadState(true); }, 600);
        } else {
          keyError.textContent = '密钥无效，请检查后重试';
          keyError.style.display = 'block';
          keyInput.focus();
          shakeInput(keyInput);
        }
      } catch (e) {
        // Hash API failed, accept valid format
        setAuth('key');
        keySuccess.style.display = 'block';
        keyError.style.display = 'none';
        showToast('\u2705 登录成功', 'success');
        setTimeout(function() { hideWall(); setDownloadState(true); }, 600);
      }

      setLoading(keyBtn, false);
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
      showToast('\u6e38\u5ba2\u6a21\u5f0f \u2014 \u53ef\u9884\u89c8\uff0c\u4e0d\u53ef\u4e0b\u8f7d', 'info');
    });

    // Bottom bar "输入密钥" button
    var openBtn = document.getElementById('open-auth-btn');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        clearAuth();
        showWall();
        // Focus key input after wall animation
        setTimeout(function() {
          var ki = document.getElementById('key-input');
          if (ki) ki.focus();
        }, 500);
      });
    }

    // Close wall on background click
    var wall = document.getElementById('auth-wall');
    if (wall) {
      wall.addEventListener('click', function(e) {
        if (e.target === wall) {
          // Don't close if no auth
        }
      });
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

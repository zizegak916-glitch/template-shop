/**
 * Template Shop — Auth System v5 (Complete Rewrite)
 * All listeners always bound. No early returns.
 */
(function () {
  var STORAGE_KEY = 'tmpl_auth_level';

  // ── Cookie helpers ──────────────────────────────────────
  function setCookie(name, value, days) {
    var d = new Date(); d.setTime(d.getTime() + days * 86400000);
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[2]) : null;
  }

  // ── Auth state ──────────────────────────────────────────
  function getAuth() { return localStorage.getItem(STORAGE_KEY) || getCookie(STORAGE_KEY); }
  function setAuth(level) {
    try { localStorage.setItem(STORAGE_KEY, level); } catch(e){}
    setCookie(STORAGE_KEY, level, 365);
  }
  function clearAuth() {
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
    setCookie(STORAGE_KEY, '', -1);
  }

  // ── SHA-256 ─────────────────────────────────────────────
  async function sha256(msg) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0')}).join('');
  }

  // ── DOM refs (set once) ─────────────────────────────────
  var wall, keyInput, keyBtn, keyError, keySuccess, guestBtn, openBtn, guestNotice;

  // ── UI ──────────────────────────────────────────────────
  function showWall() {
    if (!wall) return;
    wall.style.display = 'flex';
    requestAnimationFrame(function(){ wall.classList.add('show'); });
    document.body.style.overflow = 'hidden';
    // Auto-switch to key tab and focus
    setTimeout(function(){
      switchTab('key');
      if (keyInput) keyInput.focus();
    }, 100);
  }

  function hideWall() {
    if (!wall) return;
    wall.classList.remove('show');
    setTimeout(function(){ wall.style.display = 'none'; }, 400);
    document.body.style.overflow = '';
  }

  function updateUI() {
    var auth = getAuth();
    var isKey = auth === 'key';

    // Toggle download buttons
    document.querySelectorAll('.tpl-btn.secondary, .preview-hover-btn.secondary').forEach(function(btn){
      btn.style.opacity = isKey ? '1' : '0.3';
      btn.style.pointerEvents = isKey ? 'auto' : 'none';
      btn.style.cursor = isKey ? 'pointer' : 'not-allowed';
      if (isKey) {
        btn.removeAttribute('data-locked');
        if (btn.dataset.origHref) btn.href = btn.dataset.origHref;
      } else {
        if (!btn.dataset.origHref && btn.href) btn.dataset.origHref = btn.href;
        btn.removeAttribute('download');
        btn.setAttribute('data-locked','1');
        btn.href = '#';
        // Remove any existing lock icon
        var exLock = btn.querySelector('.lock-icon');
        if (!exLock) {
          var l = document.createElement('span');
          l.className = 'lock-icon';
          l.innerHTML = '&nbsp;\uD83D\uDD12';
          l.style.fontSize = '12px';
          btn.appendChild(l);
        }
      }
      // Remove lock icon when unlocked
      if (isKey) {
        var lk = btn.querySelector('.lock-icon');
        if (lk) lk.remove();
      }
    });

    // Guest notice bar
    if (guestNotice) {
      guestNotice.style.display = (auth === 'guest') ? 'flex' : 'none';
    }
  }

  function showToast(msg, type) {
    var old = document.querySelector('.toast'); if(old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast toast-' + (type||'info');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('show'); });
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 300); }, 3000);
  }

  function setLoading(btn, on) {
    if (on) { btn.dataset.origText = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>验证中...'; }
    else { btn.disabled = false; btn.textContent = btn.dataset.origText || '验证并登录'; }
  }

  function shake(el) {
    el.style.animation = 'none'; el.offsetHeight;
    el.style.animation = 'shake .4s ease';
    setTimeout(function(){ el.style.animation=''; }, 500);
  }

  // ── Tab switch (always global) ──────────────────────────
  window.switchAuthTab = function(tab) {
    document.querySelectorAll('.auth-tab').forEach(function(t,i){
      t.classList.toggle('active', (tab==='key' && i===0) || (tab==='guest' && i===1));
    });
    var pk = document.getElementById('panel-key');
    var pg = document.getElementById('panel-guest');
    if (pk) pk.classList.toggle('active', tab==='key');
    if (pg) pg.classList.toggle('active', tab==='guest');
    if (tab === 'key' && keyInput) setTimeout(function(){ keyInput.focus(); }, 50);
  };

  function switchTab(tab) { window.switchAuthTab(tab); }

  // ── Key login logic ─────────────────────────────────────
  async function tryKeyLogin() {
    if (!keyInput || !keyBtn) return;
    var val = keyInput.value.trim();
    if (!val) {
      keyError.textContent = '请输入密钥'; keyError.style.display = 'block';
      keyInput.focus(); shake(keyInput); return;
    }
    if (!/^TMPL-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(val)) {
      keyError.textContent = '格式: TMPL-XXXX-XXXX-XXXX'; keyError.style.display = 'block';
      keyInput.focus(); shake(keyInput); return;
    }

    setLoading(keyBtn, true);
    keyError.style.display = 'none';
    keySuccess.style.display = 'none';

    try {
      var hash = await sha256(val);
      var validHashes = window.__VALID_HASHES || [];
      var valid = validHashes.length === 0 || validHashes.indexOf(hash) !== -1;

      if (valid) {
        setAuth('key');
        keySuccess.style.display = 'block';
        showToast('✅ 登录成功', 'success');
        setTimeout(function(){ hideWall(); updateUI(); }, 600);
      } else {
        keyError.textContent = '密钥无效'; keyError.style.display = 'block';
        keyInput.focus(); shake(keyInput);
      }
    } catch(e) {
      setAuth('key');
      keySuccess.style.display = 'block';
      showToast('✅ 登录成功', 'success');
      setTimeout(function(){ hideWall(); updateUI(); }, 600);
    }
    setLoading(keyBtn, false);
  }

  // ── Init: ALWAYS bind all listeners ─────────────────────
  document.addEventListener('DOMContentLoaded', function(){
    wall = document.getElementById('auth-wall');
    keyInput = document.getElementById('key-input');
    keyBtn = document.getElementById('key-submit');
    keyError = document.getElementById('key-error');
    keySuccess = document.getElementById('key-success');
    guestBtn = document.getElementById('guest-btn');
    openBtn = document.getElementById('open-auth-btn');
    guestNotice = document.getElementById('guest-notice');

    // Key submit
    if (keyBtn) keyBtn.addEventListener('click', tryKeyLogin);
    if (keyInput) {
      keyInput.addEventListener('keydown', function(e){ if(e.key==='Enter') tryKeyLogin(); });
      // Auto-format: TMPL-XXXX-XXXX-XXXX
      keyInput.addEventListener('input', function(e){
        var v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,'');
        var raw = v.replace(/-/g,'');
        if (raw.length > 4 && raw.length <= 8) v = raw.slice(0,4)+'-'+raw.slice(4);
        else if (raw.length > 8) v = raw.slice(0,4)+'-'+raw.slice(4,8)+'-'+raw.slice(8,12);
        e.target.value = v;
      });
    }

    // Guest browse
    if (guestBtn) guestBtn.addEventListener('click', function(){
      setAuth('guest'); hideWall(); updateUI();
      showToast('游客模式 — 可预览，不可下载', 'info');
    });

    // "输入密钥" bottom bar button
    if (openBtn) openBtn.addEventListener('click', function(){
      clearAuth();
      showWall();
      // switchTab + focus happens inside showWall via setTimeout
    });

    // Close wall X (click background)
    if (wall) wall.addEventListener('click', function(e){
      if (e.target === wall && getAuth()) { /* only close if already authenticated */ }
    });

    // Apply current auth state
    var auth = getAuth();
    if (auth === 'key' || auth === 'guest') {
      hideWall();
      updateUI();
    } else {
      // First visit: show wall on key tab
      showWall();
      updateUI();
    }
  });

  // ── Logout (global) ─────────────────────────────────────
  window.__logout = function(){ clearAuth(); location.reload(); };
})();

// auth.js — Key-based access control for Template Shop
(function(){
  const STORAGE_KEY = 'tmpl_auth_level'; // 'guest' | 'key'
  const STORAGE_KEY_VAL = 'tmpl_auth_key';

  // SHA-256 via SubtleCrypto
  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  async function validateKey(key) {
    const normalized = key.trim().toUpperCase();
    const hash = await sha256(normalized);
    return window.__VALID_HASHES && window.__VALID_HASHES.includes(hash);
  }

  function getAuth() {
    return localStorage.getItem(STORAGE_KEY);
  }

  function setAuth(level, key) {
    localStorage.setItem(STORAGE_KEY, level);
    if (key) localStorage.setItem(STORAGE_KEY_VAL, key);
  }

  function showWall() {
    const wall = document.getElementById('auth-wall');
    if (wall) wall.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function hideWall() {
    const wall = document.getElementById('auth-wall');
    if (wall) {
      wall.style.opacity = '0';
      wall.style.transform = 'scale(1.02)';
      setTimeout(()=>{ wall.style.display='none'; }, 350);
    }
    document.body.style.overflow = '';
  }

  function setDownloadState(enabled) {
    document.querySelectorAll('.tpl-btn.secondary').forEach(btn => {
      if (enabled) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        // Remove any lock icon
        const lock = btn.querySelector('.lock-icon');
        if (lock) lock.remove();
      } else {
        btn.style.opacity = '0.35';
        btn.style.pointerEvents = 'none';
        btn.style.cursor = 'not-allowed';
        // Add lock icon if not present
        if (!btn.querySelector('.lock-icon')) {
          const lock = document.createElement('span');
          lock.className = 'lock-icon';
          lock.innerHTML = ' 🔒';
          btn.appendChild(lock);
        }
      }
    });

    // Show/hide guest notice
    const notice = document.getElementById('guest-notice');
    if (notice) notice.style.display = enabled ? 'none' : 'flex';
  }

  // Init
  window.addEventListener('DOMContentLoaded', async () => {
    const auth = getAuth();
    if (auth === 'key') {
      hideWall();
      setDownloadState(true);
      return;
    }
    // Guest or no auth — show wall
    showWall();
    setDownloadState(false);

    // Key login handler
    const keyInput = document.getElementById('key-input');
    const keyBtn = document.getElementById('key-submit');
    const keyError = document.getElementById('key-error');
    const keySuccess = document.getElementById('key-success');

    async function tryKeyLogin() {
      const val = keyInput.value.trim();
      if (!val) { keyError.textContent = '请输入密钥'; keyError.style.display='block'; return; }
      keyBtn.disabled = true;
      keyBtn.textContent = '验证中...';
      keyError.style.display = 'none';

      const valid = await validateKey(val);
      if (valid) {
        setAuth('key', val);
        keySuccess.style.display = 'block';
        keyError.style.display = 'none';
        setTimeout(()=>{ hideWall(); setDownloadState(true); }, 800);
      } else {
        keyError.textContent = '密钥无效，请检查后重试';
        keyError.style.display = 'block';
        keyInput.value = '';
        keyInput.focus();
      }
      keyBtn.disabled = false;
      keyBtn.textContent = '登录';
    }

    keyBtn.addEventListener('click', tryKeyLogin);
    keyInput.addEventListener('keydown', e => { if(e.key==='Enter') tryKeyLogin(); });

    // Guest login handler
    document.getElementById('guest-btn').addEventListener('click', () => {
      setAuth('guest');
      hideWall();
      setDownloadState(false);
    });
  });

  // Expose for manual logout
  window.__logout = function() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_VAL);
    location.reload();
  };
})();

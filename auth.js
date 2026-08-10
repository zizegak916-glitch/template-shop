(function() {
  'use strict';

  const CONFIG = {
    STORAGE_KEYS: {
      USERS: '__ts_users',
      CURRENT_USER: '__ts_current_user',
      DEVICE_BOUNDS: '__ts_device_bounds',
      SESSION: '__ts_session',
      BUGS: '__ts_bug_reports',
      GUEST_MODE: '__ts_guest_mode'
    },
    SESSION_DURATION: 7 * 24 * 60 * 60 * 1000,
    CSS_VARS: {
      bg: '#07070e',
      bgLight: '#0f0f1e',
      card: 'rgba(255,255,255,0.03)',
      cardBorder: 'rgba(255,255,255,0.06)',
      primary: '#6C5CE7',
      primaryDim: 'rgba(108,92,231,0.15)',
      accent: '#00cec9',
      accentDim: 'rgba(0,206,201,0.15)',
      text: '#e0e0e0',
      textDim: '#888',
      error: '#ff6b6b',
      success: '#00b894',
      gold: '#ffd700',
      goldDim: 'rgba(255,215,0,0.15)',
      glass: 'rgba(255,255,255,0.04)',
      glassBorder: 'rgba(255,255,255,0.08)'
    }
  };

  const AuthSystem = {
    _initialized: false,

    async init() {
      if (this._initialized) return;
      this._initialized = true;

      this.injectStyles();
      this.createAuthModal();
      this.createBottomBar();
      this.createBugButton();
      this.createBugModal();
      this.createAdminPanel();
      this.bindEvents();
      this.checkSession();
      this.applyAuthState();
      this.injectPremiumBadges();
      this.setupAdminTrigger();
    },

    // ─── SHA-256 Utility ──────────────────────────────────────────
    async sha256(message) {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // ─── Device Fingerprint ──────────────────────────────────────
    async getDeviceFingerprint() {
      const raw = [
        navigator.userAgent || '',
        screen.width || 0,
        screen.height || 0,
        Intl.DateTimeFormat().resolvedOptions().timeZone || ''
      ].join('|||');
      return await this.sha256(raw);
    },

    // ─── Storage Helpers ─────────────────────────────────────────
    getJSON(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch { return fallback; }
    },
    setJSON(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },

    getUsers() { return this.getJSON(CONFIG.STORAGE_KEYS.USERS, []); },
    setUsers(u) { this.setJSON(CONFIG.STORAGE_KEYS.USERS, u); },
    getDeviceBounds() { return this.getJSON(CONFIG.STORAGE_KEYS.DEVICE_BOUNDS, {}); },
    setDeviceBounds(b) { this.setJSON(CONFIG.STORAGE_KEYS.DEVICE_BOUNDS, b); },
    getBugs() { return this.getJSON(CONFIG.STORAGE_KEYS.BUGS, []); },
    setBugs(b) { this.setJSON(CONFIG.STORAGE_KEYS.BUGS, b); },

    getCurrentUser() {
      return this.getJSON(CONFIG.STORAGE_KEYS.CURRENT_USER, null);
    },
    setCurrentUser(user) {
      if (user) {
        this.setJSON(CONFIG.STORAGE_KEYS.CURRENT_USER, user);
        this.setJSON(CONFIG.STORAGE_KEYS.SESSION, { userId: user.username, ts: Date.now() });
        localStorage.removeItem(CONFIG.STORAGE_KEYS.GUEST_MODE);
      } else {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.SESSION);
      }
    },

    setGuestMode(guest) {
      if (guest) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.GUEST_MODE, '1');
        localStorage.removeItem(CONFIG.STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.SESSION);
      } else {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.GUEST_MODE);
      }
    },
    isGuestMode() {
      return localStorage.getItem(CONFIG.STORAGE_KEYS.GUEST_MODE) === '1';
    },

    // ─── Session Check ───────────────────────────────────────────
    checkSession() {
      const session = this.getJSON(CONFIG.STORAGE_KEYS.SESSION, null);
      if (session && (Date.now() - session.ts > CONFIG.SESSION_DURATION)) {
        this.setCurrentUser(null);
      }
    },

    // ─── Auth State ──────────────────────────────────────────────
    isLoggedIn() { return !!this.getCurrentUser(); },

    async isPremiumDevice() {
      const bounds = this.getDeviceBounds();
      const fp = await this.getDeviceFingerprint();
      return Object.values(bounds).includes(fp);
    },

    async getAuthLevel() {
      // Returns: 'premium' | 'user' | 'guest'
      const user = this.getCurrentUser();
      if (!user) return 'guest';

      if (user.isPremium) return 'premium';
      const premiumDevice = await this.isPremiumDevice();
      if (premiumDevice) return 'premium';

      return 'user';
    },

    getPremiumTemplates() {
      return window.__PREMIUM_TEMPLATES || [];
    },

    isPremiumTemplate(filename) {
      return this.getPremiumTemplates().includes(filename);
    },

    // ─── User Registration ──────────────────────────────────────
    async register(username, displayName, password) {
      username = username.trim().toLowerCase();
      displayName = displayName.trim();

      if (!username || username.length < 3) {
        return { ok: false, msg: '用户名至少需要3个字符' };
      }
      if (!/^[a-z0-9_]+$/.test(username)) {
        return { ok: false, msg: '用户名只能包含小写字母、数字和下划线' };
      }
      if (!displayName) {
        return { ok: false, msg: '请输入显示名称' };
      }
      if (!password || password.length < 6) {
        return { ok: false, msg: '密码至少需要6个字符' };
      }

      const users = this.getUsers();
      if (users.find(u => u.username === username)) {
        return { ok: false, msg: '该用户名已被注册' };
      }

      const passwordHash = await this.sha256(password);
      const newUser = {
        username,
        displayName,
        passwordHash,
        createdAt: Date.now(),
        isPremium: false
      };
      users.push(newUser);
      this.setUsers(users);
      this.setCurrentUser(newUser);
      return { ok: true, msg: '注册成功！' };
    },

    // ─── User Login ──────────────────────────────────────────────
    async loginWithPassword(username, password) {
      username = username.trim().toLowerCase();
      const users = this.getUsers();
      const user = users.find(u => u.username === username);
      if (!user) {
        return { ok: false, msg: '用户名不存在' };
      }
      const hash = await this.sha256(password);
      if (hash !== user.passwordHash) {
        return { ok: false, msg: '密码错误' };
      }
      this.setCurrentUser(user);
      return { ok: true, msg: '登录成功！' };
    },

    // ─── Key Login ───────────────────────────────────────────────
    async loginWithKey(keyCode) {
      keyCode = keyCode.trim();
      if (!keyCode) {
        return { ok: false, msg: '请输入密钥' };
      }

      const keyHash = await this.sha256(keyCode);
      const validHashes = window.__VALID_HASHES || [];
      const adminHashes = window.__ADMIN_HASHES || [];

      if (!validHashes.includes(keyHash)) {
        return { ok: false, msg: '密钥无效' };
      }

      const isAdminKey = adminHashes.includes(keyHash);

      const fp = await this.getDeviceFingerprint();
      const bounds = this.getDeviceBounds();

      // Admin keys bypass device limits (single-device binding).
      // They can unlock any device without being bound to one.
      if (!isAdminKey) {
        // Check if this key is already bound to this device
        if (bounds[keyHash] === fp) {
          // Already bound device, just log in
        } else if (!bounds[keyHash]) {
          // First time: bind this device
          bounds[keyHash] = fp;
          this.setDeviceBounds(bounds);
        } else {
          // Key is bound to a different device
          return { ok: false, msg: '此密钥已绑定其他设备' };
        }
      }

      // Create or find key user
      const keyUsername = 'key_' + keyHash.substring(0, 8);
      const users = this.getUsers();
      let keyUser = users.find(u => u.username === keyUsername);

      if (!keyUser) {
        keyUser = {
          username: keyUsername,
          displayName: '密钥用户',
          passwordHash: '',
          createdAt: Date.now(),
          isPremium: true
        };
        users.push(keyUser);
        this.setUsers(users);
      } else {
        keyUser.isPremium = true;
        this.setUsers(users);
      }

      this.setCurrentUser(keyUser);
      return { ok: true, msg: '密钥验证成功！旗舰版已激活 ✓' };
    },

    logout() {
      this.setCurrentUser(null);
      this.setGuestMode(false);
      this.applyAuthState();
      this.updateBottomBar();
      this.showAuthModal();
    },

    // ─── CSS Injection ───────────────────────────────────────────
    injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        /* ── Auth Modal Overlay ── */
        .__auth_overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        .__auth_overlay.__active {
          opacity: 1;
          visibility: visible;
        }
        .__auth_modal {
          width: 420px;
          max-width: 92vw;
          max-height: 90vh;
          overflow-y: auto;
          background: ${CONFIG.CSS_VARS.bgLight};
          border: 1px solid ${CONFIG.CSS_VARS.glassBorder};
          border-radius: 16px;
          padding: 32px 28px 24px;
          backdrop-filter: blur(20px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          transform: translateY(20px) scale(0.97);
          transition: transform 0.3s ease;
        }
        .__auth_overlay.__active .__auth_modal {
          transform: translateY(0) scale(1);
        }
        .__auth_close {
          position: absolute;
          top: 14px;
          right: 16px;
          background: none;
          border: none;
          color: ${CONFIG.CSS_VARS.textDim};
          font-size: 22px;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .__auth_close:hover {
          color: ${CONFIG.CSS_VARS.text};
          background: ${CONFIG.CSS_VARS.card};
        }
        .__auth_modal { position: relative; }
        .__auth_title {
          text-align: center;
          font-size: 22px;
          font-weight: 700;
          color: ${CONFIG.CSS_VARS.text};
          margin-bottom: 20px;
          letter-spacing: 0.5px;
        }
        .__auth_title span {
          background: linear-gradient(135deg, ${CONFIG.CSS_VARS.primary}, ${CONFIG.CSS_VARS.accent});
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* ── Tabs ── */
        .__auth_tabs {
          display: flex;
          gap: 0;
          margin-bottom: 20px;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid ${CONFIG.CSS_VARS.glassBorder};
          background: ${CONFIG.CSS_VARS.card};
        }
        .__auth_tab {
          flex: 1;
          padding: 10px 8px;
          background: transparent;
          border: none;
          color: ${CONFIG.CSS_VARS.textDim};
          font-size: 13px;
          cursor: pointer;
          transition: all 0.3s;
          font-weight: 500;
        }
        .__auth_tab.__active {
          background: ${CONFIG.CSS_VARS.primaryDim};
          color: ${CONFIG.CSS_VARS.primary};
          font-weight: 600;
        }
        .__auth_tab:hover:not(.__active) {
          color: ${CONFIG.CSS_VARS.text};
          background: rgba(255,255,255,0.02);
        }

        /* ── Forms ── */
        .__auth_pane { display: none; }
        .__auth_pane.__active { display: block; }

        .__auth_input_group {
          margin-bottom: 14px;
        }
        .__auth_input_group label {
          display: block;
          font-size: 12px;
          color: ${CONFIG.CSS_VARS.textDim};
          margin-bottom: 6px;
          font-weight: 500;
          letter-spacing: 0.3px;
        }
        .__auth_input {
          width: 100%;
          padding: 11px 14px;
          background: ${CONFIG.CSS_VARS.card};
          border: 1px solid ${CONFIG.CSS_VARS.glassBorder};
          border-radius: 10px;
          color: ${CONFIG.CSS_VARS.text};
          font-size: 14px;
          outline: none;
          transition: all 0.3s;
          box-sizing: border-box;
          font-family: inherit;
        }
        .__auth_input:focus {
          border-color: ${CONFIG.CSS_VARS.primary};
          box-shadow: 0 0 0 3px ${CONFIG.CSS_VARS.primaryDim};
        }
        .__auth_input::placeholder {
          color: rgba(255,255,255,0.15);
        }

        .__auth_btn {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 6px;
          letter-spacing: 0.5px;
        }
        .__auth_btn_primary {
          background: linear-gradient(135deg, ${CONFIG.CSS_VARS.primary}, #8b5cf6);
          color: #fff;
        }
        .__auth_btn_primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(108,92,231,0.3);
        }
        .__auth_btn_primary:active {
          transform: translateY(0);
        }
        .__auth_btn_ghost {
          background: transparent;
          color: ${CONFIG.CSS_VARS.textDim};
          border: 1px solid ${CONFIG.CSS_VARS.glassBorder};
          margin-top: 10px;
        }
        .__auth_btn_ghost:hover {
          color: ${CONFIG.CSS_VARS.text};
          background: ${CONFIG.CSS_VARS.card};
        }

        .__auth_msg {
          font-size: 12px;
          margin-top: 10px;
          padding: 8px 12px;
          border-radius: 8px;
          display: none;
          text-align: center;
        }
        .__auth_msg.__show { display: block; }
        .__auth_msg.__error {
          color: ${CONFIG.CSS_VARS.error};
          background: rgba(255,107,107,0.08);
          border: 1px solid rgba(255,107,107,0.15);
        }
        .__auth_msg.__success {
          color: ${CONFIG.CSS_VARS.success};
          background: rgba(0,184,148,0.08);
          border: 1px solid rgba(0,184,148,0.15);
        }

        .__auth_guest_btn {
          display: block;
          text-align: center;
          margin-top: 16px;
          font-size: 12px;
          color: ${CONFIG.CSS_VARS.textDim};
          cursor: pointer;
          background: none;
          border: none;
          padding: 6px;
          transition: color 0.2s;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .__auth_guest_btn:hover {
          color: ${CONFIG.CSS_VARS.accent};
        }

        /* ── Bottom Bar ── */
        .__bottom_auth_bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 9990;
          padding: 8px 20px;
          background: rgba(7,7,14,0.85);
          backdrop-filter: blur(12px);
          border-top: 1px solid ${CONFIG.CSS_VARS.glassBorder};
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: ${CONFIG.CSS_VARS.textDim};
        }
        .__bottom_user_info {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .__bottom_avatar {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${CONFIG.CSS_VARS.primary}, ${CONFIG.CSS_VARS.accent});
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          color: #fff;
        }
        .__bottom_name {
          color: ${CONFIG.CSS_VARS.text};
          font-weight: 600;
          font-size: 13px;
        }
        .__bottom_badge {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 20px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        .__bottom_badge.__premium {
          background: ${CONFIG.CSS_VARS.goldDim};
          color: ${CONFIG.CSS_VARS.gold};
          border: 1px solid rgba(255,215,0,0.2);
        }
        .__bottom_badge.__guest {
          background: ${CONFIG.CSS_VARS.card};
          color: ${CONFIG.CSS_VARS.textDim};
          border: 1px solid ${CONFIG.CSS_VARS.glassBorder};
        }
        .__bottom_actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .__bottom_btn {
          background: none;
          border: none;
          color: ${CONFIG.CSS_VARS.textDim};
          font-size: 12px;
          cursor: pointer;
          padding: 4px 10px;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .__bottom_btn:hover {
          color: ${CONFIG.CSS_VARS.accent};
          background: ${CONFIG.CSS_VARS.accentDim};
        }

        /* ── Premium Badge on Cards ── */
        .__premium_card_badge {
          position: absolute;
          top: 12px;
          right: 12px;
          background: linear-gradient(135deg, #ffd700, #ffaa00);
          color: #1a1a2e;
          font-size: 10px;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 20px;
          letter-spacing: 1px;
          box-shadow: 0 2px 10px rgba(255,215,0,0.3);
          z-index: 5;
          pointer-events: none;
        }
        .__lock_overlay {
          position: absolute;
          inset: 0;
          background: rgba(7,7,14,0.6);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: inherit;
          z-index: 4;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s;
        }
        .__lock_overlay.__show {
          opacity: 1;
          visibility: visible;
        }
        .__lock_icon {
          font-size: 32px;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));
        }

        /* ── Bug Feedback ── */
        .__bug_fab {
          position: fixed;
          bottom: 56px;
          right: 20px;
          z-index: 9980;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, ${CONFIG.CSS_VARS.primary}, #8b5cf6);
          border: none;
          color: #fff;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(108,92,231,0.35);
          transition: all 0.3s;
        }
        .__bug_fab:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 24px rgba(108,92,231,0.5);
        }

        .__bug_overlay {
          position: fixed;
          inset: 0;
          z-index: 10001;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        .__bug_overlay.__active {
          opacity: 1;
          visibility: visible;
        }
        .__bug_modal {
          width: 460px;
          max-width: 92vw;
          background: ${CONFIG.CSS_VARS.bgLight};
          border: 1px solid ${CONFIG.CSS_VARS.glassBorder};
          border-radius: 16px;
          padding: 28px;
          backdrop-filter: blur(20px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          transform: translateY(20px);
          transition: transform 0.3s ease;
          position: relative;
        }
        .__bug_overlay.__active .__bug_modal {
          transform: translateY(0);
        }
        .__bug_modal h3 {
          margin: 0 0 16px;
          font-size: 18px;
          color: ${CONFIG.CSS_VARS.text};
        }
        .__bug_textarea {
          width: 100%;
          min-height: 120px;
          padding: 12px;
          background: ${CONFIG.CSS_VARS.card};
          border: 1px solid ${CONFIG.CSS_VARS.glassBorder};
          border-radius: 10px;
          color: ${CONFIG.CSS_VARS.text};
          font-size: 14px;
          resize: vertical;
          outline: none;
          font-family: inherit;
          box-sizing: border-box;
          transition: border-color 0.3s;
        }
        .__bug_textarea:focus {
          border-color: ${CONFIG.CSS_VARS.primary};
        }
        .__bug_textarea::placeholder {
          color: rgba(255,255,255,0.15);
        }
        .__bug_email {
          width: 100%;
          padding: 11px 14px;
          background: ${CONFIG.CSS_VARS.card};
          border: 1px solid ${CONFIG.CSS_VARS.glassBorder};
          border-radius: 10px;
          color: ${CONFIG.CSS_VARS.text};
          font-size: 14px;
          outline: none;
          margin-top: 12px;
          box-sizing: border-box;
          transition: border-color 0.3s;
          font-family: inherit;
        }
        .__bug_email:focus {
          border-color: ${CONFIG.CSS_VARS.primary};
        }
        .__bug_email::placeholder {
          color: rgba(255,255,255,0.15);
        }
        .__bug_submit {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, ${CONFIG.CSS_VARS.primary}, #8b5cf6);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 14px;
          transition: all 0.3s;
        }
        .__bug_submit:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(108,92,231,0.3);
        }

        /* ── Admin Panel ── */
        .__admin_overlay {
          position: fixed;
          inset: 0;
          z-index: 10002;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(10px);
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        .__admin_overlay.__active {
          opacity: 1;
          visibility: visible;
        }
        .__admin_modal {
          width: 600px;
          max-width: 92vw;
          max-height: 80vh;
          background: ${CONFIG.CSS_VARS.bgLight};
          border: 1px solid ${CONFIG.CSS_VARS.glassBorder};
          border-radius: 16px;
          padding: 28px;
          backdrop-filter: blur(20px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          overflow-y: auto;
          position: relative;
        }
        .__admin_modal h3 {
          margin: 0 0 20px;
          color: ${CONFIG.CSS_VARS.text};
          font-size: 18px;
        }
        .__admin_bug_item {
          background: ${CONFIG.CSS_VARS.card};
          border: 1px solid ${CONFIG.CSS_VARS.glassBorder};
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 10px;
        }
        .__admin_bug_item p {
          margin: 0 0 6px;
          color: ${CONFIG.CSS_VARS.text};
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .__admin_bug_meta {
          font-size: 11px;
          color: ${CONFIG.CSS_VARS.textDim};
          display: flex;
          gap: 16px;
        }
        .__admin_empty {
          text-align: center;
          color: ${CONFIG.CSS_VARS.textDim};
          padding: 40px 0;
          font-size: 14px;
        }
        .__admin_close {
          position: absolute;
          top: 14px;
          right: 16px;
          background: none;
          border: none;
          color: ${CONFIG.CSS_VARS.textDim};
          font-size: 22px;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .__admin_close:hover {
          color: ${CONFIG.CSS_VARS.text};
          background: ${CONFIG.CSS_VARS.card};
        }

        /* ── Responsive ── */
        @media (max-width: 480px) {
          .__auth_modal {
            padding: 24px 18px 20px;
            border-radius: 12px;
          }
          .__auth_tab {
            font-size: 12px;
            padding: 9px 4px;
          }
          .__bottom_auth_bar {
            padding: 6px 14px;
          }
        }

        /* ── Download button premium styling ── */
        .__dl_locked {
          opacity: 0.5;
          position: relative;
        }
        .__dl_locked::after {
          content: '🔒';
          margin-left: 6px;
          font-size: 12px;
        }
      `;
      document.head.appendChild(style);
    },

    // ─── Auth Modal HTML ─────────────────────────────────────────
    createAuthModal() {
      const overlay = document.createElement('div');
      overlay.className = '__auth_overlay';
      overlay.id = '__authOverlay';
      overlay.innerHTML = `
        <div class="__auth_modal">
          <button class="__auth_close" id="__authClose">✕</button>
          <div class="__auth_title"><span>模板商店</span></div>
          <div class="__auth_tabs">
            <button class="__auth_tab __active" data-tab="key">密钥登录</button>
            <button class="__auth_tab" data-tab="login">账号登录</button>
            <button class="__auth_tab" data-tab="register">注册</button>
          </div>

          <div class="__auth_pane __active" data-pane="key">
            <div class="__auth_input_group">
              <label>输入您的密钥</label>
              <input type="text" class="__auth_input" id="__keyInput" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off">
            </div>
            <button class="__auth_btn __auth_btn_primary" id="__keySubmit">验证密钥</button>
            <div class="__auth_msg" id="__keyMsg"></div>
          </div>

          <div class="__auth_pane" data-pane="login">
            <div class="__auth_input_group">
              <label>用户名</label>
              <input type="text" class="__auth_input" id="__loginUser" placeholder="请输入用户名" autocomplete="username">
            </div>
            <div class="__auth_input_group">
              <label>密码</label>
              <input type="password" class="__auth_input" id="__loginPass" placeholder="请输入密码" autocomplete="current-password">
            </div>
            <button class="__auth_btn __auth_btn_primary" id="__loginSubmit">登 录</button>
            <div class="__auth_msg" id="__loginMsg"></div>
          </div>

          <div class="__auth_pane" data-pane="register">
            <div class="__auth_input_group">
              <label>用户名</label>
              <input type="text" class="__auth_input" id="__regUser" placeholder="3位以上，字母数字下划线" autocomplete="off">
            </div>
            <div class="__auth_input_group">
              <label>显示名称</label>
              <input type="text" class="__auth_input" id="__regDisplay" placeholder="您的昵称" autocomplete="off">
            </div>
            <div class="__auth_input_group">
              <label>密码</label>
              <input type="password" class="__auth_input" id="__regPass" placeholder="至少6位" autocomplete="new-password">
            </div>
            <div class="__auth_input_group">
              <label>确认密码</label>
              <input type="password" class="__auth_input" id="__regPassConfirm" placeholder="再次输入密码" autocomplete="new-password">
            </div>
            <button class="__auth_btn __auth_btn_primary" id="__regSubmit">注 册</button>
            <div class="__auth_msg" id="__regMsg"></div>
          </div>

          <button class="__auth_guest_btn" id="__guestBtn">游客模式 → 继续浏览</button>
        </div>
      `;
      document.body.appendChild(overlay);
    },

    // ─── Bottom Bar HTML ─────────────────────────────────────────
    createBottomBar() {
      const bar = document.createElement('div');
      bar.className = '__bottom_auth_bar';
      bar.id = '__bottomBar';
      bar.innerHTML = `
        <div class="__bottom_user_info" id="__bottomUserInfo">
          <div class="__bottom_avatar" id="__bottomAvatar">?</div>
          <span class="__bottom_name" id="__bottomName">游客模式</span>
          <span class="__bottom_badge __guest" id="__bottomBadge">游客</span>
        </div>
        <div class="__bottom_actions">
          <button class="__bottom_btn" id="__bottomAuthBtn">登录 / 注册</button>
        </div>
      `;
      document.body.appendChild(bar);
    },

    // ─── Bug Feedback Button ─────────────────────────────────────
    createBugButton() {
      const btn = document.createElement('button');
      btn.className = '__bug_fab';
      btn.id = '__bugFab';
      btn.innerHTML = '🐛';
      btn.title = '反馈问题';
      document.body.appendChild(btn);
    },

    createBugModal() {
      const overlay = document.createElement('div');
      overlay.className = '__bug_overlay';
      overlay.id = '__bugOverlay';
      overlay.innerHTML = `
        <div class="__bug_modal">
          <button class="__auth_close" id="__bugClose">✕</button>
          <h3>🐛 反馈问题</h3>
          <textarea class="__bug_textarea" id="__bugText" placeholder="请描述您遇到的问题..."></textarea>
          <input type="email" class="__bug_email" id="__bugEmail" placeholder="邮箱（选填，方便我们联系您）">
          <button class="__bug_submit" id="__bugSubmit">提交反馈</button>
          <div class="__auth_msg" id="__bugMsg"></div>
        </div>
      `;
      document.body.appendChild(overlay);
    },

    // ─── Admin Panel ─────────────────────────────────────────────
    createAdminPanel() {
      const overlay = document.createElement('div');
      overlay.className = '__admin_overlay';
      overlay.id = '__adminOverlay';
      overlay.innerHTML = `
        <div class="__admin_modal">
          <button class="__admin_close" id="__adminClose">✕</button>
          <h3>🐛 反馈列表 (管理员)</h3>
          <div id="__adminBugList"></div>
        </div>
      `;
      document.body.appendChild(overlay);
    },

    // ─── UI Helpers ──────────────────────────────────────────────
    showMsg(el, msg, type) {
      el.textContent = msg;
      el.className = '__auth_msg __show ' + (type === 'error' ? '__error' : '__success');
    },
    hideMsg(el) {
      el.className = '__auth_msg';
    },

    switchTab(tabName) {
      document.querySelectorAll('.__auth_tab').forEach(t => t.classList.toggle('__active', t.dataset.tab === tabName));
      document.querySelectorAll('.__auth_pane').forEach(p => p.classList.toggle('__active', p.dataset.pane === tabName));
      // Clear messages
      ['__keyMsg', '__loginMsg', '__regMsg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) this.hideMsg(el);
      });
    },

    showAuthModal() {
      document.getElementById('__authOverlay').classList.add('__active');
    },
    hideAuthModal() {
      document.getElementById('__authOverlay').classList.remove('__active');
    },

    showBugModal() {
      document.getElementById('__bugOverlay').classList.add('__active');
    },
    hideBugModal() {
      document.getElementById('__bugOverlay').classList.remove('__active');
    },

    showAdminPanel() {
      this.renderAdminBugs();
      document.getElementById('__adminOverlay').classList.add('__active');
    },
    hideAdminPanel() {
      document.getElementById('__adminOverlay').classList.remove('__active');
    },

    // ─── Update Bottom Bar ───────────────────────────────────────
    updateBottomBar() {
      const user = this.getCurrentUser();
      const avatarEl = document.getElementById('__bottomAvatar');
      const nameEl = document.getElementById('__bottomName');
      const badgeEl = document.getElementById('__bottomBadge');
      const authBtn = document.getElementById('__bottomAuthBtn');

      if (user) {
        const initial = (user.displayName || user.username).charAt(0).toUpperCase();
        avatarEl.textContent = initial;
        nameEl.textContent = user.displayName || user.username;

        if (user.isPremium) {
          badgeEl.className = '__bottom_badge __premium';
          badgeEl.textContent = '旗舰';
        } else {
          badgeEl.className = '__bottom_badge __guest';
          badgeEl.textContent = '用户';
        }

        authBtn.textContent = '退出登录';
        authBtn.onclick = () => this.logout();
      } else if (this.isGuestMode()) {
        avatarEl.textContent = '?';
        nameEl.textContent = '游客模式';
        badgeEl.className = '__bottom_badge __guest';
        badgeEl.textContent = '游客';
        authBtn.textContent = '登录 / 注册';
        authBtn.onclick = () => this.showAuthModal();
      } else {
        avatarEl.textContent = '?';
        nameEl.textContent = '游客模式';
        badgeEl.className = '__bottom_badge __guest';
        badgeEl.textContent = '游客';
        authBtn.textContent = '登录 / 注册';
        authBtn.onclick = () => this.showAuthModal();
      }
    },

    // ─── Apply Auth State (download buttons, premium badges) ────
    async applyAuthState() {
      const authLevel = await this.getAuthLevel();
      this.updateBottomBar();
      this.updateDownloadButtons(authLevel);
      this.updatePremiumOverlays(authLevel);
    },

    updateDownloadButtons(authLevel) {
      const premiumList = this.getPremiumTemplates();
      if (!premiumList.length) return;

      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const isPremiumDL = premiumList.some(p => href.includes(p));

        if (isPremiumDL) {
          // Remove old lock class
          a.classList.remove('__dl_locked');
          // Remove old lock overlay if exists
          const existingLock = a.querySelector('.__lock_overlay');

          if (authLevel !== 'premium') {
            a.classList.add('__dl_locked');
            // Add click handler to prevent download and show auth modal
            if (!a.__authBound) {
              a.__authBound = true;
              a.addEventListener('click', (e) => {
                if (!this._allowDownload) {
                  e.preventDefault();
                  e.stopPropagation();
                  this.showAuthModal();
                }
              });
            }
          } else {
            a.classList.remove('__dl_locked');
          }
        }
      });

      // Also handle buttons with data attributes or specific classes
      document.querySelectorAll('[data-template]').forEach(el => {
        const tpl = el.dataset.template;
        if (this.isPremiumTemplate(tpl)) {
          // Check if it's a download button
          if (el.tagName === 'A' || el.tagName === 'BUTTON') {
            el.classList.toggle('__dl_locked', authLevel !== 'premium');
          }
        }
      });
    },

    updatePremiumOverlays(authLevel) {
      const premiumList = this.getPremiumTemplates();
      if (!premiumList.length) return;

      // Find template cards and add overlays
      document.querySelectorAll('[data-template]').forEach(card => {
        const tpl = card.dataset.template;
        if (!this.isPremiumTemplate(tpl)) return;
        if (card.__tsBadged) return;      // already processed — skip

        // Ensure position relative
        if (getComputedStyle(card).position === 'static') {
          card.style.position = 'relative';
        }

        // Add gold badge if not exists
        if (!card.querySelector('.__premium_card_badge')) {
          const badge = document.createElement('div');
          badge.className = '__premium_card_badge';
          badge.textContent = '旗舰';
          card.appendChild(badge);
        }
        card.__tsBadged = true;
      });

      // Also try to match by href for cards containing download links
      document.querySelectorAll('.card, .template-card, .tpl-card, [class*="card"]').forEach(card => {
        if (card.__tsBadged) return;      // already processed — skip
        const links = card.querySelectorAll('a[href]');
        let isPremiumCard = false;
        let tplName = '';

        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          const match = premiumList.find(p => href.includes(p));
          if (match) {
            isPremiumCard = true;
            tplName = match;
          }
        });

        if (isPremiumCard && tplName) {
          if (getComputedStyle(card).position === 'static') {
            card.style.position = 'relative';
          }

          if (!card.querySelector('.__premium_card_badge')) {
            const badge = document.createElement('div');
            badge.className = '__premium_card_badge';
            badge.textContent = '旗舰';
            card.appendChild(badge);
          }
          card.__tsBadged = true;
        }
      });
    },

    // ─── Premium Badge Injection ─────────────────────────────────
    injectPremiumBadges() {
      const premiumList = this.getPremiumTemplates();
      if (!premiumList.length) return;

      // Observe DOM for dynamically loaded cards — but debounced to
      // avoid infinite self-trigger loops (badges injected → observer fires → re-inject)
      let observerTimer = null;
      const observer = new MutationObserver(() => {
        if (observerTimer) return;
        observerTimer = setTimeout(() => {
          observerTimer = null;
          this.applyAuthState();
        }, 300);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    },

    // ─── Admin Trigger (triple-click on logo) ───────────────────
    setupAdminTrigger() {
      let clickCount = 0;
      let clickTimer = null;

      // Try common logo selectors
      const logoSelectors = [
        '.logo', '#logo', '.site-logo', '#site-logo',
        'header a:first-child', 'nav a:first-child',
        '.navbar-brand', '[class*="logo"]', 'header h1', 'header .title'
      ];

      let logoEl = null;
      for (const sel of logoSelectors) {
        logoEl = document.querySelector(sel);
        if (logoEl) break;
      }

      if (!logoEl) {
        // Fallback: use the first heading or first element in body
        logoEl = document.querySelector('h1') || document.querySelector('header') || document.body.firstChild;
      }

      if (logoEl) {
        logoEl.addEventListener('click', (e) => {
          clickCount++;
          if (clickTimer) clearTimeout(clickTimer);

          if (clickCount >= 3) {
            clickCount = 0;
            clearTimeout(clickTimer);
            this.showAdminPanel();
          } else {
            clickTimer = setTimeout(() => { clickCount = 0; }, 800);
          }
        });
      }
    },

    // ─── Admin Bugs Renderer ─────────────────────────────────────
    renderAdminBugs() {
      const list = document.getElementById('__adminBugList');
      const bugs = this.getBugs();

      if (!bugs.length) {
        list.innerHTML = '<div class="__admin_empty">暂无反馈 ✨</div>';
        return;
      }

      list.innerHTML = bugs.slice().reverse().map(b => `
        <div class="__admin_bug_item">
          <p>${this.escapeHtml(b.text)}</p>
          <div class="__admin_bug_meta">
            <span>📧 ${b.email || '未提供'}</span>
            <span>🕐 ${new Date(b.timestamp).toLocaleString('zh-CN')}</span>
            <span>📌 ${b.status}</span>
          </div>
        </div>
      `).join('');
    },

    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    // ─── Event Binding ───────────────────────────────────────────
    bindEvents() {
      // Tab switching
      document.querySelectorAll('.__auth_tab').forEach(tab => {
        tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
      });

      // Close buttons
      document.getElementById('__authClose').addEventListener('click', () => this.hideAuthModal());
      document.getElementById('__bugClose').addEventListener('click', () => this.hideBugModal());
      document.getElementById('__adminClose').addEventListener('click', () => this.hideAdminPanel());

      // Close on overlay click
      ['__authOverlay', '__bugOverlay', '__adminOverlay'].forEach(id => {
        document.getElementById(id).addEventListener('click', (e) => {
          if (e.target.id === id) {
            e.target.classList.remove('__active');
          }
        });
      });

      // Close on Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          document.querySelectorAll('.__auth_overlay.__active, .__bug_overlay.__active, .__admin_overlay.__active').forEach(el => {
            el.classList.remove('__active');
          });
        }
      });

      // Guest button
      document.getElementById('__guestBtn').addEventListener('click', () => {
        this.setGuestMode(true);
        this.hideAuthModal();
        this.applyAuthState();
      });

      // Key login
      document.getElementById('__keySubmit').addEventListener('click', async () => {
        const input = document.getElementById('__keyInput');
        const msg = document.getElementById('__keyMsg');
        const key = input.value.trim();
        if (!key) { this.showMsg(msg, '请输入密钥', 'error'); return; }

        this.showMsg(msg, '验证中...', 'success');
        const result = await this.loginWithKey(key);
        this.showMsg(msg, result.msg, result.ok ? 'success' : 'error');

        if (result.ok) {
          input.value = '';
          setTimeout(() => {
            this.hideAuthModal();
            this.applyAuthState();
          }, 1000);
        }
      });

      // Key input enter
      document.getElementById('__keyInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('__keySubmit').click();
      });

      // Password login
      document.getElementById('__loginSubmit').addEventListener('click', async () => {
        const user = document.getElementById('__loginUser').value;
        const pass = document.getElementById('__loginPass').value;
        const msg = document.getElementById('__loginMsg');

        if (!user || !pass) { this.showMsg(msg, '请填写所有字段', 'error'); return; }

        const result = await this.loginWithPassword(user, pass);
        this.showMsg(msg, result.msg, result.ok ? 'success' : 'error');

        if (result.ok) {
          document.getElementById('__loginUser').value = '';
          document.getElementById('__loginPass').value = '';
          setTimeout(() => {
            this.hideAuthModal();
            this.applyAuthState();
          }, 800);
        }
      });

      // Login enter
      document.getElementById('__loginPass').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('__loginSubmit').click();
      });

      // Register
      document.getElementById('__regSubmit').addEventListener('click', async () => {
        const user = document.getElementById('__regUser').value;
        const display = document.getElementById('__regDisplay').value;
        const pass = document.getElementById('__regPass').value;
        const confirm = document.getElementById('__regPassConfirm').value;
        const msg = document.getElementById('__regMsg');

        if (!user || !display || !pass || !confirm) {
          this.showMsg(msg, '请填写所有字段', 'error'); return;
        }
        if (pass !== confirm) {
          this.showMsg(msg, '两次输入的密码不一致', 'error'); return;
        }

        const result = await this.register(user, display, pass);
        this.showMsg(msg, result.msg, result.ok ? 'success' : 'error');

        if (result.ok) {
          document.getElementById('__regUser').value = '';
          document.getElementById('__regDisplay').value = '';
          document.getElementById('__regPass').value = '';
          document.getElementById('__regPassConfirm').value = '';
          setTimeout(() => {
            this.hideAuthModal();
            this.applyAuthState();
          }, 800);
        }
      });

      // Register confirm enter
      document.getElementById('__regPassConfirm').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('__regSubmit').click();
      });

      // Bottom bar auth button
      document.getElementById('__bottomAuthBtn').addEventListener('click', () => {
        const user = this.getCurrentUser();
        if (user) {
          this.logout();
        } else {
          this.showAuthModal();
        }
      });

      // Bug FAB
      document.getElementById('__bugFab').addEventListener('click', () => this.showBugModal());

      // Bug submit
      document.getElementById('__bugSubmit').addEventListener('click', () => {
        const text = document.getElementById('__bugText').value.trim();
        const email = document.getElementById('__bugEmail').value.trim();
        const msg = document.getElementById('__bugMsg');

        if (!text) {
          this.showMsg(msg, '请描述您遇到的问题', 'error'); return;
        }

        const bugs = this.getBugs();
        bugs.push({
          id: 'bug_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          text,
          email,
          timestamp: Date.now(),
          status: 'pending'
        });
        this.setBugs(bugs);

        this.showMsg(msg, '感谢您的反馈！我们会尽快处理 ✓', 'success');
        document.getElementById('__bugText').value = '';
        document.getElementById('__bugEmail').value = '';

        setTimeout(() => {
          this.hideBugModal();
          this.hideMsg(msg);
        }, 1500);
      });
    }
  };

  // ─── Initialize on DOMContentLoaded ────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AuthSystem.init());
  } else {
    AuthSystem.init();
  }

  // Expose for external use
  window.__AuthSystem = AuthSystem;

})();
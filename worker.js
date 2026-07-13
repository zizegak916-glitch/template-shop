/**
 * Template Shop — Key Validation Worker
 * Cloudflare Worker + KV 存储密钥-设备绑定
 *
 * API:
 *   POST /api/auth  { action: "login"|"unbind"|"status", key: "TMPL-..." }
 *   GET  /api/status
 *
 * KV Namespace: KEY_BINDINGS (绑定数据)
 * KV Namespace: KEY_STORE  (有效密钥哈希)
 *
 * 部署: npx wrangler deploy
 */

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = env.ALLOWED_ORIGIN;
  return {
  'Access-Control-Allow-Origin': origin && origin === allowedOrigin ? origin : allowedOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
};
}

function originIsAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return Boolean(env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN);
}

export default {
  async fetch(request, env) {
    if (!env.ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ success: false, message: '服务未配置允许来源' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request, env) });
    }

    if (!originIsAllowed(request, env)) {
      return jsonResponse({ success: false, message: 'Origin not allowed' }, 403, request, env);
    }

    const url = new URL(request.url);

    // GET /api/status — health check
    if (url.pathname === '/api/status' && request.method === 'GET') {
      return jsonResponse({
        status: 'ok',
        version: '2.0',
        features: ['key-validation', 'device-binding', 'one-device-limit'],
      }, 200, request, env);
    }

    // POST /api/auth — main auth endpoint
    if (url.pathname === '/api/auth' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { action, key, fingerprint } = body;

        if (!action) {
          return jsonResponse({ success: false, message: 'Missing action' }, 400, request, env);
        }

        switch (action) {
          case 'login':
            return await handleLogin(env, key, fingerprint, request);
          case 'unbind':
            return await handleUnbind(env, key, request);
          case 'status':
            return await handleStatus(env, key, request);
          default:
            return jsonResponse({ success: false, message: 'Unknown action' }, 400, request, env);
        }
      } catch (e) {
        return jsonResponse({ success: false, message: 'Invalid request' }, 400, request, env);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404, request, env);
  },
};

// ─── Login Handler ───────────────────────────────────────────────

async function handleLogin(env, key, clientFingerprint, request) {
  if (!key || !clientFingerprint) {
    return jsonResponse({ success: false, message: '请输入密钥和设备信息' }, 400, request, env);
  }

  const normalizedKey = key.trim().toUpperCase();

  // Validate key format
  if (!/^TMPL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizedKey)) {
    return jsonResponse({ success: false, message: '密钥格式错误' }, 400, request, env);
  }

  // Hash the key
  const keyHash = await sha256(normalizedKey);

  // Check if key is valid (from KV or fallback)
  let isValid = false;
  try {
    const stored = await env.KEY_STORE.get(keyHash);
    isValid = stored === '1';
  } catch (e) {
    return jsonResponse({ success: false, message: '密钥服务未配置' }, 503, request, env);
  }

  if (!isValid) {
    return jsonResponse({ success: false, message: '密钥无效' }, 401, request, env);
  }

  // Check device binding
  const bindingKey = `bind:${keyHash}`;
  let existingBinding = null;
  try {
    const raw = await env.KEY_BINDINGS.get(bindingKey);
    if (raw) existingBinding = JSON.parse(raw);
  } catch (e) {
    return jsonResponse({ success: false, message: '设备绑定服务不可用' }, 503, request, env);
  }

  if (existingBinding) {
    // Key already bound to a device
    if (existingBinding.fingerprint === clientFingerprint) {
      // Same device — allow
      return jsonResponse({
        success: true,
        message: '欢迎回来',
        bound: true,
        boundAt: existingBinding.boundAt,
      }, 200, request, env);
    } else {
      // Different device — deny
      const boundDate = new Date(existingBinding.boundAt).toLocaleDateString('zh-CN');
      return jsonResponse({
        success: false,
        message: `此密钥已绑定到其他设备（${boundDate}绑定）。一个密钥仅限一台设备使用。`,
        errorType: 'device_mismatch',
      }, 409, request, env);
    }
  }

  // New key — bind it to this device
  const binding = {
    fingerprint: clientFingerprint,
    boundAt: new Date().toISOString(),
    ip: request.headers.get('CF-Connecting-IP') || 'unknown',
    country: request.headers.get('CF-IPCountry') || 'unknown',
  };

  try {
    await env.KEY_BINDINGS.put(bindingKey, JSON.stringify(binding), {
      expirationTtl: 365 * 24 * 3600, // 1 year
    });
  } catch (e) {
    return jsonResponse({ success: false, message: '设备绑定服务不可用' }, 503, request, env);
  }

  return jsonResponse({
    success: true,
    message: '密钥已绑定到当前设备',
    bound: false,
    boundAt: binding.boundAt,
  }, 200, request, env);
}

// ─── Unbind Handler (admin) ──────────────────────────────────────

async function handleUnbind(env, key, request) {
  if (!env.ADMIN_UNBIND_SECRET || request.headers.get('X-Admin-Secret') !== env.ADMIN_UNBIND_SECRET) {
    return jsonResponse({ success: false, message: 'Unauthorized' }, 401, request, env);
  }
  if (!key) {
    return jsonResponse({ success: false, message: 'Missing key' }, 400, request, env);
  }

  const normalizedKey = key.trim().toUpperCase();
  const keyHash = await sha256(normalizedKey);
  const bindingKey = `bind:${keyHash}`;

  try {
    await env.KEY_BINDINGS.delete(bindingKey);
    return jsonResponse({ success: true, message: '密钥设备绑定已清除' }, 200, request, env);
  } catch (e) {
    return jsonResponse({ success: false, message: '解绑失败' }, 500, request, env);
  }
}

// ─── Status Handler ──────────────────────────────────────────────

async function handleStatus(env, key, request) {
  if (!key) {
    return jsonResponse({ success: false, message: 'Missing key' }, 400, request, env);
  }

  const normalizedKey = key.trim().toUpperCase();
  const keyHash = await sha256(normalizedKey);
  const bindingKey = `bind:${keyHash}`;

  try {
    const raw = await env.KEY_BINDINGS.get(bindingKey);
    if (raw) {
      const binding = JSON.parse(raw);
      return jsonResponse({
        success: true,
        bound: true,
        boundAt: binding.boundAt,
        country: binding.country,
      }, 200, request, env);
    }
    return jsonResponse({ success: true, bound: false }, 200, request, env);
  } catch (e) {
    return jsonResponse({ success: true, bound: false }, 200, request, env);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function jsonResponse(data, status = 200, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(request && env ? corsHeaders(request, env) : {}),
    },
  });
}

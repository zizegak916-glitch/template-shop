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

// 有效密钥哈希（部署前通过 keygen.py 生成并写入 KV）
const DEFAULT_HASHES = [
  "0ce368d3837daba00bdfebcc828e68f8ee3d626ccb6fab6053c30008313aa680",
  "81db0bebb7bbdad3a0844387ca6506035f4b56aff2d07025aa8e3f8a7e0e3ad8",
  "5666b08ecc6e5a5e069628c4bd8a4edc81b5fe2afa04f660e9a08fed3c7568f4",
  "ba5d4ca6aab02836cf3e596ce1815dac41f483072aa2b6fceb9c3b9e69fd0e08",
  "0ffccc1fd695a61fbf8a5b78ac1cb2670605d8f8a67de26c220b2949b1e2afa3",
  "6029afff9c26eda9b74c05ea0090c7f9e550008462861459dd030164eee78170",
  "4d73bdf11b6c9d9927df39c76b8fa70bc96cdd369910220949f08e69cb756397",
  "5ba38be1c2632ddacfcf22571b46b94fa9c15a3cfbf06263c20fe1aede5597c0",
  "456b5d7be945a7e35634b832e3a14d11611054f284331088a4964f4baf98bf24",
  "49310c57bd0c5a177ac5e37502838e48b999a206cab36747e43d04280e548da0",
  "529a06922824003936c87ade843e13f8273e072cbba6f3b557d65752e1685e36",
  "6408cf6687379dbd13b63a571237d8f382c666f0989b94b67648ad42f1fbaf06",
  "b1af45af251b0b283086401bab851a5a21f88ab59b93cb7eadaf5eafb3b1f183",
  "1f61db6330772b9de725878cfb80537fa8de50b012720cac1a1f6e3bfcfd9ec8",
  "ffeb2eb37a71a46055141b95a9db754b64e1b87805900ba51cdcff9b2bcae6c6",
  "9f30d1bc0274186b60b0c3c8ebb70f6ca1319bdd06bfd582a53604f716dc7e70",
  "b185f6e217cdd35215ee607be863611aef0e93a2a2873344091f9725eb3d01c3",
  "1b0bc2a61293001614f5666a1480c75d2d28184c9ba2a55f18310af535031a92",
  "25830d854728199311efc83b49879a4c216fcbc4b408d927b712ec1214f98e5b",
  "568d4ef9d9acf9e6a2854a31a7c6e4a4c490852a39b4a8b98399633b9c32c97f",
  "d4274ec08eabd196ee4b66d9774f7e64acf4dccd9429af4fbef36794d9dd85f8",
  "c8d928a137556a00cd47a7aea91ec13b56d1f6f378094232e99734d49401c0a4",
  "293558c5e74524c9df238dbcf4ac0b584c7cbe53e32b110fb8e166034bfc7a94",
  "83a04ca1d16229e0972c54058424753abf77adc0f1019c05156c415e51393fef",
  "abc5836bcc9ed730cf811259765bd56507a0f5478fb9494f505619f0a6dd4a27",
];

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // GET /api/status — health check
    if (url.pathname === '/api/status' && request.method === 'GET') {
      return jsonResponse({
        status: 'ok',
        version: '2.0',
        features: ['key-validation', 'device-binding', 'one-device-limit'],
      });
    }

    // POST /api/auth — main auth endpoint
    if (url.pathname === '/api/auth' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { action, key, fingerprint } = body;

        if (!action) {
          return jsonResponse({ success: false, message: 'Missing action' }, 400);
        }

        switch (action) {
          case 'login':
            return await handleLogin(env, key, fingerprint, request);
          case 'unbind':
            return await handleUnbind(env, key);
          case 'status':
            return await handleStatus(env, key);
          default:
            return jsonResponse({ success: false, message: 'Unknown action' }, 400);
        }
      } catch (e) {
        return jsonResponse({ success: false, message: 'Invalid request' }, 400);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};

// ─── Login Handler ───────────────────────────────────────────────

async function handleLogin(env, key, clientFingerprint, request) {
  if (!key || !fingerprint) {
    return jsonResponse({ success: false, message: '请输入密钥' }, 400);
  }

  const normalizedKey = key.trim().toUpperCase();

  // Validate key format
  if (!/^TMPL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizedKey)) {
    return jsonResponse({ success: false, message: '密钥格式错误' });
  }

  // Hash the key
  const keyHash = await sha256(normalizedKey);

  // Check if key is valid (from KV or fallback)
  let isValid = false;
  try {
    const stored = await env.KEY_STORE.get(keyHash);
    isValid = stored === '1';
  } catch (e) {
    // KV not configured, use fallback
    isValid = DEFAULT_HASHES.includes(keyHash);
  }

  if (!isValid) {
    return jsonResponse({ success: false, message: '密钥无效' });
  }

  // Check device binding
  const bindingKey = `bind:${keyHash}`;
  let existingBinding = null;
  try {
    const raw = await env.KEY_BINDINGS.get(bindingKey);
    if (raw) existingBinding = JSON.parse(raw);
  } catch (e) {
    // KV not configured
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
      });
    } else {
      // Different device — deny
      const boundDate = new Date(existingBinding.boundAt).toLocaleDateString('zh-CN');
      return jsonResponse({
        success: false,
        message: `此密钥已绑定到其他设备（${boundDate}绑定）。一个密钥仅限一台设备使用。`,
        errorType: 'device_mismatch',
      });
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
    // KV not configured — still allow login
  }

  return jsonResponse({
    success: true,
    message: '密钥已绑定到当前设备',
    bound: false,
    boundAt: binding.boundAt,
  });
}

// ─── Unbind Handler (admin) ──────────────────────────────────────

async function handleUnbind(env, key) {
  if (!key) {
    return jsonResponse({ success: false, message: 'Missing key' }, 400);
  }

  const normalizedKey = key.trim().toUpperCase();
  const keyHash = await sha256(normalizedKey);
  const bindingKey = `bind:${keyHash}`;

  try {
    await env.KEY_BINDINGS.delete(bindingKey);
    return jsonResponse({ success: true, message: '密钥设备绑定已清除' });
  } catch (e) {
    return jsonResponse({ success: false, message: '解绑失败' }, 500);
  }
}

// ─── Status Handler ──────────────────────────────────────────────

async function handleStatus(env, key) {
  if (!key) {
    return jsonResponse({ success: false, message: 'Missing key' }, 400);
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
      });
    }
    return jsonResponse({ success: true, bound: false });
  } catch (e) {
    return jsonResponse({ success: true, bound: false });
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

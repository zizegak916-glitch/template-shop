#!/usr/bin/env python3
"""
Template Shop — Key Manager v2
密钥生成、验证、设备绑定管理

用法:
  python3 keygen.py                    # 生成 10 个新密钥
  python3 keygen.py 20                 # 生成 20 个新密钥
  python3 keygen.py --verify TMPL-XXX # 验证密钥
  python3 keygen.py --hash TMPL-XXX   # 只输出哈希
  python3 keygen.py --append          # 生成并追加到 keys.js
  python3 keygen.py --unbind TMPL-XXX # 清除设备绑定（需 Worker）
  python3 keygen.py --list            # 列出所有已生成密钥哈希
"""
import hashlib
import secrets
import string
import sys
import json
import urllib.request

HASH_FILE = "keys.js"

# Cloudflare Worker URL (填入后可管理设备绑定)
WORKER_URL = ""  # 例如: https://template-shop-auth.xxx.workers.dev

def generate_key():
    chars = string.ascii_uppercase + string.digits
    parts = [''.join(secrets.choice(chars) for _ in range(4)) for _ in range(3)]
    return f"TMPL-{parts[0]}-{parts[1]}-{parts[2]}"

def hash_key(key):
    return hashlib.sha256(key.strip().upper().encode()).hexdigest()

def read_existing_hashes():
    """从 keys.js 读取已有哈希"""
    hashes = set()
    try:
        with open(HASH_FILE) as f:
            for line in f:
                line = line.strip().strip('"').strip(',').strip("'")
                if len(line) == 64 and all(c in '0123456789abcdef' for c in line):
                    hashes.add(line)
    except FileNotFoundError:
        pass
    return hashes

def worker_api(action, key=None):
    """调用 Cloudflare Worker API"""
    if not WORKER_URL:
        print("⚠️  WORKER_URL 未配置，无法执行服务端操作")
        return None
    try:
        data = json.dumps({"action": action, "key": key or ""}).encode()
        req = urllib.request.Request(
            f"{WORKER_URL}/api/auth",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"❌ API 调用失败: {e}")
        return None

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        key = sys.argv[2] if len(sys.argv) > 2 else input("Enter key: ")
        h = hash_key(key)
        print(f"Key:   {key.strip().upper()}")
        print(f"Hash:  {h}")
        existing = read_existing_hashes()
        if h in existing:
            print("✅ VALID — key found in", HASH_FILE)
        else:
            print("❌ INVALID — key not found in", HASH_FILE)

    elif len(sys.argv) > 1 and sys.argv[1] == "--hash":
        key = sys.argv[2] if len(sys.argv) > 2 else input("Enter key: ")
        print(hash_key(key))

    elif len(sys.argv) > 1 and sys.argv[1] == "--list":
        hashes = read_existing_hashes()
        print(f"📋 {len(hashes)} keys registered in {HASH_FILE}\n")
        for i, h in enumerate(sorted(hashes), 1):
            print(f"  {i:2d}. {h[:16]}...{h[-8:]}")

    elif len(sys.argv) > 1 and sys.argv[1] == "--unbind":
        key = sys.argv[2] if len(sys.argv) > 2 else input("Enter key to unbind: ")
        print(f"🔄 Unbinding key: {key.strip().upper()}")
        result = worker_api("unbind", key)
        if result and result.get("success"):
            print("✅ 设备绑定已清除")
        else:
            print("❌ 解绑失败" if result else "⚠️  Worker 未配置或不可达")

    elif len(sys.argv) > 1 and sys.argv[1] == "--status":
        key = sys.argv[2] if len(sys.argv) > 2 else input("Enter key: ")
        result = worker_api("status", key)
        if result:
            if result.get("bound"):
                print(f"🔒 Key is BOUND (since {result.get('boundAt', 'unknown')})")
                print(f"   Country: {result.get('country', 'unknown')}")
            else:
                print("🔓 Key is UNBOUND — available for use")
        else:
            print("⚠️  Worker 未配置或不可达")

    elif len(sys.argv) > 1 and sys.argv[1] == "--append":
        # Generate and auto-append
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        existing = read_existing_hashes()
        new_keys = []
        new_hashes = []
        attempts = 0
        while len(new_keys) < count and attempts < count * 10:
            attempts += 1
            k = generate_key()
            h = hash_key(k)
            if h not in existing:
                new_keys.append(k)
                new_hashes.append(h)
                existing.add(h)

        print(f"🔑 Generated {len(new_keys)} keys:\n")
        for i, k in enumerate(new_keys, 1):
            print(f"  {i:2d}. {k}")

        try:
            with open(HASH_FILE, 'r') as f:
                content = f.read()
            last_hash_end = content.rfind('"')
            if last_hash_end > 0:
                insert = ""
                for h in new_hashes:
                    insert += f',\n"{h}"'
                content = content[:last_hash_end+1] + insert + content[last_hash_end+1:]
                with open(HASH_FILE, 'w') as f:
                    f.write(content)
                print(f"\n✅ {len(new_hashes)} hashes appended to {HASH_FILE}")
        except Exception as e:
            print(f"\n❌ Error: {e}")

    else:
        # Default: generate and display
        count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
        print(f"🔑 Generating {count} keys...\n")

        existing = read_existing_hashes()
        new_keys = []
        new_hashes = []
        attempts = 0
        while len(new_keys) < count and attempts < count * 10:
            attempts += 1
            k = generate_key()
            h = hash_key(k)
            if h not in existing:
                new_keys.append(k)
                new_hashes.append(h)
                existing.add(h)

        print("=" * 50)
        print("🔑 Keys (give to buyers)")
        print("=" * 50)
        for i, k in enumerate(new_keys, 1):
            print(f"  {i:2d}. {k}")

        print(f"\n{'=' * 50}")
        print(f"📋 Hashes (for {HASH_FILE})")
        print("=" * 50)
        for h in new_hashes:
            print(f'"{h}",')

        print(f"\nTotal keys in system: {len(existing)}")
        print(f"\nTip: Use --append to auto-add to {HASH_FILE}")

if __name__ == "__main__":
    main()

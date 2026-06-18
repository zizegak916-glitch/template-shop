#!/usr/bin/env python3
"""
Template Shop — Key Generator
生成密钥并输出对应的 SHA-256 哈希值。

用法:
  python3 keygen.py              # 生成 10 个新密钥
  python3 keygen.py 20           # 生成 20 个新密钥
  python3 keygen.py --verify TMPL-XXXX-XXXX-XXXX  # 验证一个密钥
  python3 keygen.py --hash TMPL-XXXX-XXXX-XXXX    # 只输出哈希
"""
import hashlib
import secrets
import string
import sys
import json

HASH_FILE = "keys.js"

def generate_key():
    chars = string.ascii_uppercase + string.digits
    parts = [''.join(secrets.choice(chars) for _ in range(4)) for _ in range(3)]
    return f"TMPL-{parts[0]}-{parts[1]}-{parts[2]}"

def hash_key(key):
    return hashlib.sha256(key.strip().upper().encode()).hexdigest()

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        key = sys.argv[2] if len(sys.argv) > 2 else input("Enter key: ")
        h = hash_key(key)
        print(f"Key:   {key.strip().upper()}")
        print(f"Hash:  {h}")
        # Check if already in keys.js
        try:
            with open(HASH_FILE) as f:
                content = f.read()
            if h in content:
                print("✅ VALID — key found in", HASH_FILE)
            else:
                print("❌ INVALID — key not found in", HASH_FILE)
        except FileNotFoundError:
            print(f"⚠️  {HASH_FILE} not found, can't verify")

    elif len(sys.argv) > 1 and sys.argv[1] == "--hash":
        key = sys.argv[2] if len(sys.argv) > 2 else input("Enter key: ")
        print(hash_key(key))

    else:
        count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
        print(f"Generating {count} keys...\n")

        # Read existing hashes
        existing = set()
        try:
            with open(HASH_FILE) as f:
                for line in f:
                    line = line.strip().strip('"').strip(',').strip("'")
                    if len(line) == 64 and all(c in '0123456789abcdef' for c in line):
                        existing.add(line)
        except FileNotFoundError:
            pass

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

        # Output keys for the seller
        print("=" * 50)
        print("🔑 Generated Keys (give to buyers)")
        print("=" * 50)
        for i, k in enumerate(new_keys, 1):
            print(f"  {i:2d}. {k}")

        print(f"\n{'=' * 50}")
        print(f"📋 Hashes (append to {HASH_FILE})")
        print("=" * 50)
        for h in new_hashes:
            print(f'"{h}",')

        # Ask to auto-update keys.js
        print(f"\nTo add these to {HASH_FILE}, paste the hashes above")
        print("into the window.__VALID_HASHES array, or run:")
        print(f"  python3 keygen.py --append")

        # Auto-append mode
        if "--append" in sys.argv:
            try:
                with open(HASH_FILE, 'r') as f:
                    content = f.read()
                # Find the last hash and add after it
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

if __name__ == "__main__":
    main()

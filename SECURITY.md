# 密钥与付费模板

当前公开仓库中的 HTML 文件任何人都能直接访问。因此，前端弹窗、`localStorage`、前端哈希或 CSS 锁都不能保护付费模板。

## 已采用的密钥校验方式

- 浏览器将密钥与设备指纹发送至 Cloudflare Worker。
- Worker 使用 KV `KEY_STORE` 判断 SHA-256 后的密钥是否有效。
- 首次验证后由 Worker 在 `KEY_BINDINGS` 写入一台设备的绑定记录。
- 解绑必须携带仅保存在 Worker Secret 中的 `ADMIN_UNBIND_SECRET`。
- 有效密钥哈希不再放入前端或 Worker 源码。

## 部署

1. 复制 `.dev.vars.example` 为本地 `.dev.vars`，填写实际域名和管理员解绑密钥。
2. 在 Cloudflare 为 Worker 设置同名 secret：`wrangler secret put ADMIN_UNBIND_SECRET`。
3. 用 `keygen.py` 生成密钥后，仅将其 SHA-256 写进 `KEY_STORE`，值设为 `1`。
4. 在 `auth-config.js` 填入 Worker 的公开 URL。这个 URL 可以提交；它不是密钥。

## 付费文件

要真正出售模板，付费 HTML 必须从公开仓库移走，放进私有 R2 bucket 或私有下载服务；Worker 完成验证后发放短时签名下载链接。否则用户绕过前端，直接输入模板 URL 就能拿到文件。

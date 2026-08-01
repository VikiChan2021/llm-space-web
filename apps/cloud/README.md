# LLM Space Cloud

`@llm-space/cloud` is the same-origin control plane for the Hosted Multi-User
SaaS. The first slice provides GitHub Web OAuth, opaque revocable sessions,
Personal Tenant/Workspace provisioning, PostgreSQL migrations, and forced RLS
for tenant-owned tables.

It intentionally does not expose the desktop/server filesystem, Bash, stdio
MCP, Generator, or host tool execution.

## Local configuration

Set these environment variables without committing their values:

- `CLOUD_PUBLIC_URL` — exact public origin, for example
  `http://127.0.0.1:8787`.
- `CLOUD_DATABASE_URL` — PostgreSQL connection string.
- `CLOUD_MIGRATION_DATABASE_URL` — optional schema-owner connection. Production
  should keep it separate from `CLOUD_DATABASE_URL`.
- `CLOUD_DATABASE_RUNTIME_ROLE` — optional lowercase runtime role to receive
  the minimum schema grants during migration.
- `CLOUD_SESSION_SECRET` — at least 32 bytes.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` — GitHub OAuth App values.
- `CLOUD_AUTO_MIGRATE=1` — optional local convenience; production should run
  `mise run migrate:cloud` as a separate release step.

The GitHub OAuth callback is `${CLOUD_PUBLIC_URL}/auth/github/callback`.

Run migrations with `mise run migrate:cloud`, then start the control plane with
`mise run dev:cloud`.

## Security boundary

- GitHub access tokens are used only to read the authenticated identity and are
  not persisted.
- Browser sessions are random opaque values; only SHA-256 hashes are stored.
- Tenant context comes from the verified session, never a client tenant header.
- Tenant-owned tables use `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL
SECURITY`.
- Cloud startup refuses a PostgreSQL `SUPERUSER` or `BYPASSRLS` runtime role
  and verifies that every tenant table has forced RLS.
- Production must use separate migration and runtime database roles.

Set `CLOUD_TEST_DATABASE_URL` to a dedicated disposable PostgreSQL database to
run the real RLS integration test. Without it, the test is skipped and the
database boundary is not claimed as runtime-verified.

## 游客工作台 Hosted Alpha

公开 Alpha 在 GitHub 登录和 BYOK 延期期间允许游客直接进入工作台。Thread
内容保存在浏览器本地；服务器提供受额度约束的智谱模型调用、安全网络工具和
演示 MCP，并只持久化经过 HMAC 处理的每日额度计数。

服务端必填环境变量：

- `GUEST_PUBLIC_URL`：包含路径前缀的完整公开地址。
- `GUEST_HMAC_SECRET`：至少 32 字节。
- `ZHIPU_API_KEY`：仅供服务端使用的智谱 BigModel Key。
- `GUEST_QUOTA_DATABASE_PATH`：单 Node 进程使用的 JSON 额度文件。

可选的 `GUEST_*_LIMIT` 环境变量在 `src/guest-config.ts` 中校验。默认限制为：
每个浏览器每天 20 次 Run、每个 IP 每天 100 次 Run、同一游客同时 1 次 Run、
输入最多 12,000 个文本字符、输出最多 2,048 个 Token。图片输入只对
`glm-4.6v` 开放，允许 JPG、PNG、WebP，单次最多 5 张、单张解码后最多
4 MB、图片合计最多 6 MB；总请求体默认上限为 10 MB。部署时反向代理的
请求体上限必须与服务端保持一致。

本地 Bun 入口使用 `mise run dev:guest-api`，Node 22 部署包使用
`mise run pack:guest-api`。配套路径前缀前端使用 `mise run build:guest-web` 构建。

安全边界：

- 供应商 Key 只从服务端进程环境读取，不会通过 Models、Run 或错误响应返回。
- `/api/guest/models` 只下发经过真实调用验证的智谱模型白名单；每次 Run 都在消耗额度前校验模型 ID 与输入模态，不接受伪造模型或把图片发送给纯文本模型。
- 浏览器只接收不透明的 `HttpOnly; Secure; SameSite=Lax` 游客 Cookie。
- 额度服务不持久化原始 IP、Prompt 或模型响应。
- Built-in Tools 仅开放受限网络/天气工具和浏览器虚拟文件；MCP 仅开放同源演示能力，宿主 Bash、宿主文件系统、stdio MCP 与 Generator 仍不开放。
- JSON 额度存储是单进程 Alpha 基础设施，不具备横向扩容、正式计费或生产级滥用防护能力。

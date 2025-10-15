# AI Relay Service

## 致谢
- 感谢社区项目的开源贡献。特别感谢：
  - https://github.com/Wei-Shaw/claude-relay-service
- 本项目的绝大部分代码与实现思路来源于上述项目，在此致以诚挚感谢。

AI Relay Service 是一个针对 Claude Code API 的中继层，提供多账号管理、API Key 认证、限流、以及带可视化界面的后台控制台。

## 功能亮点
- 多租户账号管理与用量看板。
- OpenAI 兼容的转发接口，方便现有项目快速对接。
- 基于角色的后台管理端，支持密钥全生命周期管理。
- 依托 Redis 的限流、令牌统计和任务队列。
- CLI 辅助工具与自动化脚本，覆盖常见运维场景。

## 前置条件
- Docker 24+ 与 Docker Compose v2。
- 可选：若不使用容器，可本机安装 Node.js 18+ 与 npm。
- 可选：PostgreSQL 14+（建议），用于持久化 API Key、账号与系统设置。
- 复制 `.env.example` 为 `.env`，并为 `JWT_SECRET`、`ENCRYPTION_KEY`、Redis 与（可选）PostgreSQL 连接信息设置安全值。

## 快速上手（Docker）
1. 复制示例环境变量文件并填充必要密钥（只需执行一次）：
   ```bash
   cp .env.example .env
   # 编辑 .env，至少设置以下字段：
   # JWT_SECRET、ENCRYPTION_KEY、PORT（可选，默认3000）
   # 以及远程 Redis 连接：REDIS_HOST、REDIS_PORT、REDIS_PASSWORD（如需要）、REDIS_ENABLE_TLS（如需要）
   ```

   示例（按需调整）：
   ```env
   JWT_SECRET=your-strong-jwt-secret
   ENCRYPTION_KEY=your-32-char-encryption-key-xxxxxxxxxxxxxxxx
   PORT=3000
   REDIS_HOST=your.redis.host
   REDIS_PORT=6379
   REDIS_PASSWORD=your-redis-password
   # 如果你的 Redis 开启 TLS：
   # REDIS_ENABLE_TLS=true
   # REDIS_TLS_REJECT_UNAUTHORIZED=true
   ```

2. 构建并启动应用（Compose 会自动加载 `.env`）：
   ```bash
   docker compose up -d --build
   ```
3. 首次启动容器会将 `config/config.example.js` 拷贝为 `config/config.js`，执行 `scripts/setup.js`，并在配置了管理员凭据时写入初始账号。
4. 访问后台与健康检查：
   - 后台：`http://localhost:<PORT>`（默认 `http://localhost:3000`）
   - 健康检查：
     ```bash
     curl -fsS http://localhost:${PORT:-3000}/health
     ```
   - 如遇启动问题，可查看实时日志：
     ```bash
     docker compose logs -f app
     ```
5. 停止服务：
   ```bash
   docker compose down
   ```

## PostgreSQL 集成（持久化）

本项目支持将“重要主数据”持久化到 PostgreSQL（API Key、账号归档、系统设置），同时继续使用 Redis 存储“高频/时序/TTL”数据（限流、使用统计、会话映射等）。

- 环境变量（示例）：
  ```env
  # PostgreSQL 连接
  PG_HOST=127.0.0.1
  PG_PORT=5432
  PG_DATABASE=ai-relay-service
  PG_USER=ai-relay-service
  PG_PASSWORD=***
  PG_SSL=false
  PG_POOL_MAX=10
  PG_IDLE_TIMEOUT=30000

  # 使用 PG 进行 API Key 列表/搜索/标签/详情（默认 false）
  PG_LIST_API_KEYS=true
  ```

- 迁移（幂等）：
  ```bash
  # 初始化表结构（db/migrations/*）
  npm run db:init

  # 从 Redis 迁移 API Key + 系统设置（OEM/套餐/Webhook）
  npm run db:migrate:keys

  # 归档各平台账号与账户分组到 PG（运行时仍读写 Redis）
  npm run db:migrate:accounts

  # 单独重跑系统设置迁移（可选，用于同步）
  npm run db:migrate:settings
  ```

- 运行时读写策略（默认配置下）：
  - API Key 主数据：读写双写（Redis + PG）。校验/列表/标签/详情优先 PG，失败回退 Redis。
  - 系统设置（OEM、产品套餐）：读写优先 PG，并同步写回 Redis（兼容旧路径）。
  - 使用统计 / 速率限制 / 会话映射：保持在 Redis（高频/TTL 友好）。

- 健康检查 `/health`：返回 `components.postgres` 指标展示 PG 连接与延迟。

更多操作细节参考：`docs/redis-to-postgres-migration.md`。

## 开发流程
- 在容器内启用热重载开发环境（使用远程 Redis）：
  ```bash
  docker compose --profile dev up app-dev
  ```
- 执行测试与代码检查：
  ```bash
  npm run lint
  npm test
  ```

## 核心环境变量
| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | 必填。用于签发管理员 Token 的密钥。 |
| `ENCRYPTION_KEY` | 必填。32 字符密钥，用于加密敏感数据。 |
| `REDIS_HOST` | 远程 Redis 主机名或 IP（项目不再内置 Redis 容器，需指向外部 Redis）。 |
| `PORT` | 服务暴露的 HTTP 端口，默认 `3000`。 |
| `CLAUDE_API_URL` | Anthropic Claude 接口地址，可按需自定义。 |
| `CLAUDE_BETA_HEADER` | 向 Anthropic 发送的 Beta 标记列表。 |
| `ENABLE_CORS` | 是否启用后台 SPA 的 CORS，默认 `true`。 |

### PostgreSQL 相关
| 变量 | 说明 |
|------|------|
| `PG_HOST` | PostgreSQL 主机名或 IP |
| `PG_PORT` | 端口，默认 `5432` |
| `PG_DATABASE` | 数据库名（如含连字符，客户端可能需要使用双引号） |
| `PG_USER` | 数据库用户名 |
| `PG_PASSWORD` | 数据库密码 |
| `PG_SSL` | 是否启用 SSL（`true/false`） |
| `PG_POOL_MAX` | 连接池最大连接数，默认 `10` |
| `PG_IDLE_TIMEOUT` | 空闲连接超时（毫秒），默认 `30000` |
| `PG_LIST_API_KEYS` | 是否使用 PG 承载 API Key 列表/搜索/标签/详情，默认 `false` |

更多变量说明见 `.env.example`，最终由 `config/config.js` 读取。

## 项目结构
```
config/           # 运行时配置（首次启动从 config.example.js 拷贝）
docs/             # 后台界面截图与扩展文档
scripts/          # 运维脚本与 CLI
src/              # Express 服务端代码
web/admin-spa/    # 后台单页应用
docker-compose.yml
Dockerfile
docker-entrypoint.sh
```

## 常用 npm 脚本
- `npm run dev` – 使用 nodemon 启动 API，支持热重载。
- `npm run lint` – 执行 ESLint 自动修复。
- `npm run test` – 运行 Jest 测试。
- `npm run build:web` – 构建后台 SPA 到 `web/admin-spa/dist`。
- `npm run service` – 通过 `scripts/manage.js` 管理本地后台服务。
- `npm run db:init` – 初始化 PostgreSQL 表结构（幂等）。
- `npm run db:migrate:keys` – 将 Redis 中的 API Key 与系统设置迁移至 PG（幂等）。
- `npm run db:migrate:accounts` – 将各平台账号与分组归档至 PG（幂等）。
- `npm run db:migrate:settings` – 单独迁移系统设置至 PG（幂等）。

## Docker Compose 提示
- 需要自定义时，可新建 `docker-compose.override.yml` 覆写服务（额外挂载、命令等）。
- 使用 `docker compose logs -f app` 实时查看启动日志及生成的管理员账号。
- 通过修改 `.env` 中的 `PORT` 同步调整容器与宿主暴露端口。
- 若代码变更后需要刷新镜像，可执行：`docker compose up -d --build`。
- 项目默认使用外部 Redis，请确保 `.env` 中已正确配置 `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`，以及必要时的 TLS 相关变量。
 - 如启用 PostgreSQL，请配置 `PG_*` 环境变量，并先执行 `npm run db:init` 与相关迁移。

## 一键部署（1Panel）
- 你可以在 1Panel 上快速部署并管理 Redis 与 PostgreSQL 服务（创建实例、设置持久化、备份、监控等）。
- 在 1Panel 中完成 Redis/PostgreSQL 的安装与网络暴露后，将连接信息填写到本项目的 `.env`（`REDIS_*` 与 `PG_*`），即可直接启动本服务。
- 建议：
  - 为不同项目使用不同的 Redis DB（`REDIS_DB`）或使用 ACL 隔离；
  - 为 PostgreSQL 创建独立数据库与用户（最小权限），并开启定期备份。

## 运行时数据分层
- PostgreSQL：API Key 主数据、系统设置（OEM/产品）、账号归档（备份/报表用途）。
- Redis：使用/费用统计（usage:*）、速率限制（rate_limit:*）、会话/分布式锁、短期配置缓存。

## 常见问题（FAQ）
- 客户端连接 PG 后看不到表？
  - 请确认连接的数据库名与 `.env` 的 `PG_DATABASE` 完全一致（含连字符时需使用双引号）。
  - 执行 `npm run db:init` 后再跑迁移脚本。
  - 通过 `SELECT current_database();` 与 `\dt public.*` 确认是否在目标库与 `public` schema。

## CI/CD 自动部署（GitHub Actions + Docker Hub）
- 推送到 `prod` 分支时，工作流会：
  - 使用 Buildx 在 CI 内构建 `linux/amd64` 镜像（兼容 Debian 12/x86_64）。
  - 将镜像推送到 Docker Hub（推荐名：`<dockerhub-username>/claude-relay-service`）。
  - 通过 SSH 登录你的 Debian 服务器，执行 `docker compose pull && up -d`（使用 `docker-compose.prod.yml` 覆盖以禁止服务器构建）。
- 配置与前置准备请参考：`docs/deploy-with-actions.md`

## 许可证

本项目基于 MIT 协议发布，详情见 `LICENSE`。

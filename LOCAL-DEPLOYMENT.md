# 搭搭本机运行与架构

当前环境为 macOS Apple Silicon + Docker Desktop。网页与后端只绑定本机回环地址；数据库、Redis、对象存储、监测采集器不发布主机端口。

- 网页：[http://localhost:3000](http://localhost:3000)
- 推荐：[http://localhost:3000/dashboard/suggest](http://localhost:3000/dashboard/suggest)
- 健康检查：[http://localhost:18000/api/v1/health/ready](http://localhost:18000/api/v1/health/ready)
- 上游基础版本：`cfbb5a9`；当前代码通过项目自己的镜像运行，实际镜像与源码摘要以验收报告为准。
- 数据库迁移版本：`f0a3b4c5d6e7`。三次新增迁移只增加任务表、发件箱和请求关联字段。

## 当前架构

| 服务 | 职责 |
|---|---|
| frontend | Next.js 页面、NextAuth 会话、同源接口转发 |
| backend | FastAPI 业务接口、鉴权、衣橱与搭配等模块 |
| postgres | 业务记录、任务状态、任务发件箱 |
| redis | 队列、可重建缓存 |
| worker | 识图、通知和原有定时任务 |
| image-worker | 去背景、批量图片处理 |
| task-worker | 独立执行可恢复的搭配任务 |
| task-dispatcher | 发件箱派发、过期执行恢复、丢失队列任务重放 |
| object-store | 私有 RustFS S3 兼容图片存储 |
| otel-collector | 接收 OpenTelemetry 请求/模型调用链和指标 |

前端推荐页已拆为表单、天气、基础单品、结果、任务面板和数据 hooks。任务状态由服务器保存，刷新页面不会再次提交生成请求。任务列表按用户隔离；全局缓存、离线上传队列也按后台用户身份隔离。历史无归属上传文件会保留，需逐个确认归属。

主要前端页面与 21 个基础组件现统一使用 Mantine 8.3.18，保留 React 18 / Next.js 14。支持桌面侧栏、手机抽屉与底部导航、浅色/深色主题。当前前端镜像为 `wardrowbe-frontend:dada-20261017`；后端 API 同样更新为 `wardrowbe-backend:ui-20261017`，增加按实际穿着记录筛选的可选参数，工作进程保留原架构镜像。只更新前端可执行 `./local.sh build frontend` 后再执行 `./local.sh up -d --no-deps frontend`。

完整职责与一致性说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 启停与构建

`local.sh` 合并基础、local、architecture 三份 Compose 文件，以及三份私有环境文件。请不要把包含密钥的完整 `docker compose config` 输出分享出去。

```sh
./local.sh build backend frontend
./local.sh up -d
./local.sh ps
./local.sh logs --tail 100 backend task-worker task-dispatcher
./local.sh stop
```

代码已烘焙到镜像，修改源码后需要重新构建并更新相应服务。

全新数据库启动顺序如下。不要在已有 S3 桶上重新执行初始化数据导入。

```sh
./local.sh up -d postgres redis object-store otel-collector
./local.sh run --rm --no-deps -T backend alembic upgrade head
# 全新空图片卷首次建桶，必须明确执行并记录校验清单。
./local.sh run --rm --no-deps -T -v "$PWD/backups:/backup" backend python scripts/migrate_storage.py --source /data/wardrobe --manifest /backup/initial-copy.jsonl --execute --create-bucket
./local.sh up -d
```

后台任务工作进程可独立增加实例；发件箱使用 PostgreSQL 锁协调多实例。增加进程前应按模型配额与实际负载测试并发。

```sh
./local.sh up -d --scale task-worker=2 task-worker
```

## 私有配置

- `.env`：数据库、会话等配置。
- `.env.ai.local`：云桥 API 地址、密钥和模型。
- `.env.architecture.local`：存储凭证、存储后端及监测导出地址。

三份文件均为 Git 忽略的本地文件；含凭证的文件权限为 `600`。

当前识图模型是 `Qwen3.8-max`，文本模型是 `Doubao-Seed-2.0-Mini`。统一模型接入层位于 `backend/app/services/model_gateway.py`，保留普通 JSON、完整结果 SSE 外包装、语言约束、有限重试及模型回退。日志不记录密钥、提示词、图片内容或上游错误正文。

任务每次执行的整体时限为 180 秒，自动尝试上限为 3 次；心跳每 10 秒更新、租约 45 秒。Worker 异常退出后由派发器恢复。任务、全部搭配和完成状态在同一数据库事务提交，重复投递不会重复保存搭配。外部模型调用无法承诺绝对只发生一次。取消会立即保存终态，执行协程最迟在下一次心跳观察后停止；已有服务商侧处理是否停止由服务商决定。

上传识图与重新分析也使用事务发件箱：衣物和投递意图一起提交，即时投递最多等待 1 秒，队列恢复后自动派发。写回前核对任务代次，人工完成分类会使旧结果失效。旋转、去背景继续使用原有独立图片队列与手动重试方式。

## 图片迁移、备份与恢复

48 个原有文件已按 SHA256 逐一核验复制到对象存储，原 `wardrobe_data` 卷保留。数据库中的图片路径及签名 URL 不变。新增图片现在只写 S3，不能仅切换回旧文件卷就认为完成回滚。

迁移脚本默认只检查；显式执行时仅复制缺失文件，不覆盖不同内容、不删除来源，支持重跑与全量字节校验。

```sh
./local.sh run --rm --no-deps -T backend python scripts/migrate_storage.py --source /data/wardrobe --verify-only
```

一致性备份脚本会短暂停止写入服务，保存 PostgreSQL 自定义格式快照与当前存储中的全部图片、校验清单，然后恢复写入服务。备份在本机 `backups/`，已被 Git 忽略。

```sh
ops/backup-local.sh
```

数据库恢复和迁移已在独立副本 `wardrobe_arch_migration_check` 演练；未对运行数据库执行降级。真实恢复时应先恢复到全新的数据库和图片目录，核对清单与业务记录，再安排切换。旧版本若不支持新任务表，不应在未核对源码和镜像的情况下直接覆盖运行实例。

## 验证与部署边界

最新网页品牌已更名为「搭搭」，新衣架图标、八语品牌文案及浏览器/Apple 图标验收见 [verification/dada-brand/REPORT.md](verification/dada-brand/REPORT.md)，完整前端 842 项测试通过；只更新前端，保留原存储、草稿和登录标识。彩色社区界面与灵感功能验收见 [verification/editorial-style/REPORT.md](verification/editorial-style/REPORT.md)：87 个前端测试文件、842 项测试通过，完成发现、搜索、收藏刷新、衣橱试搭、工作室预选及保存后刷新；桌面、平板、手机和深色主题有截图。创作者一手来源与方法边界见 [docs/research/2026-10-17-style-creators.md](docs/research/2026-10-17-style-creators.md)。上一轮首页内容验收见 [verification/dashboard-content/REPORT.md](verification/dashboard-content/REPORT.md)：前端 82 个测试文件、793 项测试通过，并检查电脑、平板、手机及深色主题和首页各入口。首页展示最近衣物、少穿单品、待确认推荐、衣橱待办、配色与常用入口，使用真实账号数据。上轮完整 UI 验收保留在 [verification/ui-redesign/REPORT.md](verification/ui-redesign/REPORT.md)：前端 80 个测试文件、771 项测试及后端 2155 项测试通过，并验证真实上传识图、推荐恢复、搭配生成、造型册与手机布局。后端架构验收见 [verification/architecture/REPORT.md](verification/architecture/REPORT.md)，其中图片存储、真实 AI、后台队列及本地 OTLP 采集有独立运行证据；原部署验收保留为历史记录。

当前仍使用本机开发登录。公开部署所需的域名、HTTPS、正式 OIDC 身份服务，以及真实邮件/推送接收渠道尚未配置。S3 适配器可连接其他兼容服务；本机单节点 RustFS 及 Docker 卷不能替代跨主机容灾。未承诺未经压测的并发容量。

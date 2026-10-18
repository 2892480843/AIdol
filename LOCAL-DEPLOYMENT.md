# 搭搭本机运行与架构

> 本文保留本机历次发布记录；当前公网入口为 http://124.70.96.183:6780/dashboard，使用专用演示账号。[最终交付索引](docs/submission/README.md)与[新环境运行说明](docs/submission/RUNNING.md)优先。以下“尚未公网部署”等描述仅适用于对应历史本机记录。

当前环境为 macOS Apple Silicon + Docker Desktop。网页与后端只绑定本机回环地址；数据库、Redis、对象存储、监测采集器不发布主机端口。

- 网页：[http://localhost:3000](http://localhost:3000)
- 3D 悬挂衣橱：[http://localhost:3000/dashboard/wardrobe/3d](http://localhost:3000/dashboard/wardrobe/3d)，[本轮验收](verification/wardrobe-3d/REPORT.md)。
- 推荐：[http://localhost:3000/dashboard/suggest](http://localhost:3000/dashboard/suggest)
- 健康检查：[http://localhost:18000/api/v1/health/ready](http://localhost:18000/api/v1/health/ready)
- 数据库迁移版本：`a1b2c3d4e5f7`。本轮只新增私有试衣任务表；此前任务表、发件箱和请求关联字段保留。

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

主要前端页面与 21 个基础组件现统一使用 Mantine 8.3.18，保留 React 18 / Next.js 14。支持桌面侧栏、手机抽屉与底部导航、浅色/深色主题。当前前端镜像为 `wardrowbe-frontend:tripo-series-20261018-r3`，提供男女 3D 造型工作室、最多四件真人试衣、造型管理与恢复；后端 API 为 `wardrowbe-backend:video-quality-20261018`，补齐工作室来源衣物归属验证，工作进程保留原架构镜像。更新当前前端请执行文末高质量人物发布流程，包含完整资源封装与逐文件运行校验；后端使用 `docker build -f backend/Dockerfile.local -t wardrowbe-backend:video-quality-20261018 ./backend`，本轮没有新数据库迁移。全功能验证和边界见 `verification/full-function/REPORT.md`。

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

最新潮流风格发现迭代见 [verification/style-discovery/REPORT.md](verification/style-discovery/REPORT.md)：六类、十二套原创示范，分类与关键词搜索、整套预览、并排比较及衣橱练习入口；首页精选也已同步。风格类别可随网址刷新恢复。分类是编辑探索标签，不是热度排名或对私人衣物的自动识别。

最新抖音灵感迭代见 [verification/douyin-style/REPORT.md](verification/douyin-style/REPORT.md)：88 个测试文件、856 项通过，新增三位抖音创作者参考、来源与作者筛选、九套三步练习及可选单品跳过；实际工作室保存后刷新和数据库均确认跳过项未入选。研究边界见 [docs/research/2026-10-17-douyin-style-creators.md](docs/research/2026-10-17-douyin-style-creators.md)。此前网页品牌已更名为「搭搭」，新衣架图标、八语品牌文案及浏览器/Apple 图标验收见 [verification/dada-brand/REPORT.md](verification/dada-brand/REPORT.md)，完整前端 842 项测试通过；只更新前端，保留原存储、草稿和登录标识。彩色社区界面与灵感功能验收见 [verification/editorial-style/REPORT.md](verification/editorial-style/REPORT.md)：87 个前端测试文件、842 项测试通过，完成发现、搜索、收藏刷新、衣橱试搭、工作室预选及保存后刷新；桌面、平板、手机和深色主题有截图。创作者一手来源与方法边界见 [docs/research/2026-10-17-style-creators.md](docs/research/2026-10-17-style-creators.md)。上一轮首页内容验收见 [verification/dashboard-content/REPORT.md](verification/dashboard-content/REPORT.md)：前端 82 个测试文件、793 项测试通过，并检查电脑、平板、手机及深色主题和首页各入口。首页展示最近衣物、少穿单品、待确认推荐、衣橱待办、配色与常用入口，使用真实账号数据。上轮完整 UI 验收保留在 [verification/ui-redesign/REPORT.md](verification/ui-redesign/REPORT.md)：前端 80 个测试文件、771 项测试及后端 2155 项测试通过，并验证真实上传识图、推荐恢复、搭配生成、造型册与手机布局。后端架构验收见 [verification/architecture/REPORT.md](verification/architecture/REPORT.md)，其中图片存储、真实 AI、后台队列及本地 OTLP 采集有独立运行证据；原部署验收保留为历史记录。

当前仍使用本机开发登录。公开部署所需的域名、HTTPS、正式 OIDC 身份服务，以及真实邮件/推送接收渠道尚未配置。S3 适配器可连接其他兼容服务；本机单节点 RustFS 及 Docker 卷不能替代跨主机容灾。未承诺未经压测的并发容量。

最新「一件多搭」验收见 [verification/one-piece-many-looks/REPORT.md](verification/one-piece-many-looks/REPORT.md)：885 项前端测试通过，已验证真实衣物主角保留、工作室保存及刷新，桌面、平板与手机布局通过。主角选择仅在当前页面保留，刷新后重新选择；兼容练习数量不代表不同搭配数量。

本轮「穿搭切换」验收见 [verification/look-switching/REPORT.md](verification/look-switching/REPORT.md)。首页与新页面使用同一组原创虚构成年模特素材；本人实穿照保存在当前浏览器的独立 IndexedDB 数据库。AI 上装模拟使用现有云桥配置中的 `Doubao-Seedream-5.0-lite`，单独的 90 秒生成时限，超时或刷新不会自动重发；照片仅在用户选择并明确同意后发送，输入不保存在服务器，输出是账号私有图片。删除源衣物会先清理其试衣结果。当前真实接口验收结论以报告为准，模型列表中存在名称不代表已经验证出图成功。

3D 衣柜新增单件聚焦与整圈旋转、真实主图/附图放大，以及按账号隔离的浏览器本地搭配篮。搭配篮刷新或离开页面后可恢复；恢复时逐件核验，加载失败或衣物不可用时明确提示，只有整篮可用才提供工作室入口。本轮验收见 `verification/wardrobe-continuity/REPORT.md`。

新增真人试衣间 `/dashboard/wardrobe/tryon`，可由3D单品或兼容搭配篮直接进入。支持摄像头本地预览/拍照、人物照片上传、文字与可选浏览器语音选衣、最多4件互补单品生成、同源前后对比及私有任务恢复。摄像头并非连续实时AI换装，只有明确同意并点击生成才上传人物照片。

本轮后端复用上一轮通过验证的依赖镜像：`docker build --pull=false -f verification/direct-tryon/Dockerfile.backend -t wardrowbe-backend:direct-tryon-20261018-r2 ./backend`。发布前执行新增迁移 `b2c3d4e5f6a8`（为try_on_tasks增加nullable item_ids JSONB）；旧任务兼容，工作进程镜像保持原版本。测试库先验证升级/回退，本机正式迁移前备份至忽略目录 `backups/direct-tryon-20261018-r2`，不对外分享该备份。详见 `verification/direct-tryon/REPORT.md`。

多件试穿采用分区参考图：2–4件原衣物在服务器内存中组成带类别标记的参考板，与独立人物照片一起作为两张模型输入；单件原路径不变。此为发送前的显式兼容处理，不在上游错误后自动回退或再次生成。


## 视频效果质量升级（2026-10-18）

本轮验收见 [verification/video-quality/REPORT.md](verification/video-quality/REPORT.md)。正式前端为 `wardrowbe-frontend:video-quality-20261018-r2`，后端为 `wardrowbe-backend:video-quality-20261018`。没有新增数据库迁移。

- 数字造型：[男女三维工作室](http://localhost:3000/dashboard/wardrobe/avatar)。六套真实剪裁预设、服装款式、日期前后浏览、真实三维缩略图。私人原衣仅按类别适配样衣；单照片本人360仍未接入。
- [照片衣物提取](http://localhost:3000/dashboard/wardrobe/extract)：服务端本地CPU模型输出透明衣物区域，审核名称/类型并明确保存；`skip_ai=true`，不会再调用云端识图。被遮挡部分不补画，边缘可能误分。
- 固定模型为 SCHP ATR18 INT8，69,141,996字节，SHA256 `4420d8db8c1f266967c89485786b01209f6d405f320fc0f87e8ced49392cefb5`，来源与许可在 `verification/video-quality/extraction-report.md`。已装在持久卷 `/data/wardrobe/.models/schp-atr-18-int8-static.onnx`，由 `CLOTHING_EXTRACTION_MODEL_PATH` 指定。不在请求期间下载权重；新环境未装会明确显示不可用。
- 正式验收发现一次女模资源截断，已采用gzip完整性封装和构建期SHA256校验发布修复镜像。复现当前发布需先构建 `wardrowbe-frontend:video-quality-20261018` 基础程序，再按 `verification/video-quality/asset-release/README.md` 生成 `-r2`。不可仅用旧标签判定资源完整。
- `python3 verification/video-quality/release.py runtime` 同时核对558个源码文件清单/镜像标签和运行容器39个公开资源的实际字节。任何不一致都会失败。

当前完整回归：前端119文件1230项、后端2282项，0失败/错误/跳过；具体生产浏览器、真实模型输出与功能边界以本轮报告为准。


## 高质量人物发布（2026-10-18）

默认人物已使用 Tripo H3.1 生成的原创男女完整造型，保留原样衣混搭入口。网页模型为固定姿态真实三维网格，提供旋转、缩放、灯光、收藏和PNG预览。桌面基础贴图4K、手机2K，原8K文件保存在忽略目录 `verification/tripo-quality/originals/`。

原始骨骼GLB存在关节变换/逆绑定数据缺陷，网页封装明确去除无效骨骼，未将动态关节姿态或单件衣物替换作为新高模能力。原因及后续验收见 `docs/technical-debt.md`。

```sh
python3 verification/tripo-quality/build-release.py
./local.sh up -d --no-deps --no-build --pull never frontend
python3 verification/video-quality/release.py runtime --output-dir verification/tripo-quality
```

发布脚本构建程序镜像，并将全部公开资源以每段不超过8MiB的压缩包封装，镜像内逐文件验证SHA256；运行检查再次比对真实45份公开资源和567份前端源文件清单。当前构建ID `vSout5jRAmtcE_JokSA8Y`，详细图像与验证记录见 `verification/tripo-quality/REPORT.md`。没有后端迁移或用户数据清理。


### 2026-10-18 高模穿搭系列与 360° 视频

当前前端镜像 `wardrowbe-frontend:tripo-series-20261018-r3`。男女各两套真实完整高模，新增左右切换、真实三维缩略图及按具体高模收藏恢复；提供本地六秒 360° 视频录制和预览下载入口。保持原样衣、照片二维试衣和既有数据。照片一键生成本人三维仍需要专用接口凭据，Studio 登录态不是开发者接口密钥。

```bash
python3 verification/tripo-series/build-release.py
./local.sh up -d --no-deps --no-build --pull never frontend
python3 verification/video-quality/release.py runtime --output-dir verification/tripo-series
```

以 `verification/tripo-series/runtime.json`、`runtime-assets.json` 和 `REPORT.md` 记录的实际镜像、来源与资源校验为准，旧段落是历史发布证据。无后端改动或数据库迁移。

### 2026-10-18 人物精修与材质升级

当前前端镜像 `wardrowbe-frontend:avatar-beauty-20261018-r1`，默认选中新增的精修男女角色，原始和街头造型继续保留。新增全身/面部细节视角。模型约15万面，桌面主颜色贴图8K、手机/纹理能力不足设备4K；材质去除生成的金属噪声和过强塑料反光。没有后端或数据库变更。

```sh
python3 verification/avatar-beauty/build-release.py
./local.sh up -d --no-deps --no-build --pull never frontend
python3 verification/video-quality/release.py runtime --output-dir verification/avatar-beauty
```

构建 ID `M3C86VyNzFijH562YxFI7`；实际587份前端源码/构建文件及63份公共资源校验零差异。验证证据、真实三维前后对比和质量边界见 `verification/avatar-beauty/REPORT.md`。新人物仍是固定姿态完整造型；不能以8K规格代替审美验收。本轮确认了新人物的视频录制和预览，浏览器下载工具未返回新文件路径，没有把旧下载文件作为证据。前一镜像 `wardrowbe-frontend:tripo-series-20261018-r3` 保留供回退。

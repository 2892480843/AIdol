# 全项目功能实现与验收差距清单

日期：2026-10-18，Asia/Shanghai。环境已确认：macOS / arm64 / zsh，本机 Docker。审查范围为当前源码中的 23 个页面文件、120 个后端路由声明、相关业务服务、既有验收记录，以及本次本机只读能力检查。路由数是声明数，不代表 120 个业务场景均重新验收。

**结论：主要衣橱、推荐、搭配、记录、分析、家庭和试衣功能都有实际实现；目前不能宣称“视频全部能力”或“全功能端到端再次通过”。照片生成本人可旋转 360° 模型尚未实现，若干收藏和相册仅在当前浏览器，真实设备权限、文件落盘、外部投递仍有验收缺口。**

本报告为代码与证据清单，不替代主任务正在进行的浏览器及接口全流程回归。没有修改业务源码、数据库或模型资源，没有读取/输出密钥，没有上传私人照片，没有调用外部模型、发邮件、发通知或下载新模型。

## 证据口径

- **确认·代码**：读到页面事件、请求、后端处理/持久化实现；不等于当前部署已经实测成功。
- **确认·历史实测**：项目内记录了此前真实接口或浏览器结果；明确指向记录目录，不能冒充本轮新验证。
- **确认·本轮只读**：本轮本机请求或脱敏字段检查已完成，见 [local-readonly-evidence.json](./local-readonly-evidence.json)。
- **推断**：由代码或有限样本推导的能力/风险，未用相应真实输入重验。
- **未验证**：当前没有本轮对应端到端结果；不据此判定功能不存在或失败。

端到端指“用户操作 → 前端请求 → 后端与实际依赖 → 数据/文件结果 → 刷新后恢复”的完整链条。单元测试通过、接口返回 200、模型名出现在列表中，都不能分别替代整条链条。

## 页面与主要功能矩阵

| 模块/入口 | 实际实现与代码证据 | 数据和外部依赖 | 已有端到端证据 | 本轮差距/边界 |
| --- | --- | --- | --- | --- |
| 登录、邀请、首次引导：`/`、`/login`、`/invite`、`/onboarding` | **确认·代码**：NextAuth、开发登录、OIDC/转发身份支持、账号资料/引导完成；邀请按 token 与账号邮箱校验。`frontend/lib/auth.ts`、`frontend/app/login/page.tsx`、`backend/app/api/auth.py`、`users.py`、`families.py:231` | 当前 `DEBUG=true`、OIDC issuer 为空；本机开发登录是当前实际方式 | `verification/REPORT.md`、`architecture/REPORT.md` 有测试账号、隔离、引导证据 | **未验证**：真实 OIDC 提供方、手机回调、外网 HTTPS。开发登录不能当作公开部署身份认证验收 |
| 首页：`/dashboard` | **确认·代码**：真实统计、最近入库、少穿单品、待洗、任务进度、推荐入口、待确认搭配、天气/家庭/每日安排、灵感与模特切换。`frontend/app/dashboard/page.tsx:34`、`components/dashboard/` | 复用当前用户 items/analytics/outfits/weather/family；首页读取不自动生成 AI | `dashboard-content/REPORT.md`、`editorial-style/REPORT.md` | 位置未配置时展示设置入口；空数据需验证空态，不能为了填满首页伪造统计。本轮交互待主任务回归 |
| 衣橱列表：`/dashboard/wardrobe` | **确认·代码**：列表/搜索/筛选/排序、详情、增删改、归档恢复、收藏、批量操作、队列状态。`frontend/app/dashboard/wardrobe/page.tsx:331`、`backend/app/api/items.py`（32 个操作） | PostgreSQL、私有图片存储、签名图片接口 | `verification/REPORT.md` 核心流程；`architecture/live-core.json` | 本轮需实际检查分页、批量跨页、失败态及账号切换；旧接口成功记录不覆盖所有当前 UI 操作 |
| 上传与识衣 | **确认·代码**：单/批量上传、格式大小约束、浏览器队列、重试/取消、后台识衣、手工分类保护、多图主图切换。`frontend/components/add-item-dialog.tsx`、`lib/upload-manager.ts`、`backend/app/tasks/tagging.py`、`workers/tagging.py`、`api/items.py:190` | 识图需要实际 AI 网关；队列依赖 Redis/worker，投递意图持久化在数据库 | `architecture/REPORT.md` 有真实上传识图、Redis 停机恢复/取消；`avatar-studio/REPORT.md` 有上传测试同步修正 | **未验证·本轮**：新上传到识图到详情链条。没有数据集证明所有衣物识别准确 |
| 图片旋转、去背景、恢复 | **确认·代码**：单/批量旋转、去背景、恢复原图、图片 worker；`api/items.py:1600`、`1648`、`1727`、`services/background_removal.py` | 旋转本地；去背景默认 rembg/u2net，需其本地权重或配置 HTTP 服务 | `verification/REPORT.md`、`architecture/live-core.json` | 本轮未重新执行图片处理；`/health/features` 构造 provider 成功不等于第一次推理权重加载/处理一定成功 |
| 穿着/洗护 | **确认·代码**：穿着次数/历史、洗涤记录/重置、洗涤间隔；`api/items.py:1295`、`1329`、`1386`、`1404`、`1443` | 账号数据库记录 | `verification/REPORT.md` 明确实际穿/洗记录 | “保存搭配”与“穿过”是不同动作，应核对只在显式标记穿过时递增，不能用保存次数代替穿着次数 |
| AI 推荐：`/dashboard/suggest` | **确认·代码**：场合、天气、基础单品、排除、偏好输入，任务提交/轮询/恢复/取消/重试，多套推荐与采纳/拒绝。`components/recommendations/`、`lib/recommendations/use-recommendation-tasks.ts`、`api/tasks.py`、`services/recommendation_service.py` | 实际文本模型、数据库、派发器和 worker；天气可选依赖 | `architecture/REPORT.md` 有真实三套中文、幂等、强杀 worker 恢复、刷新恢复证据 | 本轮未调用模型；当前开关开启不证明此刻配额、网络、模型质量可用。不能把推荐评分解释成客观合身保证 |
| 搭配册：`/dashboard/outfits`、`/dashboard/outfits/[id]` | **确认·代码**：筛选搜索、分页、日历、详情、删除、穿过、克隆到造型册；`app/dashboard/outfits/`、`lib/hooks/use-outfits.ts`、`api/outfits.py` | 服务端持久化、真实衣物 ID/权限约束 | `verification/REPORT.md`、`editorial-style/REPORT.md`、`avatar-studio/database-after.json` | 本轮需核对筛选交集、批量删除和旧引用状态。已有 3D 验收记录证明保存不自动增加穿着次数 |
| 搭配工作室：`/dashboard/outfits/new` | **确认·代码**：真实衣物选择/排序、名称/日期/场合、草稿、恢复/丢弃、编辑、保存；`page.tsx:65`、`components/studio/`、`lib/studio/`、`backend/app/services/studio_service.py`、`api/outfits.py:1213` | 草稿本浏览器；正式搭配服务端；已穿记录编辑有约束 | `editorial-style/REPORT.md`、`douyin-style/REPORT.md`、`one-piece-many-looks/REPORT.md` | 工作室为组合/记录，不是布料试衣引擎。保存需显式动作；草稿跨设备不保证 |
| 固定搭配：`/dashboard/pairings` | **确认·代码**：读取、按来源类型筛选、分页、详情/反馈/删除；从单品可人工创建及 AI 生成。`app/dashboard/pairings/page.tsx`、`components/generate-pairings-dialog.tsx`、`lib/hooks/use-pairings.ts`、`api/pairings.py` | 人工操作只需数据库；AI 生成需文本模型 | `verification/REPORT.md` 有人工与 AI pairings 真实接口结果 | 本轮待验证从单品生成/创建→列表→反馈→删除，不能仅看到空列表就判定未实现 |
| 灵感发现：`/dashboard/inspiration` | **确认·代码**：静态编辑选编公式、创作者/来源/场合/搜索/收藏筛选，来源外链，按自己已加载衣物匹配和替换，送入工作室；`components/inspiration/inspiration-workspace.tsx:62`、`lib/inspiration/catalog.ts`、`matching.ts` | 公式目录随源码；衣物来自账号接口；收藏 `localStorage` 按账号隔离 | `editorial-style/REPORT.md`、`douyin-style/REPORT.md` | **确认**：不是实时抖音抓取/博主自动更新/公开社区发帖；没有后端灵感内容服务。收藏非云同步；匹配范围限已加载库存 |
| 一件多搭（灵感页） | **确认·代码**：锁定主角、筛选兼容练习、跨练习保持、主角失效/不兼容反馈、工作室预选；`components/inspiration/anchor-picker.tsx`、`lib/inspiration/anchor.ts`、`hooks/use-inspiration-anchor.ts` | 规则匹配，非每次调用 AI；主角是当页状态 | `one-piece-many-looks/REPORT.md` 有真实保存/刷新和 10 项浏览器检查 | 数量表示兼容练习，不代表已生成 N 套新穿搭；刷新后需重新选择主角 |
| 潮流风格、模特切换：`/dashboard/looks` | **确认·代码**：六种分类、十二套固定全身示范、搜索、URL 分类、整套预览、切换/比较/键盘操作。`lib/style-discovery.ts:3`、`:65`、`lib/model-looks.ts`、`components/looks/style-discovery.tsx` | 本机静态原创 AI 图片，不调用当前衣物试穿模型 | `style-discovery/REPORT.md`、`look-switching/REPORT.md` | **确认**：示范不代表用户衣物已上身；分类不自动给私人照片或库存打标签；切换是图片切换，没有换装视频生成 |
| 本人实穿相册（looks 页） | **确认·代码**：上传照片、命名、关联衣物、保存、切换、确认删除；`components/looks/workspace.tsx:68`、`lib/looks/storage.ts`、`hooks/use-worn-looks.ts` | 按账号隔离的 IndexedDB，最多 20 张，照片在当前浏览器 | `look-switching/REPORT.md` | **确认**：没有云端相册 API；清理浏览器数据或换设备不会恢复。当前不应把“登录账号”理解为云备份 |
| 旧 AI 模拟面板（looks 页） | **确认·代码**：人物照片+单件上装、同意、提交、状态/私有结果恢复；`components/looks/workspace.tsx`、`hooks/use-tryon.ts` | 复用同一后端试衣服务 | `look-switching/REPORT.md` 有虚构人像真实单件成功 | 此旧入口的单件限制不代表新版试衣间仍只支持单件；以独立 tryon 页多件能力为准 |
| 3D 悬挂衣柜：`/dashboard/wardrobe/3d` | **确认·代码**：真实库存分类/搜索/收藏/待洗/排序、衣架/单件、旋转/缩放、灯光、照片/真实多图/双图对比、最多 6 件篮、恢复/失效校验、工作室入口；`components/wardrobe-3d/`、`lib/wardrobe-3d.ts`、`hooks/use-wardrobe-draft.ts` | 真实库存来自后端；Three.js 本机 WebGL；篮在本浏览器 | `wardrobe-3d/REPORT.md`、`wardrobe-continuity/REPORT.md` | **确认**：衣物为按品类/颜色构造轮廓，不是商品扫描或背面重建；一次最多绘制 7 件；筛选只覆盖已加载库存；实体弱性能手机未验证 |
| 真人直接试衣：`/dashboard/wardrobe/tryon` | **确认·代码**：照片/本地镜像拍照、文字/可选语音选衣、最多 4 件互斥品类、同意、生成、原图/效果/滑块、私有历史、下载；`components/fitting-room/`、`lib/fitting-room.ts`、`hooks/use-fitting-media.ts`、`api/tryon.py`、`services/tryon.py:363` | 远端图片生成；2–4 件先合成参考板，人物仍单独输入；只在显式生成时提交 | `direct-tryon/REPORT.md` 有裙装和四件整套真实成功记录 | **确认**：输出为单张图片，通常需等待；不是连续实时换装或尺码评估。当前未验证私人照片/真实摄像头麦克风授权，原图不在刷新后恢复 |
| 3D 造型工作室：`/dashboard/wardrobe/avatar` | **确认·代码/历史 GPU**：实际男女 53 骨 GLB、正侧背/拖动/转台/缩放、姿态/灯光/配色/样衣、最多 4 件衣物映射、PNG 预览、本机造型册、保存日历、带入真人试衣；`components/avatar-studio/workspace.tsx:72`、`scene.tsx:248`、`lib/avatar-studio.ts` | GLB 与纹理本机；造型配置 `localStorage`；日历复用 `/outfits/studio` | `avatar-studio/REPORT.md`、`ASSET-REPORT.md`、`asset-audit.json` 有 r2 GPU/资产证据 | **确认**：内置样衣由品类/颜色映射，不复原原衣物纹理/剪裁；男模没有裙层且 UI 有能力限制；PNG 落盘待验证；照片→本人模型不存在，详下表 |
| 历史/日历：`/dashboard/history` | **确认·代码**：按月/日、场合/状态查记录、详情、反馈，服务端日历；`page.tsx:108`、`components/outfit-calendar.tsx`、`api/outfits.py:585` | 真实搭配/反馈与用户时区 | `verification/REPORT.md`、`architecture/live-core.json` | 本轮需验证跨月、当天时区、非已穿/已穿语义，历史统计不代表所有保存都已穿过 |
| 分析：`/dashboard/analytics` | **确认·代码**：总量、颜色/类别分布、最多/最少/从未穿、接受率趋势、洞察；`page.tsx:155`、`hooks/use-analytics.ts`、`backend/app/api/analytics.py` | 真实数据库聚合，不需要 LLM 编造数字 | `verification/REPORT.md` 有数据结果；后端 `test_analytics_trend.py`、`test_analytics_insights.py` | 本轮需与测试账号实际操作后数据对账；缺数据的空值不是 0% 或已验证偏好 |
| 学习：`/dashboard/learning` | **确认·代码**：反馈偏好统计、颜色/风格/场合/温度模式、重算、生成/确认洞察、搭配对评分；`page.tsx:346`、`hooks/use-learning.ts`、`services/learning_service.py:171`、`:741` | 数据驱动的统计/规则学习，至少 1 次反馈才有 profile；配对评分至少 2 次共同记录；并非后台微调神经网络 | `verification/REPORT.md`、后端 `test_learning_service.py`、`test_learning_item_composition.py` | **确认**：洞察由统计阈值与模板生成，没有“持续训练大模型”流程。样本很少时结果只能参考，未做满意度测评 |
| 家庭/动态：`/dashboard/family`、`/dashboard/family/feed` | **确认·代码**：创建/加入/退出、角色/移除、邀请码更新、邀请/撤销、家庭动态与评分；`app/dashboard/family/`、`hooks/use-family.ts`、`api/families.py`、`api/outfits.py:1026` | 基础家庭数据库；邮件邀请投递另需 SMTP；token 加入检查同邮箱与已验证身份 | `verification/REPORT.md` 有家庭加入、隔离、评分、退出真实接口结果 | 本轮未发送外部邮件；接口显式区分 `email_sent=false`，邀请记录成功不等于邮件送达。成员动态/评分 UI 待新浏览器回归 |
| 通知与定时：`/dashboard/notifications` | **确认·代码**：ntfy/Mattermost/email 配置、启停/测试/删除、按星期时间/场合计划；移动 push 注册另有 API。`page.tsx:299`、`hooks/use-notifications.ts`、`api/notifications.py`、`workers/notifications.py`、`services/notification_providers.py` | 外部收件服务/SMTP/Expo 凭据和分钟调度 worker | `verification/REPORT.md` 的 `scheduled-delivery.json` 使用本机 HTTP 接收；不是外部手机验证 | **未验证**：真实邮箱/手机/Mattermost 收件、手机 push。外部测试会发送消息，本轮未授权也未执行；不要用配置 CRUD 冒充投递成功 |
| 设置：`/dashboard/settings` | **确认·代码**：资料、位置/时区、单位/身体信息、风格/颜色/排除/重复/天气偏好、AI endpoint 排序/测试、重置、主题/语言；`page.tsx:180`、`hooks/use-preferences.ts`、`api/preferences.py`、`api/users.py` | 服务端偏好；定位需浏览器/可选地理服务；endpoint 测试只读远端模型列表 | `verification/REPORT.md` 有偏好/endpoint 兼容，多个 UI 重构记录有主题/语言检查 | 身体字段作为推荐上下文，不生成对应体型的本人 GLB；模型列表可连通不证明指定模型实际生成成功。定位拒绝/手工设置需本轮浏览器覆盖 |
| 天气（首页/推荐/设置） | **确认·代码**：按账号位置查询当前与预报，天气参与推荐上下文；`api/weather.py:55`、`:109`、`services/weather_service.py`、`hooks/use-weather.ts` | Open-Meteo、有效位置/时区；设置地名可使用定位/地理编码 | `verification/REPORT.md` 有真实天气与 7 日预报 | 未配置位置是明确状态；天气外部故障需要错误反馈，不保证所有时刻在线。当前本轮未访问外部天气服务 |

上表列出 23 个 page 文件中的合并业务模块，表格行数与文件数不一一对应；引导/登录合并，页面内的上传、试衣、相册等拆开记录。

## 照片 → 本人 360° 的可实现性核查

| 层次 | 确认事实 | 判断边界 |
| --- | --- | --- |
| 当前前端 | `avatar-studio/scene.tsx:248` 仅加载 `/models/avatar/${model}.glb`；模型 ID 为 female/male；`workspace.tsx:912` 明示 reconstruction notice | **确认：只有预设模特，没有人物照片驱动的身份/体型重建入口或服务调用** |
| 当前后端 | `api/router.py` 无 avatar/reconstruction/mesh 服务；`schemas/tryon.py:49` 输出固定为 `image`；`services/tryon.py:363` 发送图片参考并解码 JPEG 结果 | **确认：现有试衣路径输出图片，不输出可绕背查看的网格、蒙皮、材质或 GLB** |
| 当前脱敏 AI 配置 | 本轮读取白名单字段：`https://aistore.gsiig.cn/v1`、识图 `Qwen3.8-max`、文本 `Doubao-Seed-2.0-Mini`；TRYON_MODEL 未覆盖，采用源码默认 `Doubao-Seedream-5.0-lite` | 模型名本身不证明外部服务所有能力。已成功生成试衣图片仅有历史样本证据；本轮不发起计费请求 |
| 开关与健康 | 本轮 `/api/v1/capabilities` vision/text 为 true；`/health/ready` 为 healthy/database healthy | 仅证明开关与数据库响应；不能证明模型可用、配额充足，更不能证明支持 3D |
| 本地工具 | 已安装 Blender 5.1.2，主机内存 16 GiB；项目已有男女两个 GLB；backend 依赖有 rembg 去背景，没有已集成的人像三维重建 pipeline | **确认：可以本地编辑/渲染已有模型；不能据此推断已具备照片自动重建本人能力。** 没有安装或测试新重建模型，也没有验证其速度/精度 |
| 多视角与身份 | 当前没有本人多视图数据采集、几何/纹理重建、身体尺度标定、自动绑定及重建结果质量审核链 | **确认：不能把“生成几张正侧背图片”当作真实 360° 模型；即便未来模型能猜出背面，也需标注未被照片观测的部分。** |

因此，当前可交付的是“预设成年男女 3D 模特造型 + 另行照片 AI 换装”。若验收要求必须是本人 360°，需新增可用重建提供方或本地经过验证的重建流程、模型资产处理和质量验证；本轮没有充分证据承诺本机现成可用、保持身份、精确身材、实时完成或免费运行。

## 真实风险与验收缺口

**本次只读审计没有确认一个新的 P1/P2 业务源码故障。** 以下分别标注未满足能力、产品限制和证据缺口，不能混称为已复现 Bug。正在并行修复的其他代理发现不在本报告中抢先声明解决。

| 优先级/类型 | 风险及证据 | 可接受的验收口径 |
| --- | --- | --- |
| **P1（有条件的交付门槛）·未满足需求** | 若“按视频全部实现”包含照片生成本人 360°，当前前后端没有这条链；见上表。UI 已提示未接入，因此不是悄悄伪造模型的缺陷 | 必须明确缺项；只有真实接入并验证后才能宣称此能力完成。不能用现有两个人物模板代替本人重建 |
| **P1（公开发布前门槛）·环境限制** | 当前 `DEBUG=true` 且未配置 OIDC；这是本机演示配置，`frontend/lib/auth.ts` 包含开发登录 | 当前本机可接受；公开部署前应切换真实受信认证、HTTPS，并重新验证权限。不能在本机范围内报告为已发生的公网漏洞 |
| **P2·用户数据可携带性限制** | 灵感收藏 `use-saved-inspirations.ts`、实穿照片 `looks/storage.ts`、3D 篮 `use-wardrobe-draft.ts`、3D造型 `use-avatar-journal.ts` 都依赖浏览器存储 | 页面已说明本机边界；清理数据/换设备不可恢复。如要求跨设备“全部完善”，还需另行同步/导出方案。真正同刻多页签写入的 localStorage 不具事务保证 |
| **P2·端到端证据缺口** | `direct-tryon/REPORT.md` 和 `avatar-studio/REPORT.md` 记录 Blob 下载工具超时；已验证图片生成/预览和下载链接，未证明文件在 OS 落盘 | 本轮用真实浏览器完成一次下载，检查文件存在、类型、尺寸、可解码；不要仅用链接属性作为下载通过 |
| **P2·真实设备证据缺口** | 摄像头/语音没有真实设备权限实测；低端实体手机 GPU/内存未测试。已有媒体生命周期模拟测试、桌面 WebGL、窄屏布局证据 | 明确模拟与实体证据边界；真实授权需由用户设备执行，拒绝权限也应能回到上传路径。不要主动采集私人摄像头/麦克风补证 |
| **P2·外部投递证据缺口** | 邮件/手机/Mattermost 未实收；本机接收成功只证明发送流程；`families.py:328` 明确区分 `email_sent` | 不在无收件授权下发外部测试；可验证配置/禁用/错误/本机接收，把实际外部送达留为明确未验证项 |
| **P2·AI与三维质量边界** | 试衣图片可能改变细节，衣橱/模特样衣并非原服装精确几何，无尺码/布料物理链；历史少量合成样本不能证明识衣/审美总体准确率 | 功能验收与质量评测分开；真实数据集、不同体型/姿态/品类仍需后续评估，不能宣传精准合身或完整原衣物复刻 |

## 本轮主任务还需补齐的回归证据

1. 使用隔离测试账号走上传 → 识衣 → 修改/归档/恢复 → 穿/洗 → 查询与统计对账；覆盖空数据、失败和刷新。
2. 走手工搭配/编辑/穿过/反馈 → 日历/历史/学习，再走固定搭配的创建、查看、删除；检查实际持久化与权限。
3. 灵感/一件多搭/风格分类进入工作室；收藏/草稿/本机相册在刷新、账号切换与存储失败时行为正确。
4. 3D 衣架、模特与真人试衣之间真实衣物 ID 传递、失效引用、互斥类别、男性不支持裙层、模型加载失败状态；下载文件实际落盘。
5. 设置、天气、家庭、通知以允许范围验证；外部投递、计费生成、私人媒体不因“补测试”自动获得授权。
6. 按最终修复版本重新记录前后端测试、构建、运行源码一致性；新结果单列在本目录。历史 2251 项后端与 1151 项前端通过不自动覆盖当前后续变更。

## 可追溯来源

- [最初核心业务真实验收](../REPORT.md)、[任务/存储/故障恢复架构验收](../architecture/REPORT.md)。
- [首页](../dashboard-content/REPORT.md)、[灵感与工作室](../editorial-style/REPORT.md)、[抖音方法练习](../douyin-style/REPORT.md)、[一件多搭](../one-piece-many-looks/REPORT.md)。
- [图片切换与实穿相册](../look-switching/REPORT.md)、[潮流分类](../style-discovery/REPORT.md)。
- [3D 衣架](../wardrobe-3d/REPORT.md)、[衣架连续使用](../wardrobe-continuity/REPORT.md)。
- [多件真人试衣](../direct-tryon/REPORT.md)、[3D 造型工作室](../avatar-studio/REPORT.md)、[资产结构/许可](../avatar-studio/asset-audit.json)。
- [本轮只读脱敏能力与本机检查](./local-readonly-evidence.json)。外部事实未新增引用，本次无需新的网络检索。

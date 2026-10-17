# Wardrowbe 功能验收报告

验证时间：2026-10-17T11:53:51.723378+08:00。范围：当前部署的开源 Web 版本，使用独立测试账号与合成衣物图片。

**结论：开源核心功能已通过自动化回归、真实接口和浏览器验收；真实邮件及手机端推送仍需提供服务配置。**

## 验证结果

| 层级 | 结果 | 证据 |
|---|---|---|
| 后端全套测试 | 2054 项通过，0 失败/错误/跳过 | backend-tests-final.xml、backend-tests-final.log |
| 前端全套测试 | 693 项通过，0 失败 | frontend-tests.json |
| TypeScript 类型检查 | npx tsc --noEmit 返回 0 | frontend-types.log |
| 前端生产构建 | npm run build 返回 0 | frontend-build.log |
| 实际业务接口 | 17 组通过 | live-check-final.json |
| 后台通知任务 | 已通过 Redis 入队、工作进程、真实 AI 生成、通知持久化、本机 HTTP 接收 | scheduled-delivery.json |
| 浏览器 | 主要页面、真实上传与 AI 详情、三套中文推荐、采纳操作 | browser-pages.json 与截图 |

## 真实流程明细

| 流程 | 结果 | 摘要 |
|---|---|---|
| Unauthenticated access is refused | 通过 | Not authenticated |
| Test account/profile/onboarding and 3 uploads | 通过 | {'created_items': 3, 'test_account': 'wardrowbe-verify-owner-6c60db61@example.com'} |
| AI image upload queue | 通过 | {'type': 't-shirt', 'primary_color': 'blue', 'status': 'ready', 'tagging_status': 'tagged', 'ai_description': '一件蓝色短袖圆领T恤，纯色无图案。'} |
| Signed image via frontend proxy | 通过 | {'image_bytes': 8775, 'type': 'image/jpeg'} |
| Wardrobe management | 通过 | edit, search, filter, archive and restore passed |
| Wear and wash tracking | 通过 | wear count, history, wash reset and wash history passed |
| Image rotation | 通过 | clockwise/counterclockwise rotations passed |
| Background removal and undo | 通过 | image worker completed background removal and original restore |
| Preferences and exclusions | 通过 | preferences and recommendation exclusions saved |
| Manual outfit and feedback | 通过 | manual outfit create/edit, wear-today and feedback passed |
| Real AI recommendation | 通过 | {'item_count': 2, 'reasoning': '黑白休闲套装'} |
| Multiple recommendations and reject | 通过 | {'options': 3, 'reject_test': True} |
| Manual and AI pairings | 通过 | {'ai_generated': 1} |
| Analytics, history and learning | 通过 | {'wardrobe': {'total_items': 3, 'items_by_status': {'ready': 3, 'processing': 0, 'archived': 0, 'error': 0}, 'total_outfits': 8, 'outfits_this_week': 8, 'outfits_this_month': 8, 'acceptance_rate': 50.0, 'average_rating': 4.0, 'total_wears': 4}} |
| Family and access isolation | 通过 | create, join, member isolation, family rating and leave passed |
| Notification and schedules | 通过 | local ntfy delivery plus disabled channel/schedule CRUD passed; no external recipient |
| Real weather and forecast | 通过 | {'condition': 'sunny', 'temperature': 28.4, 'forecast_days': 7} |

后台通知任务以手动入队方式执行，测试时间表保持禁用，接收端是本机测试服务；没有向任何外部联系人发送通知。分钟定时匹配逻辑另有自动化测试覆盖。

## 最终配置与修复

- 识衣：`Qwen3.8-max`；文本推荐：`Doubao-Seed-2.0-Mini`，接口均为 `https://aistore.gsiig.cn/v1`。
- 选择文本模型依据完整推荐请求的实际成功结果；之前的模型在该网关上出现长时间错误或推理输出耗尽额度。
- 兼容云接口对非流式请求返回 SSE 包装的响应，保留普通 JSON 行为。
- 修复设置页 AI 端点测试仅检查 Ollama 的问题，兼容 OpenAI 模型列表；只向已配置的同一服务地址发送服务器密钥。
- 推荐与搭配说明按账号语言生成，简体中文账号补充中文输出约束。浏览器已看到中文标题、理由与穿搭建议。
- 修复前端锁文件遗漏 `@swc/helpers`，全新 npm ci 安装与构建通过。
- 后端修复通过 docker-compose.local.yml 的只读源码挂载生效。升级上游镜像时需同步核对源码版本。

## 演示与复现

- 网页：http://localhost:3000
- 演示账号：`demo@wardrowbe.local`，本地开发登录无需密码。
- 演示账号中保留 4 件明确标记的合成衣物、真实 AI 识别结果及生成的穿搭。
- 默认 `dev@wardrobe.local` 的衣橱数据未改动；浏览器当前切换到了演示账号。
- `live_check.py` 用于重跑部署中的业务检查，会新建独立测试账号；原始运行记录和截图保留在本目录。
- `check_scheduled_delivery.py` 测试通知任务，使用本机接收端；运行时需使同目录的 live_check.py 可被测试进程加载。
- 后端完整测试使用独立数据库 `wardrowbe_verify_20261017` 与 Redis 第 15 库；运行配置在被 Git 忽略的 `.verification.env.local`。
- 启停与配置命令见仓库根目录 LOCAL-DEPLOYMENT.md。

## 验收边界

- 尚未配置真实邮箱 SMTP、Mattermost Webhook 或手机推送令牌，所以不能宣称真实外部投递已通过。用户可选择暂不配置，或提供接收渠道并授权发送测试通知。
- 此次未验证手机相机权限、真实手机推送、外部统一登录或公网发布；当前部署用于本机 Web 演示。
- AI 测试使用合成图片与有限衣橱样例，证明流程能完成，不代表所有衣物识别及推荐质量都有保证。
- 批量处理、边界输入、权限和并发情形主要由自动化测试覆盖，不等同于对所有输入组合逐一人工检查。

模型资源配置来源：
- https://yunqiao.jpx.com/cup/resources/login.html#login-section-5
- https://aistore.gsiig.cn/model-market

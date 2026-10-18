# 模型、API、开源组件与资产

## 模型与接口

| 用途 | 当前配置 | 运行位置与说明 |
|---|---|---|
| 衣物识别 | `Qwen3.8-max` | 云桥 `https://aistore.gsiig.cn/v1`；需要网络和账号额度 |
| 穿搭推荐 | `Doubao-Seed-2.0-Mini` | 同上；后台任务调用 |
| 照片试穿 | `Doubao-Seedream-5.0-lite` | 同上；用户确认后发送人物照与衣物参考 |
| 衣物区域提取 | SCHP ATR18 INT8 ONNX | 服务器 CPU，固定权重摘要 `4420d8db8c1f266967c89485786b01209f6d405f320fc0f87e8ced49392cefb5` |
| 去背景 | u2net / rembg | 服务器 CPU，当前权重摘要 `8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491` |
| 预设三维资产 | Tripo / MakeHuman 等既有制作链路 | 资产离线生成后随网页交付；不在用户点击时重建本人三维 |

模型名为当前服务商配置，不代表自研模型。接口密钥不随源码发布。ONNX（跨平台模型文件格式）推理依赖 `onnxruntime`；模型权重单独部署，不在请求期间下载。来源、许可与制作记录见 `verification/video-quality/extraction-report.md` 及 `frontend/public/models/` 各版本的来源和许可文件。

## 主要开源组件

| 层次 | 组件 | 作用与来源文件 |
|---|---|---|
| 网页 | Next.js 14.2.35、React 18.2、TypeScript、Mantine 8.3.18 | 页面、交互、组件；`frontend/package.json` / `package-lock.json` |
| 三维 | Three.js 0.186.1 | 浏览器三维渲染；同上 |
| 登录与数据请求 | NextAuth、TanStack Query | 会话与请求缓存；同上 |
| 服务端 | FastAPI、Pydantic、SQLAlchemy、Alembic | 接口、校验、数据库与迁移；`backend/requirements.txt` |
| 数据与队列 | PostgreSQL、Redis、ARQ | 业务数据、后台任务 |
| 图片 | Pillow、rembg、ONNX Runtime | 图片预处理、去背景与人体分割 |
| 可选存储与观测 | RustFS / S3、OpenTelemetry | 本机对象存储、运行指标；公网当前使用独立文件存储 |
| 公开部署 | Nginx、systemd、Ubuntu | 入口认证、进程管理 |

许可证以各依赖实际版本和资产旁的许可文件为准。仓库根目录 `LICENSE` 适用于项目代码，不替代第三方资产的许可。前端依赖由锁文件固定；公网 Python 环境的实际版本清单见 `verification/server-6780/requirements-deployed.txt`，重新安装浮动版本不保证与此清单相同。

## 数据与能力边界

- 公网专用演示数据使用合成衣物，未复制本机私人数据库和图片。
- 私人照片只在明确同意相应生成操作后发送；预设三维造型不是个人重建。
- HTTP 公网入口不满足摄像头/麦克风的安全上下文要求；本机 localhost 可以用于现场演示这些浏览器功能。
- 自动识别、推荐、试穿和衣物提取均有误差，结果需要用户核对。

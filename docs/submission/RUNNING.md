# 从冻结源码运行

## 直接体验

公网入口：<https://124.70.96.183:6780/dashboard>。浏览器弹出身份框时使用私下提交的测试账号和密码，认证后自动登录。桌面 Chrome / Edge 优先。公网环境与管理命令见 [ops/server-6780/README.md](../../ops/server-6780/README.md)。

## 新电脑本机运行

前提：Git、Docker Desktop / Docker Engine 与支持 `!reset` / `!override` 的 Docker Compose、联网下载镜像与依赖、可用的云桥模型密钥。现有本机镜像基础在 Apple Silicon 上验证；公网 x86_64 使用下文原生部署，不能将本机镜像当作跨架构验收。

```bash
git clone --branch aidol-final-20261018 https://github.com/2892480843/AIdol.git
cd AIdol
cp .env.example .env
cp .env.ai.example .env.ai.local
cp .env.architecture.example .env.architecture.local
```

编辑 `.env`：设置独立的 `POSTGRES_PASSWORD`、`SECRET_KEY` 和 `NEXTAUTH_SECRET`（后两者分别用 `openssl rand -hex 32` 生成），`DEBUG=true`、`BACKEND_PORT=18000`、`NEXTAUTH_URL=http://localhost:3000`。本机不要配置 OIDC 或公网 forward-auth。编辑 `.env.ai.local` 填入自己的模型密钥；编辑 `.env.architecture.local` 填入独立对象存储凭据。三个私有文件均被 Git 忽略，不要公开。

```bash
chmod 600 .env .env.ai.local .env.architecture.local
./local.sh build backend frontend
# 后台进程运行同一份刚构建的源码；全新电脑没有历史镜像标签。
docker tag wardrowbe-backend:loading-performance-20261018-r2 wardrowbe-backend:architecture-20261017
./local.sh up -d postgres redis object-store otel-collector
./local.sh run --rm --no-deps -T backend alembic upgrade head
# 仅全新空存储首次建桶执行；已有数据不要重新初始化。
./local.sh run --rm --no-deps -T backend python scripts/migrate_storage.py --source /data/wardrobe --manifest /tmp/initial-copy.jsonl --execute --create-bucket
./local.sh up -d
./local.sh ps
curl -fsS http://localhost:18000/api/v1/health/ready
```

打开 <http://localhost:3000>，使用 `demo@wardrowbe.local` 进行本机开发登录，无密码。新数据库没有演示衣物，需自行上传合成或已获许可的图片。新环境构建步骤在此次交付中按配置和脚本复核；没有在另一台空电脑完整重装，不应宣称已完成干净机器验收。

## 衣物提取模型（可选功能所必需）

衣橱管理与云端推荐不依赖该权重；照片提取页必须部署固定模型。权重不在 Git 源码包中。下载来源、固定 revision 与许可见 [模型证据](../../verification/video-quality/extraction-report.md)。在联网电脑下载并验证：

```bash
curl -fL 'https://huggingface.co/pirocheto/schp-atr-18/resolve/61f4ff3c508b899904e495cefbbaff9cacadeb45/onnx/schp-atr-18-int8-static.onnx' -o schp-atr-18-int8-static.onnx
shasum -a 256 schp-atr-18-int8-static.onnx
# 必须得到：4420d8db8c1f266967c89485786b01209f6d405f320fc0f87e8ced49392cefb5
./local.sh exec -T backend mkdir -p /data/wardrobe/.models
./local.sh cp schp-atr-18-int8-static.onnx backend:/data/wardrobe/.models/schp-atr-18-int8-static.onnx
./local.sh restart backend
```

服务读取 `CLOTHING_EXTRACTION_MODEL_PATH`。缺模型会明确不可用，不在请求时自动下载。去背景 u2net 由现有后端基础镜像提供。三维模型和旁边的许可/来源文件位于 `frontend/public/models/`，必须连同源码一起获取，不能只复制页面代码。

## 公网原生运行环境

当前已验收的环境：Ubuntu 24.04 x86_64、Node.js 22.23.2、Python 3.12；PostgreSQL、Redis、Nginx、systemd。后端依赖的部署版本见 `verification/server-6780/requirements-deployed.txt`。源文件清单、实际构建 ID 见同目录 `release.json`、`source-manifest.json` 与 `file-verification.json`。

原生构建入口：前端在 `frontend/` 执行 `npm ci && npm run build`，运行 standalone 构建并保留 `public/`、`.next/static/`、`messages/`；后端使用独立虚拟环境安装 `backend/requirements.txt` 与 `requirements-extras.txt`。服务命令见 `ops/server-6780/run-service.sh`，systemd 模板见 `dada-6780@.service`。部署脚本依赖预先准备的私有环境、数据库和发布目录，不是克隆后即可运行的一键安装器。

本地 ARM64 的 standalone 依赖不能直接复制为任意 x86_64 原生依赖；重新构建需在目标架构安装。公网使用单独测试数据，不复制私人数据库或照片。不要把现有部署命令用于覆盖服务器其他站点。

## 验证命令

```bash
cd frontend
npm ci
npm test
npx tsc --noEmit
```

后端隔离测试工具：`python3 verification/full-function/backend/run-isolated-tests.py submission`，使用本机 Docker 中现有镜像启动临时数据库和 Redis；此工具不连接正式业务数据库或外部模型，不等价于新环境部署脚本。

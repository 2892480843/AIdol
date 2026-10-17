# Wardrowbe 本机部署

已在 macOS Apple Silicon 使用 Docker Desktop 启动。仅本机访问，适用于试用和比赛原型开发。

- 网页：http://localhost:3000
- 后端健康检查：http://localhost:18000/api/v1/health/ready
- 源码版本：`cfbb5a9`，上游 https://github.com/Anyesh/wardrowbe
- 容器镜像版本固定在 `docker-compose.local.yml`；完整摘要见 `deployment-images.json`。
- 数据库、Redis、图片均保存到 Docker 命名卷，重启服务保留数据。
- 本机已有程序使用 8000 端口，本项目后端使用 18000。

## 登录

本地开发登录已启用。使用页面默认邮箱 `dev@wardrobe.local` 与名称 `Dev User`，点击登录即可。
演示账号已完成首次引导，当前衣橱为空。

## 启动、停止和检查

在本目录执行：

```sh
./local.sh up -d
./local.sh ps
./local.sh stop
```

查看日志：

```sh
./local.sh logs --tail 100 backend worker image-worker frontend
```

首次建立全新数据库时按顺序初始化，避免后台任务先于建表启动：

```sh
./local.sh up -d postgres redis
./local.sh run --rm --no-deps backend alembic upgrade head
./local.sh up -d
```

本次数据库已初始化至 `a7d3c9e1f5b2 (head)`。

## AI 接口配置

已接入用户提供的云桥比赛资源接口，密钥保存在 `.env.ai.local`，文件权限为仅当前用户可读写，并已被 Git 忽略。

- 接口基础地址：`https://aistore.gsiig.cn/v1`
- 衣物识别模型：`Qwen3.8-max`
- 文本生成模型：`Doubao-Seed-2.0-Mini`
- AI 功能：已开启。
- 超时：120 秒；最大请求重试次数：2。

修改 `.env.ai.local` 后重新应用：

```sh
./local.sh up -d
curl -fsS http://localhost:18000/api/v1/health/ai
```

### 网关响应兼容修复

实测该网关对 `stream=false` 请求也返回 SSE（服务器发送事件，给结果加上 `data:` 外包装）的完整响应。原项目直接按 JSON 读取会抛出 `JSONDecodeError`。

已在 `backend/app/services/ai_service.py` 为识图与文本调用统一处理此包装，保留普通 JSON 行为；真正的分块流不会被当作完整回答。修复通过本地 Compose 覆盖配置只读挂载到后端和后台任务容器，服务重启后仍生效。

升级镜像时应同步核对这份源码与镜像版本；上游修复后可移除本地挂载。

相关回归测试和原有 AI 服务测试共 85 项通过（无外网请求，不使用真实密钥）：

```sh
docker run --rm --network none --entrypoint python \
  -e DEBUG=true -e AI_INTERNAL_ENABLED=true \
  -e AI_BASE_URL=http://ai-endpoint.test/v1 \
  -v "$PWD/backend:/app:ro" \
  ghcr.io/anyesh/wardrowbe@sha256:ea1cee12c1b1e48db72991f37b0ef8a7785de37ecf6affbe913ed55eec68fa6b \
  -m pytest --noconftest -p no:cacheprovider -q \
  tests/test_ai_gateway_response.py tests/test_ai_service.py
```

当前是仅本机可访问的开发登录；公开部署前需配置正式身份认证与 HTTPS。

资源配置依据：
- https://yunqiao.jpx.com/cup/resources/login.html#login-section-5
- https://aistore.gsiig.cn/model-market

## 本次验证

- 6 个服务启动；数据库、Redis、后端健康检查通过。
- 数据库迁移完成；前端代理能访问数据库就绪检查。
- 浏览器已验证中文首页、开发登录、首次引导、仪表盘、空衣橱页面。
- 已配置云桥资源密钥，模型鉴权与中文文本生成实测通过；图像识别实测结果见 AI-VERIFICATION.json。
- 未使用个人衣物图片进行测试。

## 全功能验收

最新完整结果见 [verification/REPORT.md](verification/REPORT.md) 与 [verification/SUMMARY.json](verification/SUMMARY.json)。
后端 2054 项、前端 693 项通过，真实业务 17 组通过；真实外部推送待配置。

# 最新版重新部署验收

2026-10-18 23:33（北京时间）上线 `https://124.70.96.183:6780`。

- 当前工作区601个前端源码/资源文件与构建镜像清单完全一致。
- 生产构建：`PEQRW1j-iBdLB73DZbCPA`；镜像为 `collage-style-20261018-r4`。
- 服务端2303个前端产物文件和265个后端文件校验通过；后端未变化。
- 新发布目录：`/opt/dada-6780/releases/20261018-latest-collage-r4`，保留此前版本。
- 公网通过正常HTTPS证书验证，未关闭证书校验。真实演示账号登录、后端身份、6个页面、65个JS/CSS资源以及现有3件衣物与签名缩略图均通过。
- 浏览器登录新版首页，首页轮播从1/4切换至2/4；截图保存于同目录。
- 数据库、图片、账号和私有配置沿用原服务。未运行数据库迁移，未新发AI付费生成请求。

证据：`deployment.json`、`frontend-manifest.json`、`frontend-package-manifest.json`、`public-smoke.json`和`final-source-check.json`。

首次检查沿用旧HTTP地址，在登录POST遇到服务器新增HTTPS重定向；改用服务器当前HTTPS入口后完整检查通过。

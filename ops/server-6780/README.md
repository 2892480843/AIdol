# 124.70.96.183:6780 部署

独立目录 `/opt/dada-6780`，服务使用专用低权限用户 `dada6780`。
前端复用本机正在运行的 Next.js standalone 生产构建，使用服务器已有的 x86_64 Node.js 22；移除构建产物中的 ARM64 可选 sharp 二进制（项目关闭图片优化）。后端使用独立 Python 3.12 虚拟环境安装 x86_64 依赖。

- 公网入口：`http://124.70.96.183:6780`，Nginx 密码认证后使用已有 forward-auth 登录流程。
- 前端：`127.0.0.1:31680`；后端：`127.0.0.1:31681`。
- 数据：独立 PostgreSQL 数据库 `dada6780`、Redis DB 6、`/var/lib/dada-6780`。
- 私有配置：`/etc/dada-6780/*.env`，不纳入仓库。
- 六个 systemd 服务：`dada-6780@{frontend,api,worker,images,tasks,dispatcher}`。
- 原有网站和 Docker 容器不重启；数据库及上传文件使用新的演示数据，不复制本机私人数据库或图片。
- 模型：复制已验证的 SCHP ATR18 与 u2net 权重；云端模型沿用现有项目配置。

```sh
systemctl status 'dada-6780@*'
journalctl -u dada-6780@api -n 80 --no-pager
curl -fsS http://127.0.0.1:31681/api/v1/health/ready
systemctl restart dada-6780@frontend
```

发布目录保留在 `releases/`，`current` 指向当前版本。回滚须先核对数据库迁移兼容性；不能只切换软链接来撤销数据库变更。
HTTP 入口暂未配置域名与 HTTPS；使用独立演示账号，不使用服务器 root 凭据登录应用。

## 公共预设模型与认证

三维预设模型已随公开源码分发，浏览器模型加载器使用 `credentials: omit`。Nginx 仅对 `/models/avatar/` 放行并清除 Cookie、Authorization 与身份转发头；配置片段为 `public-model-assets.nginx.conf`，provision 会将其合入私有入口配置。页面和私人 API 继续受认证保护。修改私有配置后须同步安装到 `/etc/nginx/conf.d/dada-6780.conf`，通过 `nginx -t` 后 reload。2026-10-18 交付回归见 `verification/submission/public-model-regression.json`。

队长已确认服务器与云桥模型额度保障至 2026-11-10。最终交付和凭据分发方法见 `docs/submission/README.md`；不在此文公开演示密码。

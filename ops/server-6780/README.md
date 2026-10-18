# 124.70.96.183:6780 部署

独立目录 `/opt/dada-6780`，服务使用专用低权限用户 `dada6780`。
前端复用本机正在运行的 Next.js standalone 生产构建，使用服务器已有的 x86_64 Node.js 22；移除构建产物中的 ARM64 可选 sharp 二进制（项目关闭图片优化）。后端使用独立 Python 3.12 虚拟环境安装 x86_64 依赖。

- 公网入口：`https://124.70.96.183:6780`，公开演示模式，无浏览器密码弹窗，使用已有 forward-auth 流程自动进入独立演示账号。
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
入口已配置 HTTPS，HTTP 自动跳转；使用独立演示账号，不使用服务器 root 凭据登录应用。

## 公共预设模型与认证

三维预设模型已随公开源码分发，浏览器模型加载器使用 `credentials: omit`。`/models/avatar/` 清除 Cookie、Authorization 与身份转发头；配置片段为 `public-model-assets.nginx.conf`，provision 会将其合入私有入口配置。修改私有配置后须同步安装到 `/etc/nginx/conf.d/dada-6780.conf`，通过 `nginx -t` 后 reload。

2026-10-18 23:56，应队长要求开放所有人访问：入口取消 Basic Auth，在代理端固定演示身份，覆盖外部传入的身份头，服务之间的密钥保持原状。后端 API 仍检查应用会话令牌。所有访客共用演示数据，不能作为个人私密衣橱使用。本次没有修改应用源码、数据库或 3D 模型。开放前配置备份位于服务器 `/etc/dada-6780/access-backups/20261018-235645/`，保持 root 私有；恢复时同时恢复运行配置与存档配置，再检查并 reload Nginx。验收见 `verification/server-6780/public-access/`。

队长已确认服务器与云桥模型额度保障至 2026-11-10。最终交付和凭据分发方法见 `docs/submission/README.md`；不在此文公开演示密码。

## HTTPS 与证书续期

6780 端口使用服务器已有的可信 IP 证书（SAN 为 `124.70.96.183`），证书路径为 `/etc/letsencrypt/live/medinsight-ip/`。仅为本应用添加 TLS 监听，不改动其他站点。`NEXTAUTH_URL` 为 `https://124.70.96.183:6780`。旧 HTTP 请求经 Nginx 497 错误处理跳转到 HTTPS。已有 `med-insight-cert-renew.timer` 负责短期 IP 证书续期；证书私钥、环境文件和登录密码不进入 Git。发布前需检查该 timer 与近期续期结果，不可仅依据当前证书到期日承诺长期有效。

排查依据：[MDN randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) 的安全上下文要求和 [Nginx SSL 模块](https://nginx.org/en/docs/http/ngx_http_ssl_module.html) 的配置说明；本次同时使用真实浏览器与 HTTPS 请求验证。

## 参赛版本固定

`submission-freeze.conf` 是仅针对 `dada-6780@frontend` 的 systemd drop-in，将工作目录与启动文件固定到 `releases/20261018-server/frontend`，避免并行开发切换 `current` 后无意改变参赛入口。新拼贴发布目录保留，不覆盖本次选择。后续正式升级时应明确移除该 drop-in、`systemctl daemon-reload`，再执行受控发布；不要误认为切换 `current` 已更新参赛入口。

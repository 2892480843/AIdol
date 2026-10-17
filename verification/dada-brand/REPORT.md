# 搭搭品牌替换验收

日期：2026-10-17。用户选择名称 **搭搭**。网页品牌已完成替换并更新到本机生产容器。

## 变更

- 原创 SVG 图标：莓红底、白色衣架与浅黄色灵感闪光；同一矢量源生成 16、32、48、96、128、192、256、512 像素 PNG，以及 Apple 图标和含 16/32/48 三帧的 ICO。
- 同步侧栏、页头、手机抽屉、公开入口和登录共享版式；手机页头保留品牌名称与图标。
- 更新网页标题、应用名称及八语目录中的 72 处品牌文案；品牌名保持「搭搭」，未误改服装品牌输入字段。
- 图标 URL 使用 `v=dada-20261017`，避开旧图标缓存；移除旧标志的灰度和深色增亮滤镜。
- 保留账号、Cookie、上传队列、收藏与草稿存储键；未改数据、接口、依赖或后端部署。相对上一轮共有 43 个前端文件/资源变化，含 24 份语言目录和 11 份图标文件。

## 验证

| 项目 | 结果与证据 |
|---|---|
| 完整测试 | **87 个文件、842/842 项通过**，0 失败；[输出](./frontend-tests.log)、[JSON](./frontend-tests.json) |
| 类型 | `npx tsc --noEmit --incremental false` 退出 0；[日志](./typecheck.log) |
| 八语检查 | `npm run i18n:check` 通过；[日志](./i18n.log) |
| 代码规范 | `npm run lint` 退出 0，保留 6 条既有警告；[日志](./lint.log) |
| 构建 | `./local.sh build frontend` 成功；构建标识 `qbd8LHJ3IkoNdA9Jk3Fs8`；[日志](./build.log) |
| 图标 | 所有尺寸可解析，ICO 包含三帧；[资产尺寸与摘要](./assets.json)、[ICO 解析](./favicon-formats.txt)。网页实际提供的六种品牌资产与本地源文件摘要一致；[验证](./served-assets.json) |
| 浏览器 | 标题为「搭搭 · 穿搭灵感社区」，图标加载成功且没有灰度滤镜；桌面 1280、手机 320/390 无横向溢出；手机抽屉可打开、关闭；深色主题保持原图标颜色；公开入口未出现旧品牌。该验收时段未捕获 console error；[记录](./browser-checks.json) |
| 独立复核 | 第二位代理只读核对品牌引用、可访问名称、图标与手机显示，未发现可操作问题 |

执行环境为 macOS Darwin arm64、zsh、Docker Desktop。测试命令：`npm test -- --maxWorkers=2 --reporter=default --reporter=json --outputFile=../verification/dada-brand/frontend-tests.json`。源码冻结的 434 个前端文件与资源在构建和验收后摘要一致；[源码清单](./source-manifest.json)。

镜像标签 `wardrowbe-frontend:dada-20261017`，构建与运行 ID 均为 `sha256:ff2467e77aa9598d91d3166eb99acc29fd5da9f041d9f6704914cb392e9287ca`。只重新创建前端容器；后端 ready 仍返回数据库 healthy。[部署输出](./deploy.log)、[服务状态](./services-runtime.jsonl)、[汇总](./SUMMARY.json)。

## 截图

- [桌面首页](./dashboard-desktop.png)
- [深色主题](./dashboard-dark.png)
- [手机首页](./dashboard-mobile.png)
- [手机抽屉](./mobile-drawer.png)
- [公开入口及登录共享品牌版式](./public-entry.png)

## 范围

本轮替换网页品牌。后台通知模板仍沿用上游名称，未在本轮修改或重新发送；内部服务名、包名与上游文档地址保留兼容标识。没有新增公网部署、推送或商标注册声明。本轮没有改业务行为，因此只复用既有回归测试，并更新已有品牌扫描测试的名称样本，没有增加镜像实现的样式测试。

# 全功能测试完善计划

**目标：** 对现有搭搭项目实施完整自动回归和主要业务浏览器验收，修复可复现缺陷，明确外部服务与未实测边界。
**架构：** 沿用 Next.js / React 前端、FastAPI 后端、PostgreSQL / Redis / worker 现有架构；测试数据库使用一次性隔离容器，正式账号保持原记录。
**平台：** macOS Darwin 25.6.0 / arm64 / zsh / 本机 Docker。

- [x] 逐个核对 `frontend/app/dashboard/**/page.tsx`、后端 API 与已有验收记录，保存 `verification/full-function/FEATURE-MATRIX.md`，区分已实现、需外部服务、未验证。
- [x] 后端在隔离 PostgreSQL / Redis / 网络中运行完整 pytest；记录计数、跳过项、mock 边界，修复真实缺陷并补回归。
- [x] 前端检查 3D 工作室、衣柜、真人试衣、保存与本机恢复的状态边界；有可复现缺陷先写失败测试、再做最小修复。前端完整验证命令为 `npm test -- --reporter=json --outputFile=../verification/full-function/frontend-full.json`、`npx tsc --noEmit`、`npm run lint`、`npm run i18n:check` 和 `npm run vocab:check`。
- [x] 通过 Codex 浏览器检查首页、衣柜、3D 衣架/人物、照片试衣、灵感、穿搭切换、搭配与日历、历史、分析/学习及设置入口。执行搜索/筛选、跨页携带选择、收藏与恢复、错误与空状态；不上传私人照片，不新建真实 AI 任务，不点击破坏性删除。
- [x] 如有功能修改，执行当前源码构建、仅更新对应服务，核验镜像/源码清单、服务健康、修复流程和手机布局。没有改动的服务不为形式重复部署。
- [x] 写 `verification/full-function/REPORT.md`：实际覆盖模块、修复、最新自动测试计数、正式浏览器结果、外部重建/模型质量/硬件能力等边界，清理一次性测试容器与临时页面。

验收规则：测试通过仅证明其所覆盖的路径；mock 不等于外部模型实测；照片生成本人360必须有真实重建实现和验证，不能用预设模型替代。正式数据库不清空、不为测试修改密码或导出密钥。

最终结果：前端1166项、后端2255项通过，19个业务路由实测；正式发布与未接入/未实测边界见 `verification/full-function/REPORT.md`。一次性后端容器/网络和临时浏览器页已清理，正式人物页保留。

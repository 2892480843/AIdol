# 搭搭「一件多搭」验收

环境：macOS Darwin 25.6.0 arm64；本地 Node v22.23.2，Docker 前端构建/运行使用 Dockerfile 的 Node 24。仅本机部署，不涉及公网发布。

## 本轮范围

- 首页增加入口，跳到灵感页「一件多搭」。从当前已加载且可使用的真实衣物中选择主角。
- 按主角类型筛选兼容练习，并结合原有搜索、场合、来源、创作者与收藏筛选；数量表示兼容练习，不代表不同搭配数量或审美评分。
- 主角在练习间保持，锁定其换衣控件，可选主角不能跳过；重置其他选件仍保留主角。创作者练习兼容时保留，不兼容时明确提示已取消主角。
- 单品失效或库存加载失败时不提供有效工作室入口。部分库存继续提示加载更多；无结果时仍可重试或加载。选择按账号隔离，仅在当前页面保留，刷新后重新选择。
- 不改数据库、后端接口、AI 模型、密钥、收藏或其他既有存储键，不自动保存或生成。

## 源码与自动验证

| 项目 | 结果 |
|---|---|
| 新行为专项 | 43/43 通过；[focused-tests.json](focused-tests.json) |
| 完整前端测试 | 90 个文件、885/885 通过，零失败零跳过；[frontend-tests.json](frontend-tests.json) |
| 类型检查 | `npx tsc --noEmit` 退出 0 |
| 静态检查 | `npm run lint` 退出 0，6 条已有警告，见 lint.log |
| 八语一致性 | 1631 键；键引用、语言一致性与未翻译扫描均通过，见 i18n.log |
| 独立代码复核 | 未发现 P1/P2；检查了账号和旧回调隔离、主角优先级、部分库存、无结果恢复与种子有效性 |
| 源码冻结 | [source-manifest.json](source-manifest.json)，444 个文件；与上一轮相比 19 个前端文件变化，见 [changed-from-douyin.json](changed-from-douyin.json) |

回归先观察到缺少选择控件导致新增 5 项失败，再实现功能。随后增加创作者兼容行为用例。新纯函数 18 项、账号 hook 5 项、页面新增 6 项，共新增 29 项。整套测试未修改超时或跳过任何项目。完整测试中的 `Not implemented: navigation to another Document` 来自测试环境，不影响断言通过。

## 本机运行与浏览器验收

- 前端镜像 `wardrowbe-frontend:anchor-20261017` 构建成功，构建与运行 ID 一致；构建标识 `9Q8BdQ8sIs-hkTWIM9oC3`。详见 [SUMMARY.json](SUMMARY.json)、build.log 和 deploy.log。
- 只重建并替换 frontend；10 个本项目服务运行，已配置的 backend/postgres/redis 健康检查正常。后端 ready 返回 healthy。
- [10 项浏览器检查](browser-checks.json)：首页入口、T恤主角跨练习、锁定可选外套、跨创作者保留、连衣裙筛选与不兼容提示、真实保存后详情刷新，以及 320/390/830/1280 宽度检查全部通过。
- 演示账号保存「一件多搭验收 · 红色外套 1017」，记录 `bda87073-2fdc-4707-97d7-e37a417c2a9c`。连衣裙、鞋和主角外套共 3 件，约会、manual、未记录穿着日期。浏览器刷新后完整；另用只读数据库查询核对 [saved-outfit-db.json](saved-outfit-db.json)。记录保留供查看，未改动已有造型。
- 构建后 444 个文件摘要再次核对一致。Dockerfile 有 5 条既有 ENV 写法提示，构建退出 0。

截图：[桌面](anchor-desktop.png)、[手机](anchor-mobile.png)、[320窄屏](anchor-mobile-320.png)、[平板](anchor-tablet.png)、[工作室](studio-anchor-three-items.png)、[保存详情刷新](saved-anchor-detail-reloaded.png)。

边界：本轮未调用 AI 模型、未重新验收图片识别等未修改功能。库存与失效验证基于已加载数据；带入工作室和保存仍走原有服务器校验。演示图为已有验收衣物，未冒用博主图片。

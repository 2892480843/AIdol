# 搭搭 · 抖音灵感迭代验收

日期：2026-10-17。**本轮已更新到本机前端容器，88 个前端测试文件、856 项全部通过，并实际完成跳过外搭、工作室保存和刷新后持久化验收。** 范围为前端灵感发现与练习交互；未改后端、模型调用或既有报告。

## 来源与实际落地

从用户提供的抖音穿搭搜索入口核对了以下三个主页及具体作品。详见[调研记录](../../docs/research/2026-10-17-douyin-style-creators.md)与[结构化来源](research-sources.json)。

| 账号主页 | 具体视频来源 | 我方新增练习 |
| --- | --- | --- |
| [盐百万](https://www.douyin.com/user/MS4wLjABAAAArqPU_WLvIM5pin6_H_Ck1kKuptKwqDy2zKbApxwuRuX0ea6o3WXo762no-rFQlTO) | [穿搭配色公式](https://www.douyin.com/video/7655584129869688177) | 让一件彩色单品出场 |
| [蟹煲](https://www.douyin.com/user/MS4wLjABAAAATqlQR24F8_lSDuHzETTXT9ntS9DtyulEVvrMcTTJQVoUTY3QfD3l_8uIaGYB1scB) | [秋冬穿搭技巧：5个懒人搭配口诀](https://www.douyin.com/video/7694687869555022479) | 外搭，跟着温度选 |
| [常鑫](https://www.douyin.com/user/MS4wLjABAAAA9hCZ4YkAyenvy0zXpQ0lmqMX6kpQhucEC-xIpFdNFqru9g_q4YnmL6tMJg2VQLgU) | [穿搭技巧二百三十五课：局部取色法](https://www.douyin.com/video/7687539904575090600) | 让一个细节有回应 |

在原有六条练习上新增三条，**共九条我方练习**。页面支持平台与创作者筛选，并与搜索、场景、收藏筛选组合使用。创作者卡片的站内按钮进入对应练习，原作品和主页保留为独立外链；筛选为空时也可从创作者入口恢复练习，等待面板重新显示后再聚焦定位。

每条练习提供三步说明，使用本账号真实可用衣物；可选位置允许跳过、恢复，跳过项不带入工作室。选件与跳过状态按公式和账号隔离，由用户显式进入工作室继续调整。

## 验证与发布记录

| 项目 | 证据与状态 |
| --- | --- |
| 针对性回归 | **31/31 通过**，见[focused.log](focused.log) |
| 最终全量回归 | **856 项通过、0 失败、0 跳过，88 个文件**，见[JSON](frontend-tests.json)及[日志](frontend-tests.log) |
| 类型、翻译、静态检查 | 均退出 0。八语共 1618 键；代码规范保留 6 条既有警告。[类型](typecheck.log)、[翻译](i18n.log)、[规范](lint.log) |
| 前端镜像 | `wardrowbe-frontend:douyin-20261017` 构建成功；构建与运行 ID 相同，详见 [SUMMARY.json](SUMMARY.json)；构建标识 `IvSIyq1bwR43LfYbUd8vW`，见[build.log](build.log) |
| 真实浏览器验收 | 8 项记录通过，验收阶段 console error 为 0；[browser-checks.json](browser-checks.json) |
| 冻结源码 | [438 个文件的源码快照](source-manifest.json)；构建后摘要一致，未发生源码漂移 |

镜像 ID：`sha256:77dd3f2d7430f389169713bc8b21e58baf55d772c35fbd2fa06db778d626bf5d`。全量测试命令为 `npm test -- --maxWorkers=2 --reporter=default --reporter=json --outputFile=../verification/douyin-style/frontend-tests.json`。本轮较上一版改动 20 个前端文件/资源，见 [changed-files.json](changed-files.json)。

### 真实浏览器与数据核对

1. 从首页能看到盐百万、蟹煲、常鑫对应的三个新入口。灵感来源选“抖音”后仅显示这三条练习；再选蟹煲后只显示对应练习。
2. 输入无结果词后，点创作者“看Ta的练习”能恢复面板，焦点实际位于 `practice-panel`；没有留在页面底部的旧问题。
3. 外搭练习显示三个具体步骤。可选外搭默认参与时是 4 件，跳过后 3 件，恢复再回到 4 件；必需类别覆盖一直为 3/3。最终工作室参数没有外搭 ID。
4. 工作室预选三件、场合办公，显式保存 `抖音灵感验收 · 可选外搭 1017`，打开详情并刷新后仍为 3 件。数据库只读核对 `source=manual`、`scheduled_for=null`、关联 3 件，且不含被跳过的外搭；[查询结果](saved-outfit-db.json)。验收记录 `f33e1149-fd18-4b52-be1c-a479998b1f98` 保留供查看，未删除。
5. 新公式 `easy-layers` 收藏后刷新，收藏视图仍可看到。此条验收收藏保留；旧收藏没有覆盖。多候选手动换衣和账号切换由组件/Hook 回归覆盖；演示账号每类只有一个候选，不将本次浏览器验证写成多候选换衣测试。
6. 桌面 1280、平板 830、手机 390/320 均无横向溢出，手机深色主题可读。临时视口和深色设置已恢复；独立验收页保留为交付，未刷新用户原页面。

截图：[来源筛选](douyin-discovery-desktop.png)、[三步练习](practice-desktop.png)、[跳过外搭](optional-skipped-desktop.png)、[工作室三件预选](studio-three-items.png)、[保存后刷新](saved-three-items-reloaded.png)、[首页](home-desktop.png)、[手机首页](home-mobile.png)、[手机发现](discovery-mobile.png)、[手机练习](practice-mobile.png)、[手机深色](practice-mobile-dark.png)、[平板](practice-tablet.png)、[新练习收藏刷新](new-bookmark-reloaded.png)。

### 运行状态与构建期间事件

只重新创建前端容器；项目 10 项服务最终均运行，后端、PostgreSQL、Redis 三项已配置健康检查均 healthy，后端 ready 返回数据库 healthy。[部署](deploy.log)、[最终服务状态](services-runtime.jsonl)、[ready](backend-ready.json)。

构建期间曾出现后端健康检查启动或请求超时；[当时状态](backend-health-during-build.json)。当时本机 16 GB 内存、交换空间使用较多，资源压力可能相关，但未证明唯一根因。没有放宽健康阈值或重启后端；构建结束后原服务自行恢复，最终重新核验 healthy 和真实保存成功。以上不作为未经证实的根因修复声明。

工作环境为 macOS Darwin arm64 与 Docker Desktop，仅本机部署；没有新增公开发布或本轮 Git 推送。历史全后端测试没有重跑或冒充本轮结果。

## 适用边界

收藏仅保存在同一浏览器，未新增云端同步；筛选和选件为当前页面临时状态，刷新不保证保留。匹配依据是衣物类别及可用状态，颜色只是辅助提示，**不代表风格评分，也不判断真实照片的明度、版型或上身效果**。

调研仅覆盖公开标题、文案与部分可见帧，未完整观看或验证完整教程。三条新增练习是我方改编；未复制、下载博主媒体，未用其训练模型，也不表示作者合作、授权或背书。

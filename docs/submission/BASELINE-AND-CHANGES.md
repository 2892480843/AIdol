# 赛前状态、第三方基础与 48 小时新增

## 赛前状态

队长于 2026-10-18 本次交付会话明确确认：**赛前团队成果为零，没有已有项目或源码成果。** 当前未提供组委会赛前存档回执；此处是队长的事实声明，不冒充主办方已认证的存档。

作品在比赛窗口中引入了第三方开源项目并继续开发。“团队从零开始”不表示团队原创了第三方原有功能。比赛窗口按提供的比赛要求为 2026-10-17 至 2026-10-18；本地 Git 时间用于追溯开发，不替代主办方回执。

## 第三方基础（不计作团队原创）

引入 [Anyesh/wardrowbe](https://github.com/Anyesh/wardrowbe)，上游基础提交 `cfbb5a9`（完整编号可由 `git rev-parse cfbb5a9` 获取）。它已经提供衣橱管理、AI 识衣与推荐、穿着记录、家庭、统计及通知等能力。保留仓库 MIT 许可证、原作者版权与贡献记录。Next.js、React、FastAPI 等依赖及三维资产各自适用原许可。

## 比赛窗口内团队开发与集成

| 模块 | 团队新增或改进 | 可核查源码/材料 |
|---|---|---|
| 产品界面与搭搭品牌 | 首页重组、八语文案、桌面与手机布局、基础组件和灵感工作区 | `frontend/app/`、`frontend/components/`、`frontend/messages/` |
| 云桥模型接入 | 识图、推荐与试衣模型接入；响应格式适配、有限重试、中文输出 | `backend/app/services/model_gateway.py`、`tryon.py` |
| 持久推荐任务 | 进度、恢复、取消、重试、重复请求复用、事务发件箱 | `backend/app/tasks/`、`backend/app/api/tasks.py` |
| 私有图片与账号边界 | 存储适配、图片签名、账号切换清理、来源衣物归属校验 | `backend/app/storage/`、`studio_service.py`、`frontend/app/providers.tsx` |
| 风格发现与一件多搭 | 分类搜索、原创虚构人物示范、创作者方法参考、衣橱练习 | `frontend/components/looks/`、`frontend/components/inspiration/` |
| 三维衣柜与造型 | 衣架交互、预设人物与高模资产集成、造型收藏、360°本地录制 | `frontend/components/wardrobe-3d/`、`avatar-studio/`、`frontend/public/models/` |
| 真人照片试穿 | 单件/多件衣物引用、显式同意、私有任务与前后对比 | `backend/app/api/tryon.py`、`backend/app/services/tryon.py`、`frontend/components/fitting-room/` |
| 照片衣物提取 | 服务器本地人体分割模型集成、透明衣物预览与审核保存 | `backend/app/services/clothing_extraction.py`、`frontend/components/clothing-extraction/` |
| 公网部署与留证 | 独立 Linux 部署、测试账号、源码摘要、功能验收及交付材料 | `ops/server-6780/`、`verification/`、`docs/submission/` |

以上包括集成与修复，不将模型训练、开源组件、Tripo 生成服务或上游软件的原有实现声明为团队原创。本人照片一键生成本人360°三维尚未接入，不能列作已完成成果。

## 可复现核查

```bash
git log --date=iso-strict --format='%H %ad %s' cfbb5a9..aidol-final-20261018
git diff --stat cfbb5a9 aidol-final-20261018 -- backend frontend ops docs
git show aidol-final-20261018:README.md
```

上游提交用于计算第三方代码与本次扩展的差异，不是“团队赛前版本”。

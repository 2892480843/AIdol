# 功能模块与实现索引

| 模块 | 功能 | 源码与材料 |
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

## 功能边界

数字形象使用预设三维人物；个人照片生成本人完整三维形象尚未接入。照片试穿为二维生成效果，衣物提取不补全遮挡区域。

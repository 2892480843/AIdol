# 搭搭 · AI 衣橱与穿搭助手

云上码术队 · 京东 Aidol 创造营 S2 冒险季

搭搭是一款围绕日常穿搭打造的 AI 衣橱应用。把已有衣物整理进衣橱，根据天气和场合获得搭配建议，从风格灵感中找到新思路，再通过照片试穿和三维衣柜查看不同造型。

## 主要功能

| 功能 | 说明 |
|---|---|
| 智能衣橱 | 上传衣物照片，识别类型、颜色与风格，支持搜索、筛选和分类管理 |
| 推荐搭配 | 结合衣橱、天气和场合生成搭配，保存推荐结果并查看任务进度 |
| 穿搭灵感 | 浏览穿搭思路，围绕已有单品练习一件多搭 |
| 风格发现 | 按风格探索造型、配色和搭配建议 |
| 照片试穿 | 上传人物照片并选择衣物，生成二维试穿效果图 |
| 三维衣柜 | 旋转查看衣柜，浏览单品并挑选搭配 |
| 数字形象 | 切换预设三维人物与造型，调整视角和灯光 |
| 穿搭记录 | 保存搭配、安排日历，查看衣橱数量、配色与类型统计 |

## 在线体验

| 项目 | 地址或说明 |
|---|---|
| 体验入口 | [打开搭搭](https://124.70.96.183:6780/dashboard) |
| 访问方式 | 无需输入账号密码，自动进入演示账号；访客共用演示数据 |
| 使用设备 | 支持桌面和手机浏览器，复杂三维场景建议使用桌面浏览器 |
| 代码仓库 | [2892480843/AIdol](https://github.com/2892480843/AIdol) |
| 发布版本 | [查看发布记录与下载附件](https://github.com/2892480843/AIdol/releases) |

最新源码以 `main` 分支为准。演示服务计划维护至 **2026-11-10**。

## 当前界面

以下图片于 **2026-10-19** 从当前公网演示版实拍，点击图片可查看原图。

### 穿搭日常

![搭搭拼贴风格首页](docs/images/latest/home.png)

### 衣橱与推荐搭配

| 我的衣橱 | 已完成的推荐搭配 |
|---|---|
| ![衣物管理与分类](docs/images/latest/wardrobe.png) | ![已保存的穿搭推荐](docs/images/latest/recommendations.png) |

### 穿搭灵感与风格发现

| 穿搭灵感 | 风格发现 |
|---|---|
| ![一件多搭与衣橱练习入口](docs/images/latest/inspiration.png) | ![风格分类与原创模特示范](docs/images/latest/styles.png) |

### 照片试穿与三维衣柜

| 照片试穿 | 三维衣柜 |
|---|---|
| ![演示账号已生成的照片试穿结果](docs/images/latest/tryon.png) | ![立体衣柜与衣物查看](docs/images/latest/wardrobe-3d.png) |

### 衣橱数据

![衣物数量、配色与类型统计](docs/images/latest/analytics.png)

### 手机端

<img src="docs/images/latest/mobile.png" alt="390 像素宽度的手机端首页" width="320" />

## 技术架构

| 模块 | 技术 |
|---|---|
| 网页与交互 | Next.js、React、TypeScript、Mantine |
| 三维展示 | Three.js |
| 后端接口 | FastAPI、Python |
| 数据存储 | PostgreSQL、SQLAlchemy |
| 后台任务 | Redis、ARQ |
| 衣物识别与推荐 | Qwen3.8-max、Doubao-Seed-2.0-Mini |
| 照片试穿 | Doubao-Seedream-5.0-lite |
| 图像处理 | SCHP、ONNX Runtime、u2net / rembg |

## 本机运行

按照[运行说明](docs/submission/RUNNING.md)准备配置、构建镜像、初始化数据库与模型后启动：

```bash
./local.sh up -d
./local.sh ps
curl -fsS http://localhost:18000/api/v1/health/ready
```

本机访问地址：`http://localhost:3000`。

## 部署与文档

- [本机部署](LOCAL-DEPLOYMENT.md)
- [服务器部署与维护](ops/server-6780/README.md)
- [配置与模型说明](docs/submission/DEPENDENCIES.md)
- [功能矩阵](verification/full-function/FEATURE-MATRIX.md)

## 使用说明

- 演示账号的数据由访客共用，请使用演示素材体验。
- 照片试穿生成二维效果图；数字形象使用预设三维人物。
- 衣物提取保留照片中可见的区域，遮挡部分不会自动补全。
- 云端生成功能需要网络和可用模型额度；摄像头与麦克风功能需要浏览器授权。

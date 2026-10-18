# 拼贴艺术风：已完成并更新本地前端

当前运行地址：http://localhost:3000/dashboard。镜像 `wardrowbe-frontend:collage-style-20261018-r4`，构建 ID `PEQRW1j-iBdLB73DZbCPA`。

## 变更
- 按用户 Collage Art 附件统一米白纸张、红蓝黄紫色块、方角、硬偏移阴影、混搭字体、条纹胶带、撕纸装饰与错落纸片构图。
- 覆盖首页、导航、共享按钮/输入/卡片/弹窗、衣橱、灵感、试穿和 3D 展示外围界面；保留减少动态效果设置。
- 修复原有 Next Image fill 与 style.width 冲突：将图集裁切尺寸移到外层容器，保留原图、裁切比例和清晰度。真实 getImageProps 校验先失败 5 项，修复后通过。
- 限制构建并发为 2，静态生成等待 300 秒，避免本机资源争用导致默认 60 秒超时；仅影响构建。
- 没有更改后端、数据库、权限、照片/语音授权流程、模型资产、3D 场景渲染或新增依赖。

## 验证
| 验证 | 结果与证据 |
|---|---|
| 核心回归 | 8 个文件、76 项通过，tests-final.log |
| 衣橱与风格发现补充回归 | 2 个文件、19 项通过，radius-regression.log；与核心回归部分重叠，不相加统计 |
| 类型 / 核心文件静态检查 / 语言检查 | 通过，tsc-final.log / lint.log / i18n.log |
| 正式构建 | 完整 Next.js 构建退出 0，27/27 页面生成，build-native.log |
| 风格约束 | 146 个源文件无禁用圆角类、平滑渐变或 backdrop blur；style-audit.json |
| 文字对比度 | 13 组语义色对全部通过，最低 4.67；semantic-contrast.json |
| Linux 路由检查 | 首页、衣橱、试穿、数字形象、3D 衣柜、风格发现、灵感共 7 个路由返回 200；linux-preview-smoke.json |
| 实际生产页面 | 首页数据 8 件衣物 / 15 条搭配显示正常；“下一套”从 1/4 切至 2/4 酒红拼色运动套装 |
| 添加衣物弹窗 | 可打开、取消；方角 0px，硬影 5px，窄屏 padding 20px 16px，overlay backdrop-filter none；dialog-final.json |
| 390px 小屏 | 首页与试穿页 clientWidth=scrollWidth=390；mobile-final.json / mobile-final.png |
| 浏览器错误 | 本轮生产检查 0 条；browser-console.json |
| 天气回归 | 未设位置时本轮 weather/current 请求 0，400 为 0；weather-runtime.json |
| 发布绑定 | 601 个源文件与 manifest 一致，镜像标签匹配，无挂载覆盖；runtime.json |
| 资源保真 | 68 个公开资源逐字节校验一致；两个 3D scene.tsx 源文件哈希与前版一致 |
| 差异格式 | git diff --check 通过 |

## 构建与发布边界
原全量 Docker 构建通过编译和类型检查，但高并发页面生成出现默认 60 秒超时，包括 /404 与 /500。已结束该轮，保留 build-r3.log 与完整编译缓存 build-cache.tar。调整构建并发/等待后，在已验证的 macOS Darwin arm64 本机完成正式构建，所有页面成功生成。

使用 build-runtime-overlay.py 将 520 个生成的 JS/CSS/页面清单和 server.js 打入现有 Linux 运行镜像。package.json 与 package-lock.json 与原运行版本哈希一致；Linux 依赖和公开资产保留，未复制任何本机 node_modules 或原生二进制。压缩构建包 3432556 字节。实际运行平台 linux/arm64，已完成浏览器与资源校验。源清单 SHA256：6f6245b7b27295105cd7eb7cb733a0c6e01101e58fc579364d4cb63415ed3884。

构建中的已有检查警告未隐藏：搭配日历 useMemo 依赖、上传弹窗 ref 清理与 img 提示、单品详情 useEffect 依赖。核心改动文件的独立检查通过。早期默认 5 秒测试曾有 3 项超时；保持原断言、统一使用 20 秒等待后最终完整 76 项通过。

## 截图与范围
正式页面截图：home-final.png、dialog-final.png、mobile-final.png。旧 dialog-preview.png 是修正弹窗前的中间记录，不是交付证明。临时浏览器页、3002 预览服务及 3001 检查容器均已关闭；保留用户的正式首页。

本轮未重新调用上游 AI 生成，也未测试摄像头/麦克风硬件；未上传或保存测试衣物。未提交或推送当前工作区。

# 潮流风格发现验收记录

日期：2026-10-17 至 2026-10-18（Asia/Shanghai）。环境：macOS Darwin 25.6.0 arm64、zsh、Docker Desktop。本轮仅更新前端；已在本机发布并完成以下范围验收。

## 交付范围

- 六类工作标签：街头机能、运动休闲、日系 Cityboy、清爽极简、复古学院、法式松弛。每类两套，共十二套完整造型。
- 发现页增加摄影主视觉、参考配色、搭配思路、试穿提示，分类与当前语言关键词搜索取交集；无结果可重置。
- 分类保存在 `style` URL 参数，可刷新或分享；未知值按全部显示。搜索只保留在当前页面。
- 选择任一造型打开整套预览，保持点击项为初始造型，切换和比较仅使用当前筛选结果；支持 Escape 关闭并回到触发按钮，尊重减少动态效果偏好。
- 衣橱入口接到已有的有效搭配练习；首页精选改为街头、运动、复古、法式四套，新页与首页复用照片组件。
- 示范在主视觉前明确标注原创 AI；原有本机实穿相册和私有 AI 结果保持原工作流。

## 素材与依据

新增8套为同一位原创虚构成年模特，两张2×2图集，每张1024×1536、单格512×768，头部与鞋完整。新 WebP 分别140006与144558 bytes；只做格式编码，未用程序重绘或复制博主人像。提示词、原图和路径见 [IMAGE-ASSETS.md](IMAGE-ASSETS.md)。

六分类是便于探索的编辑标签，允许交叉，不是热度排行、功能认证或体型判断。品牌与时尚媒体公开正文参考及单来源边界见 [研究记录](../../docs/research/2026-10-17-style-discovery.md)。未把品牌参考图放入产品。

## 自动验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 数据与搜索 | 14项通过，先红后绿 | domain-checks.md、domain-tests.log |
| UI及周边回归 | 37项通过，包含上述14项与旧流程；新增预览时序问题先红后绿 | ui-checks.md |
| 首页定向回归 | 11项通过；后续小文案改纳入最终全量 | home-tests.json |
| 八语检查 | 1763键一致，键检查与未翻译扫描通过 | i18n.log |
| 完整前端测试 | 97个文件、949项通过，0失败、0跳过 | frontend-tests.json、frontend-tests.log |
| 类型、静态与格式 | 定向及全局类型通过，局部ESLint无警告；生产构建另记录 | ui-checks.md |
| 生产构建 | R1和弹窗高度CSS修正后的R2均退出0；6条原有应用警告及5条原有Docker ENV写法提示 | frontend-build.log、frontend-build-r2.log、build-warning-comparison.json |

独立复核发现并修复：用户点击分类后立即打开预览，延迟到达的同分类 URL 确认不应关闭弹窗；真正外部分类变化仍关闭预览并更新分类。见新时序回归测试。除此未见未处理的 P1/P2。

## 本机发布与浏览器验收

以下交互在R1生产页面验证；R2仅修改预览照片的最大宽度。R2重新验证了全部十二套、街头分类、第二套初始位置、下一套、分类内对比、全部十二套对比、关闭和焦点返回、图片加载，并补充了桌面与手机弹窗几何测量及截图。

| 路径 | 真实浏览器结果 | 证据 |
| --- | --- | --- |
| 六类筛选与URL | 六类各两张，选中状态及参数正确；法式分类刷新恢复 | category-checks.json、french-desktop.png |
| 搜索与恢复 | 法式“条纹与红”一张；无匹配零张且有重置；重置恢复全部十二张 | search-empty.png |
| 整套预览 | 第二套起始为2/2，下一套为1/2；比较仅包含本分类另一套 | preview-compare.png（修正前，保留问题证据） |
| 键盘 | Escape关闭后焦点回到“看这套: 橄榄色外套”触发按钮 | 浏览器DOM检查 |
| 衣橱练习 | 街头入口进入balance练习，已加载5件衣物、3/3所需位置及工作室入口 | practice-link.json |
| 原有实穿与AI | 原实穿图1024×1536、旧成功试衣结果1365×2048正常加载 | existing-photo-checks.json |
| 首页 | 四套精选，首图街头，下一套运动；风格发现入口正常 | home-styles.png |
| 页面适配 | 320（全部与街头）、390、830、1280宽度均无横向溢出 | responsive.json、all-320.png、street-390.png、street-830.png |
| 图片加载 | 十二张卡片及主视觉均已加载，保留原实穿与AI图片 | image-loading.json |

重置到无查询参数URL时一次浏览器导航等待超时，随后直接读取URL、搜索值和卡片数量均正确，未重复触发重置；未发现对应产品故障。控制台错误列表为空。

浏览器另发现720px高窗口中的对比弹窗照片过高，点击底部控件会把照片头部滚出视口。最小修正仅限制发现页弹窗中2:3照片的宽度，按可用视高预留标题和控件空间。949项全量测试在此CSS修正前执行，修正后以生产构建及真实浏览器尺寸验收补充，不宣称重新执行全量测试。独立静态复核未发现新的确定性P1/P2。

最终R2布局证据（`modal-final.json`）：

- 1280×720：街头两套和全部十二套的比较弹窗均高624px，顶部46.98、底部673.02，照片及控件同时完整显示，无弹窗内部滚动；十二个数字按钮均存在。
- 320×740：全部十二套比较弹窗宽286px、高658px、顶部39.88、底部700.12；数字按钮分三行，照片和控件均可见；页面滚动宽度320，无横向溢出。
- Escape关闭后弹窗数为0，焦点返回第十二套触发按钮。临时视口覆盖已复原。
- 最终截图：`all-styles-final.png`、`preview-compare-final.png`、`preview-all-mobile-final.png`。已逐张目视检查；前者显示六类与十二套，后两者确认头部、鞋和控件完整。
- 最终浏览器错误列表为空，见 `browser-errors-final.json`。验收未接触用户另一个尚有表单输入的标签页。

最终运行身份：

| 项目 | 实测值 |
| --- | --- |
| 前端镜像 | `wardrowbe-frontend:styles-20261017-r2` |
| 前端镜像ID | `sha256:f8e2e808e6217a6524a6b01f7b393da873bab347e22cfd182277533be5b0c177` |
| Next.js BUILD_ID | `iCDv5Igmn15gLrOx3xvVQ` |
| 源文件清单SHA256及运行标签 | `81486e2668e3451f56ba0ed3627660dcfff65def5cf2ada971a0061a0175c9af`，两者一致 |
| 后端镜像 | `wardrowbe-backend:tryon-20261017-r2`，保持上一轮运行版本 |
| 后端镜像ID | `sha256:bfdd438346b65c441a2431d9d21f03cfd5f7894cf3d67f53f1273eadd6d3d105` |
| 服务状态 | 项目10个服务均running；backend、postgres、redis的已配置健康检查均healthy，其余未配置健康检查 |
| 就绪接口 | `GET /api/v1/health/ready` 返回healthy，database healthy |

构建使用 `docker build --progress=plain --label com.dada.source-manifest-sha256=81486e2668e3451f56ba0ed3627660dcfff65def5cf2ada971a0061a0175c9af -t wardrowbe-frontend:styles-20261017-r2 ./frontend`；成功后执行 `./local.sh up -d --no-deps --no-build frontend`，仅重建前端容器。见 `rollout-r2.log`、`runtime-images.txt`、`frontend-build-id.txt`、`runtime-manifest-label.txt`、`services-final.jsonl`、`health-final.json`。

源文件摘要见 source-manifest.json；472项前端文件，不含依赖、构建缓存、私有环境文件与认证配置。后端与上一轮已核验源文件摘要逐一一致，无新增数据库迁移、后端构建或试衣生成请求。

最终再次逐项比对472个前端文件，0项不一致；运行镜像标签对应同一清单。通过只读数据库查询比对前后试衣任务元数据，均为原2条且ID、状态、创建时间逐项一致，见 `final-consistency.json` 与 `tryon-tasks-before.json` / `tryon-tasks-after.json`。未打印凭证或完整环境配置。

## 交付边界

- 风格是示范分类；未自动给用户衣物或私人照片分类。
- “用我的衣橱试试”进入已有搭配练习，仍需用户按实物颜色、版型、天气自行调整；不宣称精准风格匹配或已拥有整套。
- 原有AI能力仍是单件上装模拟，不包含连续换装视频、整套多件自动试衣或尺码判断。
- 本轮未修改用户主题偏好，未向现有云桥试衣接口提交新任务，未推送新Git提交。两张原创示范素材通过内置图片生成工具制作，详见素材记录。

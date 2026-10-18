# 精修人物升级验收

2026-10-18，macOS Darwin arm64。本轮针对人物外观重新制作模型，没有将参考图片当作三维交付。

## 结果

- 新增成年原创男女精修人物，默认进入精修系列；原始造型、街头造型与已有收藏保留原标识和文件路径。
- 参考图使用内置 `image_gen` 工具创作，项目副本为 `female-reference-v2.png`、`male-reference-v2.png`；完整英文提示词分别保存于 `female-reference-prompt.txt`、`male-reference-prompt.txt`。这些参考图只是建模输入，验收截图来自实际 GLB 渲染。
- 女模进行了多视图 A 与原图增强 B 的实际网格比较，选用眼周、嘴唇更干净的 B。男模使用原图增强。实际参考、提示词、任务与源文件哈希见 `generation-manifest.json`。
- 原始模型约 194–199 万面，网页版本约 15 万面。桌面保留 8K 主颜色贴图，手机/不支持 8K 的设备选择 4K 主颜色版本；其他贴图不做无意义放大。
- 修正生成材质的塑料反光：金属度为 0，粗糙度绿色通道最低 174/255；没有重绘主颜色。几何、纹理坐标、顶点法线、索引与各自导出源文件逐字节相同。
- 新增全身/面部细节视角，保持同一个真实模型，支持重置、旋转和导出；缩略图均来自项目渲染器中的实际人物。
- 使用已有 Tripo 积分 210，余额 20825 → 20615，没有购买、开通新订阅或上传私人照片。

## 验证

| 层级 | 结果 | 证据 |
|---|---|---|
| 前端全套 | 122 个文件、1262 项通过 | `frontend-final.log` / XML |
| 最终资产 | 14 项通过，含新增两张缩略图的格式/尺寸检查 | `asset-final.log` |
| 类型、静态、多语言 | 通过；静态检查有既有警告；8 种语言 2137 个键一致 | `types-final.log`、`lint-final.log`、`i18n-final.log` |
| 生产构建 | 通过 | `build-final.log` |
| 运行内容 | 587 份源码/构建文件、63 份公共资源一致，零差异 | `runtime.json`、`runtime-final.log` |
| 浏览器 | 正式页面 1280×960、390×844、320×844，无横向溢出或错误提示；正侧背、细节、性别/三套切换正常 | `production-*.png`、`refined-models-contact.jpg` |
| 收藏 | 保存“精修人物 · 奶油甜酷”，刷新后与旧街头收藏互相恢复正常 | 正式页面本机造型册 |
| 视频 | 新模型实际录制成功，预览 readyState=4、490×590、无媒体错误，录制期间控制锁定后恢复 | 浏览器实际预览；下载工具没有返回新文件路径，不将旧下载文件当成本轮证据 |
| 独立复核 | 缩略图缺失已修复；14 项资产测试通过，粗糙度像素与几何保真另行复核通过 | `beauty_release_review` |

目录、相机与界面行为均观察到预期失败基线后修复；生成资产采用文件结构、哈希、真实渲染与目视比较验收。首次单文件检查误在仓库根目录运行导致路径错误，改用 frontend 工作目录后 14 项通过。测试过程中 Studio 高模占用资源时出现超时，卸载预览后相关 53 项及全套检查通过。

## 运行版本与复现

镜像：`wardrowbe-frontend:avatar-beauty-20261018-r1`

- Image ID：`sha256:3366ccf5400c66d0ed321b7a31b90a3875e95d20a2376ce518a4df668bd865aa`
- Build ID：`M3C86VyNzFijH562YxFI7`
- 源码清单 SHA-256：`a0925780a5b71ebb3ce350378ca6bb7217eb027b543df0fe5c92a85e992aa461`
- 后端、数据库和衣物数据没有变更。本次新增一条本机精修造型收藏。
- 回退镜像保留：`wardrowbe-frontend:tripo-series-20261018-r3`。

在仓库目录执行：

```sh
python3 verification/avatar-beauty/package-models.py
python3 verification/avatar-beauty/finish-assets.py
python3 verification/avatar-beauty/build-release.py
./local.sh up -d --no-deps --no-build --pull never frontend
python3 verification/video-quality/release.py runtime --output-dir verification/avatar-beauty
```

源 GLB 在本地 `originals/` 中保留并忽略提交，公开网页文件与生成追溯说明位于 `frontend/public/models/avatar/beauty-v2/`。

## 质量边界

这版改善了脸部、头发造型、身材比例、站姿和布料反光，但发丝边缘和指尖仍有局部生成痕迹。没有把面数、贴图规格或通过单元测试当作“完全达到参考视频品质”的认证。人物仍是固定姿态完整造型，不宣称能够任意拆换单件衣服或做骨骼动画。视频下载的新本地文件路径在本轮浏览器工具中未确认；生成与预览已确认，需区分二者。

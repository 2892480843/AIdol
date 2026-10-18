# 高质量穿搭系列与真实 360° 视频

2026-10-18；macOS Darwin arm64。正式入口：http://localhost:3000/dashboard/wardrobe/avatar 。

## 交付范围

- 重新核对用户 WOO 参考视频：精致全身人物、360°查看、完整穿搭切换、日期收藏、照片试穿与照片生成本人三维分别验收。
- 已在授权 Tripo Studio 账号中制作新街头女款与男款。与上一轮合计男女各两套完整高质量三维造型；原六类样衣混搭继续独立提供。
- 新参考图由内置 image_gen 对原原创成年虚拟人物进行服装编辑并目视检查，未上传私人照片。最终图片及精确提示词见本目录 `*-street-reference.png` 与 `*-reference-prompt.txt`。三维生成在 Studio 完成，参考图不冒充三维结果。
- H3.1、超清几何、200万面目标、8K基础贴图、PBR、去光。新女模实际1,990,038面，男模1,969,594面；分别导出原始高模与十万面网页版本。桌面4K、手机2K贴图，保留真实网格、法线和材质。源文件在忽略目录 `originals/`，公开资源哈希见 `frontend/public/models/avatar/editorial-v1/PROVENANCE-STREET.json`。
- 本轮使用已有140积分：生成各65、重拓扑各5；余额20965→20825。无新购买或订阅。任务ID、原始字节与哈希见 `generation-manifest.json`。

## 实际功能

1. 高模模式左右循环与缩略图可选择具体三维文件，男女各两套。新造型ID加入加载身份，旧加载取消/迟到不会覆盖新选择；同一性别/模式换装保留渲染器，减少上下文重建。
2. 收藏保存具体高模造型ID，旧记录无此字段时恢复原款；样衣模式不受新ID干扰。个人原衣物与已有记录保留。
3. 新增真实六秒360°视频录制与预览下载入口。录制浏览器当前三维画布，完整转一圈后恢复视角与背景；不使用摄像头、麦克风或屏幕共享。
4. 录制期间锁定页面表单控制；隐藏页面、改变模型、画布失效、卸载或改变尺寸会中断。未完成整圈或没有编码数据时明确失败，不发布部分视频；失败后保留模型和PNG导出。
5. 首次正式页验收发现导出按钮在画布下方，滚动后错误拒绝录制。已保存失败回归 `video-scrolled-red.log`；修复为允许显式录制已加载但滚出视口的画布，仅暂停普通不可见渲染。页面切到后台仍会中断。进一步修复从页面底部恢复收藏时，新模型没有可见帧而一直处于准备状态的问题：不可见模型也允许一次初始化渲染，之后仍停止普通后台渲染；失败回归见 `video-offscreen-initial-red.log`。

## 代码与生成资产验证

| 项目 | 结果 |
|---|---|
| 前端完整回归 | 122个文件、1255项通过；`frontend-final.log` / `.xml` |
| 失败基线 | 新目录、页面切换、提前结束视频、滚出视口录制均有对应 red 日志 |
| 类型检查 | `types-final.log`，退出0 |
| 静态检查 | `lint-final.log`，退出0；既有非阻断警告保留 |
| 多语言 | 8语言2133键一致，扫描通过；`i18n-final.log` |
| 资产 | 8份高模GLB实际哈希、完整二进制长度、嵌入纹理、PBR、面数、无无效骨骼检查通过 |
| 真实GPU | 新男女模型正面/侧面/背面已检查；`street-models-contact.jpg` 来自同一实际网格的三种视角 |
| 视频实证 | 浏览器实际录制文件 `actual-turntable.webm`，VP9、857×1120、180帧、2,137,550字节；`video-verification.json` |
| 分享预览副本 | 由上述实际录制转换的 `actual-turntable.mp4`，858×1120（补1像素以满足编码）、6.000秒；没有重绘人物或替换动画 |

视频编码依据：[MDN canvas captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)、[MediaRecorder.isTypeSupported](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)。浏览器支持判断不代替实际录制验收。

独立代码审查发现“编码器提前stop会被视为完成”，已加入 completedOrbit 校验和实际失败回归。录制文件由仅监听127.0.0.1的临时同源验收工具保存，用于ffprobe解码；不将该工具冒充正式产品流程。正式页面另行验收。

## 部署与浏览器验收

最新发布以 `build.json`、`runtime.json`、`runtime-assets.json`、`browser-verification.json` 为准。使用 `build-release.py` 打包全部公开资源，构建期与运行时均逐文件检查实际字节；原镜像保留。最终镜像 `wardrowbe-frontend:tripo-series-20261018-r3`，Build ID `UzwcnhKW-bCDGgvHmGEZr`；54份公开资源及578份前端来源文件校验一致，无挂载。桌面正常模式的男女原款/街头款、快速切换、旧样衣收藏与新高模收藏刷新恢复均已复测；6件原衣物保留。390和320宽度的文档宽与scrollWidth一致，人物全身单屏检查通过，见 `production-mobile*.png`。新高模缩略图两张均实际解码为160×220。

正式页从底部恢复收藏后录制成功，控件在录制期间禁用，完成后恢复；实际下载 `dada-360-2026-10-18.webm` 已收到并归档为 `production-turntable.webm`：490×590、VP9、181帧、1,745,766字节。解码见 `production-video-verification.json`。分享副本 `production-turntable.mp4` 仅转为H.264，没有放大或更换人物。该实际文件证明下载完成，不再把浏览器自动下载事件超时等同于无法落盘。

一次全页长截图后观察到临时空画布；未确认该长截图操作的影响。正常重新载入、样衣到高模恢复及可见区域单屏截图均复测可见，未把空白长截图作为通过证据。最终截图 `production-female-street-final.png` 和 `production-male-street.png` 使用可见区域捕获。

## 尚未完成的参考视频能力

- **个人照片在本应用一键生成本人360°三维：未接入。** 已有 Studio 网页登录可以人工生成模型，但不能作为应用开发者API密钥。已询问用户是否有专用接口凭据；尚未收到，不读取或复用网页登录令牌。官方[开发者认证文档](https://developers.tripo3d.ai/en/docs/introduction)明确要求API Key，[Studio/API说明](https://www.tripo3d.ai/help/api-plugins/tripo-studiotripo-api)明确两者额度独立；本轮未购买API额度。当前“用我的照片试穿”仍是独立二维试衣能力。
- 新高模是固定姿态的完整生成造型，不能任意替换某一件三维衣物，也没有关节动作。已有样衣混搭是另一模式；独立生成任务的人脸细节可能有差异，不宣称完全一致的本人重建。
- 模型审美与参考视频是否等同仍需实际视觉比较。本报告不把面数、8K参数或测试数量等同“所有视频效果已达到”。

无后端代码改动、数据库迁移或用户数据删除。没有将上一轮2282项后端回归冒充本轮重跑结果。未提交或推送Git。

# 真实三维时装资产 v2 交付记录

日期：2026-10-18。运行环境：本机 macOS（Darwin）、Blender 5.1.2、MakeHuman/MPFB 离线工具。未提交、未推送；原版 GLB 未覆盖。

**两性资产、目录、许可与可复现脚本已发布；结构校验通过。主任务已完成 12 套真实场景缩略图并查看总览无进一步阻断，实际 reload 确认女性针织领口修复干净。完整角度矩阵与最终生产构建以主任务记录为准，本报告不将离线渲染等同于线上验收。**

## 发布身份

GLB 是把三维网格、骨骼和贴图封装到一个文件的格式；骨骼蒙皮指衣物和身体能随关节姿态共同变形。

| 文件（相对仓库根目录） | 字节数 | 骨骼 | 网格节点 | 嵌入图片 | 法线贴图材质 |
|---|---:|---:|---:|---:|---:|
| `frontend/public/models/avatar/v2/female.glb` | 18,729,540 | 53 | 18 | 15 | 4 |
| `frontend/public/models/avatar/v2/male.glb` | 11,790,748 | 53 | 14 | 12 | 2 |

SHA256（文件内容校验值）：

- female：`8817471e3f5fe71b96fcd8eb15c246a523b33b0b3b22a575d8d93e389ec5e458`
- male：`da18c1d0e28ad9ab5407e1625d88c28c36d19184c28baaa59dcfc977c266b303`

同目录提供 `catalogue.json`、`NOTICE.txt`、`LICENSE-CC0.txt`、`PROVENANCE.json`。发布文件与验证过的生成文件逐字节一致；模型均低于 25 MB 上限。female 超过理想 15 MB 目标，保留了编发、两款裙装和多种鞋型的实际几何。

## 实际变化

- 女性重新调整成人身材比例、肩宽、椭圆脸、下颌宽度和轻微上扬嘴角；适量调整眼形、唇形，保留原皮肤纹理并在唇部 UV 区域柔化着色。最终头发为 Elvaerwyn French braid variation：正面整洁侧分，背面实际长编发；已放弃早期过于方硬的短发和蓬乱长发试版。
- 男性重新调整肩身比例、下颌骨、眉型和轻微表情；采用贴合头部的 short02 短发。两个模型均为虚拟成人模板，保留真实眼睛、眉毛、睫毛网格。
- 衣物是独立网格和真实不同轮廓，非仅改色。女性新增短袖露腰上衣、层叠短裙、工装裤、针织长袖、两种连衣裙、短靴和平底鞋；男性新增短袖、Polo、工装裤、短靴。短裙为层叠荷叶边，**不是百褶裙**。
- 服装漫反射图转为中性底色，保留针织、布纹、缝线、鞋面细节以便场景调色；女性工装裤/短裙/短靴/平底鞋及男性工装裤/短靴包含已导出的法线贴图（以光照表现小凹凸）。针织衫导出的是实际针织色彩纹理，未宣称导出了针织法线贴图。图片全部内嵌，最大边长 2048。
- 短上衣使用真实平面切割形成整齐下摆，修掉早期锯齿腰线。去掉胸部兜底安全带，骨盆兜底限制在衣物内部，解决黑色胸腰碎片。保持身体完整顶点，不通过删除脸、手或裸露皮肤换取遮挡。
- 静态贴合使用身体表面距离修正；例如女性挂脖裙修正 700 顶点，最大移动约 7.51 mm；短上衣 231 顶点约 2.20 mm。保留闭合西装对应的裤装贴合形变。姿态下的针织袖子和闭合靴另用精确条件覆盖，原因和契约见下文。

## 变体契约与六套搭配

`extras.avatarLayer` 标识槽位，`extras.avatarVariant` 标识具体剪裁；同一实际可见槽位只显示一个变体。子节点沿最近祖先继承。目录中的非活动槽位只是保留选择值；主场景决定哪些槽位可见。

| 模型 | tops | bottoms | dresses | outerwear | shoes |
|---|---|---|---|---|---|
| female | camisole / cropped-tee / knit | tailored / cargo / mini-skirt | halter / shift | blazer | sneakers / ankle-boots / ballet-flats |
| male | knit / tee / polo | tailored / cargo | 无 | blazer | sneakers / ankle-boots |

| 预设 | female 实际可见搭配 | male 实际可见搭配 |
|---|---|---|
| sweet | cropped-tee + mini-skirt + ballet-flats | polo + tailored + sneakers |
| minimal | blazer + tailored + ballet-flats | blazer + tailored + ankle-boots |
| street | cropped-tee + cargo + ankle-boots | tee + cargo + ankle-boots |
| relaxed | knit + tailored + sneakers | knit + tailored + sneakers |
| elegant | halter + ballet-flats | blazer + tailored + ankle-boots |
| sport | cropped-tee + cargo + sneakers | tee + cargo + sneakers |

闭合西装自带衬衫/领带，替代独立上衣；连衣裙替代上衣和下装。没有增加配饰槽位。

身体材质 `extras.avatarHiddenByVariants: string[]` 使用实际可见的 `slot:variant` 键，例如 `tops:knit`、`shoes:ankle-boots`。场景只在对应服装真的显示时隐藏该材质；不能因目录里留有 knit 选择就在穿裙时隐藏胳膊。旧 `avatarHiddenByOuterwear` 与新覆盖条件取并集，仍仅用于闭合西装；头、颈、手指和手掌保护保留。

- 靴子采用作者原始 `Delete.toigo_ankle_boots_*` 身体分组，覆盖上限受真实靴筒高度约束，解决脚趾和甲片穿出。
- 针织衫源文件没有 delete_verts，按脊柱/锁骨/上下臂主要骨权重及衣物真实下摆/领口位置划分完全覆盖的身体面。女性原始覆盖 9,356 四边面、靴子 8,656；男性针织 9,356、靴子 8,816。完整身体 53,514 顶点/53,512 原始面仍保留。
- 实际 GPU 场景发现女性圆领中央黑色小三角，根因是肩部领顶高于前圆领开口，统一高度上限覆盖过界。最后只恢复前中部约 11 cm 宽、领顶以下 5 cm 区域的 264 个已三角化身体面。使用索引/材质重新分组，所有位置、UV、法线、骨权重和鞋子遮罩不变，同片西装覆盖标志保留。同步修改源规则，未启动 Blender 或重新渲染。主任务已实际 reload 确认领口黑三角消失；本任务同时复看更新后的实际场景截图，圆领皮肤连续。

## 验证与证据

最新运行：

```sh
python3 verification/video-quality/asset-work/refine-knit-neckline.py
python3 verification/video-quality/asset-work/validate-glb.py
python3 verification/video-quality/asset-work/publish-v2.py
```

三项退出成功；结果保存在 `assets-audit.json`、`assets-coverage.json`、`assets-neckline.json` 及 `asset-work/audit-final.log`。结构检查覆盖：GLB2 头/长度、所有图片和缓冲区内嵌、53 关节、皮肤及服装 JOINTS/WEIGHTS、法线、实际二进制浮点数有限、三角形索引在顶点范围内、槽位变体唯一、目录每项确实存在、没有相同网格/蒙皮/变换的重复绘制实例、条件遮罩元数据格式和 25 MB 上限。

| 证据 | 范围及结论 |
|---|---|
| `asset-work/renders/female-sweet-front.png`、`female-face.png` | 本任务检查过 700×1000 全身/700 方形脸部图，最终整洁编发、柔化脸部、无旧版黑腰。离线图早于最后条件遮罩修订。 |
| `asset-work/renders/female-elegant-front.png`、`female-elegant-side.png`、`female-elegant-back.png` | 本任务检查过挂脖裙正侧背面；胸/髋黑片已清除，背面确认真实长编发。24 采样未降噪，颗粒不是材质缺陷。 |
| `asset-work/renders/male-minimal-front.png`、`male-street-front.png` | 本任务检查过西装与短袖工装裤的真实轮廓、短发、脸部和鞋型。早于最后遮罩修订。 |
| `gpu-female-sweet-front.png` | 主任务实际 Three 场景核对并反馈无黑腰。 |
| `gpu-female-street-front.png` | 主任务最终 reload 后确认脚趾已被闭合靴完整覆盖；此前读到旧缓存截图不作为最终结论。 |
| `gpu-female-relaxed-front.png` | 主任务确认袖子肉色穿出消失；随后发现领口小三角，发布上述 264 面局部修订后，主任务已 reload 确认修复；本任务复看更新截图无黑三角。 |

**未声称完成**：36 张全套离线正侧背面图、本轮最终完整角度矩阵/生产构建。主任务为减轻 16 GB 机器内存压力，接手实际场景验收，并已生成 `/v2/thumbs/{sex}-{preset}.webp` 共 12 张真实场景缩略图，查看 `all-looks-contact.png` 反馈无进一步阻断。早期试版的其他离线图不作最终资产证据。所有本任务 Blender 进程已结束。

## 许可与来源

官方资产包页面与作者许可证据记录于 `PROVENANCE.json`；全部源文件保留作者信息，并记录 SHA256。MPFB 上游版本固定为 `3af0cd5a2ffba072e93a34e5f6f494fdc4813ddf`。图形输出采用 CC0-1.0（允许再分发和改作的公共领域贡献）；MPFB 软件自身的 GPL-3.0 是离线工具许可，软件没有打包进网页运行时。

- 官方包索引：<https://static.makehumancommunity.org/assets/assetpacks.html>
- 官方素材来源：MakeHuman system assets、shirts01、pants01、dress01、suits01、skirts01、shoes01、hair01；每个详细 URL、原档/源文件校验值均在 `PROVENANCE.json`。
- French braid 的 MHCLO 源头保留旧 AGPL3 导出模板头，但官方 hair01 对应行和作者页面均明确标注 CC0。原始头未改写；作者许可页面 <http://www.makehumancommunity.org/clothes/french_braid_01_variation.html> 的本地保存件及 SHA256 位于 `asset-work/frenchbraid-author-page.html` 和 provenance，明确记录该不一致。
- 归属包括 MakeHuman/MPFB Community、Data Collection AB、Joel Palmius、Jonas Hauquier、Margaret Toigo（MRT）、Cortu Johnstone、Elvaerwyn、namuhekam。完整声明见发布目录 `NOTICE.txt`。

## 可复现材料与边界

核心脚本：`author-build.py` / `build-v2.py` 组装和体型；`neutral-fabric.py` / `beauty-skin.py` 贴图；`finalize-v2.py` 几何贴合；`apply-coverage-v2.py` 条件覆盖及导出；`refine-knit-neckline.py` 最后局部二进制修订；`validate-glb.py` 校验；`publish-v2.py` 发布及许可。最后修订只需在未修订的导出 GLB 上执行一次，重复运行会主动报错。`generated/female.blend` 保留修订前覆盖分组，重新导出请使用已同步领口规则的 `apply-coverage-v2.py`，无需再次叠加二进制修订。

本资产提供虚拟成人样衣展示，不是用户本人照片的 360° 重建，也不是上传原衣服的精确网格、尺寸或物理布料仿真。静态及编辑姿态的检查不能外推任意大幅动画都无穿插。最后领口修订已通过实际场景 reload；主任务已快照发布资产并开始生产构建，此后本任务只更新报告，不再修改 frontend/public。

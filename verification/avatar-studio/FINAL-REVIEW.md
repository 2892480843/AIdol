# 3D造型工作室独立复审

检查时间：2026-10-17T20:09:03.638829+00:00。

**代码审查结论：未发现新增、未解决的 P1/P2 问题。** P1/P2 分别指应优先修复的严重问题及会影响正常功能的明确缺陷。此次为静态只读复审，没有启动浏览器、服务器、模型调用或修改功能代码。

## 已检查的功能边界

- 账号与异步保存：工作室按账号及会话代际重挂；云端保存只在明确点击时调用，校验衣物所有权、槽位、名称及真实日历日期；切号、退出重登、换令牌和卸载会中止旧请求，并忽略迟到结果。保存不会标记衣物已经穿过。
- 衣物与恢复：恢复本机记录后重新查询自有衣物；无效、已删除、待洗或归档衣物不能成为可保存的选择。未解析ID不会因另选衣物而静默消失；同槽位和裙装/上下装冲突均阻断保存。
- 模型能力：男模不含裙装层，开关及裙装卡片被禁用，已有裙装选择时不能切换男模；异常恢复出的男模加裙装组合不能保存，并有八语说明。
- 本机造型册：仅保存设置、日期和衣物UUID；挂载只读，不会用空状态覆盖存量；配额/存储错误保留当前内存选择，并与账号隔离。云端搭配日历和本机3D设置有清楚区分。
- 导出：保留生成的PNG预览及明确下载链接；替换结果和卸载释放Blob URL；导出失败只提示错误，不把已加载模型当作加载失败。实际PNG生成由场景控制器负责。
- 外套局部形变：最终场景沿当前网格及父级查找`avatarOuterwearFitMorph`，只对命名目标且合法索引写入外套开启1/关闭0；保留其他形变权重，GLTF多材质分组可继承标记，缺失目标不抛异常。已复审新增开关与恢复测试；场景代理确认18项专项测试通过并冻结。最终GLB已核验同名目标索引0、默认权重0、POSITION/NORMAL各5750顶点；2个稀疏访问器完整解码且delta全部有限，最大位移约2.07厘米。
- 材质遮挡范围：`applyAvatarWardrobe`仅对`avatarHiddenByOuterwear=true`的明确标记材质设置随外套变化的可见性；未标记皮肤及身体节点继续可见。已有用例同时检查开关外套后标记材质隐藏/恢复、普通皮肤保持可见及肤色不变。最终女模已核验只有Body_OuterwearCovered_Material标记遮挡，未标记皮肤45543渲染顶点保持可见范围，含头部与下肢。
- 已修复的资产集成问题：鞋材质允许染色；闭合外套通过avatarReplacesTops隐藏内层上装；男模外套冗余裤腿已去除。女性背面外套的明确皮肤遮挡材质与仅在外套开启时使用的裤装局部形变，也已完成最终二进制核验。

## 测试证据与覆盖边界

- 检查了 avatar-studio、avatar-outfit-hook、avatar-journal、avatar-journal-hook、avatar-workspace、avatar-scene-model 对应测试。已有用例覆盖不发起自动写入、日期和槽位、所有者变化、请求中止、重复点击、保存失败、PNG预览链接、模型加载迟到、上下文丢失、骨骼姿态和资源清理。
- 场景阴影常量修正：`PCFSoftShadowMap`改为`PCFShadowMap`。已只读核对已安装Three的`WebGLShadowMap.js`第99—102行：旧常量本来就警告并回退到PCF，因此该修改明确原有实际行为并消除警告；最新类型/lint结果由主代理记录。
- 本次复审没有重复运行测试，但只读核对了主代理的`frontend-release-r2.json`：113个文件、1151项通过，0失败、0跳过；`types-r2.log`无诊断，`lint-r2.log`零警告，`i18n-r2.log`八语2021键检查通过。最终资产或源码后续变化仍需主代理完成相应的新检查。
- 当前没有直接专项用例证明造型册跨标签页顺序写入、存储失败后重试恢复，以及造型册自身A→退出→A时的旧回调；实现沿用会话围栏，但不把相关机制的其他hook测试等同于该模块的直接覆盖。
- 浏览器手机尺寸测试不等同实体低端手机/GPU验证。操作系统下载目录实际落盘尚需浏览器或人工证据，显式Blob下载链接的DOM测试不能替代它。
- 首次/重新加载缓存、自然手臂姿态、正侧背面服装穿插以及实际PNG像素外观，应由最终正式页面浏览器验证补充。

## 资产审计状态

**最终男女GLB已冻结并独立审计通过。** `asset-audit.json`记录17类检查、97份源资产逐文件哈希及最终许可/来源文件哈希。没有外部缓冲区或图片地址，两模型各53骨及6张内嵌图片。正常蒙皮、三角/骨骼索引、全部浮点及稀疏形变范围均有效。

| 模型 | 文件字节数 | SHA-256 |
|---|---:|---|
| female.glb | 10,906,708 | `2f42454d5a21d39e3005416f6d4e952843686c4f80a2b8060e0e8c85be876f4a` |
| male.glb | 9,474,732 | `e805df1a0ab1dc94d0e94dc83327b7561ea003b112b9d0e1739682ae59fa380a` |

已独立核对最终前端源清单526份文件，0哈希差异；清单SHA-256为`ce9058862daf3e0d524fad9255190d58aa0741a501066532ac63834f49fe5bb3`。主代理报告最新开发页面女性正/侧/背外套开关及男性后背GPU检查干净；本审计没有重复运行浏览器，也不把开发页面检查等同最终生产部署。正式构建、部署身份及正式页面验证由主代理完成。

## 本次审阅源码快照

| 文件 | SHA-256 |
|---|---|
| `frontend/components/avatar-studio/workspace.tsx` | `de91d8d6fe4bee1865750b39a3a6b0b6d9aeb9bee420f330755605eaf2ab825b` |
| `frontend/lib/avatar-studio.ts` | `fe7f62faaf9fc6bb6a673027b5c00553a5dcfaf01d71e184ffb8478e81d9a631` |
| `frontend/lib/hooks/use-avatar-outfit.ts` | `f25e3c555bc5635d205611cf556b18624c53143e03f0adf05fd8c5be9437e94d` |
| `frontend/lib/avatar-journal.ts` | `20682faa8590abed555913e838dabc5dfa52d2d5dc25c2e4cb90b88afb4d34a1` |
| `frontend/lib/hooks/use-avatar-journal.ts` | `a7fefa91f0ddacb23fb01123354d66bf308df7b547e772af303ecb98316c9932` |
| `frontend/lib/looks/use-owner-scope.ts` | `bc97da063e46f59dccab6b4336d5460c0ff187b777c8e1e149de7e67c1068e33` |
| `frontend/lib/hooks/use-wardrobe-draft.ts` | `8c21f528e6a35b7e73ec0302e31a47ac2cc3e6b5a0dea2748b359b0ea25009a2` |
| `frontend/lib/fitting-room.ts` | `8681658de034d4397481dd6274964f3b05fa7742c1f8b384529008d92bb09962` |
| `frontend/lib/fitting-seed.ts` | `8cd662e2cee34c61228c6a33393bf5bd186fc6b468257cd42b855382906e6b62` |
| `frontend/components/avatar-studio/scene.tsx` | `7de285133833b4a838f93792015213928eab1738c6ef78b48f0c504806b8b8c3` |
| `frontend/components/avatar-studio/scene-model.ts` | `ab35974efdf1c2b9a0be9f70504ffdb376840d2af605d5ff6ca6aafd40731630` |
| `frontend/components/avatar-studio/scene-types.ts` | `30fb52fb8be5565cc5b229c37c7a4d74122c241b933f59fb1516358faf88343d` |
| `frontend/tests/avatar-scene-model.test.ts` | `6772a4fab420a614c3704bb50fa7141db14a856846726d2ff0e333df9ecd0fb6` |

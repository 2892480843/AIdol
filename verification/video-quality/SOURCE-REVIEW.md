# 视频效果升级：源码独立审查

审查日期：2026-10-18。平台已由 `uname -s` 确认为 macOS（Darwin）。审查依据为 `review-brief.md`、`docs/superpowers/plans/2026-10-18-video-quality.md` 和实际文件，未仅依赖 Git 差异。未修改产品代码，未运行全量测试；主任务负责最终资产、GPU（图形处理器）和真实浏览器验收。

**确认 2 项 P2（应在本轮完成前修复的问题），未发现确认的 P1。鞋款问题已观察到主任务补修；Polo 映射问题在审查探针时仍可复现。**

## 确认问题与处理

| 级别 | 定位 | 触发与实际影响 | 建议与当前状态 |
|---|---|---|---|
| P2 | `frontend/components/avatar-studio/scene-model.ts:109-115`，`applyAvatarWardrobe` | 旧实现虽然计算鞋款的 `variantVisible`，但可见性分支只处理连衣裙、上装、下装和外套。载入含多种鞋款的 v2 模型时，运动鞋、短靴、芭蕾鞋同时显示；切换鞋款无法让同槽唯一，产生重叠。 | 已告知主任务，并观察到新增 `shoes` 分支。只读探针以三种鞋款选择 `ballet-flats`，现得 `false / false / true`。主任务正在补回归测试；最终真实模型画面仍待其确认。 |
| P2 | `frontend/lib/avatar-fashion.ts:53-56`，`fashionGarments` | 男款选择真实库存 `type: "polo"` 时，上装变为 `tee`；仅 `type: "shirt"` 被映射为 `polo`。项目正式类型表支持 `polo` 且归属上装；男款样衣也已有 `polo`。库存锁定剪裁后，用户无法在下拉框纠正错误的样衣类别。 | 让 `polo` 显式映射 `polo`，保留已有衬衫适配规则；增加男款 Polo 库存映射用例。已通知主任务；探针执行时尚未修复。 |

## 可复现实证

在 `frontend` 下用已安装的 TypeScript 将**实际文件**即时编译到内存，加载真实 `fashionGarments`、`fittingGroupForType` 和 `applyAvatarWardrobe`，无替换业务实现、无源码写入。结果：

```json
{"poloGroup":"tops","inventoryPoloCut":"tee","sampleDefault":"polo"}
{"shoeVisibility":[{"variant":"sneakers","visible":false},{"variant":"ankle-boots","visible":false},{"variant":"ballet-flats","visible":true}]}
```

Polo 结论另由 `frontend/lib/wardrobe-3d.ts:38` 的正式分类与 `frontend/lib/generated/garment-vocabulary.ts` 的正式类型表交叉核对。鞋款根因由调用链 `workspace -> fashionGarments -> Scene -> applyAvatarWardrobe` 及变体收集、选择、可见性三段逻辑相互核对。探针覆盖的是修复后的鞋款分支，修复前缺失分支为此前直接阅读的实际源码。

## 范围与合规核查

| 范围 | 已读源码与测试 | 源码判断及边界 |
|---|---|---|
| 变体选择、封闭外套、旧资产回退 | `avatar-fashion.ts`、`avatar-studio.ts`、`scene-model.ts`、`scene-types.ts`；`avatar-fashion.test.ts`、`avatar-scene-model.test.ts` | 每槽先选合法请求，失败回退 `default` 或首个现有变体；父节点层级与变体可继承。仅选中的封闭外套可隐藏上装，无连衣裙时保留上下装。鞋款遗漏见上。真实衣物穿插与体表遮挡需 GPU 验收。 |
| 六造型与库存锚点 | `workspace.tsx`、`fashion-controls.tsx`；`avatar-workspace.test.tsx`、`avatar-fashion.test.ts` | 前后造型环形切换保留库存 ID；预设清除样衣手动剪裁并换配色，库存颜色与类别再次覆盖。男女剪裁集合有适配过滤。Polo 类型映射见上；其他没有可用精确剪裁的类别仅为样衣近似，不能当作原衣重建。 |
| 收藏兼容、格式界限与异步缩略图 | `avatar-journal.ts`、`avatar-snapshot.ts`、`use-avatar-journal.ts`；`avatar-journal.test.ts`、`avatar-journal-hook.test.tsx`、`avatar-snapshot.test.ts` | 旧版无 `garments`、无缩略图配置可归一化读取；缩略图仅接收受长度限制的本地 WebP 数据。缩略图附加前重读持久存储，要求存活的同一场景；已删除、同 ID 改造型、待写入状态、账户切换和卸载回调均有代码保护与对应测试。未发现新增确认的 P1/P2。 |
| 账户边界与明确保存 | `workspace.tsx`、`use-avatar-journal.ts`、`use-avatar-outfit.ts`、`use-owner-scope.ts` | 工作室按账户及会话代次重新挂载；读取与操作有账户归属过滤，异步导出和附图使用会话有效性检查。恢复本地收藏不自动创建云端穿搭。未发现新增确认的 P1/P2。 |
| 图片导出与私人照片 | `scene.tsx`、`avatar-snapshot.ts`、`workspace.tsx`；相关场景及工作室测试 | 场景只获取本站嵌入资源的模型；加载器拒绝额外远端资源，未新增照片上传或网络生成。导出先填不透明底色再复制画布；缩略图来自本地 3D 渲染。源码能确认意图，最终 PNG 的像素透明度与视觉效果仍需真实浏览器验证。 |
| 响应式与可访问性 | `workspace.module.css`、`fashion-controls.tsx`、`workspace.tsx`；`avatar-workspace.test.tsx` | 新控制使用原生按钮、标签和下拉框，有名称、选中状态、禁用态和键盘焦点样式。服装条局部水平滚动；小屏主列会收为单列。源码未发现确定的横向溢出根因；390/320 像素实际布局、触控和对比度须由主任务实测。 |

## 验证限制

- 未重跑主任务正在负责的全套测试、类型检查、国际化检查、构建和部署；现有测试的阅读结论不等于本轮执行通过。
- v2 资产仍由资产代理制作；未把制作中的文件缺失当作成品缺陷。目录及元数据命名契约已比对，最终资产来源、骨骼、真实剪裁、正侧背面和六造型效果以资产报告及主任务 GPU 结果为准。
- 当前源码没有“单张私人照片已生成本人完整三维”的实现证据，不能由现有样衣渲染或本地收藏功能推导出该能力已完成。
- 本报告记录的是审查时发现及即时补修状态；主任务后续修改后应以其最终验证结果关闭对应条目。

## 复核关闭记录

主任务修复后重新读取了 `frontend/lib/avatar-fashion.ts:53-56`、`frontend/components/avatar-studio/scene-model.ts:105-116` 以及 `frontend/tests/avatar-fashion.test.ts:58-82`，并核对对应失败到通过的执行记录：

| 原问题 | 最新源码与回归证据 | 复核结论 |
|---|---|---|
| 鞋款多变体同时可见 | 现有独立 `shoes` 分支将节点可见性设为 `variantVisible`。新测试含运动鞋、短靴、芭蕾鞋，并连续切换两种选择。`shoe-red.log` 明确记录原实现 `[true,true,true]` 失败；`shoe-green.log` 记录造型和场景模型两文件共 26 项通过。 | **已关闭。** |
| 男款库存 Polo 错映射 Tee | 映射现为 `["shirt", "polo"].includes(type) ? "polo" : "tee"`，新增真实库存 `type: "polo"` 断言。`polo-red.log` 记录原实现返回 `tee` 失败；`polo-green.log` 记录造型文件 8 项通过。 | **已关闭。** |

**在本次已审查的源码范围内，确认的 P1/P2 均已解决，无未关闭的确认问题。** 上文的“尚未修复”是首次审查时的历史状态，以本节为准。上述测试结果来自主任务实际执行日志，本复核未重跑全套测试。资产最终版本、真实 GPU 画面、窄屏交互、全量回归、构建和部署仍由主任务继续验收；本节不代替这些验证。

# Avatar Studio Implementation Plan

**Goal:** 实现有完整人物网格和时尚样衣的3D造型工作室，连通库存、日期搭配和真人试穿。
**Architecture:** 独立人物工作室；本地GLB人物与衣物分层，纯Three渲染；领域/保存状态与场景隔离；复用现有私有衣物与搭配API。
**Tech Stack:** Next.js14 / React18 / Three0.186.1 / Blender导出 / Mantine。

- [x] 资产：核实MakeHuman/MPFB及服装皮肤许可；导出男女成年形象、可控衣物层和完整贴图；渲染预览、记录来源与哈希。追加长发贴合、精确衣物遮挡和外套专用裤装形变。
- [x] 领域和保存：新增 `lib/avatar-studio.ts`、`lib/hooks/use-avatar-outfit.ts`；先测试日期/配置/姿态/颜色边界、所有者变化、POST及outfits/calendar失效，再实现。
- [x] 场景：新增 `components/avatar-studio/scene.tsx`、资源适配和类型；实现GLB加载/释放、分层着装、旋转/视角/姿态/光照、PNG导出、加载与失败状态。
- [x] 页面：新增 `app/dashboard/wardrobe/avatar/page.tsx` 和工作室组件；品类/预设/日期/本机造型保存与恢复、真实库存选择、真人试穿和搭配保存；从3D衣柜增加入口。
- [x] 文案和验证：八语键一致；113文件1151项测试、类型、定向代码检查通过；17类资产检查、源审查通过；r2构建部署，浏览器桌面/320/390像素交互和无重复写入验证，截图与记录见 `verification/avatar-studio/REPORT.md`。PNG页面预览通过，操作系统下载落盘尚未确认。

照片自动生成360人物需要额外三维重建服务，现有图片接口不具备已接入实现；最终汇报单独标明，不伪装已完成。

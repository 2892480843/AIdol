# 前端功能闭环验收

平台：macOS Darwin 25.6.0 / arm64。范围为数字人物、3D衣架、真人试衣、库存选择与本机收藏/账号搭配保存；本轮没有启动浏览器、模型生成、摄像头或正式数据库写入。

## 已复现并修复

| 级别 | 原问题 | 修复与证据 |
|---|---|---|
| P2 | 真人试衣的点击/文字选衣会静默丢弃无法解析的原选ID，可能变成另一套可提交搭配 | 新增保留未知ID的选择适配，未知项可明确单独移除，仍占四件上限；`selection-retry-red.json` → `selection-retry-green.json` |
| P2 | 数字人物恢复衣物时临时读取失败没有显式重试 | 调用现有解析hook的retry，失败期间保持保存禁用；同上红/绿报告 |
| P2 | 完全相同造型反复收藏产生不同ID并消耗24条容量 | 规范化后比较名称、日期、完整配置、衣物集合及穿着开关，复用已有ID和创建时间；同名不同内容继续独立保留；`journal-red.json` → `journal-green.json` |
| P2 | 造型册缺少删除入口 | 具名确认对话框、可取消、成功后关闭；真实hook按账号epoch校验，持久化失败不从内存丢弃记录，读取另一个标签页的最新记录后删除；同上红/绿报告 |

额外回归覆盖：账号退出后返回时的旧删除回调、卸载后的旧保存/删除回调、账号变化关闭未确认对话框、恢复日期/人物/配色/衣物不触发云端保存、未知ID占满容量时不静默替换、透明材质/分层/骨骼/morph契约、相机和语音生命周期、私有出图URL与任务幂等、3D库存和草稿账号边界。

## 当前验证

- `feature-suite.json`：17个测试文件，223项通过，0失败、0跳过。
- `types.log`：`npx tsc --noEmit --incremental false` 成功。
- `lint.log`：本轮修改TS/TSX的scoped lint成功，无告警。
- `targeted-green.json`：本轮主要变更相关63项通过。
- 全部前端回归、实际GPU/手机布局和下载落盘由根代理统一执行，本报告不将DOM/mock测试冒充实机验收。

专项命令：

```sh
npm test -- --run tests/avatar*.test.ts tests/avatar*.test.tsx tests/fitting*.test.ts tests/fitting*.test.tsx tests/tryon-hook.test.tsx tests/wardrobe-3d*.test.ts tests/wardrobe-3d*.test.tsx tests/wardrobe-draft*.test.ts tests/wardrobe-draft*.test.tsx
```

## 改动文件

- `frontend/lib/fitting-room.ts`
- `frontend/components/fitting-room/workspace.tsx`
- `frontend/components/avatar-studio/workspace.tsx`
- `frontend/components/avatar-studio/workspace.module.css`
- `frontend/lib/avatar-journal.ts`
- `frontend/lib/hooks/use-avatar-journal.ts`
- 对应5个测试文件：fitting-room、fitting-workspace、avatar-journal、avatar-journal-hook、avatar-workspace。

八语删除文案由根代理统一维护，本分支未修改语言JSON。保留全部既有脏改动，未提交或推送。照片重建360度人物仍缺真实服务，本轮没有伪造该能力。

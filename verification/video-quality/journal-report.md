# 本地 3D 穿搭缩略图验证

已在 macOS（Darwin）、zsh 环境实现。范围仅含日志数据、日志 hook、缩略图工具和对应测试；未修改工作区或 3D 场景组件，未提交版本。

## 接口与边界

- `AvatarSavedLook.thumbnail?: string`：仅保留 `data:image/webp;base64,...`，格式需为有效 Base64 字符结构，总长不超过 24,000 字符。外部地址、SVG、其他格式和超长值被丢弃；旧的纯配置记录继续可读。
- 日志原始文本解析上限由 100,000 提至 750,000 字符，最多仍为 24 条，足以保存每条受限缩略图。
- `createAvatarThumbnail(blob: Blob): Promise<string>`：仅供本地 3D 渲染截图使用。使用 `createImageBitmap` 解码，在 160×220 画布中等比完整放入，填充中性背景，以 WebP 质量 0.65 编码。失败或超限时拒绝 Promise；成功与失败路径均释放已生成的位图和画布资源。
- `save(input): boolean`：原接口不变。
- `saveThumbnail(input: AvatarSavedLook, thumbnail: string): boolean`：只更新仍存在且配置未变的场景。相同 UUID 但场景已变化时拒绝；保存时因场景重复而沿用其他 UUID 的记录，可按完整规范化签名匹配。签名包含名称、日期、完整规范化配置、排序后的单品 UUID、连衣裙与外套可见状态。保留当前记录的 UUID、创建时间和收藏状态。
- 回填前读取最新持久化记录，保留其他窗口新增记录，禁止已删除记录复活。存在尚未持久化的待保存配置时，拒绝可选图片回填，保留内存中的用户选择。
- 可选图片写入配额失败时返回 `false` 并报告错误，原持久化记录和内存记录保留，可重试恢复。账号、会话轮次或卸载边界沿用既有错误语义，过期回调抛错。
- 接入时必须在异步截图前保留当次 `journal.saveThumbnail` 回调及场景输入；完成后调用该回调，以保留账号与会话轮次隔离。

## 测试与证据

使用测试驱动流程：新增日志及 hook 测试在实现前出现 8 项预期失败；新增缩略图工具测试先因模块尚不存在失败，随后实现并修正浮点坐标断言为近似比较。

验证命令（工作目录为 `frontend`）：

```sh
npm test -- --run tests/avatar-journal.test.ts tests/avatar-journal-hook.test.tsx tests/avatar-snapshot.test.ts tests/avatar-studio.test.ts tests/avatar-outfit-hook.test.tsx tests/avatar-workspace.test.tsx
npx tsc --noEmit --incremental false
```

结果：6 个测试文件、84 项测试通过；TypeScript 类型检查退出码为 0。可复查测试日志：`verification/video-quality/journal-tests.log`。

覆盖旧数据兼容、安全格式丢弃、24 条缩略图容量、场景去重、跨窗口最新记录、删除不复活、配置变化、收藏状态保护、账号切换、退出再返回、卸载、配额失败与重试、资源释放及画面等比放入。

## 未验证范围

工具的画布与位图操作使用测试替身验证；本报告不声称已在真实浏览器中验证 WebP 编码质量或 3D 场景卡片视觉表现。主流程需结合实际 3D 截图和日志卡片做浏览器验收。用户照片不进入此工具；调用方必须只传本地 3D 渲染截图。

# 照片衣物提取前端交付记录

运行平台：macOS（`uname -s` 返回 `Darwin`）。本报告仅覆盖前端，后端模型质量和浏览器实测由主任务统一验收。

## 实现范围

- 新页面：`frontend/app/dashboard/wardrobe/extract/page.tsx`，使用独立的照片审核工作区。
- 业务与接口：`frontend/lib/clothing-extraction.ts`，真实请求 `/api/v1/clothing-extraction/capabilities`、`/api/v1/clothing-extraction` 和既有 `/api/v1/items`。
- 状态管理：`frontend/lib/hooks/use-clothing-extraction.ts`，文件选择、提取、审核、逐件确认保存与错误重试。
- 界面：`frontend/components/clothing-extraction/workspace.tsx` 和 `workspace.module.css`，浅色中性底与玫瑰色主操作，左侧照片、右侧真实透明 PNG 审核。
- 8 个语言文件仅新增 `wardrobe.extraction`；每语言 64 条文案，未移除原有键。
- 未编辑后端、avatar、衣柜主页、导航或路由注册；未提交 Git。

## 行为与边界

1. 读取真实能力接口。模型未就绪时禁用文件选择和提取，并提供服务重查。无示例图片或模拟提取结果。
2. 用户选择 JPEG/PNG/WebP 图片，按服务 `max_bytes`（客户端硬上限 10 MiB）检查。照片预览使用临时对象 URL；预览加载后按 `max_pixels` 检查图片尺寸。
3. 用户点击提取后才上传原照；提取不写衣柜。结果最多 4 件，验证唯一的固定品类 ID、合法品类映射、归一化矩形边界、有限置信度、固定模型名称及有界 PNG 数据。
4. 结果逐件呈现于棋盘透明背景。可修改名称、品类并取消选择；界面明确说明仅提取可见部分、不是 3D 重建、不补画遮挡区域。
5. 用户再次点击确认才逐件上传 PNG；字段为 `image`、`name`、`type`、`skip_ai=true`。PNG 直接 base64 解码成 File，不通过 fetch 请求图片。
6. 每件有待保存、保存中、已保存、失败、重复图片状态。成功项不再次提交；失败项仅显式点击时重试；409 标记重复并排除后续队列。
7. 成功创建后使 `queryKeys.items.all` 失效，提供查看衣柜链接。逐件创建是已有接口，整个批次不具备原子事务：切换账号前已完成创建的单件可能已经保存，但旧结果不会注入新账号界面。
8. 使用 `captureLookSession(owner, true)` 捕获身份与令牌，发请求前和响应后校验，订阅会话变化并取消请求；界面按 owner + epoch 重建。旧回调、旧照片和旧响应不能跨账号复用。
9. 文件替换、清除、账号变化和卸载会取消请求并释放对象 URL。超时使用可清理定时器，结束后解除监听；晚到响应不写状态。
10. 不将原照或提取结果写入浏览器存储。API 请求 `cache: no-store`；错误仅展示本地翻译码，不展示服务端原始英文或内部错误。

## 测试与验证

测试采用先写失败用例再实现：新模块首次运行因目标模块不存在失败，随后运行真实业务逻辑，以 fetch 为外部边界。

| 检查 | 命令 | 已观察结果 |
|---|---|---|
| 域逻辑/API 与 Hook | `npm test -- --maxWorkers=1 tests/clothing-extraction-hook.test.tsx tests/clothing-extraction.test.ts` | **29 项通过**（2 个文件；无跳过） |
| UI 交互 | `npm test -- --maxWorkers=1 tests/clothing-extraction-workspace.test.tsx` | 首轮在资源竞争期间 3 项均触发默认 5 秒超时；整套 75 秒，导入 33.64 秒。未提高超时掩盖，主任务待负载回落统一复跑。 |
| 多语言键一致性 | `npm run i18n:parity` | **通过**，8 locales，2115 English keys |
| 指定生产文件 ESLint | `npx eslint components/clothing-extraction/workspace.tsx lib/clothing-extraction.ts lib/hooks/use-clothing-extraction.ts app/dashboard/wardrobe/extract/page.tsx` | 首轮 0 errors、2 个 scope 依赖 warnings；已将 scope 解构，等待主任务最后检查。 |
| TypeScript | `npx tsc --noEmit --pretty false` | 为避免与主任务重复占用内存，主动取消自己的进程，由主任务统一执行。 |

29 项测试覆盖：PNG 转文件无网络、恶意或过大数据、重复 ID、未知品类、错误品类映射、非法矩形/置信度、源图格式和大小、真实请求与 FormData、400/413/429/503/504/409 错误码、令牌变化和超时中断、返回账号检查、无自动写库、审核名称/类型、取消选择、成功不重试、部分失败重试、重复图片不重试、换图释放对象 URL、切换账号停止后续写入、退出重登旧回调拒绝、服务不可用禁用。

UI 用例覆盖：选择照片与提取不写库、真实图片来源展示、修改名称与类型、取消选择后确认只保存一件、服务未就绪的禁用状态、切换账号清空图像和候选。

## 待统一验收

- 主任务执行默认超时的 UI 测试与统一 TypeScript/ESLint，确认静态审查后的小改动。
- 实际浏览器 320/390 像素及宽屏：无横向溢出、键盘文件选择、焦点状态、图像解码、真实模型提取及真实已登录账号保存。
- 本次未运行 dev server、未操作浏览器或调用模型；不将模拟请求测试宣称为真实模型端到端验证。

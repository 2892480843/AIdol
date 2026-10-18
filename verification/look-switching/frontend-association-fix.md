# 实穿照片批量保存：关联衣物锁定回归

记录日期：2026-10-17；环境为 macOS / zsh，时间采用 Asia/Shanghai。以下结果来自已完成的工具调用，整理本记录时未重复运行测试。

## 问题与修复

批量保存使用提交时捕获的 `itemIds`，但等待第一张照片写入时，关联衣物选择器仍可修改，造成界面选择与实际保存内容不一致。

[workspace.tsx](../../frontend/components/looks/workspace.tsx) 现用禁用的 `fieldset` 包裹关联选择器，并在保存、存储写入或删除期间降低透明度；`onToggle` 同时检查同步操作锁和忙碌状态，阻止迟到的选择事件。[回归测试](../../frontend/tests/looks-workspace.test.tsx) 用延迟完成的首张保存请求验证：等待期间关联控件不可操作，原选择不变，前后两张照片收到相同的原始关联衣物 ID。

## 先红后绿的执行证据

| 阶段 | 本机开始时间 | 命令 | 实际结果 |
| --- | --- | --- | --- |
| 修复前，单独复现 | 2026-10-17 22:30:37 | `npm test -- tests/looks-workspace.test.tsx --maxWorkers=1 -t 'locks garment associations'` | 指定用例失败；另外 9 例不在本次筛选范围 |
| 修复后，完整页面回归 | 2026-10-17 22:30:56 | `npm test -- tests/looks-workspace.test.tsx --maxWorkers=1` | **10/10 通过，0 失败、0 跳过**；耗时 4.84 秒 |

修复前失败位置与断言：

```text
locks garment associations while a batch save is pending
Error: expect(element).toBeDisabled()
Received element is not disabled:
<button aria-pressed="true" type="button" />
```

修复后工具输出：

```text
Test Files  1 passed (1)
     Tests  10 passed (10)
Start at  22:30:56
Duration  4.84s
```

## 类型与静态检查

同轮页面测试完成后执行下列命令，工具返回退出码 **0**；类型检查无诊断，静态检查输出 `✔ No ESLint warnings or errors`。该调用未单独记录时分秒，故不补写推测时间。

```sh
npx tsc --noEmit && npx next lint --file components/looks/workspace.tsx
```

两处修改另经 Prettier 格式化，以及 UTF-8 无 BOM、无行尾空白检查。最终全量验收汇总另见 [frontend-tests.json](frontend-tests.json)、[frontend-tests.log](frontend-tests.log) 和 [typecheck.log](typecheck.log)；上述汇总文件由主流程维护。

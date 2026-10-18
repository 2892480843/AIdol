# 风格发现：数据与翻译验证

日期：2026-10-17。环境：本地 macOS，zsh；未运行全量测试、构建、后端或模型请求。

## 交付范围

- `frontend/lib/style-discovery.ts`：六种风格、十二套示范、有效灵感练习入口、分类参数解析与本地化搜索。
- `frontend/tests/style-discovery.test.ts`：纯数据与筛选逻辑回归。
- `frontend/messages/{de,en,fr,it,ja,ko,zh-CN,zh-TW}/dashboard.json`：各新增 `looks.discovery` 的 64 个叶子键，并仅调整既有 `looks.tabs.model` 标签。
- 旧 `MODEL_LOOKS` 的四项标识、图片路径与位置保持不变；每种风格各两套示范。

配色与新增造型名称按 root 已生成并目视核对的素材校准。街头为灰/橄榄/米色；运动为酒红/奶油/奶黄；复古为酒红/奶油/丹宁。图片名称不声称功能性或真实面料性能。

最终六类工作标签为街头机能、运动休闲、日系 Cityboy、清爽极简、复古学院、法式松弛，已在八语名称与关键词中对应校准。它们仅描述外观风格；既有非功能性描述、提示和练习逻辑保持不变。该名称调整后 JSON、八语键/占位符一致性、UTF-8 与 diffcheck 再次通过，未重跑全量。

最终练习入口：`street → balance`、`sport → balance`、`cityboy → easy-layers`、`clean → everyday`、`retro → layer`、`french → tonal`。这些是现有分类练习入口，不代表对照片版型、面料或上身效果的自动匹配。

## 实际验证

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 首次测试 | 预期失败 | 实现前观察到缺少 `@/lib/style-discovery` 模块的失败基线。 |
| 最终独立数据回归 | 14/14 通过 | 2026-10-17 23:25:36；最终配色及入口校准后运行，见 `domain-tests.log`。 |
| 相邻旧图片切换器回归 | 5/5 通过 | 早一轮 scoped 运行；本轮未编辑该组件。 |
| 翻译三项检查 | 全通过 | `npm run i18n:check`：键解析、八语一致性、未翻译文案扫描。 |
| 最终翻译一致性 | 全通过 | 最终名称校准后再次检查，8 种语言、1763 个英文源键，见 `domain-i18n.log`。 |
| 定向 TypeScript | 0 错误 | 用项目既有编译配置检查新数据模块与纯测试的依赖闭包；其后仅修改调色值、公式字符串与翻译。 |
| 定向 ESLint | 无警告或错误 | 新数据模块与纯测试。 |
| Prettier | 通过 | 最终数据与测试文件已格式化。 |
| 编码与动态键合同 | 通过 | 八语均为无 BOM 的 UTF-8，六个风格各五字段、十二个造型名称齐全。 |
| `git diff --check` | 通过 | 数据、测试及八个翻译文件。 |

最终数据测试命令（工作目录 `frontend`）：

```sh
npx vitest run tests/style-discovery.test.ts --exclude tests/style-discovery.test.tsx --maxWorkers=2
npm run i18n:parity
```

数据测试覆盖有效目录入口、每风格两套/总数十二、旧四图兼容、八个新图片位置、未知分类回退、当前语言标签搜索、分类与搜索交集、空搜索、兼容字符规范化、大小写及德语 ß、原顺序和不修改源数组。

初次相邻测试命令的文件名子串同时选中了另一 agent 尚未实现完成的同名 `.test.tsx`，其 7 项 UI 测试当时为失败基线；这不计入数据通过数，已告知对应 owner。最终独立回归通过 `--exclude` 明确排除该并行工作。

## 验证边界

这里只证明数据、翻译与纯逻辑；UI、浏览器交互、图片显示和发布由对应 owner 另行验证。没有修改用户配置、密钥、UI 文件或后端。

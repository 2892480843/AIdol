# 穿搭切换验收记录

日期：2026-10-17。环境：macOS Darwin 25.6.0 arm64、zsh、Docker Desktop。本机地址：http://localhost:3000/dashboard/looks。三种模式均已完成本机验收；AI生成使用原创虚构人像与既有测试上装，真人照片效果尚未实测。

## 本轮范围

- 同一位原创虚构成年模特四套全身造型，固定构图，首页和新页面共享切换组件；支持循环、键盘和并排对比。示范明确标注 AI 生成。
- 本人实穿照片支持命名、关联衣橱单品、逐张保存、切换和确认删除。照片按登录账号保存在当前浏览器的独立 IndexedDB 数据库，每账号最多20张、每张10MiB。清理网站数据会丢失本机记录，未实现云端相册同步。
- 本人照片与一件当前账号可用上装提交给现有云桥 Seedream 图像编辑接口。提交需显式同意；源人像不落服务器存储，结果保存在私有对象存储。后台任务独立保存，刷新只读取状态；超时不自动重发。
- 本轮不含连续换装视频输出、多件同时整套试衣、尺码推断或真实合身承诺。AI 示范不是当前衣橱已上身的证据。

## 自动验证

| 范围 | 观察结果 | 原始证据 |
| --- | --- | --- |
| 首轮完整前端 | 926通过、0失败、0跳过 | frontend-tests.json / frontend-tests.log |
| 首轮完整后端 | 2182通过、0失败、0跳过 | backend-tests.xml / backend-tests.log |
| 删除衣物后清理试衣结果修复 | 相关150通过；4个新增回归先红后绿 | backend-cleanup-tests.xml / backend-cleanup-tests.log |
| 保存实穿照时锁定衣物关联修复 | 页面10通过；新增延迟保存回归先红后绿 | frontend-association-fix.md |
| 云桥完整SSE事件及业务错误解析 | 相关124通过；新增5个用例 | backend-parser-tests.xml / backend-parser-tests.log |
| 类型、静态、多语言 | 类型通过；6条既有lint警告；1699键、8语言一致 | typecheck.log / lint.log / i18n.log |
| 默认模型调整 | 相关125通过；默认断言先红后绿 | backend-model-fix-tests.xml / backend-model-fix-tests.log |
| 生产构建 | 前后端最终r2均构建成功 | frontend-build.log / frontend-build-r2.log / backend-build-r2.log |

上述完整测试先于后续两处P2修复及解析补丁；后续更改分别通过相应周边测试，不将部分回归混称为再次完整全量通过。

## 数据与部署

- 迁移前备份：`backups/before-look-switching-20261017.dump`，101KiB、权限600、Git忽略。
- 已执行新增迁移 `f0a3b4c5d6e7 → a1b2c3d4e5f7`；只增加试衣任务表，保留原衣橱与推荐数据。见 migration.log。
- 只更新前后端；原有worker、图片处理、对象存储及监测服务保留。网页3000、后端18000仅绑定127.0.0.1。见 runtime-services.json、runtime-images.txt、rollout.log。
- 确切源码摘要见 source-manifest.json；不包含私有环境文件。密钥及照片内容未写入日志。

## 浏览器实测

- 新导航进入穿搭切换；下一套改变名称与完整图片，第四套可并排比较第一套。见 model-compare-full.png。
- 原创虚构成年模特照片保存为“切换验收 · 原创模特1017”，关联已有测试T恤；刷新并重开“我的实穿”后仍在。删除弹窗明确永久删除，验收只点击取消，未删除记录。见 worn-restored.png。
- 首页紧凑切换由白T牛仔变为蓝衬衫通勤。见 home-model.png。
- 830px平板无横向溢出；320px初验发现Tabs最小宽度撑大页面，已修复网格列与Tabs根节点最小宽度。r2真实浏览器复验：模特、并排对比、实穿和AI四种状态均为 viewport320 / scrollWidth320；首页320同样通过。见 responsive.json 与 model-320-final.png。

## 真实 AI 验收

首个有效请求由真实网页显式提交，输入为原创虚构成年模特及账号已有几何测试T恤，不含真人隐私照片。任务 `63458b3e-93f0-4208-9c77-ed3847941c83` 在3秒内失败，安全错误码 `provider_rejected`，上游HTTP400；未自动重发。证据见 live-tryon-attempt.json。

GET模型列表存在Seedream名称，以及无生成内容的路由探测均不能证明实际出图成功；首轮错误已通过后续诊断和默认模型调整解决。成功的真实出图证据单列在下方，未覆盖或篡改原失败任务。

原创素材来源和提示词见 [IMAGE-ASSET.md](IMAGE-ASSET.md)；对两个抖音作品的可观察范围和一手技术文档见 [研究记录](../../docs/research/2026-10-17-look-switching-references.md)。没有复制博主视频或人像进入产品素材。

### 参数错误定位

一次受控诊断仍使用相同原创人像和测试上装，未修改任务表，也未自动重试。返回HTTP400、InvalidParameter，脱敏message明确指出当前模型不支持 `output_format`。同一已部署generate函数经本地MockTransport序列化复核，我方请求键没有此字段；无法直接观察该参数在转发或上游内部的加入位置，不把其具体实现写成事实。诊断证据见 provider-diagnostic.json、diagnose-provider.py。

已改用模型列表精确存在、且官方支持该输出参数的 `Doubao-Seedream-5.0-lite`。仍是显式单次请求，无自动模型回退；最终模型已部署，真实网页验收结果如下。

### 最终成功与刷新验证

- 实际网页上传同一原创人像，选择已有蓝色测试T恤并勾选同意后，点击一次生成。任务 `cf48b8c8-5a9f-43a9-a621-903d41494e8c` 在约24秒后成为 `succeeded`，模型为 `Doubao-Seedream-5.0-lite`。见 live-tryon-success.json。
- 私有存储结果为有效JPEG，1365×2048；人工查看确认原白T变为蓝色上装，仍保留完整头部与鞋。结果文件 live-tryon-result.jpg 仅由原创验收输入产生；与精确版型、身份细节和实际尺码一致性不作保证。
- 刷新页面后重新进入AI试衣，图片加载成功，浏览器 naturalWidth1365/naturalHeight2048。数据库仍只有两个网页提交任务，最新ID与创建时间未变，没有因刷新重发。见 refresh-task-check.json、tryon-restored.png。独立诊断未创建第三个UI任务。
- 成功结果的匿名读取返回401；登录后使用受鉴权Blob显示，不在URL暴露token。见 anonymous-result-status.txt。

## 最终运行身份

- 前端：`wardrowbe-frontend:looks-20261017-r2`，BUILD_ID `bUPGfdJKH7uPaYTaep2Jp`。
- 后端：`wardrowbe-backend:tryon-20261017-r2`。准确镜像摘要见 runtime-images.txt。
- 十项服务均running，后端最终就绪检查healthy；原worker未替换。见 runtime-services.json、health-final.json。
- 721项前后端源文件的SHA256与最终构建源码核对一致。文档与验收产物在源码清单外单独保存。
- 真实界面：model-compare-final.png；窄屏：model-320-final.png；实穿刷新：worn-restored.png；AI结果刷新：tryon-restored.png。

## 交付边界

本轮已验证照片切换、本机相册、现有接口的单件上装AI模拟。未实现连续视频导出、批量整套生成、云端实穿相册同步或实际尺码判断；尚未用用户本人的真实照片验收。没有修改原有衣物图片以伪装成真实摄影。本机服务已更新；本轮未推送新的Git提交。

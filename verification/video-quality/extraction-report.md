# 穿搭照片 → 衣物分类与透明遮罩验证

2026-10-18，本地 macOS Darwin 25.6.0 arm64；Python 3.11、ONNX Runtime 1.31.0，CPU 每次 2 个推理线程。未使用私人照片、云端推理、PyTorch 或 CUDA。

**结果：已实现真实的逐像素衣物提取与预览 API。三张冻结的许可合成输入均提取出正确的主要类别与透明 PNG。它仍是需要人工复核的可见区域提取，不能宣称达到电商商品平铺图的完整重建质量。**

## 证据与许可

| 候选/来源 | 核验依据 | 决定 |
|---|---|---|
| SCHP ATR18 ONNX | [发布者模型卡](https://huggingface.co/pirocheto/schp-atr-18/tree/61f4ff3c508b899904e495cefbbaff9cacadeb45) 明确 `license: mit`，适用于该模型仓库；未发现另列的权重许可条款。声明来自模型发布者，无法独立证明其所有权链。 | 使用其 69,141,996 字节 INT8 静态图，准确大小见模型清单 |
| SCHP 上游 | [官方源码许可](https://github.com/GoGoDuck912/Self-Correction-Human-Parsing/blob/master/LICENSE) 为 MIT；[官方 README](https://github.com/GoGoDuck912/Self-Correction-Human-Parsing) 提供 ATR 权重与 18 类定义。代码许可和模型发布者声明分别核验。 | 保存 MIT 文本并保留署名 |
| ATR 训练集 | [数据集作者 README](https://github.com/lemondan/HumanParsing-Dataset) 要求学术/商业研究引用两篇论文，所读 README 未列额外使用限制。没有下载或重新分发训练数据。 | 明确记录来源，不能把未列限制等同于独立法律认证 |
| SegFormer clothes | [模型作者卡](https://huggingface.co/mattmdjaga/segformer_b2_clothes) 引用 [NVIDIA 原许可](https://github.com/NVlabs/SegFormer/blob/master/LICENSE)，包含非商业研究约束。 | 排除，避免将代码 Apache/MIT 许可误写为权重许可 |
| 输入 | `extraction-work/inputs/*.png` 是本项目 asset-work 生成的 MakeHuman CC0 合成角色渲染副本。来源许可记录沿用 asset-work；没有真人照片。 | 冻结副本与 SHA256，允许复跑 |

公开模型固定 revision：`61f4ff3c508b899904e495cefbbaff9cacadeb45`。

权重 SHA256：`4420d8db8c1f266967c89485786b01209f6d405f320fc0f87e8ced49392cefb5`。

下载源：`https://huggingface.co/pirocheto/schp-atr-18/resolve/61f4ff3c508b899904e495cefbbaff9cacadeb45/onnx/schp-atr-18-int8-static.onnx`。

本地证据位于 `extraction-work/model/`：模型卡、API 元数据、原 MIT 文本、ATR README、上游原始提取脚本与发布者预处理参考。权重不应提交 Git。

## 根因发现与实际质量

发布者的 processor 文档使用 RGB 通道与 BGR 训练常数，且直接把输入拉伸为正方形。按它运行时，sweet 合成角色的裸腿被误分类为裤子；因此没有直接接入该处理方式。

对照上游 `cv2.imread` 与保比例仿射处理后，改用 BGR（蓝绿红通道顺序）与黑边补齐的 512×512 输入，再将遮罩映射回原图。裸腿误分类消失。使用模型真实概率 ≥0.7 的像素、过滤很小的孤立连通区域，未填补遮挡区域、未生成或伪造商品像素。

| 冻结输入 | 最终真实模型输出 | 目视结果 |
|---|---|---|
| female-minimal-front | top、pants、shoes | 外套与内衬是一个 top 区域，裤腿之间透明，双鞋合并；少量袖口边缘瑕疵 |
| female-elegant-front | dress、shoes | 连衣裙、领口空隙与鞋区域正确；服装层次不会被恢复为独立商品 |
| female-sweet-front | top、skirt、shoes | 上衣、短裙与双鞋正确，裸腿排除；裙腰仍带有少量相邻皮肤误分，需用户复核 |

最终一轮 `verify-service.py` 各图约 3.6–4.4 秒；先前系统内存压力更大时同样输入曾为 13–20 秒，不能把单次本地耗时当生产延迟承诺。完整原始数据见 `extraction-work/verified-results.json`，每张有输入 SHA256、归一化框与模型区域概率。

每张真实 alpha 文件与有色底预览见 `extraction-work/verified/<input>/`。`confidence` 是保留区域中该类别的平均 softmax（将模型分数转换为相对概率），**不是校准过的识别准确率**。置信度高也不能保证没有皮肤边缘误分。

## 接口与运行约束

新增：

- `backend/app/services/clothing_extraction.py`：本地模型推理、输入解码与限制、透明遮罩和元数据清理、单任务互斥、独立子进程 45 秒硬超时与终止。
- `backend/app/api/clothing_extraction.py`：沿用 `get_current_user` 验证登录；GET `/clothing-extraction/capabilities`，POST `/clothing-extraction` multipart 字段 `image`。不写数据库、不自动创建衣物；返回 `Cache-Control: no-store`。
- `backend/tests/test_clothing_extraction.py`：无需数据库的 7 项逻辑检查。

GET 返回：`{available, model, max_bytes, max_pixels}`。模型/运行依赖缺失或 SHA256 不匹配时 `available=false`，不会暴露本机路径。

POST 返回：`{model,image_width,image_height,pieces:[{id,type,category,bbox:{x,y,width,height},thumbnail_data_url,confidence}],warnings}`。`bbox` 均为相对原图的 0–1 数值；type 为 `top|skirt|pants|dress|shoes`，category 为 `top|bottom|dress|shoes`，最多 4 件，鞋合并。图片先执行 EXIF 方向纠正，最大 12MB/16MP/4096 单边；仅支持单帧，PNG 输出不包含原始 EXIF，透明区 RGB 清零。

错误：400 图片无效；413 文件过大；429 单个 API 进程已有任务；503 本地模型不可用；504 推理超过 45 秒。并发限制为每个 API 进程 1 个任务，每个任务 ORT intra-op=2、inter-op=1。多 API worker 部署应按 worker 数评估内存预算。

模型配置变量：`CLOTHING_EXTRACTION_MODEL_PATH`，默认 `/data/models/schp-atr-18-int8-static.onnx`。建议由现有私有数据卷持久保存模型，不在请求时联网下载。无需数据库或 config schema 变更；root 负责 router 注册与生产模型放置。

## 验证和边界

先观察新服务缺失导致测试失败，然后实现，最终 7/7 通过。覆盖：人体标签排除与鞋合并、真实透明间隙、空/微小标签不造衣物、BGR 与保持比例、损坏/超尺寸图片、EXIF 方向清理、超时 kill 和释放槽位、缺模型 capabilities 不泄露路径。

```bash
/tmp/wardrobe-extraction-venv/bin/python backend/tests/test_clothing_extraction.py
/tmp/wardrobe-extraction-venv/bin/python verification/video-quality/extraction-work/verify-service.py
python3 -m py_compile backend/app/services/clothing_extraction.py backend/app/api/clothing_extraction.py
```

**尚未验证**：真实用户照片泛化、多人体照片、复杂遮挡和花纹。完整认证/输入/响应路由已在下述隔离 Linux ARM64 环境验证；真实模型在生产 Linux aarch64 的本地服务调用也已验证，见最后一节。未使用生产用户凭证执行真实图片 HTTP 请求。仅三张合成样例不足以证明一般识别质量。

工具调用简报：先读本地后端/限制，网络查询在无 grok-search/Context7 可用时使用内置网页检索与官方模型仓库/原始源码；所有推理均为本机 CPU。只从公共地址下载模型与公开源码，未上传照片或凭证。


## API 集成验证追加（2026-10-18）

**隔离 Linux ARM64 套件 27/27 通过，0 failure / 0 error / 0 skipped；其中新 API 集成 20 项、原服务逻辑 7 项。** 使用现有 `client`、`test_user`、`auth_headers`、`db_session` fixtures，实际通过 PostgreSQL 和既有登录身份验证链路；没有替换认证函数。

环境：后端镜像 `sha256:673cc7a9955a7d9ca198effb6b403f5bf7b129bfbe0f17258758fe164be06b73`，Docker image inspect 确认 `linux arm64`；pytest 日志确认 Python 3.11.17。隔离网络为 internal，PostgreSQL 与 Redis 为一次性容器，不挂载生产数据卷、不读取生产凭证，外部模型访问不可达。运行结束后 fixtures 已清理。

| 验收面 | 实际断言 |
|---|---|
| GET/POST 登录保护 | 无 token、损坏 token、过期 token 均返回 401 且 `WWW-Authenticate: Bearer`；停用账户返回 403；所有情况都未进入模型函数 |
| 可用性 | 缺模型返回 `available=false`，响应含模型标识和字节/像素限制，不泄露本地路径 |
| 图片限制 | 空文件、损坏文件、超过 4096 单边为 400；超过 12MB 为 413 且不启动推理；缺 multipart 图片为 422 |
| 错误映射 | 服务异常分别映射 400/429/503/504；429 含 `Retry-After: 5`；有效图但缺模型返回 503 |
| 成功预览 | 实际运行解码、语义标签到遮罩、PNG 编码与 HTTP JSON 校验；返回 top+合并双鞋，模型标识/类别/归一化框/概率符合合同 |
| 透明 PNG | 解码返回的 base64，校验 PNG 签名、RGBA、无 EXIF；两只鞋之间为 `(0,0,0,0)`，鞋内 alpha=255 |
| 零自动建档 | 成功预览前后当前用户衣物表行数相同；响应 `Cache-Control: no-store` |

该套件使用固定语义分数代替不稳定的模型推理边界，其余 PNG 与 API 代码是真实执行。**不能将此套件描述为真实 ONNX 模型在 Linux 上的质量证明。** 真实模型本机证据仍是前述三图探针。

执行命令：

```bash
python3 verification/full-function/backend/run-isolated-tests.py video-extraction-api tests/test_clothing_extraction_api.py tests/test_clothing_extraction.py
```

证据：`verification/full-function/backend/backend-video-extraction-api.log`、`backend-video-extraction-api.xml`、`run-video-extraction-api.json`、`source-manifest-video-extraction-api.json`。测试本体 32.50 秒，含初始化总运行约 141 秒。源码清单 SHA256：`971172f20ec78678973b19f7b64bf4749a9e5ba10cdd7e7dca6fe61dfff49a9f`。

第一次尝试未执行测试：脚本先前捕获的旧 backend image ID 在 runner 启动时不可用，Docker 返回 `No such image`，退出 125。旧镜像错误与清理元数据已保存于 `extraction-work/api-initial-image-unavailable.{log,json}`。主 agent 固定新镜像后，第二次按相同命令成功；未执行 prune，也未下载新模型。


## 真实生产 Linux aarch64 推理与超时诊断追加

**同一生产镜像和持久化模型已实际成功返回 top、skirt、合并 shoes；没有修改 service/API 源码，没有重新构建镜像或重启 Docker。**

root 提供的三次旧日志显示主机 `docker exec` 在 100 秒后超时，其中两次使用 stdin 输入，一次读取容器本地合成图；旧脚本没有阶段输出，无法从这些日志判断阻塞发生在模型调用前还是调用内。root 同期观察到简单 Python print 的 8 秒超时。该历史阻塞的根因**未确认**，不能将它写成 ONNX 错误或已经修复的服务缺陷。

本轮先检查生产容器进程：仅 uvicorn，无残留验证进程/模型 worker。重新测得 shell exec 约 0.48 秒、最小 Python 约 0.61 秒、普通 Python 约 0.62 秒，历史简单 exec 超时不再复现。单独阶段探针随后证实：服务包导入 11.75 秒，模型 stat/校验约 1.48 秒，固定 69,141,996 字节权重 `available=true`，合成输入可读。记录见 `extraction-work/production-stage-diagnostic.json`。

随后使用一次有逐阶段 `flush` 输出的真实生产服务探针，容器内 `timeout --kill-after=5 75` 约束整个进程组，服务本身仍为 45 秒子进程超时，主机为 90 秒兜底。这样可区分导入、文件读取和模型执行，且不只依赖主机 Docker 客户端超时。执行脚本：`extraction-work/verify-production-service-diagnostic.py`。

| 阶段/结果 | 实际值 |
|---|---|
| 平台 | Linux `aarch64`，生产 backend 镜像 `sha256:673cc7a9955a7d9ca198effb6b403f5bf7b129bfbe0f17258758fe164be06b73` |
| 服务包导入 | 9.149 秒 |
| 读取冻结合成输入 | 728,004 字节，700×1000；SHA256 `21c639d7580e6a3d82d54ca6d498872b9b6d004ba9f9a242975cf09987d4a491` |
| 实际 `extract_clothing` 调用 | 20.290 秒 |
| 含 Docker 调用的总时长 | 31.893 秒，退出 0，stderr 为空 |
| 结果 | top 0.9278、skirt 0.9428、shoes 0.9641；均为保留区域的平均 softmax，非校准准确率 |
| 调用后容器进程 | 仅 uvicorn，模型子进程已正常退出 |

真实输出：`verification/video-quality/production-extraction/{top.png,skirt.png,shoes.png,result.json,review.jpg,png-validation.json}`；阶段证据：`extraction-work/production-service-diagnostic.json`。

PNG 逐项复核：均为有效 RGBA PNG，alpha 最小 0、最大 255，透明区 RGB 全为 0，EXIF 为空；双鞋之间透明。top 216×192、skirt 215×170、shoes 226×35。目视仍可见裙腰少量邻接皮肤误分，这与本机模型结果一致，依然需要人工复核。

本轮结论是**真实 Linux 模型路径当前可用，历史 Docker exec 阻塞未能复现且未定因**。没有用提高服务超时、修改分割逻辑或伪造输出来掩盖问题；如果再次发生，保留同一阶段日志后再判断。未上传任何照片、调用云端模型、重新下载权重、重跑完整测试或执行 prune。

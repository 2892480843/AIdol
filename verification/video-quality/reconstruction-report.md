# 照片 → 真实 360° 人体：本机可行性核查

好的老陈，**当前没有证据表明本机已实现“单张真人照片 → 高保真本人三维模型”。本轮没有运行重建、没有生成新网格，也没有可交付的重建正侧背图。** 预置人体、贴照片的平面及转动照片，都不能作为该能力的验收结果。

核查时间：2026-10-18（Asia/Shanghai）。范围仅为可行性、公开资料和本机轻量探测；没有改动产品前后端，没有提交代码，没有读取生产配置、密钥或私人照片，没有调用任何生成服务，也没有下载模型权重。

## 已验证事实

| 项目 | 实证与边界 |
|---|---|
| 运行平台 | Python `platform`、`uname` 和 Blender 版本输出互证：Darwin 25.6.0、arm64，Blender 5.1.2；物理内存 `17,179,869,184` 字节，即 16GiB。 |
| 当前负载 | 审计时磁盘余约 51GiB；`memory_pressure -Q` 为 31%，交换已用约 15.6GB；压缩器占约 6.5GiB。空闲页并不等于全部可回收内存，这些数值不能直接当成可分配显存。已有负载下继续增加数 GB 推理内存存在明显争用风险。 |
| Python | 本次审计解释器为 Python 3.14.6，未安装 `torch`。机器另有 Python 3.11；未扫描或改动其他环境，不能据此宣称全机都没有 PyTorch。 |
| 当前已验证试衣链路 | `backend/app/services/tryon.py` 使用 `/images/generations`，接收一张 `b64_json` 图片；既有脱敏诊断记录确认 `Doubao-Seedream-5.0-lite` 曾被列出。**这只证明既有适配器是二维图片编辑，没有证明服务商全部模型都不支持三维。** 本轮未查询在线模型列表。 |

原始结果与来源校验值见 [audit.json](reconstruction-work/audit.json)。压缩/交换占用是当时快照，不是重建程序的内存测量，也不构成“16GB Mac 永远不能重建”的结论。

## 候选方案与真实阻塞

“网格”指由顶点和三角面构成的真实三维表面；GLB 是可包含网格与贴图的三维文件格式。“MPS”是 PyTorch 使用 Apple GPU 的计算后端；NVIDIA 的 CUDA 显存指标不能直接等同于 Mac 统一内存。

| 方案 | 已核实的能力/要求 | 本次决定与缺项 |
|---|---|---|
| TripoSR | 官方发布为 MIT 许可的通用单图重建；模型仓库 `gated=false`，主权重 `1,677,246,742` 字节。官方 `run.py` 检测不到 CUDA 时强制使用 CPU，直接传 `--device mps` 仍会被覆盖。 | **无需付费密钥，适合后续最小真实网格实验。** 尚缺低负载窗口、隔离 Python 依赖、明确许可的公开合成人体输入和实际正侧背质量验证。未运行，不能提供时延或人体保真结论。 |
| Stable Fast 3D | 官方 Mac 支持为实验性；小于 32GB 建议 CPU。权重访问需接受条款并认证；元数据显示 `gated=auto`，权重 `4,024,289,892` 字节。 | 当前主权重本身已超过 **3GB 下载上限**；不下载、不尝试绕过授权。CPU 路线仍无本人面貌质量证明。 |
| SiTH（人体专用） | 官方测试环境为 Ubuntu/CUDA/RTX 3090；流程需要 SMPL-X 人体参数模型（按形体和关节控制人体的模型），并明确包含背面生成阶段。 | 缺适合其官方栈的计算环境、模型许可及依赖。官方没有在本机/16GB MPS 成功的证据；未移植、未运行。 |
| PSHuman（人体专用） | 官方 README 当前说明 768 分辨率模型需要超过 40GB 显存；安装使用 CUDA PyTorch 与 Kaolin。 | 不符合本机条件；需要相应 NVIDIA 计算资源。不能把未来降分辨率设想当成已提供的低内存模型。 |
| Hunyuan3D-2 官方实现 | 官方写明支持 macOS，但形状约 6GB、形状加贴图约 16GB 显存；默认贴图光栅器源码使用 `CUDAExtension`。 | **官方写“支持 Mac”不等于完整贴图流程已在这台 Mac 验证。** 高负载 16GB 机器无充足余量；本次没有运行。 |
| Hunyuan3D-Swift / Modelr（作者原生 MLX 移植） | MLX 是 Apple 芯片的计算框架。作者自报最小形状峰值约 5.6GB，完整最小形状加 RGB 贴图约 25GB。Modelr 清单最小形状权重 `3,819,958,234` 字节。 | 检查了作者一手源码清单，**没有采用社交帖“低于 2GB”作为实测事实**。当前清单最小形状已超下载上限，完整流程作者内存数据也超 16GB。量化版本若存在，需要另外逐文件确认；本轮未验证。 |
| SAM 3D Body | Meta 的人体形体/姿态恢复模型，下载需要申请权重访问。其“人体网格恢复”不能直接证明提供照片级衣服、发型、面容贴图。 | 缺授权与完整外观恢复方案；即使恢复身体形体，也不能据此宣布完成高保真本人。 |

来源均为官方/原作者一手材料：[TripoSR README](https://github.com/VAST-AI-Research/TripoSR)、[实际入口源码](https://github.com/VAST-AI-Research/TripoSR/blob/main/run.py)、[TripoSR 模型元数据](https://huggingface.co/api/models/stabilityai/TripoSR?blobs=true)、[SF3D README](https://github.com/Stability-AI/stable-fast-3d)、[SF3D 元数据](https://huggingface.co/api/models/stabilityai/stable-fast-3d?blobs=true)、[SiTH](https://github.com/SiTH-Diffusion/SiTH)、[PSHuman](https://github.com/pengHTYX/PSHuman)、[Hunyuan3D-2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2)、[贴图构建源码](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/hy3dgen/texgen/custom_rasterizer/setup.py)、[原生移植作者报告](https://github.com/ZimengXiong/Hunyuan3D-Swift)、[Modelr 下载清单](https://github.com/ZimengXiong/Modelr/blob/main/model_manifest.json)、[SAM 3D Body 安装说明](https://github.com/facebookresearch/sam-3d-body/blob/main/INSTALL.md)。上述性能数字为作者声明，**不是本机实测**；同项目 README 与模型仓库是交叉核对，不是两个独立实验。

## 路线选择

1. **必须本地、无需新增付费账号：先验证 TripoSR CPU。** 先释放现有负载，单独使用 Python 3.11 虚拟环境，依赖和缓存均限定于本目录；计算包括附加模型在内的总下载量后再下载。使用有明确许可的公开合成人体，保留原图、实际 GLB、正侧背、时延与峰值内存。降低提取分辨率或分块只用于控制资源，不能代替质量验收，也不能据此承诺本人保真。当前没有进行模型前向计算，故没有发生或观察到本方案的 OOM（内存不足）故障。
2. **优先准确还原本人：改为多角度采集。** Apple Object Capture（多照片摄影测量）直接使用多张有重叠的照片建立真实几何，不需要本次这些神经网络权重。官方要求对象形态稳定、良好漫射光，建议相邻照片重叠至少 70%；人体轻微移动可能导致失败或变形。因此应采用尽量同步的多视角采集并单独验证，不能保证随手绕人拍一圈就有高质量。缺项是**同一稳定姿态、正侧背都被实际拍到的授权图像组**，而非一张正面照。设备支持探测与重建成功必须分开记录。见 [Apple 采集指南](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture) 和 [PhotogrammetrySession](https://developer.apple.com/documentation/realitykit/photogrammetrysession)。
3. **允许外部三维计算：先取得可用的专用三维接口或 NVIDIA 资源。** 例如 Meshy 官方 Image-to-3D 接口返回三维任务及 GLB；需要自己的接口密钥和可用额度，不能复用 Seedream 图片接口能力作担保。此路线还需要一次明确授权的公开样例验收；本次没有创建任务、没有消费额度，账号可用性未知。单图生成即便质量较高，未见背面仍属推断。见 [Meshy 官方接口](https://docs.meshy.ai/en/api/image-to-3d)。

**建议当前产品仍将照片二维试衣与真实三维展示分别标明能力边界。** 如果要求“本人正面像、侧面真实、背面准确”，应先取得多视角真实证据或真正通过验收的重建资产，再连接展示；继续打磨预置人体或灯光无法补出照片没有记录的个人背面信息。SiTH 的官方流程明确将背面称为生成/幻觉步骤；[PSHuman 论文](https://arxiv.org/abs/2409.10141) 也指出单视角人体重建存在不适定性。因此“有完整三维表面”与“完整还原本人”是两项不同验收。

## 可复核交付与验收

- [只读审计脚本](reconstruction-work/audit.py)：固定公开来源，单个响应上限 1MB，保存时间、来源 URL、字节数与 SHA-256；不读取环境变量/配置、不执行模型代码。
- [本机/来源证据](reconstruction-work/audit.json) 与 `reconstruction-work/sources/`：16 个公开文本/元数据来源抓取成功；权重下载 **0 字节**、生成请求 **0 次**。
- [Object Capture 支持探测脚本](reconstruction-work/object-capture-support.swift)：只查询硬件支持，不读取照片，不启动重建。**本机硬件支持未验证**：冷编译 SDK 超过 180 秒仍未结束，为限制资源使用，停止了自己的探测进程（退出码 143）并清理独立模块缓存；没有运行时返回值，也没有观察到编译错误，不能推断硬件不支持。见 [探测结果](reconstruction-work/object-capture-support.json)。
- [文档与证据检查](reconstruction-work/verification.json)：检查来源哈希、本地链接、UTF-8 无 BOM，并解析审计脚本语法；这些检查不验证模型推理。
- 没有本次重建 GLB、没有本次重建正侧背图、没有本次重建时延/峰值内存；不能将既有预置人体或其他任务渲染图混入此项结果。

后续一次成功实验的最低验收：① GLB 可由 Blender 重新导入且有三轴体积；② 0°、90°、180°视图来自同一三维资产，侧面不是纸片、背面不是正面镜像；③ 与公开人体输入对照面容、手足、服装轮廓及遮挡细节，背面若无真值明确标为推断；④ 记录实际耗时、峰值内存和下载总量；⑤ 若需走动动画，额外验收骨骼绑定与变形，转台旋转本身不证明动画能力。

**结论置信度：高**——平台、权重大小、访问门槛、入口设备选择与现有二维适配器均有本地命令或实际源码/元数据支撑。**人体高保真可达性：尚未实证**；本报告没有把文档指标或论文展示替代本机结果。检索工具不可用的 `grok-search`/`Context7` 已降级为内置 Web 搜索与官方公开文本直接抓取；未依赖非官方博客作为关键技术结论。

# 试衣转发参数诊断（2026-10-17）

真实网页第一次请求返回 HTTP 400。经批准的第二次、唯一一次独立诊断复用原创虚构成年模特和既有测试上装，仍返回 `InvalidParameter`：上游明确指出当前模型不支持 `output_format`。未自动重试，未修改任何 UI 任务状态；原始响应、请求头、地址、密钥、提示词与图片未写入诊断报告。

为区分本端与转发链路，随后使用**已部署的同一 `generate` 函数与纯本地 `MockTransport`**复核实际序列化字段，仅保存键名：`image`、`model`、`prompt`、`response_format`、`sequential_image_generation`、`size`、`stream`、`watermark`。本端没有发送 `output_format`。这次键名检查没有网络请求；它不是第二次诊断请求的历史抓包。参数被转发层或上游默认逻辑加入是据此作出的推断，具体内部位置未观测。

只读 `/models` 实际列出精确名称 `Doubao-Seedream-5.0-lite`。官方能力交叉核对如下：

| 能力 | 核对结果 |
| --- | --- |
| 多图参考编辑 | 5.0 lite 支持多图输入；`image` 可为 Data URI 字符串数组。 |
| 输出尺寸 | 5.0 lite 支持 `2K`。 |
| 图片返回 | 支持 `response_format=b64_json`。 |
| 文件格式参数 | 5.0 lite 支持 `output_format` 的 JPEG/PNG 选项；4.5/4.0 不支持自定义该参数。 |

依据：[火山官方图片 API](https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh)、[火山官方图像创作说明](https://docs.volcengine.com/docs/ark/seedream-4-0-5-0?lang=zh)、[BytePlus 官方 API](https://docs.byteplus.com/en/docs/modelark/image-generation-api?redirect=1)。这些资料验证原厂能力，不能替代当前转发服务的实际成功响应。

最小调整仅把 `TRYON_MODEL` 的默认值切到已列出的 `Doubao-Seedream-5.0-lite`。显式环境覆盖仍生效；不新增自动模型回退、不改变重复提交保护、不重放旧任务。后续真实网页验收已确认新默认出图成功，并验证刷新恢复；见 [最终报告](REPORT.md) 与 live-tryon-success.json。本次诊断明细为 [provider-diagnostic.json](provider-diagnostic.json)。

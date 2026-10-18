# 真人穿搭切换参考核对

2026-10-17，通过用户提供的链接与抖音官方作品页核对。通用网页抓取工具无法直接读取两条作品，改用内置浏览器；仅观察页面标题、作者、部分视频画面与播放状态，不声称看完全部视频或复刻全部教程。

| 作品 | 直接观察 | 产品采用 |
|---|---|---|
| [蟹煲：秋冬穿搭技巧，5个懒人搭配口诀](https://www.douyin.com/video/7694687869555022479) | 官方页显示作者蟹煲、发布时间2026-10-10 19:15、时长约18秒；观察到约9秒的全身站立画面，固定室内背景、米色马甲/白衬衫/白色宽裤等完整层次 | 全身构图、固定模特位置、整套前后切换 |
| [GGiiinny：GRWM真人版换装小游戏](https://www.douyin.com/video/7622228222763867826) | 官方页标题与作者一致，发布时间2026-03-28 16:58、时长约70秒；观察到约48秒暂停画面，真人全身站立，周围有衣物/包/鞋小卡 | 清楚可选择的穿搭版本与完整上身比较 |

用户先选择“真人模特展示”，随后明确要求三种都要。因此本轮同时实现示范、本人实穿照片、单件 AI 模拟试衣；没有把图片切换称为连续换装视频。

技术契约依据：[火山图片生成 API](https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh) 与 [火山图片编辑说明](https://docs.volcengine.com/docs/LakeAIService/ImagegenerationandeditingDoubaoseedreamseriesmodels?lang=zh)，并由 [官方 Go SDK](https://github.com/volcengine/volcengine-go-sdk/blob/master/service/arkruntime/images.go) 交叉核对。官方模型支持多张参考图与 Base64 输出；这不证明当前转发服务已实现该协议，仍需本机真实请求验收。

没有下载原视频或复制博主头像、服装商品图进入产品。产品模特资产另行原创生成并标注。

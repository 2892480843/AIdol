# 多巴胺三维人物验收

## 选择与边界

当前网页资源选用一个连续的 150000 三角面身体模型，粉色短针织、薄荷裙与黄色鞋饰。根据用户图片制作同人物穿搭参考后，在 Tripo H3.1 分别重建全身和精细头像；最终只将头像的面部颜色贴图投射到原完整身体，不拼接头像网格。

眼睛、嘴唇控制点取自两份源模型的正面投影。初次嘴中心点有误，已按源投影中的唇色中心重新校准。最终正面、侧面、背面与面部近景保存在本目录；`actual-model-contact.jpg` 和 `actual-turntable.webm` 都来自真实 Three.js 场景。`dopamine-reference.png` 是生成参考图，不能用作三维成品证据。

资源位置、法线、UV、索引逐块与原始全身 GLB 比较哈希；手机包只缩小贴图。生成的肩部发丝仍有局部片状感，手部细节及原图五官相似度尚有差距，不能视为照片级或影视级角色验收通过。需要进一步精修时，应在连续网格上修形、重绘头发和修正脸部轮廓，避免再次直接裁切拼头。

这是固定姿态的完整穿搭：可旋转、缩放、切换造型和导出图片/转台视频，不能据此宣称有骨骼动作、布料模拟、自由替换单件衣服或精确复刻未在图片中出现的侧背面。

## 可追溯文件

- `generation-manifest.json`：源图片哈希、Tripo 任务、设置与本轮积分（140）。
- `face-projection.json`：实际投射范围和五官校准参数。
- `package-model.py` / `finish-assets.py`：最终打包与来源记录。
- `package-*-experiment.py`：未采用的网格拼接尝试，仅输出到忽略的 `originals/`。
- `frontend/public/models/avatar/dopamine-v1/PROVENANCE.json`：公开资源哈希与原始几何哈希，含头像输入哈希。
- `catalog-red.log` / `workspace-red.log` / `fallback-red.log`：新增行为变更前的失败测试证据。
- `catalog-final.log`：目录与工作台 31 条回归通过。

完整回归、构建和生产资源核验的最终结果分别以 `frontend-tests.log`、`build.json`、`runtime.json` 为准。

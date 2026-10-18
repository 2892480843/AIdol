# 原创模特资产

- 工具：内置 imagegen，未使用 CLI/API fallback。
- 最终前端素材：`frontend/public/images/model-looks-20261017.webp`，1024×1536，137626 bytes。仅编码转换，不重绘、不更换人物。
- 原始输出已保留：`verification/look-switching/model-looks-source.png`；默认生成目录原图也保留。
- 一个精确 2×2 图集，每个单格为 512×768 的完整 2:3 竖幅。CSS 仅选择对应单格；四幅均保留头与鞋，不截成半身。
- 模特为原创虚构成年人，非抖音博主本人；没有使用参考作品的截图、视频、头像作为生成输入或产品素材。
- 提取单格的 imagegen 编辑首次连接失败；使用同一内置工具重试成功，已保留为 `verification/look-switching/person-fixture.png`（1024×1536）。它仅用于不含真人隐私的上传与生成验收，未切换其他生成工具。

最终生成提示词：

```text
Use case: photorealistic-natural. Asset type: a production photographic sprite sheet for a wardrobe web app, NOT a UI mockup. Create ONE high-resolution image in portrait 2:3 ratio, a precise seamless 2 by 2 grid of four equal portrait photographic panels (each panel 2:3). No gutters, no borders, no labels, no text, no watermark. Each quadrant shows the SAME ORIGINAL FICTIONAL adult East Asian woman, age about 28, the same natural face, shoulder-length dark brown hair tucked behind ears, natural skin texture, realistic proportions, no resemblance to a known person. Same static camera, same relaxed front-facing standing pose, arms gently by her sides, head-to-toe including shoes fully visible in every quadrant, exact same person size and feet baseline, ample space above head and below shoes. Quiet off-white warm studio wall and pale stone floor, soft daylight with contact shadows. Treat it as four real e-commerce fashion photographs shot within one studio session: true-to-life woven fabric, seams, natural wrinkles and drape, realistic hands and anatomy. Upper left outfit: plain white cotton crewneck T-shirt tucked loosely into dark indigo straight-leg jeans, clean white low-top sneakers. Upper right outfit: light blue cotton button-up shirt with sleeves rolled once, charcoal tailored straight wide-leg trousers, brown leather loafers. Lower left outfit: beige knitted V-neck sleeveless vest over a crisp white long-sleeve shirt, black wide-leg trousers, black leather loafers. Lower right outfit: olive canvas short utility jacket over white T-shirt, cream straight-leg chinos, white low-top sneakers. Modest everyday autumn capsule wardrobe, no logos or jewelry, no bag or props. All four panels must be complete full-body photographs, not illustrations, not CGI, not clothing cutouts, not a collage of disjoint body parts. Preserve the same person, same pose, same lighting and exact framing across all four panels to support convincing click-to-change outfits on a website.
```

单人验收素材编辑提示词：

```text
Use the attached original fictional model sheet as the edit target. Return just one full-body portrait photograph: the SAME adult fictional woman in the UPPER LEFT image, plain white crewneck cotton T-shirt, indigo straight jeans, white sneakers. Extract that single look from the four-panel sheet. Keep her exact face, hair, front-facing pose, body shape, clothes, studio lighting and off-white wall and pale floor unchanged. Whole head and both shoes fully visible. Portrait 2:3, single photo only, no grid, no other outfits, no text or logos. This single portrait is a non-personal test fixture for the wardrobe application's image-edit integration.
```

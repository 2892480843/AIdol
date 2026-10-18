# 潮流风格原创素材

两组图均使用内置 imagegen，以上一轮原创虚构成年模特图集为编辑输入；不含博主人像、品牌图或用户私人照片。默认目录原图保留，本项目另存 style-source-a.png 与 style-source-b.png。前端 WebP 仅做格式编码，没有程序重绘、抠图或更改人物。

每张 1024×1536，精确 2×2，每格512×768。两张合计8套，加原4套，共12套、六类各2套。所有头部和鞋均完整。切换通过CSS选择对应单格，不将四格当成单张人物照。

A组顺序：街头飞行夹克 / 机能壳衣 / 酒红运动套装 / 奶黄运动夹克。
B组顺序：菱格学院 / 棕色皮衣 / 条纹与红鞋 / 奶油衬衫。

## A 最终提示词

```text
Use case: identity-preserve. Edit target: the supplied original four-panel fictional adult fashion model sheet. Create a NEW precise 2 by 2 photographic sprite sheet, portrait 2:3 overall, four equal portrait 2:3 panels with NO gutters or borders. Preserve the SAME original adult East Asian woman about 28, face, hairstyle, body, front-facing relaxed standing pose, camera distance, off-white wall, pale floor and soft daylight from the reference. Every panel MUST include her whole head and both shoes with generous margins; exact equal scale and feet baseline. Change ONLY the outfits. Upper left: fashion-forward streetwear, oversized charcoal bomber jacket open over white tee, washed black wide-leg denim, silver-gray technical sneakers, subtle silver chain, no logos. Upper right: utilitarian streetwear, structured sage-olive technical shell jacket over dark gray tee, black cargo parachute trousers, black and gray trail sneakers; relaxed but polished. Lower left: elevated sports casual, burgundy zip-front track jacket with cream side piping, cream loose straight track trousers, gray retro running sneakers, modest fully clothed. Lower right: butter yellow lightweight zip sports jacket over white crewneck tee, soft heather-gray wide-leg sweatpants, clean white court sneakers; youthful everyday athleisure. Real photographic cotton, nylon, zippers, seams and wrinkles, believable clothing drape, natural skin texture, hands and anatomy. Make the four outfits clearly different, stylish wearable outfits, no props, no text, no labels, no watermarks, no brand logos, no illustrations, no CGI. Keep background, model and framing unchanged so the website can convincingly switch looks.
```

## B 最终提示词

```text
Use case: identity-preserve. Edit target: the supplied original fictional adult woman fashion model sheet. Make a NEW precise 2 by 2 photographic sprite sheet, overall portrait 2:3, four equal portrait 2:3 panels, no gutters/borders. Preserve exactly the SAME original adult East Asian woman age about 28, natural face, shoulder-length dark hair, body proportions, relaxed front-facing standing pose, hands at sides, fixed camera distance, warm off-white wall, pale stone floor, soft studio daylight. Each panel MUST show the entire head and both shoes with ample margin, equal model size and foot baseline. Change ONLY outfits into stylish wearable fashion: UPPER LEFT retro collegiate: relaxed burgundy and cream argyle cardigan worn over a white collared shirt, charcoal pleated midi skirt reaching mid-calf, dark burgundy loafers with cream socks. UPPER RIGHT vintage casual: chestnut brown soft leather short jacket over ivory fine knit top, faded medium-blue straight jeans, brown suede loafers, no logos. LOWER LEFT relaxed French-inspired everyday: classic navy and ivory striped long-sleeve knit tucked loosely in indigo straight-leg jeans, cherry-red ballet flats, simple narrow brown leather belt. LOWER RIGHT relaxed French-inspired tailoring: ivory softly draped fully buttoned blouse, sand-beige straight tailored trousers, camel knit cardigan casually resting over shoulders, dark brown leather loafers. Modest, fully clothed adults. Authentic fabric textures, natural folds, stitches, realistic fit, skin, hands and anatomy; real fashion studio photography, not rendered mannequins or clothing stickers. NO text, NO labels, NO brand logos, NO watermark, NO props. Match the supplied model's pose, lighting, face and background so all four can be switched convincingly in a fashion web app.
```


import json
from pathlib import Path
values={
'zh-CN': ['上一套造型','下一套造型','挑选剪裁，自由混搭','每一套都有不同轮廓。换一件，也能换一种心情。','{name}样衣剪裁','按衣柜品类预览',['细肩背心','短款 T 恤','柔软针织','垂感西裤','工装长裤','百褶短裙','挂脖连衣裙','简约短裙','短西装','复古运动鞋','系带短靴','芭蕾平底鞋','宽松 T 恤','Polo 衫']],
'zh-TW': ['上一套造型','下一套造型','挑選剪裁，自由混搭','每一套都有不同輪廓。換一件，也能換一種心情。','{name}樣衣剪裁','依衣櫃品類預覽',['細肩背心','短版 T 恤','柔軟針織','垂墜西褲','工裝長褲','百褶短裙','繞頸洋裝','簡約短洋裝','短西裝','復古運動鞋','綁帶短靴','芭蕾平底鞋','寬鬆 T 恤','Polo 衫']],
'en': ['Previous look','Next look','Find your silhouette','Different cuts, a different mood. Make each look your own.','{name} sample cut','Previewed by wardrobe category',['Camisole','Cropped tee','Soft knit','Tailored trousers','Cargo trousers','Pleated mini','Halter dress','Shift dress','Blazer','Retro sneakers','Lace-up ankle boots','Ballet flats','Relaxed tee','Polo shirt']],
'de': ['Vorheriger Look','Nächster Look','Wähle deine Silhouette','Andere Schnitte, neue Stimmung. Gestalte deinen eigenen Look.','{name}: Musterschnitt','Vorschau nach Kleiderkategorie',['Trägertop','Kurzes T-Shirt','Weicher Strick','Anzughose','Cargohose','Faltenminirock','Neckholderkleid','Etuikleid','Blazer','Retro-Sneaker','Schnürstiefeletten','Ballerinas','Lockeres T-Shirt','Poloshirt']],
'fr': ['Tenue précédente','Tenue suivante','Trouvez votre silhouette','De nouvelles coupes pour changer d’allure et composer votre tenue.','Coupe du modèle : {name}','Aperçu par catégorie du dressing',['Caraco','T-shirt court','Maille douce','Pantalon de tailleur','Pantalon cargo','Mini-jupe plissée','Robe dos-nu','Robe droite','Blazer','Baskets rétro','Bottines à lacets','Ballerines','T-shirt ample','Polo']],
'it': ['Look precedente','Look successivo','Trova la tua silhouette','Tagli diversi per cambiare atmosfera e creare il tuo look.','Taglio del campione: {name}','Anteprima per categoria del guardaroba',['Canotta','T-shirt corta','Maglia morbida','Pantaloni sartoriali','Pantaloni cargo','Minigonna a pieghe','Abito all’americana','Abito dritto','Blazer','Sneaker rétro','Stivaletti stringati','Ballerine','T-shirt ampia','Polo']],
'ja': ['前のコーデ','次のコーデ','シルエットを選んで組み合わせる','異なるシルエットで、気分に合うコーデを見つけよう。','{name}のサンプル形状','ワードローブの種類に合わせたプレビュー',['キャミソール','クロップドTシャツ','ソフトニット','スラックス','カーゴパンツ','プリーツミニ','ホルターネックワンピース','シフトワンピース','ジャケット','レトロスニーカー','レースアップブーツ','バレエシューズ','ゆったりTシャツ','ポロシャツ']],
'ko': ['이전 코디','다음 코디','실루엣을 골라 자유롭게 조합해요','다른 실루엣으로 새로운 분위기의 코디를 만들어 보세요.','{name} 샘플 형태','옷장 의류 종류에 따른 미리보기',['캐미솔','크롭 티셔츠','소프트 니트','슬랙스','카고 팬츠','플리츠 미니스커트','홀터넥 원피스','시프트 원피스','블레이저','레트로 스니커즈','레이스업 앵클부츠','발레 플랫','루즈 티셔츠','폴로 셔츠']],
}
ids=['camisole','cropped-tee','knit','tailored','cargo','mini-skirt','halter','shift','blazer','sneakers','ankle-boots','ballet-flats','tee','polo']
keys=['previousLook','nextLook','cutsTitle','cutsHint','sampleCut','inventoryCut']
for locale,v in values.items():
 p=Path('frontend/messages')/locale/'wardrobe.json'
 x=json.loads(p.read_text());x['avatar'].update(dict(zip(keys,v[:6])));x['avatar']['garmentNames']=dict(zip(ids,v[6]))
 p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
